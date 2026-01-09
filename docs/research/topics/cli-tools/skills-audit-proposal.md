# Skills.md Standard Audit and Improvement Proposal

**Date:** 2026-01-09 (ET)
**Status:** Draft - Pending Vote
**Source:** Claude Code Agent Skills Documentation

---

## Research Summary

The Claude Code skills.md (officially SKILL.md) standard provides a format for
defining custom skills that Claude can automatically discover and invoke based
on user requests. Key findings:

| Aspect          | Specification                                                           |
| --------------- | ----------------------------------------------------------------------- |
| Required fields | `name` (64 chars), `description` (1024 chars)                           |
| Optional fields | `allowed-tools`, `model`, `context`, `agent`, `hooks`, `user-invocable` |
| Discovery       | Model-invoked based on description matching                             |
| Body limit      | Under 500 lines recommended                                             |
| Naming          | Gerund form preferred (verb-ing)                                        |

---

## Current Skills Audit

### 1. implement-feature.md

| Criterion           | Status | Notes                                          |
| ------------------- | ------ | ---------------------------------------------- |
| Name format         | PASS   | Lowercase with hyphens                         |
| Name length         | PASS   | 17 chars (< 64)                                |
| Description present | PASS   | Multi-line description                         |
| Description length  | PASS   | ~200 chars (< 1024)                            |
| Third person        | FAIL   | Uses "Use when" - acceptable but could improve |
| allowed-tools       | PASS   | Properly defined                               |
| Body length         | PASS   | 155 lines (< 500)                              |
| Trigger keywords    | PASS   | "implement", "add feature", "create", "build"  |

**Issues:**

- File structure: Single file vs directory with SKILL.md
- Could benefit from progressive disclosure for TDD and commit sections

### 2. research-and-vote.md

| Criterion           | Status | Notes                                        |
| ------------------- | ------ | -------------------------------------------- |
| Name format         | PASS   | Lowercase with hyphens                       |
| Name length         | PASS   | 16 chars (< 64)                              |
| Description present | PASS   | Clear multi-line description                 |
| Description length  | PASS   | ~180 chars (< 1024)                          |
| Third person        | PASS   | Uses neutral language                        |
| allowed-tools       | PASS   | Read-focused tools                           |
| Body length         | PASS   | 99 lines (< 500)                             |
| Trigger keywords    | PASS   | "research", "decide", "vote on", "consensus" |

**Issues:**

- Could add `context: fork` for isolated voting agent execution

### 3. version-check.md

| Criterion           | Status | Notes                                                     |
| ------------------- | ------ | --------------------------------------------------------- |
| Name format         | PASS   | Lowercase with hyphens                                    |
| Name length         | PASS   | 13 chars (< 64)                                           |
| Description present | PASS   | Clear purpose                                             |
| Description length  | PASS   | ~150 chars (< 1024)                                       |
| Third person        | PASS   | Neutral language                                          |
| allowed-tools       | PASS   | Bash, Read, WebFetch                                      |
| Body length         | PASS   | 106 lines (< 500)                                         |
| Trigger keywords    | PASS   | "check versions", "verify dependencies", "audit packages" |

**Issues:**

- None significant

---

## Gap Analysis

### Missing Skills (Based on CLAUDE.md Protocols)

| Skill Name         | Purpose                                             | Priority |
| ------------------ | --------------------------------------------------- | -------- |
| dogfooding-issues  | Process open issues using self-development protocol | P1       |
| reviewing-code     | Code review following project standards             | P2       |
| committing-changes | Git commit with conventional format                 | P2       |
| creating-prs       | PR creation with proper format                      | P2       |
| security-audit     | Security review per CODING_STANDARDS.md             | P2       |
| testing-code       | TDD workflow and test writing                       | P3       |

### Structure Improvements

| Current              | Proposed                              | Rationale                  |
| -------------------- | ------------------------------------- | -------------------------- |
| Single .md files     | Directory with SKILL.md               | Matches official structure |
| Flat organization    | Progressive disclosure                | Token efficiency           |
| No context isolation | Add `context: fork` where appropriate | Clean execution            |

---

## Proposal

### Option A: Incremental Improvements (Recommended)

1. **Keep current file structure** - Our single-file skills work fine
2. **Add missing high-priority skills** - dogfooding-issues, reviewing-code
3. **Add `context: fork`** to research-and-vote for isolated voting
4. **Minor description tweaks** for better discovery

**Effort:** Low
**Risk:** Low
**Compatibility:** Full backward compatibility

### Option B: Full Restructure

1. **Convert to directory structure** - Each skill as folder/SKILL.md
2. **Add all missing skills** from gap analysis
3. **Implement progressive disclosure** with reference files
4. **Add hooks** for pre/post execution validation

**Effort:** Medium
**Risk:** Low-Medium (may need testing)
**Compatibility:** Full (skills system handles both formats)

### Option C: Minimal Changes

1. **No structural changes**
2. **Add only dogfooding-issues skill** (highest priority)
3. **Document current skills** as compliant

**Effort:** Minimal
**Risk:** None
**Compatibility:** Full

---

## Recommendation

**Option A: Incremental Improvements**

Rationale:

- Current skills already comply with the standard
- Single-file format is valid and works well for our scope
- Focus on adding high-value missing skills
- Low effort with clear benefit

### Immediate Actions

1. Create `dogfooding-issues` skill for self-development workflow
2. Add `context: fork` to `research-and-vote.md`
3. Create `reviewing-code` skill for code review workflow

### Future Considerations

- Convert to directory structure if skills grow beyond 300 lines
- Add hooks for validation when we have specific requirements
- Consider `model` field if different skills need different models

---

## Voting Record

**Date:** 2026-01-09 (ET)
**Threshold:** Simple majority (reversible decision)
**Result:** APPROVED - Option A

| Agent     | Vote     | Reasoning                                                                           |
| --------- | -------- | ----------------------------------------------------------------------------------- |
| Architect | Option B | Directory structure scales better for 10+ skills, avoids future refactoring         |
| Security  | Option A | Incremental keeps security surface small, `context: fork` isolation is key addition |
| DevEx     | Option A | Pragmatic approach, current format works well, addresses operational needs          |
| PM        | Option A | Low effort, unblocks dogfooding, decision is reversible if needs change             |

**Final Tally:** Option A: 3 votes, Option B: 1 vote, Option C: 0 votes

**Dissent Acknowledged:** Architect's preference for directory structure noted. Will revisit
if skill count exceeds 6 or any skill exceeds 300 lines.

---

## Implementation Plan

1. Add `context: fork` to research-and-vote.md
2. Create dogfooding-issues skill (P1)
3. Create reviewing-code skill (P2)
4. Update sources.yaml with implementation status
