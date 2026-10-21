import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { NotificationDraft } from "@/lib/strivy/accountability";
import {
  MAX_PER_DAY,
  MAX_PER_RUN,
  createMemoryNotifier,
  disabledNotifier,
  getStrivyNotifier,
  supabaseNotifier,
} from "@/lib/strivy/notifier";
import { handleStrivyCheckinRequest } from "@/lib/strivy/pipeline";
import { runAccountabilityCheck } from "@/lib/strivy/proactive";
import { USER_ID, fakeSupabase } from "./helpers";

const EVENING = new Date("2026-09-28T14:30:00Z");

function draft(key: string): NotificationDraft {
  return {
    type: "strivy_streak_milestone",
    dedupeKey: `challenge_streak_milestone:${key}`,
    title: "Streak milestone 🔥",
    message: "7 days straight",
    relatedChallengeId: "c1",
    relatedQuestId: null,
  };
}

/* ── Notifier: idempotency, caps, disabled by default ───────────────────── */

test("same event never notifies twice", async () => {
  const n = createMemoryNotifier(() => EVENING);
  assert.equal((await n.deliver([draft("a")])).inserted, 1);
  assert.equal((await n.deliver([draft("a")])).inserted, 0);
  assert.equal((await n.deliver([draft("a"), draft("a")])).inserted, 0);
  assert.equal(n.rows.length, 1);
  assert.equal(n.rows[0].isRead, false);
});

test("at most MAX_PER_RUN per run and MAX_PER_DAY per day", async () => {
  let t = EVENING.getTime();
  const n = createMemoryNotifier(() => new Date(t));
  assert.equal((await n.deliver([draft("1"), draft("2"), draft("3")])).inserted, MAX_PER_RUN);
  assert.equal((await n.deliver([draft("4"), draft("5")])).inserted, MAX_PER_DAY - MAX_PER_RUN);
  assert.equal((await n.deliver([draft("6")])).inserted, 0, "daily cap reached");
  t += 25 * 3600_000;
  assert.equal((await n.deliver([draft("6")])).inserted, 1, "cap resets after 24h");
});

test("notifications are off unless explicitly enabled", () => {
  const { client } = fakeSupabase({});
  delete process.env.STRIVY_NOTIFICATIONS_ENABLED;
  assert.equal(getStrivyNotifier(client).name, "disabled");
  process.env.STRIVY_NOTIFICATIONS_ENABLED = "yes";
  assert.equal(getStrivyNotifier(client).name, "disabled");
  process.env.STRIVY_NOTIFICATIONS_ENABLED = "true";
  assert.equal(getStrivyNotifier(client).name, "supabase-rpc");
  delete process.env.STRIVY_NOTIFICATIONS_ENABLED;
});

test("the RPC notifier sends only the allowed fields, never a user id", async () => {
  const fake = fakeSupabase({ rpc: () => ({ data: 1, error: null }) });
  const r = await supabaseNotifier(fake.client).deliver([draft("a"), draft("b"), draft("c")]);
  assert.deepEqual(r, { status: "delivered", inserted: 1 });
  assert.equal(fake.rpcArgs[0].name, "strivy_emit_notifications");
  const items = (fake.rpcArgs[0].args as { p_items: Record<string, unknown>[] }).p_items;
  assert.equal(items.length, MAX_PER_RUN);
  assert.deepEqual(Object.keys(items[0]).sort(), [
    "dedupe_key",
    "message",
    "related_challenge_id",
    "related_quest_id",
    "title",
    "type",
  ]);
});

test("a missing RPC (migration not applied) degrades quietly", async () => {
  const fake = fakeSupabase({
    rpc: () => ({
      data: null,
      error: { message: "Could not find the function", code: "PGRST202" },
    }),
  });
  assert.deepEqual(await supabaseNotifier(fake.client).deliver([draft("a")]), {
    status: "unavailable",
    inserted: 0,
  });
  const failing = fakeSupabase({
    rpc: () => ({ data: null, error: { message: "boom", code: "XX000" } }),
  });
  assert.equal((await supabaseNotifier(failing.client).deliver([draft("a")])).status, "error");
});

