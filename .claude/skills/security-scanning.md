---
name: security-scanning
description: |
  Review and fix security scanning alerts from CodeQL and secret scanning.
  Run as part of system reviews, after CI runs, or on manual request.
  Triggers on "security scan", "codeql", "secret scanning", "security alerts".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Agent
---

# Security Scanning Skill

## Trigger Conditions

Run when ANY occur:

- System review (Phase 4 integration)
- New CodeQL alerts appear after CI
- Secret scanning alert notification
- Manual request ("check security alerts")

## Phase 1: Triage Alerts

```bash
# Check CodeQL alerts (open only)
gh api repos/{owner}/{repo}/code-scanning/alerts \
  --jq '[.[] | select(.state == "open")] | length'

# Check secret scanning alerts
gh api repos/{owner}/{repo}/secret-scanning/alerts \
  --jq '[.[] | select(.state == "open")] | length'
```

Categorize by severity: critical > high > medium > low.

## Phase 2: CodeQL Fixes

Priority order for CodeQL alert categories:

| Category                                  | Fix Pattern                                         |
| ----------------------------------------- | --------------------------------------------------- |
| `js/shell-command-constructed-from-input` | Use `execFile()` or validate inputs                 |
| `js/insecure-randomness`                  | Replace `Math.random()` with `crypto.randomBytes()` |
| `js/polynomial-redos`                     | Bound quantifiers, use character classes            |
| `js/incomplete-sanitization`              | Single-quote shell escaping                         |
| `js/missing-rate-limiting`                | Add rate limiter middleware                         |
| `js/incomplete-url-scheme-check`          | Validate HTTP/HTTPS only                            |

For each alert:

1. Read the affected file and understand the context
2. Write a test that reproduces the vulnerability
3. Apply the fix
4. Run tests to verify no regressions

## Phase 3: Secret Scanning

For each secret scanning alert:

1. **Assess**: Is the secret still active/valid?
2. **Rotate**: Generate new credentials if active
3. **Revoke**: Invalidate the exposed secret
4. **Remediate**: Update all references to use the new secret
5. **Dismiss**: Mark the alert as resolved with reason

Never commit secrets to resolve alerts — use environment variables.

## Phase 4: Report

Create or update a tracking issue with findings:

```bash
gh issue create --title "security: scanning alert review $(TZ='America/New_York' date '+%Y-%m-%d')" \
  --label "security" --body "## Alert Summary\n\n[counts and categories]\n\n## Actions Taken\n\n[fixes applied]"
```

## Integration with System Review

The system-review skill should include security scanning as Phase 4.5:

```
Phase 4: Security Audit (npm audit)
Phase 4.5: Code Scanning Review (CodeQL + secret scanning)
Phase 5: Code Quality
```

## Rate Limit

Max 5 auto-fixes per session. Beyond that, create issues for tracking.
