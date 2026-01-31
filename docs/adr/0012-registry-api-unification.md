# ADR-0012: Registry API Unification

## Status

IMPLEMENTED (Consensus Vote: 80% approval, 2026-01-31)

## Context

Two registries exist with identical singleton patterns but different APIs:

1. **ExpertRegistry** - Expert agent registry
   - Methods: query(), getByCapability(), getByRole(), findBestMatch()

2. **TemplateRegistry** - Workflow template registry
   - Methods: search(), getByCategory(), getAll()

Problems:

- Inconsistent API patterns
- Duplicated singleton logic
- Different test utilities (only ExpertRegistry has resetInstance())
- Learning curve for contributors

## Decision

Unify both registries behind the `IRegistry<T,E>` interface already defined in `core/types/registry.ts`:

1. Both registries implement `IRegistry<T,E>`
2. Domain-specific methods remain as extensions
3. Add `resetInstance()` to TemplateRegistry for test parity
4. No breaking changes to external APIs

## Consensus Vote

- **Date:** 2026-01-31
- **Threshold:** Simple Majority (50%)
- **Result:** APPROVED (80%)
- **Votes:**
  - Software Architect: APPROVE (unified interfaces are best practice)
  - Security Engineer: APPROVE (single pattern easier to audit)
  - Developer Experience: APPROVE (consistent API improves DX)
  - AI/ML Engineer: ABSTAIN
  - Product Manager: APPROVE (reduces complexity)

## Consequences

### Positive

- Consistent API across registries
- Easier to add new registry types
- Better test isolation with resetInstance()
- Fitness score improvement: +2 points on canonicalPaths

### Negative

- Minor refactoring effort
- Need to update any direct API consumers (internal only)

## Implementation

1. ✅ Update ExpertRegistry to implement IRegistry<Expert, RegistryError>
   - Added getAll(), getAllIds(), query(predicate), search() methods
   - Renamed query(options) to queryWithOptions() for backward compatibility
   - Updated RegistryStats to extend IRegistryStats with total field
2. ✅ Update TemplateRegistry with IRegistry-compatible methods
   - Added id field to TemplateMetadata (alias for name)
   - Added TemplateRegistryError class
   - Added get(), has(), getAllIds(), query(predicate), size, isEmpty, clear() methods
   - Updated getStats() to return IRegistryStats-compatible type
3. ✅ resetInstance() equivalent exists as resetRegistry() for TemplateRegistry
4. ✅ Updated tests to use non-deprecated interface methods

## Related

- Issue #596
- Epic #598 (LOOP H)
- Fitness Dimension: canonicalPaths, configSimplicity