test("nothing to send makes no RPC call", async () => {
  const fake = fakeSupabase({});
  await supabaseNotifier(fake.client).deliver([]);
  assert.equal(fake.rpcArgs.length, 0);
});

/* ── Proactive pipeline end to end (fake Supabase) ──────────────────────── */

function journeyTables() {
  // getTodaysTasks works out the challenge day from the real clock, so the
  // join date must be relative to it or the challenge "ends" as time passes.
  const joined = new Date(Date.now() - 11 * 86_400_000).toISOString();
  return {
    challenge_participants: {
      data: [
        {
          challenge_id: "c1",
          joined_at: joined,
          status: "active",
          challenges: { title: "30 Days of Running", duration_days: 30 },
        },
      ],
    },
    challenge_tasks: { data: [] },
    proof_submissions: { data: [] },
    quest_task_submissions: { data: [] },
    streaks: { data: [{ challenge_id: "c1", current_streak: 7 }] },
    profile_challenge_stats: {
      data: [
        {
          challenge_id: "c1",
          title: "30 Days of Running",
          status: "active",
          current_day: 12,
          duration_days: 30,
          current_streak: 7,
          longest_streak: 7,
          consistency_pct: 80,
          joined_at: joined,
        },
      ],
    },
    quest_participants: { data: [] },
    quest_reward_claims: { data: [] },
    profile_heatmap: { data: [{ submission_date: "2026-09-27", submission_count: 1 }] },
  };
}

test("proactive check finds grounded check-ins without a chat message", async () => {
  const fake = fakeSupabase({ user: { id: USER_ID }, tables: journeyTables() });
  const notifier = createMemoryNotifier(() => EVENING);
  const result = await runAccountabilityCheck({
    supabase: fake.client,
    userId: USER_ID,
    notifier,
    now: EVENING,
  });

  assert.deepEqual(
    result.checkIns.map((c) => c.event.type),
    ["challenge_streak_at_risk", "challenge_streak_milestone"]
  );
  assert.match(result.checkIns[1].reply.text, /7/);
  assert.equal(result.delivery.inserted, 2);
  assert.equal(result.unavailable.length, 0);

  // Every query is the user's own; nothing selects *.
  for (const q of fake.queries) {
    assert.ok(
      q.filters.some(([op, , v]) => op === "eq" && v === USER_ID) ||
        q.filters.some(([op]) => op === "in"),
      q.table
    );
    assert.ok(!q.select.includes("*"), q.table);
  }
  // No names or profile reads on the proactive path.
  assert.ok(!fake.queries.some((q) => q.table === "profiles"));
});

test("running the check again (page refresh) creates no new notifications", async () => {
  const fake = fakeSupabase({ user: { id: USER_ID }, tables: journeyTables() });
  const notifier = createMemoryNotifier(() => EVENING);
  await runAccountabilityCheck({ supabase: fake.client, userId: USER_ID, notifier, now: EVENING });
  const again = await runAccountabilityCheck({
    supabase: fake.client,
    userId: USER_ID,
    notifier,
    now: EVENING,
  });
  const later = await runAccountabilityCheck({
    supabase: fake.client,
    userId: USER_ID,
    notifier,
    now: new Date(EVENING.getTime() + 3600_000),
  });
  assert.equal(again.delivery.inserted, 0);
  assert.equal(later.delivery.inserted, 0);
  assert.equal(notifier.rows.length, 2);
});

test("failed queries produce no events, not 'zero' events", async () => {
  const tables = {
    ...journeyTables(),
    profile_challenge_stats: { error: { message: "boom" } },
    profile_heatmap: { error: { message: "boom" } },
  };
  const fake = fakeSupabase({ user: { id: USER_ID }, tables });
  const result = await runAccountabilityCheck({
    supabase: fake.client,
    userId: USER_ID,
    notifier: disabledNotifier,
    now: EVENING,
  });
  assert.deepEqual(result.checkIns, []);
  assert.ok(result.unavailable.includes("your challenges"));
  assert.ok(result.unavailable.includes("this week's activity"));
  assert.equal(result.delivery.status, "disabled");
});

/* ── Check-in endpoint security ─────────────────────────────────────────── */

