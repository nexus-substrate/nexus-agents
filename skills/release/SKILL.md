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
- [ ] `pnpm coverage` — coverage hasn't regressed below the gate (89.66% statements, 93.26% functions per CLAUDE.md)
- [ ] No `TODO` / `FIXME` / `XXX` comments in production source added in this release that should have been resolved
- [ ] No `console.log` debugging statements in production code
- [ ] All `@deprecated` markers added in this release have a clear replacement and migration path (see `deprecation-and-migration` skill)

### Security

- [ ] `pnpm audit` shows no critical/high vulnerabilities (or each is documented + mitigated)
- [ ] No new secrets, env vars, or credentials added without `.env.example` placeholder + docs
- [ ] CodeQL alerts at 0 high/critical (see `security-scanning` skill)
- [ ] `gh api repos/{owner}/{repo}/dependabot/alerts?state=open` returns clean

### Documentation

- [ ] CHANGELOG entry exists for every public-API change (changesets handles this if `pnpm changeset` was run)
- [ ] Migration recipe in changeset for any breaking change (typed-only or runtime)
- [ ] `inject-governance.ts` regen ran cleanly (CLAUDE.md skill table, AGENTS.md, marketplace.json all in sync)
- [ ] No stale `@deprecated` references in `docs/`

### Pipeline health

- [ ] Last 5 release runs on `main` succeeded (`gh run list --workflow=Release --limit 5`)
- [ ] No release PR currently open (`gh pr list --search "version packages"`) — if one IS open, see "Avoid the publish race" below

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
   repository (`williamzujkowski/nexus-agents`), and environment. If you rename
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
