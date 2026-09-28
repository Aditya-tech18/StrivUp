<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent instructions for this repo

## The live database is the source of truth

`supabase/migrations/*.sql` has **drifted** from the live project
(`cxujipeulvhreiryaptr`). Confirmed divergences include a `request_status`
column on `followers` and six columns on `notifications` that appear nowhere in
the migration files, plus 13 triggers and 16 functions the files never create.

So: **introspect the live schema before writing any DDL or any query that
assumes a column.** Do not trust these files, and do not assume a migration in
this folder has been applied.

Consequences worth knowing before you touch data:

- Every new migration must be idempotent — `IF NOT EXISTS`, and
  `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_policies ...)` guards for policies.
- `proof_submissions.ai_classification` is constrained to
  `match | mismatch | uncertain`. Writing anything else fails silently if you
  don't check the update's error, which has already caused a bug where the
  function reported a verdict it never persisted. **Check the error on every
  write whose result you report back to the caller.**
- `list_tables` row counts come from Postgres statistics and can be stale by
  orders of magnitude. Use `select count(*)` when the number matters.

## Routing

One routing file: `src/proxy.ts`. Next 16 renamed `middleware` to `proxy`, and
the file must sit beside `app/` — `src/`, not the repo root. A root-level
`proxy.ts` is silently ignored, which is exactly how a dead copy once sat at the
root while `src/middleware.ts` quietly served all traffic. Never add a
`middleware.ts` back.

## Summary format

After completing any task, end your response with a summary in this exact format:

## Summary
- **Files created:** [list paths]
- **Files modified:** [list paths]
- **Packages installed:** [list, or "none"]
- **Verification run:** [e.g. "npm run build — exit 0", "npm run dev — started clean"]
- **Deviations from the request:** [anything you did differently than asked,
  and why — or "none"]
- **Follow-ups needed:** [anything left unfinished, stubbed, or requiring a
  manual step before the next task — or "none"]

Keep this summary concise — a table or short bullets, not prose paragraphs.
