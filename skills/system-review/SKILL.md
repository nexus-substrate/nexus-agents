---
name: system-review
description: |
  Run a system review to check project health.
  Use when issues drop below 5, an EPIC closes, or 7+ days since last review.
  Triggers on "system review", "project health", "review system".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task, WebSearch
---

# System Review Skill

## Trigger Conditions

Run when ANY occur:

- Open GitHub issues drop below 5
- An EPIC issue is closed (label: `epic`)
- 7 days since last review
- Manual request

## Review Checklist

### Phase 1: Registry Reconciliation

```bash
# Count techniques by status
grep -c "status: implemented" docs/research/registry/techniques.yaml
grep -c "status: planned" docs/research/registry/techniques.yaml

# Verify RESEARCH_INDEX.md matches actual counts
# Check integration_files exist for implemented techniques
```

### Phase 2: Documentation Sync

- [ ] ARCHITECTURE.md reflects current phase status
- [ ] README.md lists current capabilities accurately
- [ ] CHANGELOG.md has entries for shipped features
- [ ] ALIGNMENT_ROADMAP.md phase status is current

### Phase 3: Issue Health

```bash
gh issue list --state open --limit 50
```

- [ ] No orphaned issues (referenced but not in GitHub)
- [ ] No stale issues (no activity > 30 days without `wontfix` label)
- [ ] Labels are accurate and consistent

### Phase 4: Generate Report

Create GitHub issue titled "System Review: YYYY-MM-DD" with findings and action items.

```bash
TZ='America/New_York' date '+%Y-%m-%d'
gh issue create --title "System Review: $(TZ='America/New_York' date '+%Y-%m-%d')" \
  --label "maintenance" --body "## Findings\n\n[report here]"
```
