#!/usr/bin/env bash
# Decides whether a release.yml run will publish, so `publish-smoke` knows
# whether to smoke the packed tarball(s) first (#6770, #6790).
#
# Usage: scripts/decide-publish-smoke.sh <sha>
#   Run from the repo root. Writes `will_publish` and `memory_ahead` to
#   $GITHUB_OUTPUT. Exits 1 when an npm lookup fails.
#
# Extracted from release.yml unchanged so it can be tested
# (scripts/decide-publish-smoke.test.ts, #6804).
set -euo pipefail

sha="${1:?usage: decide-publish-smoke.sh <sha>}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"

# Read the commit object, not the tree (#4487): the same inputs the
# release job's fallback decision reads.
pending=$(pnpm exec tsx scripts/count-pending-changesets.ts "$sha")
if [ "$pending" -gt 0 ]; then
  echo "$pending non-empty changeset(s) pending: this run opens or updates the version PR and publishes nothing. No smoke."
  echo "will_publish=false" >> "$GITHUB_OUTPUT"
  echo "memory_ahead=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

# `changeset publish` publishes EVERY package whose committed version
# npm lacks, so both published packages are measured: a bump of
# nexus-memory alone still publishes.
will_publish=false
memory_ahead=false
for pkg in nexus-agents nexus-memory; do
  local_version=$(git show "$sha:packages/$pkg/package.json" | jq -r '.version')
  # A failed lookup is unmeasured, never "nothing to publish" (#4927):
  # guessing "not ahead" here would skip the smoke on a real publish.
  if ! published_version=$(npm view "$pkg" version 2>/dev/null) || [ -z "$published_version" ]; then
    echo "::error::npm view $pkg version failed, so whether this run publishes is unmeasured. Not skipping the smoke on a guess; re-run once the registry answers."
    exit 1
  fi
  larger=$(printf '%s\n%s\n' "$local_version" "$published_version" | sort -V | tail -1)
  echo "$pkg: package.json=$local_version npm=$published_version"
  if [ "$local_version" != "$published_version" ] && [ "$larger" = "$local_version" ]; then
    echo "$pkg is ahead of npm: this run publishes it."
    will_publish=true
    if [ "$pkg" = "nexus-memory" ]; then memory_ahead=true; fi
  fi
done
if [ "$will_publish" = "true" ]; then
  echo "No pending changesets and a package is ahead of npm: smoking the packed tarball(s) first."
else
  echo "No pending changesets and no package is ahead of npm: nothing new to publish. No smoke."
fi
echo "will_publish=$will_publish" >> "$GITHUB_OUTPUT"
echo "memory_ahead=$memory_ahead" >> "$GITHUB_OUTPUT"
