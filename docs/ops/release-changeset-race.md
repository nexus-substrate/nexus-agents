---
title: Release-changeset publish race runbook
description: Symptom, diagnostic, and fix for the version-skip publish race that bit us 2026-05-04 (jumped 2.64 → 2.67 on npm, skipping 2.65 and 2.66).
tier: 2
keywords: [release, changesets, publish, race, npm, version-skew]
---

# Release-changeset publish race runbook

## Symptom

`packages/nexus-agents/package.json` reports a higher version than `npm view nexus-agents version` returns. Releases on npm appear to skip one or more minor versions even though the changeset PR for those versions was merged.

Example (2026-05-04):

```
npm published: 2.64.0 → 2.67.0
package.json bumps that never published: 2.65.0, 2.66.0
```

The CHANGELOG accumulates everything correctly; only the npm tarball publishes are missed.

## Diagnostic check

Run this any time a `chore(release): version packages` PR has just merged but you're not sure if the publish actually happened:

```bash
LOCAL=$(jq -r '.version' packages/nexus-agents/package.json)
PUBLISHED=$(npm view nexus-agents version)
echo "package.json: $LOCAL"
echo "npm latest:   $PUBLISHED"
[ "$LOCAL" = "$PUBLISHED" ] && echo "OK: in sync" || echo "SKEW: package.json ahead of npm"
```

If `LOCAL > PUBLISHED`, the publish step did not run on the merge of the most recent release PR. (`changesets/action` re-entered PR mode instead of publish mode.)

## Root cause

`changesets/action` runs in one of two modes per push to `main`:

1. **Publish mode** — when `pnpm changeset:version` finds **no** pending changesets in `.changeset/` → runs `pnpm release` and publishes to npm.
2. **PR-update mode** — when `.changeset/*.md` files exist → consumes them on the side branch, force-pushes `changeset-release/main`, updates the open release PR.

The race: between the moment a release PR is opened and the moment it merges, **other PRs on `main` add new changesets**. When the release PR squash-merges, only the changesets it knew about are deleted from `main`. The new changesets are still there. The post-merge release run sees them, enters PR-update mode, creates a _new_ release PR for the _next_ version, and **skips publishing the just-bumped version**.

This compounds: every subsequent merge of a non-release PR adds another changeset; every subsequent release-PR merge re-races; every release run continues in PR-update mode.

## Fix

### Automatic (already in workflow as of #2382 / PR #2383)

`.github/workflows/release.yml` has a step `Detect publish-race version skew (#2382)` that runs after `changesets/action` when it did **not** publish. It checks three gates:

1. `local_version > published_version` (version skew exists)
2. **No** pending `.changeset/*.md` files (the version commit landed cleanly)
3. (implicit) Concurrency lock prevents racing publishes

If all three hold, the step runs `pnpm release` to force-publish the local version. Downstream SBOM upload, attest-build-provenance, and CycloneDX steps fire on either `steps.changesets.outputs.published == 'true'` or `steps.fallback-publish.outputs.published == 'true'`, so the recovery path produces the same supply-chain artifacts as the happy path.

### Manual recovery (if the automatic fallback is somehow disabled)

From `main` with `npm` credentials:

```bash
git checkout main
git pull
pnpm install
pnpm build
pnpm release       # runs `changeset publish` against current package.json
```

`changeset publish` is idempotent — if a version already exists on npm, it errors gracefully without re-publishing or affecting other versions.

After publishing, manually upload the SBOM and attest provenance if needed:

```bash
TAG="nexus-agents@$(jq -r '.version' packages/nexus-agents/package.json)"
gh release upload "$TAG" sbom.cdx.json --clobber
```

## Prevention

The race is rare. To minimize the chance of triggering it:

- **During deprecation batches or any cluster of related PRs**: when a `chore(release): version packages` PR is open, hold non-trivial PR merges until the release PR merges first. The autonomous-loop end-of-turn checklist should flag an open release PR.
- **Watch for the symptom early**: if you've merged a release PR and `npm view nexus-agents version` still shows the old version after ~5 minutes, check for the skew and rely on the automatic fallback. If the fallback step also failed, fall back to the manual recovery above.

## See also

- `#2382` — original ops issue documenting the race.
- `PR #2383` — workflow fallback implementation.
- `.github/workflows/release.yml` — the actual workflow definition.
- `package.json` `release` script — runs `pnpm build && changeset publish`.
