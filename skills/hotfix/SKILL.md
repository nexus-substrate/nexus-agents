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
   # Add changeset for patch bump
   pnpm changeset  # select patch
   git add . && git commit -m "chore: changeset for hotfix"
   git push origin main --tags
   # CI handles npm publish via OIDC trusted publishing
   # Or trigger manually: gh workflow run publish.yml
   ```

## Rollback (if needed)

```bash
npm unpublish nexus-agents@<version>  # Within 72 hours only
git tag -d v<version> && git push --delete origin v<version>
```

## Anti-rationalization — Hotfix

| Excuse                                                 | Counter                                                                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| "Skip tests, it's an emergency"                        | A hotfix without tests becomes the next regression. Add at least the failing-test-then-fix (Prove-It Pattern).                                 |
| "Bypass the lint gate just this once"                  | Hotfix bypass is the most expensive shortcut: the next change you ship inherits the broken state. Lint stays.                                  |
| "Skip the PR review, just push"                        | Hotfix PR review can be quick (one trusted reviewer + admin merge), but the second pair of eyes catches the wrong-fix-for-the-symptom mistake. |
| "Roll forward later, no need for proper rollback plan" | Production users can't wait. Either the hotfix works or there's a rollback plan; "we'll figure it out" is not a plan.                          |

## Red flags

- Hotfix PR with no test
- Hotfix that touches more than the affected subsystem (drive-by changes)
- Same hotfix reverted-and-reapplied multiple times (root cause is elsewhere)
- No incident timeline / post-mortem after the fix lands
- Branch named with the vuln class if the hotfix is security-shaped (use `security-advisory-response` instead)

## Verification checklist

- [ ] Failing test paired with the fix (Prove-It Pattern)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass before merge
- [ ] PR scope tight to the affected code; no drive-bys
- [ ] Rollback plan documented (revert PR + npm unpublish window if applicable)
- [ ] Incident timeline captured
- [ ] Post-fix: post-mortem issue filed for class-level mitigation if applicable
