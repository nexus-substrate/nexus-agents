---
name: version-check
description: |
  Check that dependencies are current stable versions and not deprecated.
  Use before adding new dependencies or at project setup.
  Triggers on "check versions", "verify dependencies", "audit packages".
allowed-tools: Bash, Read, WebFetch
---

# Version Check Skill

## Purpose

Verify all dependencies are current stable versions with no deprecations.

## Process

### 1. Get Current Time (ET)

```bash
TZ='America/New_York' date '+%Y-%m-%d %H:%M:%S %Z'
```

### 2. Check Node.js Version

```bash
node --version
# Should be 24.x LTS (current as of 2026)
```

### 3. Check Package Versions

For each dependency:

```bash
# Check current version and latest
npm view <package> version
npm view <package> 'dist-tags'

# Check for deprecation
npm view <package> deprecated

# Check last publish date
npm view <package> time.modified

# Check required Node version
npm view <package> engines
```

### 4. Evaluate Criteria

| Criterion | Pass | Fail |
|-----------|------|------|
| Deprecation | Not deprecated | Deprecated |
| Last update | Within 12 months | Over 12 months |
| Node version | Compatible with 24.x | Incompatible |
| Security | No advisories | Has advisories |

### 5. Run Security Audit

```bash
pnpm audit
# or
npm audit
```

### 6. Generate Report

```markdown
# Dependency Verification Report

**Date:** [Current ET time]
**Node.js:** [version]

## Summary
- Total packages: X
- Up to date: Y
- Needs update: Z
- Deprecated: W

## Details

| Package | Current | Latest | Status | Notes |
|---------|---------|--------|--------|-------|
| ... | ... | ... | ... | ... |

## Recommendations
[List any required updates or replacements]
```

## Actions

If deprecated package found:
1. Find recommended replacement
2. Create GitHub issue to track migration
3. Document migration path

If outdated package found:
1. Check changelog for breaking changes
2. Create GitHub issue if major update needed
3. Update if minor/patch
