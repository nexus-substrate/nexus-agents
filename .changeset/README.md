# Changesets

This project uses [changesets](https://github.com/changesets/changesets) for version management and changelog generation.

## Quick Reference

```bash
# Add a changeset (after making changes)
pnpm changeset

# Preview version bumps
pnpm changeset version --no-commit

# Publish (CI does this automatically)
pnpm changeset publish
```

## Workflow

1. **Make Changes**: Implement your feature or fix
2. **Add Changeset**: Run `pnpm changeset` to describe your changes
3. **Select Package**: Choose `nexus-agents` (or future packages)
4. **Select Bump Type**:
   - `patch` - Bug fixes, documentation
   - `minor` - New features, non-breaking changes
   - `major` - Breaking changes
5. **Write Summary**: Brief description for the changelog entry
6. **Commit**: Include the generated `.changeset/*.md` file with your PR

## Changeset Format

Changesets are stored as markdown files:

```markdown
---
'nexus-agents': minor
---

Add release automation CLI commands (#637)
```

Changeset descriptions support markdown and can include multi-line content. Use issue/PR references (e.g., `#637`) for traceability.

## Two-Changelog Architecture

This project maintains two changelogs:

| Changelog         | Location                             | Updated By             | Format                                 |
| ----------------- | ------------------------------------ | ---------------------- | -------------------------------------- |
| Package CHANGELOG | `packages/nexus-agents/CHANGELOG.md` | Changesets (automatic) | Changesets format with commit links    |
| Root CHANGELOG    | `CHANGELOG.md`                       | Maintainer (manual)    | Keep a Changelog with curated sections |

**How it works:**

1. Contributors add changesets with their PRs
2. On merge to main, `changesets/action` creates a "Version Packages" PR
3. That PR auto-updates `packages/nexus-agents/CHANGELOG.md` with changeset entries
4. When the Version Packages PR merges, the package is published to npm
5. The root `CHANGELOG.md` is updated by the maintainer during release prep using `nexus-agents release-notes` as a starting point

## CI Integration

When changes with changesets merge to main, the Release workflow (`release.yml`):

1. Creates a "Version Packages" PR (version bump + package CHANGELOG update)
2. When that PR merges, publishes to npm via OIDC trusted publishing (no tokens)
3. Creates a GitHub Release with auto-generated notes

The `release-validate` CLI command checks both changelogs for the current version.

## When to Add a Changeset

| Change Type                 | Bump  | Changeset Required |
| --------------------------- | ----- | ------------------ |
| Breaking API change         | major | Yes                |
| New feature                 | minor | Yes                |
| Bug fix                     | patch | Yes                |
| Documentation               | patch | Optional           |
| Refactoring (no API change) | -     | No                 |
| Test updates                | -     | No                 |
| CI/tooling changes          | -     | No                 |

## Skipping Changesets

For changes that don't affect the published package:

- Add `[skip changeset]` to your commit message, OR
- The CI bot will comment asking for a changeset - reply with explanation

## Links

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Adding a Changeset](https://github.com/changesets/changesets/blob/main/docs/adding-a-changeset.md)
- [Common Questions](https://github.com/changesets/changesets/blob/main/docs/common-questions.md)
