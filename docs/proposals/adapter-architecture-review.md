# Adapter Architecture Review Proposal

**Date:** 2026-01-10 (ET)
**Status:** IMPLEMENTED — All major items delivered (CompositeRouter, ResilientAdapter, UnifiedAdapterRegistry, CliCircuitBreaker). Voted 3/3 APPROVE to close on 2026-03-04.
**Stakeholders:** Architect, Security, DevEx, AI/ML, PM

---

## 1. Problem Statement

The nexus-agents adapter system has grown organically to support both API-based model adapters and CLI-based adapters (claude, gemini, codex). While functional, an architectural review has identified several inconsistencies and gaps that affect:

1. **Performance** - No caching for CLI detection/health checks
2. **Consistency** - Model usage varies across entry points
3. **Integration** - Some research implementations are vestigial/unconnected
4. **Developer Experience** - Missing exports and unclear patterns

---

## 2. Current Architecture Summary

### Adapter Types

- **Model Adapters** (`src/adapters/`): API-based (Claude, OpenAI, Gemini, Ollama)
- **CLI Adapters** (`src/cli-adapters/`): Subprocess/MCP-based (Claude CLI, Gemini CLI, Codex CLI)

### Key Components

- `auto-adapter.ts` - CLI-first selection with API fallback
- `cli-to-model-adapter.ts` - Bridge ICliAdapter → IModelAdapter
- Multiple routers: confidence, budget, agreement-cascade, TOPSIS, preference, LinUCB
- Circuit breaker pattern for failure handling

### Identified Issues

| Issue                                          | Category    | Impact                                             |
| ---------------------------------------------- | ----------- | -------------------------------------------------- |
| No CLI detection caching                       | Performance | Repeated health checks on each adapter creation    |
| `defaultFactory` singleton unused              | Vestigial   | Dead code, confusing API                           |
| `SubprocessCliAdapter` exported but unused     | Vestigial   | Dead export, no concrete usage                     |
| `CodexMcpAdapter` not in main exports          | Missing     | Users can't directly import                        |
| `delegate_to_model` tool registered but unused | Vestigial   | Tool exists but not called in workflows            |
| Health checks always run                       | Performance | Slow startup when CLIs already known               |
| No session-level adapter caching               | Consistency | Different adapters may be selected in same session |

---

## 3. Proposed Changes

### 3.1 CLI Detection Caching System

**Goal:** Run CLI detection once per session, cache results

```typescript
// New: src/cli-adapters/cli-detection-cache.ts
interface CliDetectionCache {
  readonly timestamp: Date;
  readonly available: Map<CliName, CliHealthResult>;
  readonly preferred: CliName | null;
  isStale(): boolean;
  invalidate(): void;
}

// Usage: Auto-adapter checks cache before health checks
const cache = getGlobalCliCache();
if (!cache.isStale()) {
  return cache.available;
}
```

**Impact:**

- First request: Full detection (~500ms for 3 CLIs)
- Subsequent requests: Cache hit (<1ms)
- Cache TTL: 5 minutes (configurable)

### 3.2 Remove Vestigial Code

**Remove:**

1. `defaultFactory` singleton from `src/adapters/factory.ts`
2. `SubprocessCliAdapter` export from `src/cli-adapters/index.ts`

**Keep but Connect:**

1. `delegate_to_model` tool - integrate into workflow system

### 3.3 Fix Missing Exports

**Add to `src/cli-adapters/index.ts`:**

```typescript
export { CodexMcpAdapter } from './adapters/codex-mcp-adapter.js';
```

### 3.4 Task-Type Routing Consistency (Amended per AI/ML Review)

**Goal:** Maintain routing consistency within task workflows while enabling adaptive per-task routing

**Important:** The original proposal for session-level adapter locking was AMENDED based on AI/ML review. Session-level locking would conflict with adaptive routing strategies (LinUCB, TOPSIS, confidence cascade).

**Amended approach:**

- CLI detection caching: YES (availability metadata only)
- Session-level adapter locking: NO (prevents adaptive learning)
- Task-type consistency: YES (multi-turn conversations stay with same model)

```typescript
// Amended: Task-scoped consistency, not session-scoped
interface TaskRoutingContext {
  conversationId?: string; // Multi-turn conversations use same model
  workflowId?: string; // Steps in a workflow use same model
  // Independent tasks route independently via adaptive routers
}

// No global SessionAdapterManager - use existing routers
```

### 3.5 Router Composition (New - per AI/ML Review)

**Goal:** Connect currently disconnected research routers

```typescript
// New: src/cli-adapters/composite-router.ts
class CompositeRouter {
  // Chain routers in priority order:
  // 1. BudgetRouter - filter by cost constraints
  // 2. TopsisRouter - rank eligible models by criteria
  // 3. LinUCBBandit - exploration/exploitation on top

  route(task: Task, budget?: BudgetConstraint): RoutingDecision {
    const eligible = this.budgetRouter.filterEligible(task, budget);
    const ranked = this.topsisRouter.rank(task, eligible);
    return this.linucb.select(task, ranked);
  }
}
```

### 3.6 Cache Invalidation Hooks (New - per AI/ML Review)

