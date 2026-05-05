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

## Anti-rationalization — Dependency choice

| Excuse                                    | Counter                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| "It's the most-starred package"           | Stars correlate with marketing, not maintenance. Check last-commit, open-issues-vs-resolved-rate, recent CVE response time. |
| "Latest version is fine, just install it" | Latest may be a 0.x with breaking changes, or a v2 alpha. Check stability marker — `latest` tag isn't always stable.        |
| "I'll fix any issues that come up"        | Cost of `npm uninstall + replacement` is a multiple of `npm view` upfront. Ten seconds of due diligence saves an afternoon. |

## Red flags

- Dependency added via `npm install <name>` without a `version-check` cite in the PR
- Last commit > 12 months on a non-trivial dep
- Maintenance signal poor (open issues piling, no recent releases) but added anyway
- License incompatible with our MIT (e.g., AGPL, GPLv3 in CLI/library code)

## Verification checklist

- [ ] `npm view <pkg> dist-tags` confirms latest is intentional (not alpha/beta)
- [ ] Last commit < 6 months on `main` of upstream
- [ ] License compatible (`npm view <pkg> license`)
- [ ] No critical/high in `npm audit <pkg>`
- [ ] Bundle size impact known (use `bundlephobia` or `npm view <pkg> dist.tarball` size)
