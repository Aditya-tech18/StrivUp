import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearChat,
  loadChat,
  responseToMessage,
  saveChat,
  toHistory,
  type StrivyChatMessage,
} from "@/components/features/strivy/chat";
import type { StrivyReply } from "@/lib/strivy/types";

const reply: StrivyReply = {
  intent: "streak",
  text: "11 days",
  chips: [],
  links: [],
  suggestions: [],
};

test("successful responses become Strivy messages", () => {
  const m = responseToMessage(200, { reply }, "streak?");
  assert.equal(m.role, "strivy");
});

test("errors offer retry only when it can help", () => {
  const cases: [Parameters<typeof responseToMessage>[0], boolean][] = [
    ["timeout", true],
    ["network", true],
    [500, true],
    [502, true],
    [401, false],
    [403, false],
    [404, false],
    [400, false],
  ];
  for (const [status, retry] of cases) {
    const m = responseToMessage(status, null, "streak?");
    assert.equal(m.role, "error", String(status));
    if (m.role === "error") assert.equal(m.retry, retry ? "streak?" : null, String(status));
  }
});

test("history skips error bubbles, keeps intents, and caps at 8 turns", () => {
  const messages: StrivyChatMessage[] = [];
  for (let i = 0; i < 6; i++) {
    messages.push({ id: `u${i}`, role: "user", text: `q${i}` });
    messages.push({ id: `s${i}`, role: "strivy", reply });
  }
  messages.push({ id: "e", role: "error", text: "oops", retry: "q" });
  const h = toHistory(messages);
  assert.equal(h.length, 8);
  assert.ok(h.every((t) => t.text !== "oops"));
  assert.equal(h[h.length - 1].intent, "streak");
});

test("stored chats are per user and skip errors", () => {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  const messages: StrivyChatMessage[] = [
    { id: "u", role: "user", text: "hi" },
    { id: "s", role: "strivy", reply },
    { id: "e", role: "error", text: "oops", retry: null },
  ];
  saveChat("user-a", messages);
  assert.equal(loadChat("user-a").length, 2);
  assert.equal(loadChat("user-b").length, 0);
  clearChat();
  assert.equal(loadChat("user-a").length, 0);
});

test("storage failures never throw", () => {
  (globalThis as unknown as { window: unknown }).window = {
    get sessionStorage(): never {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(loadChat("user-a"), []);
  saveChat("user-a", []);
  clearChat();
});

test("check-ins run at most once per tab, per user, per day", async () => {
  const { claimCheckinRun, unseenCheckIns, markCheckInsSeen, clearCheckInState } =
    await import("@/components/features/strivy/chat");
  const session = new Map<string, string>();
  const local = new Map<string, string>();
  const store = (m: Map<string, string>) => ({
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
  (globalThis as unknown as { window: unknown }).window = {
    sessionStorage: store(session),
    localStorage: store(local),
  };
  const day = new Date("2026-09-28T14:30:00Z");
  assert.equal(claimCheckinRun("user-a", day), true);
  assert.equal(claimCheckinRun("user-a", day), false, "refresh doesn't re-run");
  assert.equal(claimCheckinRun("user-b", day), true, "another account runs its own");
  assert.equal(
    claimCheckinRun("user-b", new Date(day.getTime() + 86_400_000)),
    true,
    "next day runs"
  );

  const list = [
    { key: "k1", reply },
    { key: "k2", reply },
  ];
  assert.equal(unseenCheckIns("user-a", list).length, 2);
  markCheckInsSeen("user-a", ["k1"]);
  assert.deepEqual(
    unseenCheckIns("user-a", list).map((c) => c.key),
    ["k2"]
  );
  assert.equal(unseenCheckIns("user-b", list).length, 2, "seen state is per user");
  clearCheckInState();
  assert.equal(unseenCheckIns("user-a", list).length, 2);
});
