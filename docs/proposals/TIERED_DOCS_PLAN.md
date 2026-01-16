# Tiered Documentation System - Comprehensive Plan

**Issue:** #283
**Created:** 2026-01-15 (ET)
**Status:** ✅ APPROVED - Ready for Implementation
**Voting:** Round 2 passed 5-0 APPROVE (9/10 avg confidence)

---

## Executive Summary

Transform nexus-agents' scattered documentation (~24,900 lines, 20-28% duplication) into a 3-tier progressive disclosure system that reduces agent context requirements by 87% while improving navigation.

---

## Round 1 Voting Results & Amendments

**Voting Date:** 2026-01-15 (ET)
**Result:** 5-0 APPROVE (Unanimous)

| Agent     | Vote    | Confidence | Key Amendment                                                         |
| --------- | ------- | ---------- | --------------------------------------------------------------------- |
| Architect | APPROVE | 8/10       | Define INDEX.yaml schema, commit generated files                      |
| Security  | APPROVE | 8/10       | Add CI guardrails for secrets in .generated/                          |
| DevEx     | APPROVE | 8/10       | Add TROUBLESHOOTING.md, extend timeline, keep CLAUDE.md 600-650 lines |
| AI/ML     | APPROVE | 8/10       | Add context budget guidance, consider llms-full.txt                   |
| PM        | APPROVE | 8/10       | Measure "time to first success", establish baseline                   |

### Incorporated Amendments

1. **INDEX.yaml Schema** (Architect): Concrete schema definition added to Phase 0
2. **Generated Files Committed** (Architect): `.generated/` contents committed, not gitignored
3. **Secrets Guardrails** (Security): CI check for sensitive data in generated docs
4. **TROUBLESHOOTING.md** (DevEx): Added to Tier 2 for common issues
5. **Extended Timeline** (DevEx): 17 days → 19 days for thoroughness
6. **CLAUDE.md Target** (DevEx): 500 lines → 600-650 lines (preserve unique content)
7. **Context Budget Guidance** (AI/ML): Added to CLAUDE.md requirements
8. **llms-full.txt** (AI/ML): Optional comprehensive variant for deep research
9. **Time-to-First-Success** (PM): New metric for onboarding validation
10. **Baseline Measurement** (PM): Discovery rate measured before migration

### Resolved Open Questions

| Question                  | Resolution                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| INDEX.yaml vs llms.txt    | **Both** - INDEX.yaml for automation, llms.txt for direct LLM use |
| CLAUDE.md reduction scope | **600-650 lines** - Less aggressive, preserve unique content      |
| Timeline                  | **19 days** - Extended by 2 days for validation                   |
| Auto-generation priority  | **llms.txt first** - Immediate value for LLM agents               |
| Semantic chunking         | **Defer** - Tier structure sufficient initially                   |

---

## Current State Analysis

### Problems Identified

| Problem                          | Impact                           | Evidence                                                                |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| 20-28% duplication               | ~5,000-7,000 wasted lines        | Time Authority in 2 files, MCP patterns in 3 files                      |
| 5 monolithic files (>1000 lines) | High token cost for simple tasks | CLAUDE.md 1,396 lines, ARCHITECTURE.md 1,186 lines                      |
| No unified index                 | Agents can't discover docs       | Multiple parallel systems (RESEARCH_INDEX, codebase-index, ENTRYPOINTS) |
| Skills duplicate CLAUDE.md       | 30-40% overlap                   | implement-feature.md repeats quality gates                              |
| Rules duplicate CODING_STANDARDS | 65-75% overlap                   | typescript.md repeats structure limits                                  |
| JSDoc never exported             | 1,067 annotations unused         | TypeDoc configured but not running                                      |

### Token Cost Analysis

| Context Type            | Current        | After Restructuring |
| ----------------------- | -------------- | ------------------- |
| Minimal (quick task)    | ~2,900 tokens  | ~800 tokens         |
| Standard (feature work) | ~8,400 tokens  | ~2,500 tokens       |
| Research context        | ~5,100 tokens  | ~1,500 tokens       |
| Full system review      | ~18,000 tokens | ~6,000 tokens       |

---

## Proposed Solution: 3-Tier Progressive Disclosure

