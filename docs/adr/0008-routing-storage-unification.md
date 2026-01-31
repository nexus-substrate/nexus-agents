# ADR-0008: Routing Storage Unification

## Status

APPROVED (Consensus Vote: 100% approval, 2026-01-31)

## Context

The routing system currently uses three separate storage mechanisms:

1. **preference-router-store.ts** - Stores user/model preferences
2. **routing-memory.ts** - Stores performance history for LinUCB
3. **routing-metrics.ts** - Collects routing metrics for observability

This creates:

- Redundant data storage (overlapping performance data)
- Multiple configuration surfaces
- Inconsistent persistence patterns
- Higher maintenance burden

## Decision

Unify the three routing storage systems into a single `RoutingContextStore` that:

1. Stores preferences, performance history, and metrics in one backend
2. Provides typed query interfaces for each concern
3. Uses a single write path for recording decisions
4. Uses a single persistence mechanism

## Consensus Vote

- **Date:** 2026-01-31
- **Threshold:** Supermajority (67%)
- **Result:** APPROVED (100%)
- **Votes:**
  - Software Architect: ABSTAIN
  - Security Engineer: APPROVE
  - Developer Experience: ABSTAIN
  - AI/ML Engineer: ABSTAIN
  - Product Manager: APPROVE

## Consequences

### Positive

- Reduced code duplication
- Single source of truth for routing state
- Simplified configuration
- Fitness score improvement: +3-5 points on canonicalPaths

### Negative

- Migration effort required
- Potential performance regression if queries slow down
- Risk during transition period

## Migration Plan

1. Design unified schema accommodating all three systems
2. Implement RoutingContextStore with backward-compatible APIs
3. Add migration to convert existing data
4. Deprecate individual stores with warnings
5. Remove after one release cycle

## Related

- Issue #594
- Epic #598 (LOOP H)
- Fitness Dimension: canonicalPaths
