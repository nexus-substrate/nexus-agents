---
name: version-check
description: |
  Check that dependencies are current stable versions and not deprecated.
  Use before adding new dependencies or at project setup.
  Triggers on "check versions", "verify dependencies", "audit packages".
allowed-tools: Bash, Read, WebFetch
---

# Version Check Skill

<!-- CANONICAL SOURCE: CLAUDE.md Core Operating Principles - Version Currency Enforcement -->

**Full documentation:** [CLAUDE.md](../../CLAUDE.md#2-version-currency-enforcement)

## Quick Process

### 1. Check Package Status

```bash
npm view <package> version
npm view <package> deprecated
npm view <package> time.modified
npm view <package> engines
```

### 2. Evaluate Criteria

| Criterion    | Pass                 | Fail           |
| ------------ | -------------------- | -------------- |
| Deprecation  | Not deprecated       | Deprecated     |
| Last update  | Within 12 months     | Over 12 months |
| Node version | Compatible with 22.x | Incompatible   |
| Security     | No advisories        | Has advisories |

### 3. Run Security Audit

```bash
pnpm audit
```

## Actions

If deprecated or outdated:

1. Find replacement
2. Create GitHub issue to track migration
3. Document migration path

See [CLAUDE.md](../../CLAUDE.md#2-version-currency-enforcement) for complete version verification protocol.
