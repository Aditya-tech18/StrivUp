#!/usr/bin/env node
/**
 * scripts/verification.mjs — the blue-seal queue from a terminal.
 *
 *   node scripts/verification.mjs list [waiting|approved|rejected|all]
 *   node scripts/verification.mjs show <request-id>
 *   node scripts/verification.mjs approve <request-id>
 *   node scripts/verification.mjs reject  <request-id> "reason"
 *
 * Authorisation
 * -------------
 * This script signs in as a real admin account and acts as that person. It
 * does NOT use the service-role key, deliberately: the service role bypasses
 * RLS entirely, so a mistake here would be able to grant a seal to anyone,
 * and the approval would be recorded against nobody. Signing in means
 * admin_review_identity_request applies its own is_platform_admin check and
 * stamps reviewed_by with a real admin id, exactly as the web UI does.
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   STRIVUP_ADMIN_EMAIL, STRIVUP_ADMIN_PASSWORD
 */

import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.STRIVUP_ADMIN_EMAIL;
const PASSWORD = process.env.STRIVUP_ADMIN_PASSWORD;

const DOC_LABELS = {
  aadhaar: "Aadhaar card",
  voter_id: "Voter ID",
  driving_license: "Driving licence",
};

function die(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

function usage() {
  console.log(`
  Blue-seal review queue

    list [waiting|approved|rejected|all]   show applications (default: waiting)
    show <request-id>                      one application, with a 60s document link
    approve <request-id>                   grant the blue seal
    reject <request-id> "reason"           decline, with a reason the applicant sees

  Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
  STRIVUP_ADMIN_EMAIL and STRIVUP_ADMIN_PASSWORD.
`);
}

async function signIn() {
  if (!URL_ || !ANON) die("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  if (!EMAIL || !PASSWORD) die("Set STRIVUP_ADMIN_EMAIL and STRIVUP_ADMIN_PASSWORD.");

  const supabase = createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (error) die(`Could not sign in: ${error.message}`);

  // Fail loudly here rather than letting every RPC come back "not_admin".
  const { data: isAdmin } = await supabase.rpc("is_platform_admin", {
    p_user: data.user.id,
  });
  if (!isAdmin) die(`${EMAIL} is not a platform admin.`);

  return supabase;
}

function statusFor(word) {
  const map = {
    waiting: "under_review",
    pending: "under_review",
    approved: "approved",
    rejected: "rejected",
    all: "all",
  };
  return map[word] ?? "under_review";
}

async function list(supabase, which) {
  const { data, error } = await supabase.rpc("admin_list_identity_requests", {
    p_status: statusFor(which),
    p_limit: 100,
  });
  if (error) die(error.message);
  if (!data?.ok) die(data?.error ?? "unknown error");

  const rows = data.requests ?? [];
  if (rows.length === 0) {
    console.log("\n  Nothing here.\n");
    return;
  }

  console.log(`\n  ${rows.length} application${rows.length === 1 ? "" : "s"}\n`);
  for (const r of rows) {
    const name = r.full_name ?? r.username ?? "Unnamed";
    const doc = DOC_LABELS[r.document_type] ?? "no document";
    const mail = r.email_verified_at ? "email confirmed" : "EMAIL NOT CONFIRMED";
    console.log(`  ${r.id}`);
    console.log(`    ${name}  ${r.username ? "@" + r.username : ""}`);
    console.log(`    ${r.status}  ·  ${doc}  ·  ${mail}`);
    if (r.rejection_reason) console.log(`    reason: ${r.rejection_reason}`);
    console.log("");
  }
}

async function show(supabase, id) {
  const { data, error } = await supabase.rpc("admin_list_identity_requests", {
    p_status: "all",
    p_limit: 200,
  });
  if (error) die(error.message);
  if (!data?.ok) die(data?.error ?? "unknown error");

  const r = (data.requests ?? []).find((x) => x.id === id);
  if (!r) die(`No application with id ${id}.`);

  console.log(`
  ${r.full_name ?? "Unnamed"} ${r.username ? "@" + r.username : ""}
  status    ${r.status}
  email     ${r.email} ${r.email_verified_at ? "(confirmed)" : "(NOT confirmed)"}
  document  ${DOC_LABELS[r.document_type] ?? "none"}
  applied   ${new Date(r.created_at).toLocaleString("en-IN")}`);

  if (r.document_path) {
    const { data: signed, error: sErr } = await supabase.storage
      .from("identity-documents")
      .createSignedUrl(r.document_path, 60);
    if (sErr) console.log(`\n  Could not sign the document link: ${sErr.message}`);
    else console.log(`\n  Document (valid 60 seconds):\n  ${signed.signedUrl}`);
  }
  console.log("");
}

async function review(supabase, id, approve, reason) {
  const { data, error } = await supabase.rpc("admin_review_identity_request", {
    p_request_id: id,
    p_approve: approve,
    p_reason: reason ?? null,
  });
  if (error) die(error.message);
  if (!data?.ok) die(data?.error ?? "unknown error");

  if (approve) {
    console.log(`\n  Approved. ${data.verification_type === "business"
      ? "They keep the gold seal, since their business is verified."
      : "Blue seal granted."}\n`);
  } else {
    console.log("\n  Rejected. They can send another document.\n");
  }
}

const [cmd, arg, ...rest] = process.argv.slice(2);

if (!cmd || cmd === "help" || cmd === "--help") {
  usage();
  process.exit(0);
}

const supabase = await signIn();

switch (cmd) {
  case "list":
    await list(supabase, arg ?? "waiting");
    break;
  case "show":
    if (!arg) die("Give a request id.");
    await show(supabase, arg);
    break;
  case "approve":
    if (!arg) die("Give a request id.");
    await review(supabase, arg, true);
    break;
  case "reject":
    if (!arg) die("Give a request id.");
    await review(supabase, arg, false, rest.join(" ") || undefined);
    break;
  default:
    usage();
    process.exit(1);
}
