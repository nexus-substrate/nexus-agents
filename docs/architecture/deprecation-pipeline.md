# Deprecation Pipeline

> Updated: 2026-02-04
> Source: Complete audit of `@deprecated` annotations (Issue #678)

## Overview

This document tracks deprecated code scheduled for removal in v3.0. All deprecations must follow the process defined here. This is the canonical migration guide for consumers upgrading to v3.0.

## Deprecation Process

1. **Mark** - Add `@deprecated` JSDoc tag with migration path and target version
2. **Document** - Add entry to this file with removal timeline
3. **Warn** - Log runtime warnings when deprecated code is invoked (if applicable)
4. **Remove** - Delete after deprecation period (minimum 1 minor version)

---

## v3.0 Migration Guide

### Orchestrator Interfaces (Issue #595, ADR-0014)

**Removed:** `ITechLead`, `IExpertFactory`, `OrchestrateDeps.techLead`, `OrchestrateDeps.expertFactory`
**Replacement:** `IOrchestrator` from `core/types/orchestrator.js`

```typescript
// BEFORE (v2.x)
import type { ITechLead } from './orchestrate.js';
const tl: ITechLead = { execute: async (task) => ok(result) };
const deps: OrchestrateDeps = { techLead: tl };

// AFTER (v3.0)
import type { IOrchestrator } from '../core/types/orchestrator.js';
import { OrchestratorFactory } from '../orchestration/orchestrator-factory.js';
const factory = await createOrchestratorFactory({ modelAdapter });
const orchestrator = factory.create('tech_lead');
const deps: OrchestrateDeps = { orchestrator };
```

### Task Analysis (ADR-0004)

**Removed:** `TaskComplexityEstimator`, `estimateComplexity()`, `TaskFeatureExtractor`, `TaskAnalyzer`, `TaskTypeClassifier`
**Replacement:** `SharedTaskAnalyzer` from `core/task-analysis/shared-task-analyzer.js`

```typescript
// BEFORE (v2.x)
import { createComplexityEstimator } from './adapters/complexity-estimator.js';
const estimator = createComplexityEstimator();
const complexity = estimator.estimate(task);

// AFTER (v3.0)
import { createSharedTaskAnalyzer } from './core/index.js';
const analyzer = createSharedTaskAnalyzer();
const analysis = analyzer.analyze(task);
const complexity = analysis.complexity;
```

### Global Adapter Factory

**Removed:** `defaultFactory`, `getGlobalAdapterFactory()`
**Replacement:** Direct instantiation with `new AdapterFactory()`

```typescript
// BEFORE (v2.x)
import { defaultFactory } from './adapters/factory.js';
const adapter = defaultFactory.create('claude');

// AFTER (v3.0)
import { AdapterFactory } from './adapters/factory.js';
const factory = new AdapterFactory();
const adapter = factory.create('claude');
```

### Observer Naming (Swarm -> Orchestration)

**Removed:** `SwarmStats`, `SwarmObserverEvent`, `SwarmObserverListener`, `SwarmObserverConfig`, `SwarmObserverConfigSchema`, `ISwarmObserver`, `SwarmObserverOptions`, `SwarmObserver`, `createSwarmObserver`
**Replacement:** Use `Orchestration` prefix equivalents

```typescript
// BEFORE (v2.x)
import type { SwarmStats, ISwarmObserver } from './orchestration-observer-types.js';
import { createSwarmObserver } from './orchestration-observer.js';

// AFTER (v3.0)
import type { OrchestrationStats, IOrchestrationObserver } from './orchestration-observer-types.js';
import { createOrchestrationObserver } from './orchestration-observer.js';
```

### Gemini Adapter Naming

**Removed in v2.6.0:** `EnhancedGeminiConfig`, `EnhancedExecutionResult`, `executeEnhanced()`, `EnhancedGeminiCliAdapter`, `createEnhancedGeminiAdapter`
**Replacement:** Drop `Enhanced` prefix

```typescript
// BEFORE (deprecated)
import { EnhancedGeminiCliAdapter, createEnhancedGeminiAdapter } from './gemini-adapter.js';
const result = await adapter.executeEnhanced(task);

// AFTER (current)
import { GeminiCliAdapter, createGeminiAdapter } from './gemini-adapter.js';
const result = await adapter.executeWithMetadata(task);
```

### arXiv Metadata

**Removed:** `fetchArxivMetadata()`
**Replacement:** `fetchArxivMetadataResult()` with proper `Result<T, E>` error handling

```typescript
// BEFORE (v2.x)
const meta = await fetchArxivMetadata(arxivId);
if (!meta) {
  /* error */
}

// AFTER (v3.0)
const result = await fetchArxivMetadataResult(arxivId);
if (!result.ok) {
  handleError(result.error);
}
const meta = result.value;
```

### Agent State Transitions

**Removed:** `BaseAgent.setState()`
**Replacement:** `stateMachine.transition()` directly

```typescript
// BEFORE (v2.x)
this.setState('running');

// AFTER (v3.0)
this.stateMachine.transition('running');
```

### Utility Aliases

**Removed:** `uuidv4` from `utils/id-utils.ts`
**Replacement:** `generateUUID()`

```typescript
// BEFORE (v2.x)
import { uuidv4 } from './utils/id-utils.js';

// AFTER (v3.0)
import { generateUUID } from './utils/id-utils.js';
```

### Colors Re-export

**Removed:** `COLORS` from `core/trace-exporter-helpers.ts`
**Replacement:** Import from `cli/ansi-output.js` directly

```typescript
// BEFORE (v2.x)
import { COLORS } from './core/trace-exporter-helpers.js';

// AFTER (v3.0)
import { colors } from './cli/ansi-output.js';
```

### Expert Registry Methods

**Removed:** `ExpertRegistry.list()`, `ExpertRegistry.listIds()`, `RegistryStats.totalExperts`
**Replacement:** IRegistry interface methods

```typescript
// BEFORE (v2.x)
const experts = registry.list();
const ids = registry.listIds();
const count = stats.totalExperts;

// AFTER (v3.0)
const experts = registry.getAll();
const ids = registry.getAllIds();
const count = stats.total;
```

### Stop Words Constant

**Removed:** `STOP_WORDS` from `agents/experts/task-analyzer-keywords.ts`
**Replacement:** Import from `utils/text-utils.js`

---

## Complete v3.0 Removal Queue

### Interfaces & Types

| Item                          | Location                              | Replacement                                  | Since |
| ----------------------------- | ------------------------------------- | -------------------------------------------- | ----- |
| `ITechLead`                   | `mcp/tools/orchestrate.ts:88`         | `IOrchestrator`                              | v2.5  |
| `IExpertFactory`              | `mcp/tools/orchestrate.ts:99`         | Not used (unified orchestrator)              | v2.5  |
| `SwarmStats`                  | `orchestration-observer-types.ts:276` | `OrchestrationStats`                         | v2.3  |
| `SwarmObserverEvent`          | `orchestration-observer-types.ts:278` | `OrchestrationObserverEvent`                 | v2.3  |
| `SwarmObserverListener`       | `orchestration-observer-types.ts:280` | `OrchestrationObserverListener`              | v2.3  |
| `SwarmObserverConfig`         | `orchestration-observer-types.ts:282` | `OrchestrationObserverConfig`                | v2.3  |
| `SwarmObserverConfigSchema`   | `orchestration-observer-types.ts:284` | `OrchestrationObserverConfigSchema`          | v2.3  |
| `ISwarmObserver`              | `orchestration-observer-types.ts:286` | `IOrchestrationObserver`                     | v2.3  |
| `SwarmObserverOptions`        | `orchestration-observer-types.ts:288` | `OrchestrationObserverOptions`               | v2.3  |
| ~~`EnhancedGeminiConfig`~~    | ~~`gemini-adapter.ts:70`~~            | `GeminiConfig` (**removed v2.6.0**)          | v2.4  |
| ~~`EnhancedExecutionResult`~~ | ~~`gemini-adapter.ts:92`~~            | `GeminiExecutionResult` (**removed v2.6.0**) | v2.4  |

### Functions & Methods

| Item                              | Location                                | Replacement                                  | Since |
| --------------------------------- | --------------------------------------- | -------------------------------------------- | ----- |
| `fetchArxivMetadata()`            | `cli/research-helpers-arxiv.ts:138`     | `fetchArxivMetadataResult()`                 | v2.4  |
| `estimateComplexity()`            | `adapters/complexity-estimator.ts`      | `SharedTaskAnalyzer.getComplexity()`         | v2.3  |
| `createComplexityEstimator()`     | `adapters/complexity-estimator.ts:227`  | `createSharedTaskAnalyzer()`                 | v2.3  |
| `setState()`                      | `agents/base-agent.ts:198`              | `stateMachine.transition()`                  | v2.2  |
| `performLegacyStateTransition()`  | `agents/base-agent-state-helpers.ts:22` | `stateMachine.transition()`                  | v2.2  |
| `createSwarmObserver`             | `orchestration-observer.ts:453`         | `createOrchestrationObserver`                | v2.3  |
| `createMockTechLead()`            | `mcp/tools/orchestrate.ts:420`          | `createMockOrchestrator()`                   | v2.5  |
| ~~`executeEnhanced()`~~           | ~~`gemini-adapter.ts:195`~~             | `executeWithMetadata()` (**removed v2.6.0**) | v2.4  |
| ~~`createEnhancedGeminiAdapter`~~ | ~~`gemini-adapter.ts:394`~~             | `createGeminiAdapter` (**removed v2.6.0**)   | v2.4  |
| `ExpertRegistry.list()`           | `experts/expert-registry.ts:270`        | `getAll()`                                   | v2.5  |
| `ExpertRegistry.listIds()`        | `experts/expert-registry.ts:280`        | `getAllIds()`                                | v2.5  |

### Modules (Entire File)

| Module                    | Location                                       | Replacement          | Since |
| ------------------------- | ---------------------------------------------- | -------------------- | ----- |
| `complexity-estimator.ts` | `adapters/complexity-estimator.ts`             | `SharedTaskAnalyzer` | v2.3  |
| `task-features.ts`        | `agents/coordination/task-features.ts`         | `SharedTaskAnalyzer` | v2.3  |
| `task-analyzer.ts`        | `agents/experts/task-analyzer.ts`              | `SharedTaskAnalyzer` | v2.3  |
| `task-classifier.ts`      | `cli-adapters/task-classifier.ts`              | `SharedTaskAnalyzer` | v2.3  |
| `task-analyzer.ts`        | `cli-adapters/task-analyzer.ts`                | `SharedTaskAnalyzer` | v2.3  |
| `task-type-classifier.ts` | `agents/collaboration/task-type-classifier.ts` | Import from `core`   | v2.4  |
| `deprecated-exports.ts`   | `agents/deprecated-exports.ts`                 | New module names     | v2.3  |

### Fields & Constants

| Item                            | Location                                   | Replacement                             | Since |
| ------------------------------- | ------------------------------------------ | --------------------------------------- | ----- |
| `outputFormat`                  | `agent-schemas.ts:44`                      | Not enforced (use prompt-level)         | v2.0  |
| `allowedTools`                  | `agent-schemas.ts:49`                      | Not enforced (use policy firewall)      | v2.0  |
| `outputFormat`                  | `core/types/agent.ts:86`                   | Not enforced                            | v2.0  |
| `allowedTools`                  | `core/types/agent.ts:92`                   | Not enforced                            | v2.0  |
| `defaultFactory`                | `adapters/factory.ts:303`                  | `new AdapterFactory()`                  | v2.3  |
| `charsPerToken`                 | `agents/orchestration/state-manager.ts:30` | `getTokenEstimator()`                   | v2.4  |
| `OrchestrateDeps.techLead`      | `mcp/tools/orchestrate.ts:116`             | `OrchestrateDeps.orchestrator`          | v2.5  |
| `OrchestrateDeps.expertFactory` | `mcp/tools/orchestrate.ts:121`             | Not used                                | v2.5  |
| `RegistryStats.totalExperts`    | `experts/expert-registry.ts:54`            | `RegistryStats.total`                   | v2.5  |
| `STOP_WORDS`                    | `experts/task-analyzer-keywords.ts:17`     | `import from 'utils/text-utils.js'`     | v2.5  |
| `COLORS`                        | `core/trace-exporter-helpers.ts:43`        | `import from 'cli/ansi-output.js'`      | v2.5  |
| `uuidv4`                        | `utils/id-utils.ts:138`                    | `generateUUID()`                        | v2.5  |
| ~~`EnhancedGeminiCliAdapter`~~  | ~~`gemini-adapter.ts:386`~~                | `GeminiCliAdapter` (**removed v2.6.0**) | v2.4  |
| `SwarmObserver`                 | `orchestration-observer.ts:451`            | `OrchestrationObserver`                 | v2.3  |

## Per ADR-0005: Router Deprecation Queue (Phase 3)

Once all routing stages are validated, these routers should be deprecated:

| Router           | Stage Replacement      | Status                      |
| ---------------- | ---------------------- | --------------------------- |
| BudgetRouter     | BudgetFilterStage      | Ready to deprecate          |
| ZeroRouter       | ZeroRouterStage        | Ready to deprecate          |
| PreferenceRouter | PreferenceStage        | Ready to deprecate          |
| TopsisRouter     | TopsisRouterStage      | Ready to deprecate          |
| ConfidenceRouter | ConfidenceCascadeStage | ✅ Implemented (Issue #755) |
| TaskRouter       | CapabilityMatchStage   | ✅ Implemented (Issue #755) |
| QualityRouter    | QualityConstraintStage | ✅ Implemented (Issue #755) |

**Status**: All replacement stages implemented. Integration with CompositeRouter complete (disabled by default via feature flags). Ready for final deprecation of legacy routers once stages are validated in production.

## Metrics

- **Total deprecated items**: 43
- **v3.0 module removals**: 7
- **v3.0 interface/type removals**: 11
- **v3.0 function/method removals**: 11
- **v3.0 field/constant removals**: 14
- **Awaiting validation (routers)**: 7 (all replacement stages implemented)

## Removal Checklist

Before removing any deprecated item:

1. [ ] Deprecation has been in place for >=1 minor version
2. [ ] No internal usages remain (grep verification)
3. [ ] Migration guide exists in this document
4. [ ] CHANGELOG entry prepared
5. [ ] Breaking change noted in release notes

---

_Updated: 2026-02-05 (Issue #755 - replacement stages implemented)_
_Next review: Before v3.0 release_
