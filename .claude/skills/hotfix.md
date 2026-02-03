---
name: hotfix
description: |
  Apply a hotfix for critical production issues.
  Use for security vulnerabilities or bugs that prevent core functionality.
  Triggers on "hotfix", "emergency fix", "critical fix", "production bug".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task
---

# Hotfix Skill

<!-- CANONICAL SOURCE: docs/development/CONTRIBUTION_GUIDE.md -->

## Hotfix Criteria (ALL must be true)

- Issue is in production (deployed, not development branch)
- Issue prevents core functionality (not feature degradation)
- Fix cannot wait for next release cycle
- Issue affects active users or critical systems

**If criteria not met:** Use the `bug-fix` skill instead.

## Workflow

1. **Create branch from latest release tag:**

   ```bash
   git tag --sort=-v:refname | head -5  # Find latest tag
   git checkout -b hotfix/<issue>-description <latest-tag>
   ```

2. **Implement fix** with minimal changes — no refactoring, no extras

3. **Fast-track review:** Security label + P1 = single-reviewer approval sufficient

4. **Quality gates:**

   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   ```

5. **Merge to main AND cherry-pick to release branch**

6. **Immediate release** with patch version bump:
   ```bash
   # Bump patch version
   npm version patch
   git push origin main --tags
   pnpm publish
   gh release create v<new-version> --generate-notes
   ```

## Rollback (if needed)

```bash
npm unpublish nexus-agents@<version>  # Within 72 hours
git tag -d v<version> && git push --delete origin v<version>
```
