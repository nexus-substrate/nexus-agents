# ADR-0010: Memory Helpers Consolidation

## Status

SUPERSEDED by ADR-0013 (Re-evaluation: APPROVED, 75% approval, 2026-01-31)

## Original Decision (2026-01-31)

**REJECTED (40%)** - Keep memory helpers separate per memory system.

## Re-evaluation (2026-01-31)

A fresh consensus vote was conducted with updated context.

### Re-evaluation Consensus Vote

- **Date:** 2026-01-31
- **Threshold:** Simple Majority (50%)
- **Result:** APPROVED (75%)
- **Votes:**
  - Software Architect: APPROVE (shared utility layer reduces maintenance burden)
  - Security Engineer: ABSTAIN (neutral from security perspective)
  - Developer Experience: APPROVE (reduces cognitive load, clearer mental models)
  - AI/ML Engineer: REJECT (preserve research paper alignment)
  - Product Manager: APPROVE (reduces technical debt, improves velocity)

### Key Changes Since Original Vote

1. Better understanding of which patterns are truly common vs specialized
2. Recognition that composition over inheritance can preserve research alignment
3. Fitness score improvements are measurable

## New Decision

**Proceed with targeted consolidation** while preserving research paper alignment:

1. Create `utils/extraction.ts` for genuinely common entity extraction patterns
2. Create `utils/memory-transform.ts` for shared transformation utilities
3. Keep paper-specific semantics in memory-specific helpers
4. Use composition (imports) rather than inheritance

## Implementation

See ADR-0013 for implementation details and migration plan.

## Related

- Issue #593
- ADR-0013 (supersedes this document)
