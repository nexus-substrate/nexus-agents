# ADR-0009: Error Class Hierarchy

## Status

APPROVED (Consensus Vote: 75% approval, 2026-01-31)

## Context

The codebase has 30+ custom error classes scattered across modules:

- SyntheticVoteError, NoAdapterError, PuppeteerError
- ValidationError, ConfigError, RoutingError
- MemoryError, ConsensusError, WorkflowError
- etc.

Problems:

- No clear hierarchy or categorization
- Inconsistent error code patterns
- Difficult to catch error categories
- No unified monitoring pattern

## Decision

Add a hierarchy to existing error classes by introducing error categories:

```typescript
NexusError (base)
├── ValidationError (input validation failures)
├── OperationError (failed operations)
├── ConfigurationError (config issues)
└── ResourceError (external resources)
```

All existing error classes will extend the appropriate category.
No errors will be removed - this is purely additive organization.

## Consensus Vote

- **Date:** 2026-01-31
- **Threshold:** Simple Majority (50%)
- **Result:** APPROVED (75%)
- **Votes:**
  - Software Architect: APPROVE
  - Security Engineer: REJECT
  - Developer Experience: ABSTAIN
  - AI/ML Engineer: APPROVE
  - Product Manager: APPROVE

## Consequences

### Positive

- Predictable error types for catch blocks
- Error codes for monitoring
- Improved observability (+1 point)
- Better error handling patterns

### Negative

- Refactoring effort across many files
- Potential for incorrect categorization
- Need to update error handling in callers

## Implementation

1. Define error categories in core/errors.ts
2. Add error code enum
3. Update each custom error to extend category
4. Add error code property
5. No removal - just add hierarchy

## Related

- Issue #597
- Epic #598 (LOOP H)
- Fitness Dimension: explicitBehavior, observability
