# ADR-0002: Unified IOrchestrator Interface

## Status

Accepted

## Context

The system has three independent orchestration implementations:

| Implementation        | Location                                         | Approach                     | Lines |
| --------------------- | ------------------------------------------------ | ---------------------------- | ----- |
| TechLead              | `agents/tech-lead.ts`                            | LLM-based task decomposition | ~472  |
| PuppeteerOrchestrator | `agents/orchestration/puppeteer-orchestrator.ts` | Learned policy execution     | ~401  |
| WorkflowEngine        | `workflows/workflow-engine.ts`                   | Static template execution    | ~305  |

**Problems identified (per redundancy-analysis.md):**

1. ~60% code overlap in core execution loop
2. No unified interface for orchestration consumers
3. Duplicate implementations of agent selection, result aggregation, termination detection
4. Inconsistent error handling patterns
5. Fitness score penalty: missing IOrchestrator interface (-2 points on Canonical Paths)

## Options Considered

### Option A: Merge All Into Single Implementation

- Pros: Maximum code reduction, single path
- Cons: Loss of specialized behaviors, complex conditional logic, risky migration

### Option B: Extract Common Base Class

- Pros: Code reuse via inheritance
- Cons: Inflexible, tight coupling, violates composition over inheritance principle

### Option C: Unified Interface + Adapters (Selected)

- Pros: Preserves specialized implementations, clean contracts, gradual migration
- Cons: Slightly more indirection, adapters need maintenance

### Option D: Do Nothing

- Pros: No risk, no effort
- Cons: Perpetuates redundancy, inconsistent API, poor discoverability

## Decision

**Implement Option C: Unified Interface + Adapters**

Create `IOrchestrator` interface in `core/types/orchestrator.ts` that:

1. Defines canonical orchestration contract
2. Uses discriminated union for different definition types (task, workflow, policy)
3. Provides optional methods for agent management
4. Returns `Result<T, E>` for consistent error handling

Existing implementations (TechLead, Puppeteer, WorkflowEngine) will be wrapped with adapters that implement `IOrchestrator`, preserving their specialized behavior.

## Consequences

### Positive

- Single canonical path for orchestration consumers
- Interchangeable implementations via factory
- Unified status tracking and cancellation
- Composability (e.g., TechLead decomposition → Puppeteer execution)
- Improved fitness score (+3 points on Canonical Paths)
- Type-safe orchestrator selection

### Negative

- Additional adapter layer (minimal overhead)
- Adapters require maintenance when base implementations change
- Slight increase in type complexity

## Migration Steps

1. **Phase 1: Interface Definition** (Complete)
   - Create `core/types/orchestrator.ts` with IOrchestrator interface
   - Export from `core/types/index.ts`
   - Update fitness-score.ts to detect interface

2. **Phase 2: Adapters**
   - Create `TechLeadAdapter implements IOrchestrator`
   - Create `PuppeteerAdapter implements IOrchestrator`
   - Create `WorkflowAdapter implements IOrchestrator`
   - Add `OrchestratorFactory` for type-safe instantiation

3. **Phase 3: Consumer Migration**
   - Update MCP tools to use `IOrchestrator`
   - Update CLI commands to use `IOrchestrator`
   - Add deprecation warnings to direct usage

4. **Phase 4: Consolidation**
   - Extract common step execution to shared utility
   - Extract common result aggregation
   - Reduce adapter complexity

## References

- Issue: #573
- Related: docs/architecture/redundancy-analysis.md (Section 4)
- Related: scripts/fitness-score.ts (Canonical Paths assessment)
