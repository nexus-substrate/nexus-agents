#!/usr/bin/env bash
# Decides whether a release.yml run will publish, so `publish-smoke` knows
# whether to smoke the packed tarball(s) first (#6770, #6790).
#
# Usage: scripts/decide-publish-smoke.sh <sha>
#   Run from the repo root. Writes `will_publish` and `memory_ahead` to
#   $GITHUB_OUTPUT. Exits 1 when an npm lookup fails.
#
# Extracted from release.yml so it can be tested
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
  if ! versions=$(pnpm exec tsx scripts/publish-env.ts npm view "$pkg" versions --json 2>/dev/null); then
    echo "::error::npm view $pkg versions failed, so whether this run publishes is unmeasured. Not skipping the smoke on a guess; re-run once the registry answers."
    exit 1
  fi
  # Empty or malformed registry evidence cannot certify that nothing publishes.
  if ! versions=$(printf '%s' "$versions" | jq -ce 'if type == "string" then [.] else . end | select(type == "array" and length > 0) | select(all(.[]; type == "string" and length > 0))'); then
    echo "::error::npm view $pkg versions returned empty or invalid evidence; publication is unmeasured."
    exit 1
  fi
  if ! printf '%s' "$versions" | jq -e --arg version "$local_version" 'index($version) != null' >/dev/null; then
    echo "$pkg@$local_version is absent from npm's versions list: this run publishes it."
    will_publish=true
    if [ "$pkg" = "nexus-memory" ]; then memory_ahead=true; fi
  fi
done
if [ "$will_publish" = "true" ]; then
  echo "No pending changesets and a package version is absent from npm: smoking the packed tarball(s) first."
else
  echo "No pending changesets and both package versions are on npm: nothing new to publish. No smoke."
fi
echo "will_publish=$will_publish" >> "$GITHUB_OUTPUT"
echo "memory_ahead=$memory_ahead" >> "$GITHUB_OUTPUT"
