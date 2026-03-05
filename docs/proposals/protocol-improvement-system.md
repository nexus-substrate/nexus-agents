# Protocol Improvement System Proposal

**Date:** 2026-01-11 (ET)
**Status:** IMPLEMENTED — Superseded by CLAUDE.md governance (Self-Check Quality Gate, Discovered Issues Protocol, system-review skill, DocOps pipeline). Voted 3/3 APPROVE to close on 2026-03-04.
**Author:** Claude Code Swarm

---

## Executive Summary

This proposal addresses gaps in the nexus-agents development workflow that lead to documentation drift, duplicate efforts, and orphaned tracking entries. It introduces:

1. **System Review Protocol** - Triggered when open issues drop below 5 or an EPIC closes
2. **Implementation Complete Checklist** - Standardized verification before marking work done
3. **Automatic Issue Creation Protocol** - Capture new issues discovered during work
4. **Registry Reconciliation Protocol** - Periodic validation of documentation accuracy
5. **Documentation Update Workflow** - Explicit steps for keeping docs in sync

---

## Problem Statement

### Identified Gaps

1. **No automated status synchronization** - GitHub issue status doesn't auto-update registry entries
2. **No cross-reference validation** - RESEARCH_INDEX.md shows "Implemented: 0" while techniques.yaml shows 25+ implemented
3. **Missing system health check** - No periodic reconciliation protocol exists
4. **Orphaned documentation updates** - Implementation workflow ends at "merge" without doc updates
5. **No automatic issue creation** - Problems found during work get lost without tracking

### Impact

- Documentation drift accumulates over time
- Duplicate research/implementation efforts occur
- Status information becomes unreliable
- Technical debt becomes invisible

---

## Proposed Solutions

### 1. System Review Protocol

**Trigger Conditions:**

- Open GitHub issues drop below 5
- An EPIC issue is closed (label: `epic`)
- Quarterly (every 90 days minimum)
- Manual request: `/system-review`

**Protocol Steps:**

```markdown
## System Review Checklist

### Phase 1: Registry Reconciliation (15 min)

- [ ] Run `grep -c "status: implemented" docs/research/registry/techniques.yaml`
- [ ] Verify RESEARCH_INDEX.md Quick Stats match actual counts
- [ ] Check all `implementation_issue` references point to closed issues
- [ ] Verify `integration_files` exist for implemented techniques

### Phase 2: Documentation Sync (15 min)

- [ ] ARCHITECTURE.md reflects current phase status
- [ ] README.md lists current capabilities accurately
- [ ] CHANGELOG.md has entries for all shipped features
- [ ] PROJECT_PLAN.md phase status is current

### Phase 3: Issue Health (10 min)

- [ ] No orphaned issues (referenced but not in GitHub)
- [ ] No stale issues (no activity > 30 days)
- [ ] Labels are accurate and consistent
- [ ] Priorities (P1-P4) match current reality

### Phase 4: Codebase Alignment (10 min)

- [ ] All implemented techniques have tests
- [ ] No dead code from removed features
- [ ] Exports match documented capabilities
- [ ] No TODO comments older than 30 days

### Phase 5: Generate Report

- Create GitHub issue with findings
- Tag issues for any gaps found
- Update ALIGNMENT_ROADMAP.md if needed
```

**Output:** GitHub issue titled "System Review: YYYY-MM-DD" with findings and action items.

---

### 2. Implementation Complete Checklist

Before marking ANY technique or feature as "implemented":

```markdown
## Implementation Complete Criteria

A technique is marked `implemented` when ALL of the following are true:

### Code Requirements

- [ ] Code exists in specified `integration_files`
- [ ] All functions have explicit return types
- [ ] No `any` types (use `unknown` instead)
- [ ] JSDoc comments on public APIs

### Quality Gates

- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (relevant tests)
- [ ] Test coverage meets threshold (80%+ lines)

### Documentation Updates

- [ ] `docs/research/registry/techniques.yaml`:
  - `status: implemented`
  - `decision_history` entry with commit reference
  - `integration_files` list is accurate
- [ ] `docs/research/registry/papers.yaml`:
  - `implementation_status` updated for source paper
- [ ] `docs/research/RESEARCH_INDEX.md`:
  - Quick Stats updated if needed
  - Priority table reflects new status
- [ ] Topic README updated:
  - `docs/research/topics/[topic]/README.md`

### GitHub Tracking

- [ ] Implementation issue closed with summary comment
- [ ] PR merged (if applicable)
- [ ] Related issues cross-referenced

### Optional (for major features)

- [ ] README.md updated if user-facing
- [ ] ARCHITECTURE.md updated if architectural
- [ ] CHANGELOG.md entry prepared
```

