# ADR-0003: Unified QuorumValidator

## Status

Accepted

## Context

The system has three independent quorum/voting implementations:

| Implementation  | Location                       | Approach                                  |
| --------------- | ------------------------------ | ----------------------------------------- |
| VotingProtocol  | `consensus/voting-protocol.ts` | Agreement ratio threshold                 |
| WeightedVoting  | `consensus/weighted-voting.ts` | Cumulative weighted sum                   |
| ConsensusEngine | `consensus/engine.ts`          | Strategy pattern with multiple algorithms |

**Problems identified (per redundancy-analysis.md Section 3.3):**

1. Three different quorum semantics with no shared abstraction
2. Duplicate eligibility checking logic
3. Inconsistent return types across implementations
4. No unified observability for quorum decisions

## Options Considered

### Option A: Inline Consolidation

- Pros: Simpler code, fewer files
- Cons: Different algorithms need different logic, harder to test

### Option B: Extract Interface Only

- Pros: Minimal changes, type safety
- Cons: Doesn't reduce code duplication

### Option C: Unified Validator + Preserved Implementations (Selected)

- Pros: Single abstraction, gradual migration, comprehensive breakdown
- Cons: Additional layer of indirection

## Decision

**Implement Option C: Unified QuorumValidator**

Create `IQuorumValidator` interface in `consensus/quorum-validator.ts` that:

1. Abstracts quorum calculation across all three implementations
2. Supports weighted and simple voting
3. Provides detailed breakdowns for observability
4. Includes agent eligibility checks for Byzantine detection

Existing implementations can be updated to use QuorumValidator internally,
or consuming code can use the validator directly.

## Consequences

### Positive

- Single source of truth for quorum logic
- Consistent return types via discriminated union
- Detailed breakdowns for metrics and debugging
- Easier to test edge cases in one place
- Clear eligibility semantics

### Negative

- Additional abstraction layer
- Existing implementations need updates to use validator
- Slight learning curve for new pattern

## Migration Steps

1. **Phase 1: Create QuorumValidator** (Complete)
   - Create `consensus/quorum-validator.ts`
   - Export from `consensus/index.ts`
   - Add unit tests

2. **Phase 2: Integrate Into VotingProtocol**
   - Replace `determineOutcome()` with validator
   - Use `getQuorumBreakdown()` for result building

3. **Phase 3: Integrate Into WeightedVoting**
   - Replace `weightedConsensus()` quorum logic
   - Use eligibility checks for voter filtering

4. **Phase 4: Integrate Into ConsensusEngine**
   - Replace strategy `calculateOutcome()` calls
   - Deprecate redundant helper functions

## References

- Issue: #576
- Related: docs/architecture/redundancy-analysis.md (Section 3)
