---
name: release
description: |
  Execute a release following project standards.
  Use when publishing a new version, creating release tags, or deploying.
  Triggers on "release", "publish", "version bump", "create release".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task
---

# Release Skill

<!--
  CANONICAL SOURCES:
  - docs/development/CONTRIBUTION_GUIDE.md
  - docs/ops/release-changeset-race.md (publish-race runbook from #2382)
  - skills/deprecation-and-migration (when the release retires deprecated APIs)
  Adapted patterns from addyosmani/agent-skills (MIT, © 2025 Addy Osmani).
-->

## Pre-launch checklist (run before tagging)

The `pnpm changeset` workflow handles versioning, but the human-judgment gates below decide whether the release is _ready_. Run all of these:

### Code quality

- [ ] `pnpm lint && pnpm typecheck && pnpm test` — green
- [ ] `pnpm test:coverage` — coverage meets the [enforced thresholds](../../packages/nexus-agents/vitest.config.ts)
- [ ] No `TODO` / `FIXME` / `XXX` comments in production source added in this release that should have been resolved
- [ ] No `console.log` debugging statements in production code
- [ ] All `@deprecated` markers added in this release have a clear replacement and migration path (see `deprecation-and-migration` skill)

### Security

- [ ] `pnpm audit` shows no critical/high vulnerabilities (or each is documented + mitigated)
- [ ] No new secrets, env vars, or credentials added without `.env.example` placeholder + docs
- [ ] CodeQL alerts at 0 high/critical (see `security-scanning` skill)
- [ ] Capture and validate a fresh Dependabot inventory for this release head using the canonical GraphQL procedure below. A REST `state=open` result is not sufficient: a filtered response has previously included an explicitly `FIXED` alert.

#### Dependabot inventory (accessible repository scope)

Run this at the release commit and record the validator's sanitized output with the release evidence. Replace `<owner>/<repo>` and `<head-sha>` with the repository and exact commit being released; use a fresh UTC capture time. Do not add a `states` filter to the query.

```bash
set -o pipefail
owner='<owner>'
name='<repo>'
query='query($owner: String!, $name: String!, $endCursor: String) { repository(owner: $owner, name: $name) { vulnerabilityAlerts(first: 100, after: $endCursor) { totalCount pageInfo { hasNextPage startCursor endCursor } edges { cursor node { id state } } } } }'
gh api graphql --paginate -f query="$query" -F owner="$owner" -F name="$name" \
  | jq -sc --arg query "$query" --arg owner "$owner" --arg name "$name" '{query: $query, owner: $owner, name: $name, pages: .}' \
  | pnpm exec tsx scripts/check-dependabot-inventory.ts \
      --repository "$owner/$name" --head-sha '<head-sha>' --captured-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

The envelope records the exact query string and repository variables passed to `gh`; `jq -s` collects the JSON objects emitted by `gh --paginate`, and the validator checks the canonical query and requires those variables to match `--repository` before assessing pages. `jq` is required for this wrapper.

The validator emits counts, provenance, and finding codes only; it does not print alert IDs or raw API responses and does not make network requests. `clean` means the captured, unfiltered connection has no `OPEN` rows within the authenticated GitHub response's accessible scope. It is not a claim about alerts the credentials cannot access. `open_count` means review the open alerts' severity and mitigation before deciding release readiness; it does not by itself mean the release is blocked. `inconsistent` or `unmeasured` means the inventory did not establish a complete, trustworthy result and must not be recorded as clean. Exit codes: `0` clean, `2` open alerts found, `1` inconsistent or unmeasured. If `gh` or the validator fails, retain the failure as unmeasured evidence and investigate; do not fall back to the filtered REST query as a clean result.

### Documentation

- [ ] CHANGELOG entry exists for every public-API change (changesets handles this if `pnpm changeset` was run)
- [ ] Migration recipe in changeset for any breaking change (typed-only or runtime)
- [ ] `inject-governance.ts` regen ran cleanly (CLAUDE.md skill table, AGENTS.md, marketplace.json all in sync)
- [ ] No stale `@deprecated` references in `docs/`

### Pipeline health

- [ ] Last 5 release runs on `main` succeeded (`gh run list --workflow=Release --limit 5`)
- [ ] Resolve any open release PR (`gh pr list --search "version packages"`) before tagging. Verify its current head, review and applicable CI before merging; retain the publish-race hold below. An empty check rollup is **UNMEASURED**: follow the [exact-head workflow diagnostic](../../docs/ops/release-changeset-race.md#diagnose-an-empty-version-packages-check-rollup), including REST run IDs, head/event, status and conclusion. Existing `action_required` runs may need authorized workflow execution approval; this is separate from native PR review, governor ratification and passing CI.
- [ ] `npm view nexus-agents version` matches `packages/nexus-agents/package.json` — the `Detect npm-ahead version skew` step in `release.yml` also enforces this, but check before tagging
- [ ] No changeset debt — every recent shippable-source PR shipped its own changeset (the `Changeset Presence` CI gate enforces this going forward)

### Avoid the publish race

If you're merging a release PR while other PRs add changesets, you'll trigger the version-skip race documented in [release-changeset-race.md](../../docs/ops/release-changeset-race.md). To avoid:

1. Hold non-trivial PR merges while a release PR is open
2. After merging the release PR, verify within 5 minutes: `npm view nexus-agents version` should match `packages/nexus-agents/package.json`
3. If it doesn't, the workflow's force-publish fallback (#2383) should kick in on the next push. If still stuck, see the runbook.

## Pre-Release Checks

```bash
# Verify all gates pass
pnpm lint && pnpm typecheck && pnpm test

# Check fitness score (must be >= 90)
nexus-agents fitness-audit --format=json
```

## Release Workflow (Changesets)

Releases are automated via changesets + GitHub Actions:

1. **Add a changeset** during development:

   ```bash
   pnpm changeset
   ```

2. **Merge PR to main** — the Release workflow will:
   - Create a "Version Packages" PR (bumps version, updates CHANGELOG.md)
   - When that PR merges, publish to npm via OIDC trusted publishing
   - Create a GitHub Release with auto-generated notes

3. **No tokens required** — npm authentication uses OIDC (see `id-token: write`
   permission in `.github/workflows/release.yml`). The trusted publisher is
   configured on npmjs.com to accept publishes from this repo's `release.yml`.

   **IMPORTANT: npm trusted publisher config must match workflow filename.**
   The npmjs.com package settings specify the exact workflow file (`release.yml`),
   repository (`nexus-substrate/nexus-agents`), and environment. If you rename
   the workflow file, update the npm trusted publisher config to match or
   publishing will fail with OIDC token rejection.

## Manual Publish (emergency only)

```bash
# Manual publish via the same release workflow (uses OIDC, no tokens needed)
gh workflow run release.yml

# Or with dry run:
gh workflow run release.yml -f dry_run=true
```

## Rollback (if needed)

```bash
npm unpublish nexus-agents@<version>  # Within 72 hours
git tag -d v<version> && git push --delete origin v<version>
```

## Release CLI Commands

The project also has built-in release automation:

```bash
nexus-agents release-notes      # Generate release notes
nexus-agents release-validate   # Validate release readiness
nexus-agents release-announce   # Announce release
```

## Anti-rationalization — Release

| Excuse                                       | Counter                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| "Skip the audit, dependencies are fine"      | `pnpm audit` shows critical/high before they ship. Five seconds of audit prevents a coordinated-disclosure scramble.                |
| "I'll fix the doc drift in the next release" | Documentation drift compounds. Block release on `inject-governance` and `check-docs-indexed` clean.                                 |
| "We can roll back if it's bad"               | npm `unpublish` only works <72h, and even then leaves the version "published" in semver caches. Pre-release gates prevent the need. |
| "The release PR is open, just merge it"      | If other PRs are queued with new changesets, you'll trigger the publish race (#2382). Hold queue until release PR merges.           |

## Red flags

- Release tagged with failing CI on main
- `pnpm audit` shows critical/high vulnerabilities
- CHANGELOG entry missing for a public-API change
- `npm view nexus-agents version` doesn't match `package.json` after release-PR merge (publish race — see release-changeset-race.md)
- Release PR merged while other changeset-adding PRs are open
