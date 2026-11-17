import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { establishSessionFromEmailLink } from "@/lib/auth/emailLinkSession";

test("finishing email authentication removes credentials but keeps the private invite destination", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let cleanedUrl = "";
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        pathname: "/set-password",
        search: "?code=single-use-secret&redirectTo=%2Fjoin%2FTEST2345%3Fauto%3D1",
        hash: "#access_token=private-token",
      },
      history: {
        replaceState: (_state: unknown, _unused: string, url: string) => {
          cleanedUrl = url;
        },
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: "test-user" } } } }) },
  } as unknown as SupabaseClient;

  assert.deepEqual(await establishSessionFromEmailLink(supabase, { code: "single-use-secret" }), {
    ok: true,
  });
  assert.equal(cleanedUrl, "/set-password?redirectTo=%2Fjoin%2FTEST2345%3Fauto%3D1");
  assert.doesNotMatch(cleanedUrl, /single-use-secret|private-token|access_token|code=/);
});
