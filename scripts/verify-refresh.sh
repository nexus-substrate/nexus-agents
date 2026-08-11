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
npx tsx scripts/check-registry-coverage.ts
echo "::endgroup::"

echo "::group::config + registry tests"
# Scoped to the suites that read generated model data. A full run would be
# ~3 minutes of mostly-unrelated tests on a weekly cron; these are the ones a
# bad refresh actually breaks.
pnpm --filter nexus-agents exec vitest run src/config
echo "::endgroup::"

echo "verify-refresh: all gates passed"
