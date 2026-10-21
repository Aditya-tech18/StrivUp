/**
 * Test helpers: a tiny fake Supabase client and sample facts.
 *
 * The fake records every query (table, selected columns, filters) so tests can
 * assert exactly what STRIVY reads, and returns canned rows per table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntentResult, StrivyContext, StrivyFacts, StrivyIntent } from "@/lib/strivy/types";

export interface RecordedQuery {
  table: string;
  select: string;
  filters: [string, string, unknown][];
  /** The row passed to upsert(), when there was one. */
  payload?: unknown;
}

export interface FakeTable {
  data?: unknown[];
  error?: { message: string };
}

export function fakeSupabase(options: {
  user?: { id: string } | null;
  tables?: Record<string, FakeTable>;
  rpcError?: boolean;
  /** Custom RPC behaviour, e.g. for strivy_emit_notifications. */
  rpc?: (
    name: string,
    args: unknown
  ) => { data: unknown; error: { message: string; code?: string } | null };
}) {
  const queries: RecordedQuery[] = [];
  const rpcCalls: string[] = [];
  const rpcArgs: { name: string; args: unknown }[] = [];
  const tables = options.tables ?? {};

  function builder(table: string) {
    const q: RecordedQuery = { table, select: "", filters: [] };
    queries.push(q);
    const result = () => {
      const t = tables[table] ?? { data: [] };
      return t.error ? { data: null, error: t.error } : { data: t.data ?? [], error: null };
    };
    const chain: Record<string, unknown> = {
      select(cols: string) {
        q.select = cols;
        return chain;
      },
      delete() {
        q.select = "<delete>";
        return chain;
      },
      update() {
        q.select = "<update>";
        return chain;
      },
      upsert(row?: unknown) {
        q.select = "<upsert>";
        q.payload = row;
        return chain;
      },
      maybeSingle() {
        const r = result();
        return Promise.resolve({ data: r.data ? (r.data[0] ?? null) : null, error: r.error });
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    for (const op of ["eq", "in", "gte", "lte", "order", "limit", "filter", "neq"]) {
      chain[op] = (col: string, val: unknown) => {
        q.filters.push([op, col, val]);
        return chain;
      };
    }
    return chain;
  }

  const client = {
    auth: {
      getUser: async () => ({ data: { user: options.user ?? null }, error: null }),
    },
    from: (table: string) => builder(table),
    rpc: async (name: string, args?: unknown) => {
      rpcCalls.push(name);
      rpcArgs.push({ name, args });
      if (options.rpc) return options.rpc(name, args);
      return options.rpcError
        ? { data: null, error: { message: "rpc failed" } }
        : { data: 0, error: null };
    },
  };

  return { client: client as unknown as SupabaseClient, queries, rpcCalls, rpcArgs };
}

export const USER_ID = "00000000-0000-0000-0000-00000000000a";

export function intent(name: StrivyIntent): IntentResult {
  return { intent: name, confidence: "high", matched: ["test"] };
}

export function ctx(
  name: StrivyIntent,
  facts: Partial<StrivyFacts> = {},
  knowledge: StrivyContext["knowledge"] = []
): StrivyContext {
  return {
    intent: intent(name),
    facts: { firstName: null, unavailable: [], ...facts },
    knowledge,
  };
}

export const SAMPLE: Required<Omit<StrivyFacts, "unavailable">> = {
  firstName: "Asha",
  today: {
    tasks: [
      {
        challengeId: "c1",
        challengeTitle: "30 Days of Running",
        title: "Run 5km",
        dayLabel: "Day 12",
        state: "todo",
      },
      {
        challengeId: "c2",
        challengeTitle: "Read Daily",
        title: "Read Daily",
        dayLabel: "Day 4",
        state: "done",
      },
    ],
    completed: 1,
    total: 2,
    bestStreak: 11,
  },
  challenges: [
    {
      challengeId: "c1",
      title: "30 Days of Running",
      status: "active",
      currentDay: 12,
      durationDays: 30,
      currentStreak: 11,
      longestStreak: 14,
      consistencyPct: 91.7,
    },
    {
      challengeId: "c2",
      title: "Read Daily",
      status: "active",
      currentDay: 4,
      durationDays: 21,
      currentStreak: 3,
      longestStreak: 3,
      consistencyPct: 75,
    },
  ],
  quests: [
    {
      questId: "q1",
      title: "Café Trail",
      businessName: "Blue Tokai",
      locationName: null,
      verificationStatus: "pending",
      completed: false,
      endsAt: "2026-10-12T18:00:00Z",
      tasksTotal: 3,
      tasksApproved: 1,
      tasksPending: 1,
      tasksNeedAction: 1,
    },
  ],
  proofs: [
    {
      kind: "challenge",
      parentId: "c1",
      parentTitle: "30 Days of Running",
      label: "Day 11",
      status: "approved",
      rejectionReason: null,
      submittedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    },
  ],
  rewards: [
    { questId: "q0", questTitle: "Park Run", rewardTitle: "Free smoothie", status: "fulfilled" },
  ],
  availableRewards: [
    { kind: "quest", parentId: "q1", parentTitle: "Café Trail", description: "20% off voucher" },
  ],
  week: { activeDays: 5, approvedProofs: 7 },
};
