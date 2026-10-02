#!/usr/bin/env bash
#
# consolidate-branches.sh
#
# Merges every remote branch that is ahead of main into main, verifies the
# result, and reports. Idempotent: with nothing ahead it changes nothing and
# exits 0.
#
#   ./scripts/consolidate-branches.sh            # dry run, report only
#   ./scripts/consolidate-branches.sh --apply    # merge and verify
#   ./scripts/consolidate-branches.sh --apply --push
#
# Safety rules, deliberately not configurable:
#   - Work happens on a scratch branch, never directly on main.
#   - A conflict stops the run. Nothing is auto-resolved, nothing is forced.
#   - No history rewriting and no --force push, ever.
#   - main is only updated after tsc, lint and build all pass.
#   - A file present on main must be present in the result, or the run aborts.
#
# This repo has no test suite, so "passes tests" means: tsc --noEmit, eslint
# and next build all exit 0.

set -euo pipefail

MAIN_BRANCH="${MAIN_BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
SCRATCH="integrate/auto-$(date +%Y%m%d-%H%M%S)"
APPLY=0
PUSH=0

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --push)  PUSH=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
fail() { printf '\n\033[31mFAILED: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
log "Preflight"
[ -n "$(git status --porcelain)" ] && fail "working tree is dirty; commit or stash first"
info "working tree clean"

git fetch --all --prune --quiet
git checkout --quiet "$MAIN_BRANCH"
git pull --ff-only --quiet "$REMOTE" "$MAIN_BRANCH"
info "$MAIN_BRANCH at $(git rev-parse --short HEAD)"

# ------------------------------------------------------- what is unmerged
log "Scanning branches"
CANDIDATES=()
while read -r ref; do
  [ "$ref" = "$REMOTE/$MAIN_BRANCH" ] && continue
  ahead=$(git rev-list --count "$REMOTE/$MAIN_BRANCH..$ref")
  if [ "$ahead" -gt 0 ]; then
    CANDIDATES+=("$ref")
    printf '    %-46s %s commit(s) ahead\n' "${ref#$REMOTE/}" "$ahead"
  else
    printf '    %-46s already merged\n' "${ref#$REMOTE/}"
  fi
done < <(git for-each-ref --format='%(refname:short)' "refs/remotes/$REMOTE" | grep -v 'HEAD$')

if [ ${#CANDIDATES[@]} -eq 0 ]; then
  log "Nothing to consolidate"
  info "every branch is already contained in $MAIN_BRANCH"
  exit 0
fi

# ------------------------------------------------- preview before merging
# git diff between two branches is a TWO-WAY diff and massively overstates
# what a merge does: every file main gained since the fork shows as a
# deletion. merge-tree computes the real merged tree instead.
log "Previewing merges"
for ref in "${CANDIDATES[@]}"; do
  out=$(git merge-tree --write-tree "$REMOTE/$MAIN_BRANCH" "$ref" 2>/dev/null || true)
  tree=$(printf '%s' "$out" | head -1)
  conflicts=$(printf '%s' "$out" | grep -c '^CONFLICT' || true)
  if git cat-file -e "${tree}^{tree}" 2>/dev/null; then
    dropped=$(comm -23 \
      <(git ls-tree -r --name-only "$REMOTE/$MAIN_BRANCH" | sort) \
      <(git ls-tree -r --name-only "$tree" | sort) | wc -l | tr -d ' ')
    printf '    %-46s conflicts=%-3s would drop %s file(s) from %s\n' \
      "${ref#$REMOTE/}" "$conflicts" "$dropped" "$MAIN_BRANCH"
  else
    printf '    %-46s preview unavailable\n' "${ref#$REMOTE/}"
  fi
done

if [ "$APPLY" -eq 0 ]; then
  log "Dry run complete"
  info "re-run with --apply to merge"
  exit 0
fi

# --------------------------------------------------------------- merging
log "Merging on $SCRATCH"
git checkout --quiet -b "$SCRATCH" "$MAIN_BRANCH"

for ref in "${CANDIDATES[@]}"; do
  info "merging ${ref#$REMOTE/}"
  if ! git merge --no-edit "$ref" >/dev/null 2>&1; then
    echo
    echo "Conflicts in ${ref#$REMOTE/}:"
    git diff --name-only --diff-filter=U | sed 's/^/      /'
    cat <<EOF

Stopping, as instructed. Nothing has been pushed and $MAIN_BRANCH is untouched.

Resolve on this branch ($SCRATCH), preferring whichever side is newer:
    git log --oneline -3 $REMOTE/$MAIN_BRANCH -- <file>
    git log --oneline -3 $ref -- <file>
    git checkout --ours <file>     # keep $MAIN_BRANCH
    git checkout --theirs <file>   # keep $ref
    git add <file> && git commit --no-edit

Then re-run with --apply, or abandon with:
    git merge --abort && git checkout $MAIN_BRANCH && git branch -D $SCRATCH
EOF
    exit 1
  fi
done

# ------------------------------------------------------------ verification
log "Verifying"

leftover=$(git grep -l '^<<<<<<<' -- . 2>/dev/null || true)
[ -n "$leftover" ] && fail "conflict markers left in: $leftover"
info "no conflict markers"

lost=$(comm -23 \
  <(git ls-tree -r --name-only "$REMOTE/$MAIN_BRANCH" | sort) \
  <(git ls-tree -r --name-only HEAD | sort))
if [ -n "$lost" ]; then
  echo "$lost" | sed 's/^/      /'
  fail "files on $MAIN_BRANCH are missing from the merge result"
fi
info "no files lost from $MAIN_BRANCH"

# This repo forbids a middleware.ts; src/proxy.ts is the single routing file.
# A branch reintroducing it is a real regression a merge will happily carry.
[ -f src/middleware.ts ] && fail "src/middleware.ts reintroduced; proxy.ts is canonical"
info "routing layer intact"

# Two pages resolving to the same URL build fine in isolation and collide here.
dupes=$(find src/app -name 'page.tsx' \
  | sed -E 's|src/app/||; s|\([^)]+\)/||g; s|/page\.tsx||' \
  | sort | uniq -d)
if [ -n "$dupes" ]; then
  echo "$dupes" | sed 's/^/      /'
  fail "two pages resolve to the same route"
fi
info "no route collisions"

npm ci --silent 2>/dev/null || npm install --silent
info "dependencies installed"

npx tsc --noEmit        || fail "tsc reported errors"
info "tsc clean"
npm run lint            || fail "eslint reported errors"
info "eslint clean"
npm run build           || fail "next build failed"
info "build clean"

# ------------------------------------------------------------- land it
log "Updating $MAIN_BRANCH"
git checkout --quiet "$MAIN_BRANCH"
git merge --no-ff --no-edit "$SCRATCH" \
  -m "Consolidate all feature branches into $MAIN_BRANCH

Merged: $(printf '%s ' "${CANDIDATES[@]#$REMOTE/}")

Verified: no files lost, no route collisions, tsc/lint/build all clean."

if [ "$PUSH" -eq 1 ]; then
  git push "$REMOTE" "$MAIN_BRANCH"
  info "pushed $(git rev-parse --short HEAD)"
else
  info "merged locally at $(git rev-parse --short HEAD); re-run with --push to publish"
fi

log "Done"
git branch -d "$SCRATCH" >/dev/null 2>&1 || true