**Goal:** Invalidate CLI detection cache when adapters fail

```typescript
// Add to cli-detection-cache.ts
onCircuitBreakerTrip(cli: CliName): void {
  this.available.delete(cli);
  this.logger.info('Cache invalidated due to circuit breaker', { cli });
}
```

### 3.7 Research Integration Audit

**Routers to Verify Are Connected:**

- [ ] `confidence-router.ts` - Cascading confidence
- [ ] `budget-router.ts` - Token budget awareness
- [ ] `agreement-cascade-router.ts` - Multi-model consensus
- [ ] `topsis-router.ts` - TOPSIS ranking
- [ ] `preference-router.ts` - User preferences
- [ ] `linucb-bandit.ts` - Contextual bandit

**Action:** Verify each router has:

1. Test coverage (confirmed: all have tests)
2. Entry point integration (audit needed)
3. Documentation in CLAUDE.md

---

## 4. Implementation Plan (Revised after Voting)

| Phase | Task                                                   | Priority | Effort |
| ----- | ------------------------------------------------------ | -------- | ------ |
| 1     | Implement CLI detection cache with invalidation hooks  | P1       | Medium |
| 2     | Create CompositeRouter to connect research routers     | P1       | Medium |
| 3     | Connect learning/OutcomeFeedbackCollector to workflows | P1       | Medium |
| 4     | Deprecate (not remove) vestigial exports               | P2       | Low    |
| 5     | Add missing CodexMcpAdapter export                     | P2       | Low    |
| 6     | Connect delegate_to_model to workflows                 | P3       | Medium |
| 7     | Update CLAUDE.md with routing documentation            | P3       | Low    |
| 8     | Remove deprecated exports in next major version        | P3       | Low    |

---

## 5. Risk Assessment

| Risk                             | Mitigation                                       |
| -------------------------------- | ------------------------------------------------ |
| Breaking changes to exports      | Major version bump if removing exports           |
| Cache invalidation timing        | Make TTL configurable, provide manual invalidate |
| Session manager state management | Clear documentation, singleton pattern           |
| Router integration complexity    | Incremental integration, feature flags           |

---

## 6. Success Criteria

1. CLI detection runs once per session (measurable via logs)
2. Zero vestigial exports in public API
3. All routers have documented entry points
4. Session adapter selection is consistent (same adapter throughout)
5. No TypeScript/lint errors
6. All tests pass

---

## 7. Voting Request

Each voting agent should evaluate:

1. Does this proposal align with CLAUDE.md standards?
2. Are the identified vestigial components correctly identified?
3. Is the caching strategy appropriate?
4. Are there security implications?
5. Will this improve developer experience?

**Vote:** APPROVE / DISSENT / ABSTAIN
**If DISSENT:** Provide specific concerns and proposed amendments.

---

## 8. Consensus Voting Results

**Vote Date:** 2026-01-10 (ET)
**Threshold Required:** Supermajority (≥4/5)
**Result:** APPROVED with amendments

| Agent     | Vote    | Key Feedback                                    |
| --------- | ------- | ----------------------------------------------- |
| Architect | APPROVE | Cache DI over global singleton                  |
| Security  | APPROVE | No security concerns; non-sensitive cache       |
| DevEx     | APPROVE | Deprecate before removing exports               |
| AI/ML     | DISSENT | Session locking conflicts with adaptive routing |
| PM        | APPROVE | Add latency benchmark to success criteria       |

**Critical Amendment (AI/ML):** The original session-level adapter locking was replaced with task-type routing consistency. The CompositeRouter and cache invalidation hooks were added based on AI/ML feedback.

**Final Tally:** 4 APPROVE, 1 DISSENT (with amendments incorporated)

---

## 9. Vestigial Components Identified

Based on codebase audit:

| Component                           | Status                      | Action                      |
| ----------------------------------- | --------------------------- | --------------------------- |
| `defaultFactory` singleton          | Exported, never used        | Deprecate                   |
| `SubprocessCliAdapter` export       | Exported, never extended    | Deprecate                   |
| `delegate_to_model` tool            | Registered, never called    | Connect to workflows        |
| `learning/OutcomeFeedbackCollector` | Implemented, never imported | Connect to workflows        |
| `ConfidenceRouter`                  | Tests only, no entry point  | Connect via CompositeRouter |
| `BudgetRouter`                      | Tests only, no entry point  | Connect via CompositeRouter |
| `TopsisRouter`                      | Tests only, no entry point  | Connect via CompositeRouter |
| `LinUCBBandit`                      | Tests only, no entry point  | Connect via CompositeRouter |
| `PreferenceRouter`                  | Tests only, no entry point  | Connect via CompositeRouter |
| `AgreementCascadeRouter`            | Tests only, no entry point  | Connect via CompositeRouter |

---

## 10. References

- CLAUDE.md - Project guidelines
- Issue #78 - CLI router implementation
- Issue #90 - Codex MCP transport preference
- Issue #99 - Confidence cascade routing
- Issue #102 - Budget-aware routing
- Issue #121 - Agreement cascade (arXiv:2410.10347)
- Issue #146 - TOPSIS router (arXiv:2509.07571)
- Issue #160 - Outcome feedback collector
