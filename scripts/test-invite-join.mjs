import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

// Run the real app against an isolated HTTP fixture. No production accounts,
// emails, memberships or rewards are created by this test.
// Usage: npm run test:invites (requires locally installed Google Chrome).
const require = createRequire(import.meta.url);
const userId = "00000000-0000-4000-8000-000000000001";
const challengeId = "00000000-0000-4000-8000-000000000002";
const code = "TEST2345";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "invite-test@example.invalid",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const challenge = {
  id: challengeId,
  title: "Private invite test",
  creator_id: "00000000-0000-4000-8000-000000000003",
  visibility: "private",
  duration_days: 30,
  created_at: new Date().toISOString(),
  profiles: { full_name: "Test organizer" },
  proof_methods: [],
  daily_stake: 0,
};
let mode = "success";
let joined = false;
let joins = 0;
let session;
const api = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ??
      "authorization, apikey, content-type, x-client-info, prefer"
  );
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") return res.end();
  if (url.pathname === "/auth/v1/user") return res.end(JSON.stringify(user));
  if (url.pathname === "/auth/v1/signup") return res.end(JSON.stringify(session));
  if (url.pathname === "/rest/v1/rpc/get_invite_preview")
    return res.end(
      JSON.stringify([
        {
          challenge_id: challengeId,
          title: challenge.title,
          thumbnail_url: null,
          created_at: challenge.created_at,
          duration_days: 30,
          organizer_name: "Test organizer",
          organizer_avatar_url: null,
          participant_count: joined ? 1 : 0,
        },
      ])
    );
  if (url.pathname === "/rest/v1/rpc/join_challenge_by_invite") {
    joins++;
    if (mode === "slow") return;
    if (mode === "invalid") {
      res.statusCode = 404;
      return res.end(JSON.stringify({ code: "P0002", message: "Invalid or expired invite link" }));
    }
    joined = true;
    return res.end(JSON.stringify(challengeId));
  }
  const table = url.pathname.split("/").pop();
  let rows = [];
  if (table === "profiles")
    rows = [
      {
        id: userId,
        full_name: "Invite tester",
        is_deactivated: false,
        account_status: "active",
        moderator_role: "none",
        account_type: "user",
      },
    ];
  if (table === "challenges") rows = [challenge];
  if (table === "challenge_participants" && joined)
    rows = [
      {
        challenge_id: challengeId,
        user_id: userId,
        joined_at: challenge.created_at,
        status: "active",
        profiles: { id: userId, full_name: "Invite tester" },
      },
    ];
  res.setHeader("Content-Range", `0-${Math.max(0, rows.length - 1)}/${rows.length}`);
  if (req.method === "HEAD") return res.end();
  if (req.headers.accept?.includes("vnd.pgrst.object"))
    return res.end(JSON.stringify(rows[0] ?? null));
  res.end(JSON.stringify(rows));
});
await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
const apiUrl = `http://127.0.0.1:${api.address().port}`;
const reservation = http.createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const appPort = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://localhost:${appPort}`;
const logPath = join(tmpdir(), `strivup-invite-browser-${process.pid}.log`);
const output = createWriteStream(logPath);
const app = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "dev", "--webpack", "-p", String(appPort)],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-publishable-key",
      NEXT_PUBLIC_SITE_URL: origin,
      STRIVY_ENABLED: "false",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }
);
app.stdout.pipe(output);
app.stderr.pipe(output);
let browser;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const started = Date.now();
  while (true) {
    try {
      await fetch(origin + "/manifest.webmanifest", { signal: AbortSignal.timeout(2000) });
      break;
    } catch {
      if (app.exitCode !== null || Date.now() - started > 120000)
        throw new Error(`Test app did not start; see ${logPath}`);
      await sleep(500);
    }
  }
  console.log("Isolated invite test app is ready");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const jwtPart = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `${jwtPart({ alg: "HS256", typ: "JWT" })}.${jwtPart({ sub: userId, role: "authenticated", aud: "authenticated", exp })}.test-signature`;
  session = {
    access_token: accessToken,
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user,
  };
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
      url: origin,
    },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (error) => console.log("Browser error:", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.log("Console error:", message.text());
  });
  if (!process.argv.includes("--signup-only")) {
    await page.goto(`${origin}/join/${code}?auto=1`, { timeout: 120000 });
    await page.waitForURL(`**/challenges/${challengeId}`, { timeout: 45000 });
    await sleep(1500);
    assert.equal(
      new URL(page.url()).pathname,
      `/challenges/${challengeId}`,
      "the first-visit tour must not navigate away from the invitation"
    );
    assert.equal(joins, 1, "automatic joining must submit exactly once");
    console.log("PASS automatic authenticated join");

    mode = "slow";
    joined = false;
    await page.goto(`${origin}/join/${code}?auto=1`);
    await page
      .getByRole("alert")
      .filter({ hasText: /too long|try again/i })
      .waitFor({ timeout: 20000 });
    assert.equal(
      await page.getByRole("button", { name: /accept invite|try again/i }).isEnabled(),
      true
    );
    console.log("PASS slow join ends with a retryable error");
    mode = "success";
    await page.getByRole("button", { name: /accept invite|try again/i }).click();
    await page.waitForURL(`**/challenges/${challengeId}`);
    console.log("PASS retry completes the join");

    mode = "invalid";
    await page.goto(`${origin}/join/${code}`);
    await page.getByRole("button", { name: "Accept invite", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: /invalid or expired/i })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Try again", exact: true }).isEnabled(),
      true
    );
    console.log("PASS invalid invitation shows an error instead of staying pending");
    mode = "success";
  }
  const newcomer = await browser.newContext();
  const signup = await newcomer.newPage();
  signup.on("console", (message) => {
    if (message.type() === "error") console.log("Signup browser error:", message.text());
  });
  const destination = `/join/${code}?auto=1`;
  await signup.goto(`${origin}/join/${code}`);
  await signup.getByRole("link", { name: "Join challenge", exact: true }).click();
  await signup.waitForURL("**/login**");
  assert.equal(new URL(signup.url()).pathname, "/login");
  assert.equal(new URL(signup.url()).searchParams.get("redirectTo"), destination);
  await signup.getByRole("link", { name: "Sign up", exact: true }).click();
  await signup.waitForURL("**/signup**");
  await signup.getByLabel("Full name", { exact: true }).fill("Invite tester");
  await signup.getByLabel("Email address", { exact: true }).fill(user.email);
  await signup.locator("#signup-submit-btn").click();
  await signup.waitForURL("**/set-password**");
  assert.equal(
    new URL(signup.url()).searchParams.get("redirectTo"),
    destination,
    "signup must preserve the private invite during password setup"
  );
  await signup.locator("#new-password").fill("TestInvite1234");
  await signup.locator("#confirm-password").fill("TestInvite1234");
  await signup.getByRole("button", { name: "Create password", exact: true }).click();
  try {
    await signup.waitForURL(`**/challenges/${challengeId}`, { timeout: 25000 });
  } catch (error) {
    console.log(
      "Signup continuation failure:",
      signup.url(),
      (await signup.locator("body").innerText()).slice(-1800)
    );
    throw error;
  }
  console.log("PASS signup and password setup return to the private invite");
} finally {
  await browser?.close();
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else app.kill("SIGTERM");
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
  output.end();
}