### Tier Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ TIER 1: Navigation Layer (~100 tokens per entry)             │
│ Always loaded - enables discovery without content loading    │
│                                                              │
│ docs/INDEX.yaml         Machine-parseable topic index        │
│ docs/llms.txt           LLM-optimized navigation (new)       │
│ docs/llms-full.txt      Comprehensive variant (deep research)│
│ QUICK_START.md          Human entry point                    │
│ FAQ.md                  Common questions                     │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ TIER 2: Actionable Reference (~500 lines max per file)       │
│ Loaded when topic is relevant - provides how-to guidance     │
│                                                              │
│ docs/ARCHITECTURE/README.md     Architecture hub             │
│ docs/DEVELOPMENT/README.md      Development hub              │
│ docs/TROUBLESHOOTING.md         Common issues & solutions    │
│ CLAUDE.md (reduced)             Project context only         │
│ ENTRYPOINTS.md                  Keep as canonical API ref    │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ TIER 3: Detailed Explanations (on-demand, unlimited)         │
│ Loaded only when specifically needed                         │
│                                                              │
│ docs/ARCHITECTURE/*.md          Deep technical docs          │
│ docs/DEVELOPMENT/*.md           Development guides           │
│ docs/research/                  Research tracking (keep)     │
│ .generated/                     Auto-generated docs          │
└──────────────────────────────────────────────────────────────┘
```

### Key Techniques to Incorporate

#### From Claude Code Skills Pattern

- Metadata-first design (Tier 1 = skill metadata)
- Conditional loading via explicit links
- Single source of truth per fact

#### From Research (New Additions)

| Technique           | Source                   | Application                                   |
| ------------------- | ------------------------ | --------------------------------------------- |
| llms.txt standard   | llmstxt.org              | Machine-parseable index for LLM consumption   |
| Semantic chunking   | Pinecone/Chroma research | 70% accuracy improvement over fixed-size      |
| RAPTOR hierarchical | arXiv:2401.18059         | Tree-organized retrieval (20% accuracy boost) |
| GraphRAG cross-refs | Microsoft                | Knowledge graph for multi-hop reasoning       |
| YAML over JSON      | LLM research             | Fewer tokens, better parsing                  |

---

## Implementation Plan

### Phase 0: Foundation (Days 1-2)

**Goal:** Create infrastructure without breaking existing docs

- [ ] Create `docs/INDEX.yaml` with concrete schema (see below)
- [ ] Create `docs/llms.txt` following llmstxt.org standard
- [ ] Create `docs/llms-full.txt` comprehensive variant
- [ ] Create `docs/TROUBLESHOOTING.md` (common issues & solutions)
- [ ] Create directory structure:
  ```
  docs/
  ├── INDEX.yaml
  ├── llms.txt
  ├── llms-full.txt
  ├── TROUBLESHOOTING.md
  ├── ARCHITECTURE/
  │   └── README.md (placeholder)
  └── DEVELOPMENT/
      └── README.md (placeholder)
  ```
- [ ] Add CI check: `docs/INDEX.yaml` must be valid YAML
- [ ] Establish baseline discovery rate measurement (PM)
- [ ] Measure current "time to first success" for new agents (PM)

#### INDEX.yaml Schema (Architect Amendment)

```yaml
# docs/INDEX.yaml - Machine-parseable documentation index
schema_version: '1.0'
generated: '2026-01-15T00:00:00-05:00'

topics:
  architecture:
    summary: 'System design and component relationships'
    tier2_file: 'docs/ARCHITECTURE/README.md'
    tier3_files:
      - 'docs/ARCHITECTURE/AGENT_SYSTEM.md'
      - 'docs/ARCHITECTURE/MEMORY_SYSTEM.md'
      - 'docs/ARCHITECTURE/ROUTING_SYSTEM.md'
    keywords: ['agents', 'memory', 'routing', 'consensus']

  development:
    summary: 'How to contribute and extend the system'
    tier2_file: 'docs/DEVELOPMENT/README.md'
    tier3_files:
      - 'docs/DEVELOPMENT/AGENT_DEVELOPMENT.md'
      - 'docs/DEVELOPMENT/TOOL_DEVELOPMENT.md'
    keywords: ['contributing', 'testing', 'coding standards']

  troubleshooting:
    summary: 'Common issues and solutions'
    tier2_file: 'docs/TROUBLESHOOTING.md'
    keywords: ['errors', 'debugging', 'FAQ']

context_budgets:
  minimal: 800 # Quick tasks (tokens)
  standard: 2500 # Feature work
  research: 1500 # Research context
  full: 6000 # System review
```

### Phase 1: Split Monolithic Files (Days 3-5)

**Goal:** Break ARCHITECTURE.md into focused documents

- [ ] Extract `docs/ARCHITECTURE/AGENT_SYSTEM.md` (IAgent, state machine, collaboration)
- [ ] Extract `docs/ARCHITECTURE/MEMORY_SYSTEM.md` (8 memory types, usage guide)
- [ ] Extract `docs/ARCHITECTURE/ROUTING_SYSTEM.md` (from cli-project_plan.md)
- [ ] Extract `docs/ARCHITECTURE/CONSENSUS_PROTOCOLS.md` (11 protocols, decision tree)
- [ ] Extract `docs/ARCHITECTURE/SECURITY.md` (unified threat model + patterns)
- [ ] Extract `docs/ARCHITECTURE/MCP_PROTOCOL.md` (tool design patterns)
- [ ] Reduce `ARCHITECTURE.md` to hub with links (~300 lines)

### Phase 2: Development Guides (Days 6-8)

**Goal:** Create missing developer documentation

- [ ] Create `docs/DEVELOPMENT/CONTRIBUTION_GUIDE.md` (from CONTRIBUTING.md)
- [ ] Create `docs/DEVELOPMENT/AGENT_DEVELOPMENT.md` (new walkthrough)
- [ ] Create `docs/DEVELOPMENT/TOOL_DEVELOPMENT.md` (new walkthrough)
- [ ] Create `docs/DEVELOPMENT/MEMORY_DEVELOPMENT.md` (new walkthrough)
- [ ] Move `CODING_STANDARDS.md` to `docs/DEVELOPMENT/`
- [ ] Create `docs/DEVELOPMENT/README.md` as hub

### Phase 3: Reduce CLAUDE.md (Days 9-10)

**Goal:** CLAUDE.md becomes project context only

Current CLAUDE.md structure (1,396 lines):

- Quick Reference (27 lines) → KEEP
- Prerequisites (19 lines) → KEEP
- Environment Variables (8 lines) → KEEP
- Getting Started (44 lines) → KEEP
- Core Operating Principles (210 lines) → KEEP (unique)
- Orchestration Model (36 lines) → KEEP (unique)
- Consensus Voting Protocol (105 lines) → MOVE to ARCHITECTURE/CONSENSUS_PROTOCOLS.md
- A2A Protocol (42 lines) → LINK to ARCHITECTURE.md
- CLI Agent Integration (187 lines) → LINK to ARCHITECTURE/ROUTING_SYSTEM.md
- GitHub Integration (74 lines) → MOVE to DEVELOPMENT/CONTRIBUTION_GUIDE.md
- Coding Standards Enforcement (41 lines) → LINK to CODING_STANDARDS.md
- Security Protocol (126 lines) → LINK to ARCHITECTURE/SECURITY.md
- MCP Server Development (42 lines) → LINK to DEVELOPMENT/TOOL_DEVELOPMENT.md
- Agent Development (58 lines) → LINK to DEVELOPMENT/AGENT_DEVELOPMENT.md
- Project Structure (24 lines) → LINK to ARCHITECTURE.md
- Workflow Templates (78 lines) → KEEP
- Implementation Checklist (32 lines) → KEEP
- System Review Protocol (38 lines) → KEEP
- Error Handling (18 lines) → KEEP

**Target CLAUDE.md:** ~600-650 lines (53-57% reduction)

**Additional CLAUDE.md Requirements (AI/ML Amendment):**

- Add Context Budget Guidance section (~30 lines)
- Document token allocation per task type
- Reference INDEX.yaml context_budgets for consistency

### Phase 4: Consolidate Rules & Skills (Days 11-12)

**Goal:** Single source of truth, no duplication

- [ ] Update `.claude/rules/*.md` to reference canonical docs instead of duplicating
- [ ] Update `.claude/skills/*.md` to reference CLAUDE.md/DEVELOPMENT instead of duplicating
- [ ] Add deprecation notices to old content locations

### Phase 5: Auto-Generation Pipeline (Days 13-16)

**Goal:** Prevent future drift with CI enforcement

- [ ] Implement llms.txt generation from INDEX.yaml
- [ ] Implement llms-full.txt generation (comprehensive variant)
- [ ] Implement RESEARCH_INDEX.md generation from registry YAMLs
- [ ] Add TypeDoc to CI pipeline for API docs
- [ ] Add markdown link validation to CI
- [ ] Add INDEX.yaml → Tier 2 link validation
- [ ] **Commit generated files** to repo (not gitignored) - Architect amendment
- [ ] **Add secrets guardrails** for .generated/ (Security amendment):
  - CI check: scan generated docs for API keys, tokens, passwords
  - Fail build if sensitive patterns detected
  - Allowlist for intentional examples (redacted)

### Phase 6: Validation (Days 17-19)

**Goal:** Verify improvements with metrics

- [ ] Measure agent navigation: tokens to find any topic
- [ ] Measure discovery rate: % of tasks where agent finds correct doc
- [ ] Compare discovery rate to baseline (PM amendment)
- [ ] Measure "time to first success" for new agents (PM amendment)
- [ ] Measure duplication: compare before/after line counts
- [ ] Run system review with new structure
- [ ] Document lessons learned for future documentation changes

---

## Migration Strategy

### Preserve Backwards Compatibility

1. **Add deprecation comments** to moved content:

   ```markdown
   <!-- DEPRECATED: This content has moved to docs/ARCHITECTURE/CONSENSUS_PROTOCOLS.md -->
   <!-- This reference will be removed in v3.0.0 -->
   ```

2. **Maintain old file locations** for 1 release cycle:
   - v2.2.0: New structure + deprecation notices
   - v2.3.0: Remove deprecated content

3. **Update all cross-references** before removing old content

### Atomic Commits

Each phase should be a separate PR:

- Phase 0: `feat(docs): add tiered documentation infrastructure`
- Phase 1: `refactor(docs): split ARCHITECTURE.md into focused documents`
- Phase 2: `feat(docs): create development guides`
- Phase 3: `refactor(docs): reduce CLAUDE.md to project context`
- Phase 4: `refactor(docs): consolidate rules and skills`
- Phase 5: `feat(ci): add documentation generation pipeline`
- Phase 6: `docs: validate tiered documentation system`

---

## Success Criteria

| Metric                    | Current      | Target        | Measurement        |
| ------------------------- | ------------ | ------------- | ------------------ |
| Duplication               | 20-28%       | <5%           | Line comparison    |
| CLAUDE.md size            | 1,396 lines  | 600-650 lines | `wc -l`            |
| Monolithic files          | 5            | 0             | Files >500 lines   |
| Navigation tokens         | ~15,000      | <2,000        | Agent testing      |
| Discovery rate            | Baseline TBD | >90%          | Agent task success |
| Time to first success     | Baseline TBD | -30%          | Onboarding test    |
| CI drift prevention       | None         | 100%          | Auto-generation    |
| Secrets in generated docs | Unknown      | 0             | CI scan            |

---

## Risk Assessment

| Risk                              | Likelihood | Impact | Mitigation                              |
| --------------------------------- | ---------- | ------ | --------------------------------------- |
| Broken cross-references           | High       | Medium | CI link validation                      |
| Missing content in migration      | Medium     | High   | Comprehensive checklist per phase       |
| Agent confusion during transition | Medium     | Medium | Deprecation notices + dual availability |
| Increased maintenance burden      | Low        | Medium | Auto-generation reduces maintenance     |

---

## Appendix: Research Sources

### Claude Code Skills Pattern

- https://github.com/anthropics/skills
- https://code.claude.com/docs/en/skills

### Academic Papers

- RAPTOR: arXiv:2401.18059 (hierarchical retrieval)
- LATTICE: arXiv:2510.13217 (LLM-guided retrieval)
- Semantic Chunking: Chroma research, Pinecone guides
- Context Engineering Survey: arXiv:2507.13334

### Industry Standards

- llms.txt: https://llmstxt.org/
- GraphRAG: https://github.com/microsoft/graphrag
- Anthropic Context Engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
