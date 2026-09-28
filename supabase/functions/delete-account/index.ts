import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * delete-account — permanent, user-initiated account deletion.
 *
 * Called by `deleteMyAccount()` in src/lib/supabase/profile.ts. Required by
 * Google Play policy for any app that lets people create an account, and by
 * the privacy policy shipped at /settings/privacy-policy.
 *
 * ── Why this is not just `auth.admin.deleteUser()` ──────────────────────────
 * `public.profiles.id` references `auth.users(id)` ON DELETE CASCADE, and most
 * user-owned tables cascade from `profiles`, so deleting the auth user removes
 * the bulk of the data automatically.
 *
 * But six foreign keys point at `profiles` with ON DELETE NO ACTION, and any
 * surviving row on those columns aborts the whole delete:
 *
 *   moderation_events.user_id          (nullable)  → null it
 *   moderation_events.admin_id         (nullable)  → null it
 *   proof_submissions.reviewed_by      (nullable)  → null it
 *   proof_submissions.admin_removed_by (nullable)  → null it
 *   quest_participants.reviewed_by     (nullable)  → null it
 *   proof_reports.reported_by          (NOT NULL)  → delete the rows
 *
 * These are "actor" columns: they record that this person reviewed, moderated
 * or reported *someone else's* content, so they are not cleared by the cascade
 * from their own rows. Nulling them preserves the moderation audit trail while
 * detaching the identity, which is the right outcome for both the audit log and
 * the deletion request.
 *
 * Storage is not covered by FK cascades at all, so objects are removed
 * explicitly. Both buckets are keyed by a `{userId}/` prefix:
 *   avatars      → {uid}/avatar.{ext}
 *   proof-media  → {uid}/proofs/{challengeId}/{taskId}/{file}
 *
 * ── Ordering ───────────────────────────────────────────────────────────────
 * Storage first, then FK detachment, then the auth user last. The auth delete
 * is the irreversible step, so everything that can fail runs before it. A
 * storage failure is reported but does NOT abort: a person's deletion request
 * must always complete, and an orphaned image is a smaller problem than an
 * account stuck half-deleted. Orphans are reported in the response so they can
 * be swept later.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKETS = ["avatars", "proof-media"] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Recursively collect every object path under `prefix`.
 * storage.list() is not recursive and returns folders as entries with a null
 * `id`, so folders have to be walked explicitly. Proof media nests four levels
 * deep ({uid}/proofs/{challenge}/{task}/{file}).
 */
async function listAllPaths(
  // deno-lint-ignore no-explicit-any
  storage: any,
  prefix: string,
  depth = 0
): Promise<string[]> {
  // Guard against a pathological tree; real paths are 4 levels at most.
  if (depth > 6) return [];

  const { data, error } = await storage.list(prefix, { limit: 1000 });
  if (error || !data) return [];

  const paths: string[] = [];
  for (const entry of data as Array<{ name: string; id: string | null }>) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      paths.push(...(await listAllPaths(storage, full, depth + 1)));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing bearer token" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Resolve the caller from their own JWT. Never trust a user id from the
    // request body — that would let anyone delete anyone.
    const asCaller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await asCaller.auth.getUser();

    if (userError || !user) {
      return json({ error: "invalid or expired session" }, 401);
    }

    const uid = user.id;

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── 1. Storage ───────────────────────────────────────────────────────────
    const storageWarnings: string[] = [];
    let removedObjects = 0;

    for (const bucket of BUCKETS) {
      try {
        const store = admin.storage.from(bucket);
        const paths = await listAllPaths(store, uid);
        if (paths.length === 0) continue;

        // remove() caps at 1000 paths per call.
        for (let i = 0; i < paths.length; i += 1000) {
          const batch = paths.slice(i, i + 1000);
          const { error } = await store.remove(batch);
          if (error) {
            storageWarnings.push(`${bucket}: ${error.message}`);
          } else {
            removedObjects += batch.length;
          }
        }
      } catch (e) {
        storageWarnings.push(`${bucket}: ${String(e)}`);
      }
    }

    // ── 2. Detach NO ACTION foreign keys ─────────────────────────────────────
    // Each of these would otherwise abort the auth delete.
    const detach: Array<{ label: string; run: () => Promise<{ error: unknown }> }> = [
      {
        label: "moderation_events.user_id",
        run: () =>
          admin.from("moderation_events").update({ user_id: null }).eq("user_id", uid),
      },
      {
        label: "moderation_events.admin_id",
        run: () =>
          admin.from("moderation_events").update({ admin_id: null }).eq("admin_id", uid),
      },
      {
        label: "proof_submissions.reviewed_by",
        run: () =>
          admin.from("proof_submissions").update({ reviewed_by: null }).eq("reviewed_by", uid),
      },
      {
        label: "proof_submissions.admin_removed_by",
        run: () =>
          admin
            .from("proof_submissions")
            .update({ admin_removed_by: null })
            .eq("admin_removed_by", uid),
      },
      {
        label: "quest_participants.reviewed_by",
        run: () =>
          admin.from("quest_participants").update({ reviewed_by: null }).eq("reviewed_by", uid),
      },
      {
        // reported_by is NOT NULL, so these rows cannot be detached — only
        // removed. The reported proof itself is unaffected.
        label: "proof_reports.reported_by",
        run: () => admin.from("proof_reports").delete().eq("reported_by", uid),
      },
    ];

    for (const step of detach) {
      const { error } = await step.run();
      if (error) {
        // Abort before the irreversible step: a leftover reference here means
        // the auth delete would fail anyway, and a clear error is far better
        // than a half-deleted account.
        return json(
          {
            error: "could not detach account references",
            step: step.label,
            detail: (error as { message?: string }).message ?? String(error),
          },
          500
        );
      }
    }

    // ── 3. Delete the auth user — cascades profiles and everything under it ──
    const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
    if (deleteError) {
      return json(
        { error: "failed to delete account", detail: deleteError.message },
        500
      );
    }

    return json({
      deleted: true,
      removed_objects: removedObjects,
      // Non-empty means orphaned storage to sweep; the account is still gone.
      storage_warnings: storageWarnings,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