---

### 3. Automatic Issue Creation Protocol

When discovering issues during work, IMMEDIATELY create a GitHub issue:

````markdown
## Discovered Issue Protocol

### When to Create Issues

- Bug found in existing code
- Technical debt identified
- Missing test coverage discovered
- Documentation inaccuracy found
- Performance concern noted
- Security consideration identified
- Refactoring opportunity spotted

### Issue Creation Format

**Title Pattern:** `{type}: {brief description}`

- `bug:` - Defect in existing functionality
- `tech-debt:` - Code quality improvement needed
- `docs:` - Documentation update needed
- `test:` - Test coverage gap
- `perf:` - Performance improvement opportunity
- `security:` - Security consideration
- `research:` - New research topic to explore

**Body Template:**

```text
## Context
Discovered while working on: #{current_issue}

## Description
[What was found]

## Location
- File(s): `path/to/file.ts`
- Line(s): [if applicable]

## Suggested Action
[Brief recommendation]

## Priority
- [ ] P1 - Critical, blocks current work
- [ ] P2 - Important, should address soon
- [ ] P3 - Nice to have
- [ ] P4 - Long-term consideration
```
````

**Labels to Apply:**

- Type label (bug, enhancement, tech-debt, etc.)
- Priority label (P1, P2, P3, P4)
- `discovered` label (for tracking)

````

### Command Shortcut

```bash
# Quick issue creation
gh issue create \
  --title "type: brief description" \
  --body "Discovered while working on #XXX" \
  --label "type,discovered,priority"
````

---

### 4. Registry Reconciliation Protocol

Run after every System Review or when inconsistencies suspected:

```bash
#!/bin/bash
# scripts/reconcile-registry.sh

echo "=== Registry Reconciliation ==="

# 1. Count techniques by status
echo "\n## Technique Status Counts"
echo "Implemented: $(grep -c "status: implemented" docs/research/registry/techniques.yaml)"
echo "Planned: $(grep -c "status: planned" docs/research/registry/techniques.yaml)"
echo "Partial: $(grep -c "status: partial" docs/research/registry/techniques.yaml)"
echo "Not Started: $(grep -c "status: not-started" docs/research/registry/techniques.yaml)"

# 2. Find implemented techniques with missing files
echo "\n## Checking integration_files exist..."
grep -A 20 "status: implemented" docs/research/registry/techniques.yaml | \
  grep "integration_files:" -A 10 | \
  grep "\.ts" | \
  while read -r file; do
    clean_file=$(echo "$file" | sed "s/.*'\(.*\)'.*/\1/")
    if [ ! -f "$clean_file" ]; then
      echo "MISSING: $clean_file"
    fi
  done

# 3. Find closed issues not marked implemented
echo "\n## Checking issue status alignment..."
grep "implementation_issue:" docs/research/registry/techniques.yaml | \
  grep -v "null" | \
  while read -r line; do
    issue_num=$(echo "$line" | grep -oE '[0-9]+')
    gh_status=$(gh issue view "$issue_num" --json state -q '.state' 2>/dev/null)
    if [ "$gh_status" = "CLOSED" ]; then
      echo "Issue #$issue_num is CLOSED - verify technique status"
    fi
  done

echo "\n=== Reconciliation Complete ==="
```

---

### 5. Documentation Update Workflow

Add to CLAUDE.md Feature Implementation section:

```markdown
### Feature Implementation Workflow (Updated)

