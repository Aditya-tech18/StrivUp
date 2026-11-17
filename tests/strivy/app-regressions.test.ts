import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeRedirect } from "@/lib/safeRedirect";
import { getChallengeDetail, getTrendingChallenges } from "@/lib/data/challenges";

test("sign-in return links cannot send a user back to an auth screen", () => {
  for (const path of [
    "/login?redirectTo=/feed",
    "/signup#form",
    "/login/",
    "/auth",
    "/feed/../login",
  ]) {
    assert.equal(safeRedirect(path), "/feed", path);
  }
});

test("sign-in return links reject browser-normalized external destinations", () => {
  for (const path of ["//example.com", "/\t/example.com", "/\n/example.com", "/\\example.com"]) {
    const destination = safeRedirect(path);
    assert.equal(destination, "/feed", JSON.stringify(path));
    assert.equal(new URL(destination, "https://strivup.example").origin, "https://strivup.example");
  }
});

test("sign-in return links preserve challenge invites, filters and anchors", () => {
  for (const path of ["/join/abcd1234", "/quests?q=walking#nearby", "/business/dashboard"]) {
    assert.equal(safeRedirect(path), path);
  }
});

test("challenge cards and detail agree on day one, day two and the final day", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-16T12:00:00Z") });
  const row = {
    id: "challenge-1",
    title: "Read daily",
    duration_days: 14,
    created_at: "2026-11-15T12:00:00Z",
    profiles: { full_name: "Organizer" },
  };
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: async () => ({ data: [row], error: null }),
    single: async () => ({ data: row, error: null }),
  };
  const supabase = { from: () => query } as unknown as SupabaseClient;
  for (const [now, expectedDay] of [
    ["2026-11-15T12:00:00Z", 1],
    ["2026-11-16T11:59:59Z", 1],
    ["2026-11-16T12:00:00Z", 2],
    ["2026-12-16T12:00:00Z", 14],
  ] as const) {
    t.mock.timers.setTime(new Date(now).getTime());
    const detail = await getChallengeDetail(supabase, "challenge-1");
    const cards = await getTrendingChallenges(supabase);
    assert.equal(detail?.currentDay, expectedDay, `detail at ${now}`);
    assert.equal(cards[0].currentDay, expectedDay, `card at ${now}`);
  }
});