function deps(options: Parameters<typeof fakeSupabase>[0], enabled = true) {
  const fake = fakeSupabase(options);
  const notifier = createMemoryNotifier(() => EVENING);
  return {
    fake,
    notifier,
    deps: {
      isEnabled: () => enabled,
      getSupabase: async () => fake.client,
      getNotifier: () => notifier,
      now: () => EVENING,
    },
  };
}

const post = (body?: unknown) =>
  new Request("http://localhost/api/strivy/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("check-in: 404 when STRIVY is off, before anything runs", async () => {
  const { fake, deps: d } = deps({ user: { id: USER_ID } }, false);
  assert.equal((await handleStrivyCheckinRequest(post(), d)).status, 404);
  assert.equal(fake.queries.length, 0);
});

test("check-in: 401 signed out, with no queries and no notifications", async () => {
  const { fake, notifier, deps: d } = deps({ user: null, tables: journeyTables() });
  const res = await handleStrivyCheckinRequest(post(), d);
  assert.equal(res.status, 401);
  assert.equal(fake.queries.length, 0);
  assert.equal(notifier.rows.length, 0);
});

test("check-in: 403 for a deactivated account", async () => {
  const { deps: d } = deps({
    user: { id: USER_ID },
    tables: { profiles: { data: [{ is_deactivated: true }] } },
  });
  assert.equal((await handleStrivyCheckinRequest(post(), d)).status, 403);
});

test("check-in: user id cannot be spoofed through the body", async () => {
  const { fake, deps: d } = deps({ user: { id: USER_ID }, tables: journeyTables() });
  const res = await handleStrivyCheckinRequest(
    post({ userId: "someone-else", user_id: "someone-else" }),
    d
  );
  assert.equal(res.status, 200);
  const values = fake.queries.flatMap((q) => q.filters.map(([, , v]) => v));
  assert.ok(!values.includes("someone-else"));
  assert.ok(values.includes(USER_ID));
});

test("check-in: 200 returns grounded check-ins and delivery status", async () => {
  const { deps: d } = deps({ user: { id: USER_ID }, tables: journeyTables() });
  const res = await handleStrivyCheckinRequest(post(), d);
  const body = (await res.json()) as {
    checkIns: { key: string; reply: { text: string; intent: string } }[];
    notifications: { status: string; created: number };
  };
  assert.equal(body.checkIns.length, 2);
  assert.ok(body.checkIns.every((c) => c.key.startsWith("challenge_streak_")));
  assert.deepEqual(body.notifications, { status: "delivered", created: 2 });
  assert.ok(!JSON.stringify(body).includes(USER_ID), "no user id in the response");
});

test("check-in: two users never share notifications", async () => {
  const a = deps({ user: { id: "user-a" }, tables: journeyTables() });
  const b = deps({ user: { id: "user-b" }, tables: journeyTables() });
  await handleStrivyCheckinRequest(post(), a.deps);
  await handleStrivyCheckinRequest(post(), b.deps);
  assert.equal(a.notifier.rows.length, 2);
  assert.equal(b.notifier.rows.length, 2);
  const bValues = b.fake.queries.flatMap((q) => q.filters.map(([, , v]) => v));
  assert.ok(!bValues.includes("user-a"));
});

/* ── Migration file (written, not applied) ──────────────────────────────── */

test("the notification migration keeps the security rules", () => {
  const sql = readFileSync("supabase/migrations/20260929_strivy_notifications.sql", "utf8");
  assert.match(sql, /NOT APPLIED/);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public/i);
  assert.match(sql, /v_uid uuid := auth\.uid\(\)/);
  assert.match(sql, /on conflict \(user_id, dedupe_key\)/i);
  assert.match(
    sql,
    /revoke all on function public\.strivy_emit_notifications\(jsonb\) from public, anon/i
  );
  assert.match(sql, /add column if not exists dedupe_key/i);
  assert.doesNotMatch(sql, /create policy/i, "no new RLS policy");
  // Every type the live constraint allows today is kept.
  for (const t of [
    "new_follower",
    "proof_approved",
    "quest_reward_fulfilled",
    "activity_flagged",
    "challenge_completed",
  ]) {
    assert.ok(sql.includes(`'${t}'`), t);
  }
});
