# ADR-0005: Router Consolidation

## Status

Accepted (Phase 2 Complete)

## Context

The system has 9 independent router implementations across ~8,000+ lines of code:

| Router             | Location                                       | Purpose                           |
| ------------------ | ---------------------------------------------- | --------------------------------- |
| TaskRouter         | `cli-adapters/router.ts`                       | Capability-based CLI selection    |
| QualityRouter      | `adapters/quality-router.ts`                   | Cost-optimized routing (RouteLLM) |
| ZeroRouter         | `cli-adapters/zero-router.ts`                  | Difficulty space routing          |
| PreferenceRouter   | `cli-adapters/preference-router.ts`            | Learned preference routing        |
| BudgetRouter       | `cli-adapters/budget-router.ts`                | Constraint enforcement            |
| TopsisRouter       | `cli-adapters/topsis-router.ts`                | Multi-criteria TOPSIS ranking     |
| ConfidenceRouter   | `cli-adapters/confidence-router.ts`            | Confidence-aware cascade          |
| CompositeRouter    | `cli-adapters/composite-router.ts`             | Pipeline orchestration            |
| AgentMessageRouter | `agents/collaboration/agent-message-router.ts` | A2A messaging                     |

**Problems:**

1. 7 different router interfaces with inconsistent contracts
2. CompositeRouter hardcodes stage composition
3. TaskRouter and QualityRouter have overlapping capability logic
4. No unified feedback/calibration mechanism
5. Decision output formats vary across routers

## Options Considered

### Option A: Keep All Routers Independent

- Pros: No migration needed
- Cons: 8,000+ lines, inconsistent interfaces, hard to test

### Option B: Single Monolithic Router

- Pros: Simple to understand
- Cons: Loss of modularity, hard to extend, violates SRP

### Option C: Pipeline Architecture with Unified Stage Interface (Selected)

- Pros: Modular, composable, testable, extensible
- Cons: Requires interface refactoring

## Decision

**Implement Option C: Pipeline Architecture with IRouterStage**

### Phase 1: Define Unified Interface

```typescript
// Core routing stage contract
interface IRouterStage<TContext = RoutingContext> {
  readonly name: string;
  readonly priority: number;

  canHandle(ctx: TContext): boolean;
  route(ctx: TContext): Promise<Result<StageResult, StageError>>;
  recordOutcome?(outcome: RoutingOutcome): void;
}

// Composable pipeline
interface IRoutingPipeline {
  execute(task: CliTask): Promise<Result<RoutingDecision, RoutingError>>;
  addStage(stage: IRouterStage, position?: number): void;
  removeStage(name: string): void;
  getStages(): readonly IRouterStage[];
}
```

### Phase 2: Migrate Routers to Stages

| Current Router   | New Stage              | Changes                                          |
| ---------------- | ---------------------- | ------------------------------------------------ |
| BudgetRouter     | BudgetFilterStage      | Implements IRouterStage, filters candidates      |
| ZeroRouter       | DifficultyStage        | Implements IRouterStage, adds difficulty score   |
| PreferenceRouter | PreferenceStage        | Implements IRouterStage, applies learned weights |
| TopsisRouter     | TopsisRankingStage     | Implements IRouterStage, produces ranking        |
| ConfidenceRouter | ConfidenceCascadeStage | Implements IRouterStage, escalation logic        |
| QualityRouter    | QualityConstraintStage | Merge with TaskRouter capability logic           |
| TaskRouter       | CapabilityMatchStage   | Core capability matching                         |

### Phase 3: Deprecate Old Interfaces

- Add @deprecated to old router interfaces
- Create adapters wrapping stages for backward compatibility
- Migrate callers to use IRoutingPipeline

### Phase 4: Consolidate AgentMessageRouter

AgentMessageRouter serves a different purpose (A2A messaging) and should remain separate but implement a consistent interface pattern.

## Consequences

### Positive

- Single `IRouterStage` interface for all routing logic
- CompositeRouter becomes generic `RoutingPipeline`
- Easy to add/remove/reorder stages
- Unified feedback mechanism
- Simpler testing (mock individual stages)

### Negative

- Migration effort for existing consumers
- Temporary adapter layer for backward compatibility
- Learning curve for new pattern

