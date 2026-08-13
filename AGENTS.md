<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent instructions for this repo

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