1. Create GitHub issue with requirements
2. Research and document approach
3. Define interfaces (if new module)
4. Implement with TDD (test first)
5. Run quality gates (`pnpm lint && pnpm typecheck && pnpm test`)
6. Create PR with issue reference
7. Address review feedback
8. Merge and close issue
9. **Update research tracking** (if research-related):
   - Update `docs/research/registry/techniques.yaml` status
   - Add decision_history entry with commit reference
   - Update RESEARCH_INDEX.md if statistics changed
   - Update topic README if applicable
10. **Update documentation** (if significant):
    - README.md for user-facing changes
    - ARCHITECTURE.md for architectural changes
    - CHANGELOG.md entry for release notes
11. **Verify completeness**:
    - Run Implementation Complete Checklist
    - Confirm no orphaned TODO comments
```

---

## CLAUDE.md Additions

### New Section: System Review Protocol

````markdown
## System Review Protocol

### Trigger Conditions

Run a System Review when ANY of these occur:

- Open GitHub issues drop below 5
- An EPIC issue is closed
- 90 days since last review
- `/system-review` command issued

### Review Process

1. **Spawn Review Swarm** with 5 specialized agents:
   - Registry Reconciliation Agent
   - Documentation Sync Agent
   - Issue Health Agent
   - Codebase Alignment Agent
   - Report Generator Agent

2. **Execute Checklist** (see System Review Checklist above)

3. **Generate Report**:
   - Create GitHub issue with findings
   - Create issues for any gaps found
   - Update ALIGNMENT_ROADMAP.md

4. **Consensus Vote** on discovered priorities

### Quick Commands

```bash
# Check current open issue count
gh issue list --state open --json number | jq length

# Check for EPICs
gh issue list --label "epic" --state closed --json number,title
```
````

````

### New Section: Discovered Issue Protocol

```markdown
## Discovered Issue Protocol

When finding issues during work, create a GitHub issue IMMEDIATELY:

```bash
# Bug discovered
gh issue create --title "bug: [description]" --label "bug,discovered"

# Tech debt found
gh issue create --title "tech-debt: [description]" --label "tech-debt,discovered"

# Docs issue
gh issue create --title "docs: [description]" --label "documentation,discovered"
````

### Priority Guidelines

| Priority | Definition          | Action                    |
| -------- | ------------------- | ------------------------- |
| P1       | Blocks current work | Address before continuing |
| P2       | Should fix soon     | Add to current sprint     |
| P3       | Nice to have        | Add to backlog            |
| P4       | Long-term           | Track for future          |

````

---

## Implementation Plan

### Phase 1: Documentation Updates (Immediate)
1. Add System Review Protocol to CLAUDE.md
2. Add Implementation Complete Checklist to CLAUDE.md
3. Add Discovered Issue Protocol to CLAUDE.md
4. Update Feature Implementation Workflow in CLAUDE.md
5. Add ALIGNMENT_ROADMAP.md to CLAUDE.md File References

### Phase 2: Registry Reconciliation (Immediate)
1. Fix RESEARCH_INDEX.md statistics to match actual counts
2. Update papers.yaml implementation_status for implemented techniques
3. Verify all integration_files exist

### Phase 3: Tooling (Future)
1. Create scripts/reconcile-registry.sh
2. Add pre-commit hook for registry validation
3. Consider GitHub Action for automated sync

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| RESEARCH_INDEX.md accuracy | ~0% | 100% |
| Documentation drift incidents | Unknown | 0/month |
| Orphaned issues | Unknown | 0 |
| System reviews completed | 0 | 4/year minimum |
| Discovered issues tracked | 0% | 100% |

---

## Appendix: Updated File References for CLAUDE.md

```markdown
## File References

- @CODING_STANDARDS.md - Detailed coding standards
- @ARCHITECTURE.md - System architecture and design decisions
- @docs/ALIGNMENT_ROADMAP.md - Current implementation status and gap analysis
- @docs/research/RESEARCH_INDEX.md - Research tracking overview
- @docs/research/CONTRIBUTING.md - Research contribution guidelines
- @packages/nexus-agents/src/core/types/index.ts - Core type definitions
- @packages/nexus-agents/src/mcp/ - MCP server and tool implementations
- @packages/nexus-agents/src/agents/ - Agent framework
````

---

**Proposal Status:** Ready for 5-Agent Consensus Vote
