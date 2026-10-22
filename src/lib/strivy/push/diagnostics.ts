/**
 * src/lib/strivy/push/diagnostics.ts
 *
 * Plain answers to "why didn't my push work?". Server only.
 *
 * Every check reports a category and a short explanation that names the
 * environment variable or step involved, never its value. Secrets
 * (VAPID_PRIVATE_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET) are only ever
 * tested for presence and shape.
 */
import webpush from "web-push";

export type PushErrorCategory =
  | "push_disabled"
  | "missing_cron_secret"
  | "unauthorized"
  | "missing_vapid"
  | "invalid_vapid"
  | "missing_service_role"
  | "invalid_service_role"
  | "database_not_set_up"
  | "database_error"
  | "no_subscription"
  | "invalid_subscription"
  | "vapid_mismatch"
  | "send_failed";

export interface PushProblem {
  category: PushErrorCategory;
  /** Safe to show a developer: names a variable or a step, never a value. */
  detail: string;
}

export interface PushCheck {
  id: string;
  label: string;
  ok: boolean;
  problem?: PushProblem;
}

type Env = Record<string, string | undefined>;

function base64UrlBytes(value: string): number | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  try {
    return Buffer.from(value, "base64url").length;
  } catch {
    return null;
  }
}

/** The role inside a legacy JWT key, or the kind of a new-style sb_ key. */
export function serviceKeyKind(key: string): "service_role" | "anon" | "unknown" {
  const k = key.trim();
  if (k.startsWith("sb_secret_")) return "service_role";
  if (k.startsWith("sb_publishable_")) return "anon";
  const parts = k.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
        role?: unknown;
      };
      if (payload.role === "service_role") return "service_role";
      if (payload.role === "anon" || payload.role === "authenticated") return "anon";
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}

/** Each server-side requirement for STRIVY push, in the order they matter. */
export function checkPushServer(env: Env = process.env): PushCheck[] {
  const checks: PushCheck[] = [];
  const add = (id: string, label: string, problem: PushProblem | null) =>
    checks.push({ id, label, ok: !problem, ...(problem ? { problem } : {}) });

  add(
    "enabled",
    "STRIVY push is enabled",
    env.STRIVY_PUSH_ENABLED === "true"
      ? null
      : { category: "push_disabled", detail: "Set STRIVY_PUSH_ENABLED=true." }
  );

  const pub = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const priv = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  add(
    "vapid-public",
    "VAPID public key is configured",
    !pub
      ? { category: "missing_vapid", detail: "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set." }
      : base64UrlBytes(pub) !== 65
        ? {
            category: "invalid_vapid",
            detail:
              "NEXT_PUBLIC_VAPID_PUBLIC_KEY isn't a VAPID public key (expected 65 bytes, base64url). Generate a pair with: npx web-push generate-vapid-keys",
          }
        : null
  );
  add(
    "vapid-private",
    "VAPID private key is configured (server only)",
    !priv
      ? { category: "missing_vapid", detail: "VAPID_PRIVATE_KEY is not set." }
      : base64UrlBytes(priv) !== 32
        ? {
            category: "invalid_vapid",
            detail:
              "VAPID_PRIVATE_KEY isn't a VAPID private key (expected 32 bytes, base64url). Use the private key from the same pair as the public key.",
          }
        : null
  );
  add(
    "vapid-subject",
    "VAPID subject is configured",
    !subject
      ? { category: "missing_vapid", detail: "VAPID_SUBJECT is not set (mailto:you@example.com)." }
      : !/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)
        ? {
            category: "invalid_vapid",
            detail: "VAPID_SUBJECT must be a mailto: address or an https: URL.",
          }
        : null
  );
  // The keys look right on their own; make sure web-push accepts them together.
  if (checks.slice(1, 4).every((c) => c.ok)) {
    let problem: PushProblem | null = null;
    try {
      webpush.getVapidHeaders("https://push.example.com", subject, pub, priv, "aes128gcm");
    } catch {
      problem = { category: "invalid_vapid", detail: "web-push rejected the VAPID key pair." };
    }
    add("vapid-pair", "VAPID keys are accepted by web-push", problem);
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  add(
    "service-role",
    "Supabase service-role key is configured (server only)",
    !url
      ? { category: "missing_service_role", detail: "NEXT_PUBLIC_SUPABASE_URL is not set." }
      : !service
        ? {
            category: "missing_service_role",
            detail:
              "SUPABASE_SERVICE_ROLE_KEY is not set. The push scheduler needs it to read every subscribed user (Supabase: Project Settings → API keys → secret/service_role).",
          }
        : serviceKeyKind(service) === "anon"
          ? {
              category: "invalid_service_role",
              detail:
                "SUPABASE_SERVICE_ROLE_KEY holds the anon/publishable key. Use the secret (service_role) key.",
            }
          : null
  );

  const secret = env.CRON_SECRET ?? "";
  add(
    "cron-secret",
    "CRON_SECRET is configured",
    secret.length >= 16
      ? null
      : {
          category: "missing_cron_secret",
          detail: secret
            ? "CRON_SECRET is too short (16+ characters)."
            : "CRON_SECRET is not set (16+ random characters).",
        }
  );
  return checks;
}

