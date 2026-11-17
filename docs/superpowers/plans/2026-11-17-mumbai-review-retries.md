# Mumbai hosting and durable proof reviews

**Goal:** Run Vercel functions in Mumbai and finish saved proof reviews after temporary AI outages without requiring an open browser.

**Design:** Set `vercel.json.regions` to `bom1`. A database trigger saves one review job per proof version. A database cron dispatches at most four leased jobs per minute using pg_net. Each dispatch gets a private, expiring token; only that token may run the worker. Browser requests authenticate and enqueue their own proof, then observe its status. Temporary network/429/5xx failures retry after 1, 2, 4, 8… minutes, capped at one hour, with jitter. Permanent errors and uncertain decisions enter human review. Verdicts, audit events and queue completion are transactional and reject stale leases, replaced uploads, removals and manual decisions. No fallback model is enabled.

**Constraints:** Preserve existing duplicate detection, 30/day automated-review cap, 0.6 confidence threshold, task requirements, decision notifications and coin triggers. Queue tables and worker functions are service-only. Scheduler stays inactive until the new edge handler is deployed. Existing unprocessed proofs are backfilled; human-review cases are excluded.

## Implementation plan

- [x] Configure Mumbai. Add queue migration, authenticated enqueue, leased dispatch, transactional completion and a rollback-only database regression suite.
- [x] Write failing tests for transient/permanent errors, invalid model output and stale/duplicate jobs. Implement a testable review engine and authenticated edge handler with bounded network calls.
- [x] Write failing browser-observer tests. Update the shared upload helper and composer to show queued/human states, preserve captions, and let users leave while processing continues.
- [x] Run unit tests, lint, build and database regressions; independently review the full change. Deploy the queue inactive, deploy the edge handler, enable scheduling, and verify real queued proofs recover.
- [ ] Publish the Mumbai app deployment, verify the live execution region and compare timings. Research fallback models from vendor docs and recommend without implementing them.

## Review focus

- Concurrent dispatch must never launch two workers for the same proof version.
- A timed-out worker must not overwrite a newer upload or a human decision.
- Lost HTTP requests must be recovered after lease expiry.
- Transient outages must not become approvals, rejections, or human-review decisions.
- Browser closure must not lose the saved proof, caption, or retry job.

## Progress

- Live schema, policies and triggers inspected. pg_cron/pg_net are available but not installed. Existing Gemini 503 errors confirmed. User authorized Mumbai hosting and durable retries; fallback suggestions only.
- Queue installed with no schedule yet; rollback SQL tests, 513 unit tests and Deno runtime type check passed. Ruling: Supabase owns pg_net grants; confirmed `net` API reads return 406 and only public/graphql_public are exposed. Dispatch uses a one-use, two-minute, proof-scoped lease, never a reusable secret. Keep `net` unexposed.
- Gateway verification remains enabled. The scheduler supplies the existing legacy public anon JWT to pass that check; a short-lived proof lease supplies worker authorization. Browser callers also pass independent getUser/ownership checks. Automatic review rejected the earlier proposal to disable gateway verification, so the deployment preserves it.
- Edge version 7 deployed with verify_jwt=true; cron ran successfully and both formerly stranded proofs reached completed decisions. Browser fixture passed caption-save-during-review and eventual-verdict-without-reinvocation. Fallback candidates: Claude Haiku 5.5 (independent provider) and Gemini 3.8 Flash (same-provider alternative); no integration added.
