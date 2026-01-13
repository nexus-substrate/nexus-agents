# Interface Contract Proposal: IMemoryBackend↔ITaskRouter

**Issue:** #238
**Date:** 2026-01-12 (ET)
**Status:** DRAFT - Pending Consensus Vote
**Threshold:** Supermajority (≥4/5 agents)

---

## Summary

This proposal defines the interface contract between memory systems and routing systems to support:

1. **MobiMem Evolution (#149)** - Experience/Action memory for post-deployment learning
2. **Preference-Trained Routing (#148)** - Storing routing preferences for model training

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     External Interface Layer                        │
│  ICompositeRouter  │  ITaskRouter  │  IFeedbackIntegration          │
└─────────────┬─────────────┬─────────────────┬───────────────────────┘
              │             │                 │
              └─────────────┴────────┬────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   IRoutingMemory (NEW)                              │
│  - storeDecision(decision, outcome)                                 │
│  - getPreferences(taskType, limit)                                  │
│  - getExperiences(query, limit)                                     │
│  - storeAction(action, result)                                      │
│  - getActions(taskType, limit)                                      │
│  - export() / import()                                              │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   IMemoryBackend (EXISTING)                         │
│  - store(key, value, metadata)                                      │
│  - retrieve(key)                                                    │
│  - search(query, limit)                                             │
│  - prune(olderThan)                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Proposed Interfaces

### IRoutingMemory (NEW)

```typescript
/**
 * Memory interface specifically for routing-related data.
 * Builds on IMemoryBackend with routing-specific operations.
 */
interface IRoutingMemory {
  // =========================================================================
  // Preference Storage (#148 - Preference-Trained Routing)
  // =========================================================================

  /**
   * Store a routing decision with its outcome for preference learning.
   * @param decision - The routing decision made
   * @param outcome - The task outcome (success, quality, duration)
   * @param preference - Optional explicit preference signal
   */
  storePreference(
    decision: RoutingDecisionRecord,
    outcome: TaskOutcomeRecord,
    preference?: PreferenceSignal
  ): Promise<Result<void, MemoryError>>;

  /**
   * Retrieve preference data for training.
   * @param filter - Filter by task type, model, time range
   * @param limit - Maximum records to return
   */
  getPreferences(
    filter: PreferenceFilter,
    limit: number
  ): Promise<Result<PreferenceRecord[], MemoryError>>;

  // =========================================================================
  // Experience Memory (#149 - MobiMem Evolution)
  // =========================================================================

  /**
   * Store an experience (task execution record) for evolution.
   * @param experience - The experience to store
   */
  storeExperience(experience: ExperienceRecord): Promise<Result<void, MemoryError>>;

  /**
   * Retrieve relevant experiences for a task.
   * @param query - Semantic query for experience retrieval
   * @param limit - Maximum experiences to return
   */
  getExperiences(query: string, limit: number): Promise<Result<ExperienceRecord[], MemoryError>>;

  // =========================================================================
  // Action Memory (#149 - MobiMem Evolution)
  // =========================================================================

  /**
   * Store a successful action pattern.
   * @param action - The action pattern to cache
   */
  storeAction(action: ActionRecord): Promise<Result<void, MemoryError>>;

  /**
   * Retrieve cached actions for a task type.
   * @param taskType - Type of task
   * @param limit - Maximum actions to return
   */
  getActions(taskType: string, limit: number): Promise<Result<ActionRecord[], MemoryError>>;

  // =========================================================================
  // Export/Import (for training & migration)
  // =========================================================================

  /**
   * Export all routing memory for training or backup.
   */
  export(): Promise<Result<RoutingMemoryExport, MemoryError>>;

  /**
   * Import routing memory from export.
   */
  import(data: RoutingMemoryExport): Promise<Result<void, MemoryError>>;

  // =========================================================================
  // Statistics
  // =========================================================================

  /**
   * Get memory statistics.
   */
  getStats(): Promise<Result<RoutingMemoryStats, MemoryError>>;
}
```

### Supporting Types

```typescript
/**
 * Record of a routing decision.
 */
interface RoutingDecisionRecord {
  readonly id: string;
  readonly timestamp: Date;
  readonly taskId: string;
  readonly taskType: string;
  readonly taskProfile: TaskProfileSummary;
  readonly selectedCli: CliName;
  readonly confidence: number;
  readonly alternatives: readonly CliName[];
  readonly reason: string;
  readonly budgetConstraint?: BudgetConstraint;
}

/**
 * Record of a task outcome.
 */
interface TaskOutcomeRecord {
  readonly decisionId: string;
  readonly success: boolean;
  readonly qualityScore: number;
  readonly durationMs: number;
  readonly tokenUsage: number;
  readonly retryCount: number;
  readonly errorCategory?: string;
}

/**
 * Explicit preference signal (human or AI feedback).
 */
interface PreferenceSignal {
  readonly source: 'human' | 'ai' | 'implicit';
  readonly preferred: CliName;
  readonly rejected?: CliName;
  readonly reason?: string;
  readonly confidence: number;
}

/**
 * Combined preference record for training.
 */
interface PreferenceRecord {
  readonly decision: RoutingDecisionRecord;
  readonly outcome: TaskOutcomeRecord;
  readonly preference?: PreferenceSignal;
  readonly computedReward: number;
}

/**
 * Experience record for MobiMem.
 */
interface ExperienceRecord {
  readonly id: string;
  readonly timestamp: Date;
  readonly taskType: string;
  readonly taskDescription: string;
  readonly steps: readonly ExperienceStep[];
  readonly success: boolean;
  readonly learnings: string;
}

/**
 * Action record for MobiMem.
 */
interface ActionRecord {
  readonly id: string;
  readonly taskType: string;
  readonly pattern: string;
  readonly usageCount: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly lastUsed: Date;
}

/**
 * Filter for preference queries.
 */
interface PreferenceFilter {
  readonly taskType?: string;
  readonly cliName?: CliName;
  readonly since?: Date;
  readonly until?: Date;
  readonly minQuality?: number;
  readonly preferenceSource?: 'human' | 'ai' | 'implicit';
}

/**
 * Export format for routing memory.
 */
interface RoutingMemoryExport {
  readonly version: '1.0';
  readonly exportedAt: Date;
  readonly preferences: readonly PreferenceRecord[];
  readonly experiences: readonly ExperienceRecord[];
  readonly actions: readonly ActionRecord[];
}

/**
 * Statistics for routing memory.
 */
interface RoutingMemoryStats {
  readonly preferenceCount: number;
  readonly experienceCount: number;
  readonly actionCount: number;
  readonly oldestRecord: Date;
  readonly newestRecord: Date;
  readonly totalStorageBytes: number;
}
```

---

## Implementation Strategy

### Phase 1: Interface Definition (This Issue)

- Define `IRoutingMemory` interface
- Define all supporting types
- Add to `core/types/index.ts` exports
- Document in ARCHITECTURE.md

### Phase 2: Default Implementation

- Implement `RoutingMemoryBackend` using composition with `IMemoryBackend`
- Store preferences with key pattern: `routing:preference:{id}`
- Store experiences with key pattern: `routing:experience:{id}`
- Store actions with key pattern: `routing:action:{taskType}:{id}`

### Phase 3: Integration

- Update `FeedbackIntegration` to use `IRoutingMemory`
- Update `CompositeRouter` to query preferences for warm-start
- Enable MobiMem (#149) to use experience/action memory
- Enable Preference-Trained Routing (#148) to export training data

---

## Migration Strategy

### Backward Compatibility

- `IMemoryBackend` remains unchanged
- `IRoutingMemory` is additive, not a replacement
- Existing code continues to work

### Version Field

- `RoutingMemoryExport.version` enables future migrations
- Schema changes bump the version

---

## Questions for Consensus Vote

1. **Interface Granularity**: Should `IRoutingMemory` be one interface or split into `IPreferenceMemory`, `IExperienceMemory`, `IActionMemory`?

2. **Composition vs Inheritance**: Should `IRoutingMemory` extend `IMemoryBackend` or compose it internally?

3. **Storage Keys**: Are the proposed key patterns (`routing:preference:{id}`) appropriate?

4. **Export Format**: Is JSON export sufficient, or should we support other formats?

5. **Versioning**: Is `version: '1.0'` in the export sufficient for future migrations?

---

## Vote Options

**APPROVE**: Accept this proposal as-is, proceed to implementation.

**APPROVE WITH AMENDMENTS**: Accept with specific modifications (list in vote).

**DISSENT**: Reject proposal with alternative suggestion.

**ABSTAIN**: No opinion on this architecture decision.

---

_Proposal generated per CLAUDE.md consensus voting protocol_