/** The first problem that stops the scheduler, or null when config is complete. */
export function firstPushConfigProblem(
  env: Env = process.env,
  ids: string[] = ["vapid-public", "vapid-private", "vapid-subject", "vapid-pair", "service-role"]
): PushProblem | null {
  return checkPushServer(env).find((c) => !c.ok && ids.includes(c.id))?.problem ?? null;
}

/** A Supabase/PostgREST error, kept with its code so it can be categorised. */
export class PushStoreError extends Error {
  readonly code: string | undefined;
  constructor(scope: string, error: { message?: string; code?: string }) {
    super(`${scope}: ${error.message ?? "error"}`.slice(0, 300));
    this.name = "PushStoreError";
    this.code = error.code;
  }
}

/** The push tables or functions aren't in the database (migration not applied). */
export function isNotSetUpCode(code: string | undefined): boolean {
  return ["PGRST202", "PGRST205", "42883", "42P01"].includes(code ?? "");
}

/** What a failed database call means for push. */
export function categorizeStoreError(err: unknown): PushProblem {
  const code = err instanceof PushStoreError ? err.code : undefined;
  const message = err instanceof Error ? err.message : "";
  if (isNotSetUpCode(code) || /does not exist|could not find the (table|function)/i.test(message)) {
    return {
      category: "database_not_set_up",
      detail:
        "The STRIVY push tables aren't in this database. Apply supabase/migrations/20261001_strivy_push.sql (it is idempotent) to the project, then try again.",
    };
  }
  if (
    code === "42501" ||
    code === "PGRST301" ||
    /permission denied|jwt|invalid api key|no api key/i.test(message)
  ) {
    return {
      category: "invalid_service_role",
      detail:
        "Supabase refused the service-role key (permission denied or invalid key). Check SUPABASE_SERVICE_ROLE_KEY belongs to this project.",
    };
  }
  return {
    category: "database_error",
    detail: /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)
      ? "Supabase couldn't be reached from this server (network). Check NEXT_PUBLIC_SUPABASE_URL."
      : "A Supabase query failed. The server log has the query and error code.",
  };
}

/** What a failed Web Push delivery means. */
export function categorizeSendStatus(status: number | undefined): PushErrorCategory {
  if (status === 404 || status === 410 || status === 400) return "invalid_subscription";
  if (status === 401 || status === 403) return "vapid_mismatch";
  return "send_failed";
}

/** Dev-friendly guidance per send failure; never includes the endpoint. */
export const SEND_HINT: Record<"invalid_subscription" | "vapid_mismatch" | "send_failed", string> =
  {
    invalid_subscription:
      "The browser subscription is expired or invalid. Turn notifications off and on again in the STRIVY bell.",
    vapid_mismatch:
      "The push service rejected the VAPID signature. The subscription was made with a different VAPID public key: re-subscribe after changing keys.",
    send_failed: "The push service didn't accept the message. The server log has the status code.",
  };
