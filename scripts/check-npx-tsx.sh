#!/usr/bin/env bash
#
# Fails when a workflow or package manifest invokes tsx through npx (#5411).
#
# tsx is a pinned devDependency, so it arrives in the lockfile and therefore in
# the pnpm store that CI already caches. Going through npx instead resolves from
# the registry on every cold runner -- setup-node caches `pnpm`, never
# ~/.npm/_npx -- which made arch-lint take 6m51s on CI for 3.95s of work and
# killed the Lint job at its cap twice while it reported zero lint errors.
#
# This lives in a script rather than inline in ci.yml for a specific reason: the
# check's own comment and error message contain the string it searches for, so
# an inline version matches its own definition and fails on a clean tree. It did
# exactly that on the PR that introduced it. Keeping it here lets the search
# exclude itself by path, which is honest -- the exclusion is one named file, not
# a pattern that could silently hide a real occurrence.
#
# governor-review.yml is excluded: governor-owned path per CODEOWNERS, not
# changed without owner ratification (same carve-out as #5400).
set -euo pipefail

matches=$(grep -rn 'npx tsx' \
  .github/workflows \
  package.json \
  packages/nexus-agents/package.json \
  2>/dev/null \
  | grep -v 'governor-review.yml' \
  || true)

if [ -n "$matches" ]; then
  echo "::error::Found 'npx tsx'. tsx is a declared devDependency - use 'pnpm exec tsx' (#5411)."
  echo "$matches"
  exit 1
fi

echo "OK: no npx-based tsx invocations in workflows or package manifests"
