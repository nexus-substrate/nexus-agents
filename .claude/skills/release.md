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

# Check fitness score (must be ≥ 90)
nexus-agents fitness-audit --format=json
```

## Release Workflow

1. **Update CHANGELOG.md** with version and date

2. **Version bump** in package.json (semantic versioning)

3. **Create and push tag:**

   ```bash
   git tag -a v<version> -m "Release v<version>"
   git push origin v<version>
   ```

4. **Publish to npm:**

   ```bash
   pnpm publish
   ```

5. **Create GitHub Release:**

   ```bash
   gh release create v<version> --generate-notes
   ```

6. **Update ALIGNMENT_ROADMAP.md** phase status

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
