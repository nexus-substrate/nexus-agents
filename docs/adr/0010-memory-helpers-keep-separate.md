# ADR-0010: Memory Helpers - Keep Separate

## Status

REJECTED (Consensus Vote: 40% approval, 2026-01-31)

## Context

The codebase has 20+ memory helper files:

- agentic-memory-helpers.ts
- belief-memory-helpers.ts
- graph-memory-helpers.ts
- etc.

A proposal was made to consolidate these into shared utility modules.

## Decision

**Keep memory helpers separate per memory system.**

The consensus vote rejected consolidation, indicating that:

- Domain-specific helpers serve research paper implementations
- Premature consolidation risks breaking specialized behavior
- Current separation aids debugging and testing
- Each memory system has unique extraction/transformation needs

## Consensus Vote

- **Date:** 2026-01-31
- **Threshold:** Simple Majority (50%)
- **Result:** REJECTED (40%)
- **Votes:**
  - Software Architect: REJECT
  - Security Engineer: APPROVE
  - Developer Experience: REJECT
  - AI/ML Engineer: REJECT
  - Product Manager: APPROVE

## Consequences

### Positive

- Preserves research paper alignment
- Easier per-system maintenance
- Clear ownership boundaries

### Negative

- Some code duplication remains
- Fitness score impact: no improvement on canonicalPaths

## Future Consideration

If similar patterns emerge across 3+ memory systems, reconsider consolidation with a more targeted proposal focusing on specific utility functions rather than wholesale reorganization.

## Related

- Issue #593
- Epic #598 (LOOP H)
