#!/usr/bin/env bash
# Gate set for the automated data-refresh workflows (#4424).
#
# PRs opened with GITHUB_TOKEN do not trigger `on: pull_request` workflows —
# GitHub suppresses that to prevent recursion. So the weekly registry and
# models.dev refreshes were opening PRs with NO checks at all: not pending,
# not failing, none. #4340 sat two weeks rewriting 2,295 lines of router data
# that way, and its diff had already caught the model retirement that later
# became bug #4410.
#
# This script is the single definition of what "verified" means for a refresh,
# invoked by both refresh workflows so the two cannot drift apart. It runs
# BEFORE the PR is opened: a failure here means no PR is created, rather than
# an unverifiable one that looks identical to a verified one.
#
# Residual risk, stated plainly: a gate added to ci.yml later is not applied
# here automatically. That is inherent to running gates outside the
# pull_request event and is the reason #4424 targets a GitHub App token as the
# end state — this script is the interim that removes the silent-green failure
# without handing a write-capable credential to a job that ingests third-party
# catalogue data.
set -euo pipefail

echo "::group::typecheck"
pnpm typecheck
echo "::endgroup::"

echo "::group::registry-coverage manifest"
pnpm exec tsx scripts/check-registry-coverage.ts
echo "::endgroup::"

echo "::group::full test suite"
# Deliberately the FULL suite, not a scoped subset.
#
# The first version of this gate ran only `src/config`, reasoning that those
# were "the ones a bad refresh actually breaks". That reasoning failed on its
# first real use: the #4340 refresh retired an openrouter `:free` SKU that
# `src/learning/usage-log.test.ts` had hardcoded, and main went red with the
# gate green. Guessing which suites depend on generated catalogue data is
# exactly the kind of judgement a gate should not be making — any test may
# reach the registry through `getDefaultRegistry()`.
#
# Cost is ~3 minutes on a weekly cron. That is cheap next to shipping a red
# main and then bisecting it.
# #5028: `--fail-if-no-match` is load-bearing. Without it pnpm exits 0 when the
# filter matches nothing (verified: `pnpm --filter nonexistent exec node -e 1`
# → exit 0), so `set -euo pipefail` cannot catch a silently-skipped suite. A
# package rename or a workspace-glob change would make this gate print
# "all gates passed" having run zero tests — the exact #4340 shape the comment
# above says it exists to prevent.
pnpm --filter nexus-agents --fail-if-no-match exec vitest run
echo "::endgroup::"

echo "::group::catalogue drift (advisory)"
# The refresh has just replaced the catalogue, which is the exact moment an
# in-tree entry can go stale — #4340's diff caught the qwen `:free` retirement
# two weeks before it surfaced as bug #4410, and nobody looked. Run the sweep
# here so it lands in the job log while the diff is in front of someone.
#
# Deliberately non-fatal: drift means an *in-tree* entry is wrong, not that
# this refresh is bad. Failing the job would block the correct catalogue update
# because of a pre-existing registry defect, which is backwards.
pnpm exec tsx scripts/check-catalogue-drift.ts || echo "^ drift reported; see #4417 — not blocking this refresh"
echo "::endgroup::"

echo "verify-refresh: all gates passed"
