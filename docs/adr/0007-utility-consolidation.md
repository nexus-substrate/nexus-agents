# ADR-0007: Utility Function Consolidation

## Status

Accepted

## Context

During System Mandate LOOP H (Redundancy & Duplication Discovery), we identified multiple duplicate utility implementations:

1. **toError utility**: Identical implementations in:
   - `cli/session-storage-helpers.ts`
   - `learning/outcome-storage-helpers.ts`

2. **CommandResult pattern**: 15+ duplicate type definitions across CLI modules (Issue #584)

This duplication creates:

- Maintenance burden when fixing bugs or updating patterns
- Inconsistency risk when implementations drift
- Cognitive overhead for developers

## Options Considered

### Option A: Keep Duplicates (Status Quo)

- Pros: No migration effort, no risk of breaking changes
- Cons: Ongoing maintenance burden, inconsistency risk, violates DRY principle

### Option B: Consolidate to Core Module

- Pros: Single source of truth, easier maintenance, consistent behavior
- Cons: Requires migration, adds dependency on core module

### Option C: Create Dedicated Utility Package

- Pros: Clean separation, explicit dependency
- Cons: Over-engineering for small utilities, adds package management overhead

## Decision

**Option B: Consolidate to Core Module**

Move common utilities to `core/errors.ts` (for error utilities) and `core/types.ts` (for result types). This follows the existing pattern where core provides foundational utilities.

## Consequences

### Positive

- Single source of truth for utility implementations
- Easier to find and maintain common patterns
- Reduced code duplication
- Consistent behavior across modules

### Negative

- Migration effort for existing code
- Slightly increased coupling to core module

## Migration Steps

### Completed (toError)

1. ✅ Added `toError` function to `core/errors.ts`
2. ✅ Exported from `core/index.ts`
3. ✅ Updated `cli/session-storage.ts` to import from core
4. ✅ Updated `learning/outcome-storage.ts` to import from core
5. ✅ Removed duplicate implementations from helper files
6. ✅ Verified all tests pass (10,602 tests)

### Pending (CommandResult - Issue #584)

1. Create `CommandResult<T>` base type in core module
2. Migrate CLI result types to extend base type
3. Update consuming code
4. Remove duplicates

## References

- Issue: #584 (CommandResult consolidation)
- Commit: ecdf0e3 (toError consolidation)
- System Mandate: LOOP H - Redundancy & Duplication Discovery