## Migration Steps

1. Create `IRouterStage` and `IRoutingPipeline` interfaces in `cli-adapters/routing/`
2. Create stage implementations wrapping existing routers
3. Update CompositeRouter to use IRoutingPipeline internally
4. Add deprecation markers to old interfaces
5. Migrate direct router users to pipeline
6. Remove deprecated interfaces after validation

## Metrics

Success criteria:

- Router code reduced by 30%+ (shared abstractions)
- All existing tests pass through new pipeline
- CompositeRouter stages are configurable at runtime
- Single routing decision format across all stages

## Implementation Progress

### Phase 1 - Complete (2026-01-30)

**Files Created:**

- `cli-adapters/routing/router-stage.ts` - IRouterStage and IRoutingPipeline interfaces
- `cli-adapters/routing/routing-pipeline.ts` - RoutingPipeline implementation
- `cli-adapters/routing/stages/topsis-stage.ts` - First stage: TopsisRouterStage
- `cli-adapters/routing/stages/budget-stage.ts` - Second stage: BudgetFilterStage
- `cli-adapters/routing/stages/index.ts` - Stage exports
- `cli-adapters/routing/index.ts` - Module exports

**Key Decisions:**

1. **Coexistence Strategy**: The new IRoutingPipeline coexists with CompositeRouter
   - CompositeRouter continues to work with its internal pipeline (composite-router-stages.ts)
   - New routers should implement IRouterStage for the unified pipeline
   - No forced migration of working code

2. **Stage Pattern**: Each stage wraps an existing router (e.g., TopsisRouterStage wraps TopsisRouter)
   - Preserves existing implementations
   - Adds composable interface on top
   - Gradual migration path

3. **BudgetFilterStage** (priority: 20): Cost-aware early filtering
   - Filters candidates that exceed cost/token budgets
   - References arXiv:2508.21141 (PILOT pattern)
   - Uses determinism providers for testability

4. **ZeroRouterStage** (priority: 40): Difficulty-based scoring
   - Wraps ZeroRouter for universal difficulty estimation
   - Scores candidates based on task difficulty match
   - Supports calibration through outcome recording

5. **PreferenceStage** (priority: 50): Learned preference scoring
   - Wraps PreferenceRouter for RouteLLM-style preference learning
   - Applies learned user preferences to score candidates
   - Supports online learning through outcome recording

6. **LinUCBStage** (priority: 70): Contextual bandit selection
   - Wraps LinUCBBandit for adaptive model selection
   - Balances exploration vs exploitation
   - Learns from outcome rewards

7. **LatencyStage** (priority: 80): Performance-based scoring
   - Wraps LatencyTracker for latency-based adjustments
   - Tracks rolling window statistics with time decay
   - Adjusts scores based on observed CLI performance

### Phase 2 - Complete (2026-01-30)

All 6 stages implemented and exported via unified `cli-adapters/routing` module:

| Stage             | Priority | Wraps            | Purpose                        |
| ----------------- | -------- | ---------------- | ------------------------------ |
| BudgetFilterStage | 20       | BudgetRouter     | Cost-aware early filtering     |
| ZeroRouterStage   | 40       | ZeroRouter       | Difficulty-based scoring       |
| PreferenceStage   | 50       | PreferenceRouter | Learned preferences (RouteLLM) |
| TopsisRouterStage | 60       | TopsisRouter     | Multi-criteria TOPSIS ranking  |
| LinUCBStage       | 70       | LinUCBBandit     | Contextual bandit selection    |
| LatencyStage      | 80       | LatencyTracker   | Performance-based scoring      |

Pipeline execution order: Budget(20) → Zero(40) → Preference(50) → TOPSIS(60) → LinUCB(70) → Latency(80)

### Phase 3 - Future

- Optional: Migrate CompositeRouter to use IRoutingPipeline internally
- Optional: Add ConfidenceStage wrapping ConfidenceRouter
- Add deprecation markers to old router interfaces once all stages are available

## References

- Issue: #574 (Router consolidation)
- Issue: #166 (CompositeRouter design)
- Related: ADR-0004 (SharedTaskAnalyzer pattern)
- Papers: arXiv:2406.18510 (RouteLLM), arXiv:2509.07571 (TOPSIS)
