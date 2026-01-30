# ADR-0004: Shared Task Analyzer

## Status

Accepted

## Context

The system has five independent task classification/analysis implementations:

| Implementation          | Location                               | Taxonomy                            | Lines |
| ----------------------- | -------------------------------------- | ----------------------------------- | ----- |
| TaskTypeClassifier      | `core/task-analysis/`                  | reasoning/knowledge (2 types)       | 207   |
| TaskComplexityEstimator | `adapters/complexity-estimator.ts`     | simple/moderate/complex/expert      | 222   |
| CLI Task Analyzer       | `cli-adapters/task-analyzer.ts`        | 8 task types + 5 capability flags   | 302   |
| Task Classifier         | `cli-adapters/task-classifier.ts`      | code/research/docs/analysis/general | 317   |
| Task Features           | `agents/coordination/task-features.ts` | 7 types + patterns                  | 346   |

**Problems identified:**

1. Five incompatible task type taxonomies in simultaneous use
2. Four+ independent keyword registries (~1,434 lines scattered)
3. Three different complexity estimation implementations
4. Three different token estimation formulas
5. Impossible to correlate classifications across subsystems

## Options Considered

### Option A: Keep Independent Implementations

- Pros: No migration needed
- Cons: Permanent duplication, inconsistent behavior

### Option B: Pick One Winner

- Pros: Single implementation
- Cons: Existing consumers need rewriting, loss of specialized features

### Option C: Unified Analyzer with Multiple Views (Selected)

- Pros: Single source of truth, backward-compatible views, shared patterns
- Cons: Additional abstraction layer

## Decision

**Implement Option C: SharedTaskAnalyzer with Multiple Views**

Create `ISharedTaskAnalyzer` interface in `core/task-analysis/shared-task-analyzer.ts` that:

1. Provides unified keyword registry (single source of truth)
2. Supports multiple classification "views" (reasoning, complexity, capabilities)
3. Consolidates complexity and token estimation
4. Maintains backward compatibility via view adapters

## Consequences

### Positive

- Single source of truth for task classification
- Consistent keyword definitions across all consumers
- One complexity estimation algorithm
- One token estimation formula
- Easier testing and maintenance
- Clear migration path for existing code

### Negative

- Additional abstraction layer
- Existing implementations need gradual migration
- Multiple views may seem redundant initially

## Migration Steps

1. **Phase 1: Create SharedTaskAnalyzer** (This ADR)
   - Create `core/task-analysis/shared-task-analyzer.ts`
   - Define unified keyword registry
   - Export from `core/task-analysis/index.ts`

2. **Phase 2: Create View Adapters**
   - ReasoningKnowledgeView (for existing TaskTypeClassifier consumers)
   - ComplexityView (for complexity-estimator consumers)
   - CapabilityView (for task-analyzer consumers)
   - TaskTypeView (for task-classifier consumers)

3. **Phase 3: Migrate Routers**
   - Update quality-router to use SharedTaskAnalyzer
   - Update zero-router to use SharedTaskAnalyzer
   - Update composite-router to use SharedTaskAnalyzer

4. **Phase 4: Deprecate Old Implementations**
   - Add @deprecated to old files
   - Re-export from SharedTaskAnalyzer where possible

## References

- Issue: #574 (Router consolidation)
- Related: docs/architecture/redundancy-analysis.md (Section 3.1)
- Related: ADR-0003 (QuorumValidator pattern)
