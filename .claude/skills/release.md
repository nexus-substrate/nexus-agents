---
name: release
description: |
  Execute a release following project standards.
  Use when publishing a new version, creating release tags, or deploying.
  Triggers on "release", "publish", "version bump", "create release".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task
---

# Release Skill

<!-- CANONICAL SOURCE: docs/development/CONTRIBUTION_GUIDE.md -->

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
