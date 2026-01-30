# Deprecation Pipeline

> Generated: 2026-01-30
> Source: System Mandate Loop K - Deprecation Pipeline

## Overview

This document tracks deprecated code scheduled for removal. All deprecations must follow the process defined here.

## Deprecation Process

1. **Mark** - Add `@deprecated` JSDoc tag with migration path and target version
2. **Document** - Add entry to this file with removal timeline
3. **Warn** - Log runtime warnings when deprecated code is invoked (if applicable)
4. **Remove** - Delete after deprecation period (minimum 1 minor version)

## Current Deprecations

### v3.0 Removal Queue (30 items)

| Item                  | Location                     | Replacement      | Added |
| --------------------- | ---------------------------- | ---------------- | ----- |
| `maxOutputTokens`     | agent-schemas.ts:44          | Not enforced     | v2.0  |
| `maxTotalTokens`      | agent-schemas.ts:49          | Not enforced     | v2.0  |
| deprecated-exports.ts | agents/deprecated-exports.ts | New module names | v2.3  |
| `maxOutputTokens`     | core/types/agent.ts:86       | Not enforced     | v2.0  |
| `maxTotalTokens`      | core/types/agent.ts:92       | Not enforced     | v2.0  |

### Immediate Deprecations (Use Alternative Now)

| Item                              | Location                                           | Replacement                          | Risk   |
| --------------------------------- | -------------------------------------------------- | ------------------------------------ | ------ |
| `fetchArxivMetadata`              | cli/research-helpers-arxiv.ts:138                  | `fetchArxivMetadataResult()`         | Low    |
| `getGlobalAdapterFactory()`       | adapters/factory.ts:306                            | `new AdapterFactory()`               | Medium |
| `estimateComplexity()`            | adapters/complexity-estimator.ts                   | `SharedTaskAnalyzer.getComplexity()` | Low    |
| `setState()`                      | agents/base-agent.ts:198                           | `stateMachine.transition()`          | Low    |
| `OrchestrationObserverImpl`       | agents/observability/orchestration-observer.ts:451 | `OrchestrationObserver`              | Low    |
| `createOrchestrationObserverImpl` | agents/observability/orchestration-observer.ts:453 | `createOrchestrationObserver`        | Low    |
| `TaskFeatureExtractor`            | agents/coordination/task-features.ts               | `SharedTaskAnalyzer`                 | Medium |
| `TaskAnalyzer`                    | agents/experts/task-analyzer.ts                    | `SharedTaskAnalyzer`                 | Medium |
| `TaskTypeClassifier`              | agents/collaboration/task-type-classifier.ts       | Import from core                     | Low    |

### Type Aliases (Backward Compatibility)

These type aliases exist for backward compatibility and will be removed in v3.0:

| Alias                  | Location                            | Canonical Type                      |
| ---------------------- | ----------------------------------- | ----------------------------------- |
| `Stats`                | orchestration-observer-types.ts:276 | `OrchestrationStats`                |
| `ObserverEvent`        | orchestration-observer-types.ts:278 | `OrchestrationObserverEvent`        |
| `ObserverListener`     | orchestration-observer-types.ts:280 | `OrchestrationObserverListener`     |
| `ObserverConfig`       | orchestration-observer-types.ts:282 | `OrchestrationObserverConfig`       |
| `ObserverConfigSchema` | orchestration-observer-types.ts:284 | `OrchestrationObserverConfigSchema` |
| `IObserver`            | orchestration-observer-types.ts:286 | `IOrchestrationObserver`            |
| `ObserverOptions`      | orchestration-observer-types.ts:288 | `OrchestrationObserverOptions`      |

## Per ADR-0005: Router Deprecation Queue (Phase 3)

Once all routing stages are validated, these routers should be deprecated:

| Router           | Stage Replacement      | Status                |
| ---------------- | ---------------------- | --------------------- |
| BudgetRouter     | BudgetFilterStage      | Ready to deprecate    |
| ZeroRouter       | ZeroRouterStage        | Ready to deprecate    |
| PreferenceRouter | PreferenceStage        | Ready to deprecate    |
| TopsisRouter     | TopsisRouterStage      | Ready to deprecate    |
| ConfidenceRouter | ConfidenceCascadeStage | Stage not implemented |
| TaskRouter       | CapabilityMatchStage   | Stage not implemented |
| QualityRouter    | QualityConstraintStage | Stage not implemented |

**Action Required**: Create ConfidenceStage, CapabilityMatchStage, and QualityConstraintStage before marking old routers as deprecated.

## Per ADR-0004: Task Analysis Deprecation

| Item                 | Replacement                        | Status |
| -------------------- | ---------------------------------- | ------ |
| TaskAnalyzer         | SharedTaskAnalyzer                 | Ready  |
| TaskFeatureExtractor | SharedTaskAnalyzer                 | Ready  |
| estimateComplexity() | SharedTaskAnalyzer.getComplexity() | Ready  |

## Metrics

- **Total deprecated items**: 30
- **v3.0 removals scheduled**: 5
- **Immediate replacements available**: 9
- **Awaiting migration (routers)**: 7

## Removal Checklist

Before removing any deprecated item:

1. [ ] Deprecation has been in place for ≥1 minor version
2. [ ] No internal usages remain (grep verification)
3. [ ] Migration guide exists in ADR or this document
4. [ ] CHANGELOG entry prepared
5. [ ] Breaking change noted in release notes

---

_Updated by System Mandate Loop K_
_Next review: Before v3.0 release_
