#!/usr/bin/env bash
#
# Fails when anything in the repo invokes tsx through npx (#5411, widened in #5413).
#
# tsx is a pinned devDependency, so it arrives in the lockfile and therefore in
# the pnpm store that CI already caches. Going through npx instead resolves from
# the registry on every cold runner -- setup-node caches `pnpm`, never
# ~/.npm/_npx -- which made arch-lint take 6m51s on CI for 3.95s of work and
# killed the Lint job at its cap twice while it reported zero lint errors.
#
# Scope. #5411 covered the executable surface: workflows and the two package
# manifests. #5413 widened it to every place the string is copied FROM --
# script usage comments, docs, skills, hooks and composite actions -- because a
# usage comment that says `npx tsx` is what the next workflow line gets pasted
# from, and ~270 such copies remained after the executable surface was fixed.
#
# This lives in a script rather than inline in ci.yml for a specific reason: the
# check's own comment and error message contain the string it searches for, so
# an inline version matches its own definition and fails on a clean tree. It did
# exactly that on the PR that introduced it. Keeping it here lets the search
# exclude itself by exact path, which is honest -- each exclusion below is one
# named file, not a pattern that could silently hide a real occurrence.
#
# Exclusions, each by exact path:
#   .github/workflows/governor-review.yml  governor-owned per CODEOWNERS; not
#                                          changed without owner ratification
#                                          (same carve-out as #5400).
#   packages/nexus-agents/CHANGELOG.md     frozen release history; rewriting
#                                          old entries would falsify the record.
#   scripts/check-docops-skill.test.ts     a unified-diff FIXTURE quotes the old
#                                          string on purpose (it is the "-" side
#                                          of a diff the test parses).
#   scripts/check-npx-tsx.sh               this file: the search string appears
#                                          in its own comment and error message.
set -euo pipefail

matches=$(grep -rn 'npx tsx' \
  .github/workflows \
  .github/actions \
  package.json \
  packages/nexus-agents/package.json \
  scripts \
  docs \
  skills \
  hooks \
  2>/dev/null \
  | grep -v -F -e '.github/workflows/governor-review.yml:' \
              -e 'packages/nexus-agents/CHANGELOG.md:' \
              -e 'scripts/check-docops-skill.test.ts:' \
              -e 'scripts/check-npx-tsx.sh:' \
  || true)

if [ -n "$matches" ]; then
  echo "::error::Found 'npx tsx'. tsx is a declared devDependency - use 'pnpm exec tsx' (#5411)."
  echo "$matches"
  exit 1
fi

echo "OK: no npx-based tsx invocations in workflows, actions, package manifests, scripts, docs, skills or hooks"
