# ADR-0013: Memory Helpers Consolidation

## Status

APPROVED (Consensus Vote: 75% approval, 2026-01-31)

## Context

The codebase has 20+ memory helper files with similar extraction/transformation patterns:

- agentic-memory-helpers.ts, agentic-memory-extraction.ts
- adaptive-memory-helpers.ts
- belief-memory-helpers.ts
- graph-memory-helpers.ts
- session-memory-helpers.ts
- mobimem-helpers.ts

This was previously rejected (ADR-0010, 40% approval) but re-evaluated with fresh context.

## Decision

**Consolidate common patterns while preserving research paper alignment.**

### Implementation Approach

1. **Create shared utility modules:**
   - `utils/memory-extraction.ts` - Common entity extraction patterns
   - `utils/memory-transform.ts` - Shared transformation utilities

2. **Preserve research alignment:**
   - Document which research paper each memory system implements
   - Keep paper-specific extraction logic in memory-specific helpers
   - Use composition (imports) not inheritance

3. **Consolidation criteria:**
   - Only consolidate patterns that appear in 3+ memory systems
   - Pattern must be semantically identical, not just structurally similar
   - Memory-specific semantics stay in memory-specific files

## Consensus Vote

- **Date:** 2026-01-31
- **Threshold:** Simple Majority (50%)
- **Result:** APPROVED (75%)
- **Votes:**
  - Software Architect: APPROVE
  - Security Engineer: ABSTAIN
  - Developer Experience: APPROVE
  - AI/ML Engineer: REJECT
  - Product Manager: APPROVE

## Consequences

### Positive

- Reduced maintenance burden (fewer duplicate patterns)
- Clearer mental models for developers
- Improved fitness score on canonicalPaths (+2-3 points)
- Easier onboarding (learn patterns once)

### Negative

- Initial refactoring effort required
- Must carefully preserve research paper semantics
- Risk of breaking specialized behavior if not careful

### Mitigations

- Comprehensive test coverage before and after refactoring
- Document research paper alignment in shared utility comments
- Incremental refactoring (one memory system at a time)

## Implementation Plan

1. Identify truly common patterns across memory helpers
2. Create shared utility modules with tests
3. Refactor agentic-memory-helpers.ts as pilot
4. Verify tests pass and behavior unchanged
5. Repeat for other memory modules
6. Remove duplicated code

## Related

- Issue #593
- ADR-0010 (superseded)
- Epic #598 (LOOP H)
- Fitness Dimension: canonicalPaths
