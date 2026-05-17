# ICTM Pattern — Dynamic Sub-Agent Creation

**Version:** 1.0.0
**Last Updated:** 2026-04-19 (ET)
**Status:** Canonical
**Location:** `docs/architecture/ICTM_PATTERN.md`
**Issue:** [#756](https://github.com/nexus-substrate/nexus-agents/issues/756) | **Paper:** [arXiv:2602.03786](https://arxiv.org/abs/2602.03786)

> ICTM = **(Instructions, Context, Tools, Model)** — a 4-tuple that fully specifies a sub-agent at creation time, enabling task-adaptive specialization instead of static expert roles.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [ICTM Tuple Components](#ictm-tuple-components)
4. [Usage Guide](#usage-guide)
5. [Migration from Static Experts](#migration-from-static-experts)
6. [Context Curation](#context-curation)
7. [API Reference](#api-reference)
8. [Configuration Examples](#configuration-examples)

---

## Overview

Traditional multi-agent systems use **static expert roles** (code_expert, security_expert, etc.) with fixed capabilities. The ICTM pattern, introduced by the AOrchestra paper, replaces static configuration with **dynamic inference** — each sub-agent receives a tailored 4-tuple based on the specific subtask it will execute.

**Benefits:**

- **Task-adaptive**: Each sub-agent is specialized for its exact subtask
- **Context-efficient**: Context curation prevents long-horizon degradation
- **Cost-optimized**: Model selection adapts to subtask complexity
- **Backward-compatible**: ICTM configs convert to `ExpertConfig` via `ictmToExpertConfig()`

**Source files:**

| File                                       | Purpose                                      |
| ------------------------------------------ | -------------------------------------------- |
| `src/agents/ictm/ictm-types.ts`            | Core types and Zod schemas                   |
| `src/agents/ictm/ictm-factory.ts`          | Inference engine and ExpertConfig conversion |
| `src/agents/ictm/context-curator.ts`       | Context filtering, ranking, and trimming     |
| `src/agents/tech-lead-ictm-integration.ts` | Orchestrator integration bridge              |

---

## Architecture

```
Task Analysis
     │
     ▼
┌──────────────────────────────┐
│   Orchestrator               │
│   decomposeTask() → subtasks │
│   selectExperts()            │
└───────────┬──────────────────┘
            │
            ▼
┌──────────────────────────────┐
│   ICTM Enrichment            │
│   enrichAssignmentsWithICTM() │
│     ├── inferICTM()          │
│     │    ├── Instructions    │
│     │    ├── Context filter  │
│     │    ├── Tool set        │
│     │    └── Model selection │
│     └── ictmToExpertConfig() │
└───────────┬──────────────────┘
            │
            ▼
┌──────────────────────────────┐
│   Expert Factory              │
│   createExpert(expertConfig)  │
│   → Specialized sub-agent     │
└──────────────────────────────┘
```

The ICTM enrichment step sits between expert selection and expert creation. It is **optional** — existing code that creates experts directly continues to work unchanged.

---

## ICTM Tuple Components

### Instructions

Task-specific instructions built from the subtask description, parent task requirements, risks, and approach. Extends the base system prompt with contextual information.

```typescript
interface ICTMConfig {
  instructions: string; // Markdown-formatted task brief
  // ...
}
```

### Context

Controls what information flows to the sub-agent. Prevents long-horizon degradation by filtering irrelevant context.

```typescript
interface ContextFilter {
  maxTokens: number; // Token budget (100–1,000,000)
  relevanceThreshold: number; // Min relevance score (0–1)
  includeHistory: boolean; // Include conversation history
  pruneStrategy: 'recency' | 'importance' | 'hybrid';
}
```

- **recency**: Exponential decay scoring (30-min half-life)
- **importance**: Pre-assigned relevance scores
- **hybrid**: 40% recency + 60% importance (recommended for most tasks)

### Tools

Restricts the sub-agent's capabilities to only what the subtask needs.

```typescript
interface ToolSet {
  capabilities: string[]; // Allowed AgentCapability values
  restrictions?: string[]; // Explicit tool exclusions
}
```

### Model

Per-subtask model optimization for the performance-cost tradeoff.

```typescript
interface ModelSelection {
  provider?: string; // e.g., 'anthropic', 'openai'
  modelId?: string; // Specific model ID
  temperature?: number; // 0–2
  maxTokens?: number; // Response token limit
  reasoning?: 'minimal' | 'standard' | 'extended';
}
```

Reasoning depth maps to defaults:

| Depth    | Temperature | Max Tokens | Complexity |
| -------- | ----------- | ---------- | ---------- |
| minimal  | 0.5         | 2,048      | ≤3/10      |
| standard | 0.3         | 4,096      | 4–6/10     |
| extended | 0.1         | 8,192      | ≥7/10      |

---

## Usage Guide

### Creating an ICTM-configured agent

```typescript
import { inferICTM, ictmToExpertConfig } from './agents/ictm/index.js';
import { createExpertFromConfig } from './agents/experts/expert-factory.js';

// 1. Infer ICTM config from subtask analysis
const inference = inferICTM(subtask, taskAnalysis);

// 2. Convert to ExpertConfig (backward-compatible)
const expertConfig = ictmToExpertConfig(inference.config, subtask.id);

// 3. Create the expert using existing factory
const expert = createExpertFromConfig(expertConfig, modelAdapter);
```

### Using the orchestrator integration

```typescript
import { enrichAssignmentsWithICTM } from './agents/tech-lead-ictm-integration.js';

// After selectExperts() in the orchestration loop:
const { assignments, inferences, averageConfidence } = enrichAssignmentsWithICTM(
  rawAssignments,
  subtasks,
  analysis
);

// assignments now have ictmConfig attached
for (const assignment of assignments) {
  if (assignment.ictmConfig) {
    const expertConfig = ictmToExpertConfig(assignment.ictmConfig, assignment.subtaskId);
    // Create expert with ICTM-optimized config...
  }
}
```

### Manual ICTM config

```typescript
import type { ICTMConfig } from './agents/ictm/index.js';
import { validateICTM } from './agents/ictm/index.js';

const config: ICTMConfig = {
  instructions: 'Analyze authentication module for SQL injection.',
  context: {
    maxTokens: 8000,
    relevanceThreshold: 0.7,
    includeHistory: false,
    pruneStrategy: 'importance',
  },
  tools: {
    capabilities: ['code_review', 'research'],
    restrictions: ['code_generation'],
  },
  model: {
    temperature: 0.1,
    reasoning: 'extended',
  },
};

// Validate with Zod schema
const validated = validateICTM(config);
```

---

## Migration from Static Experts

### Before (v2.x — static expert roles)

```typescript
// Fixed role selection — same config regardless of subtask
const expert = await createExpert({
  role: 'security_expert',
  modelAdapter,
});
await expert.execute(task);
```

### After (v3.0 — ICTM-enriched experts)

```typescript
// Dynamic config inferred from subtask specifics
const inference = inferICTM(subtask, analysis);
const expertConfig = ictmToExpertConfig(inference.config, subtask.id);
const expert = createExpertFromConfig(expertConfig, modelAdapter);
await expert.execute(task);
```

### Migration steps

1. **No breaking changes** — existing `createExpert({ role })` continues to work. ICTM is opt-in.

2. **Gradual adoption** — enable ICTM enrichment in the orchestration loop:

   ```typescript
   // Add after selectExperts():
   const enriched = enrichAssignmentsWithICTM(assignments, subtasks, analysis);
   ```

3. **Monitor confidence** — `ICTMInferenceResult.confidence` ranges from 0 to 1. Low confidence (<0.5) indicates insufficient task information — fall back to static roles.

4. **Context curation** — for agents that process large context, use the context curator:
   ```typescript
   import { curateContext } from './agents/ictm/index.js';
   const result = curateContext(contextItems, ictmConfig.context);
   // result.items contains only the most relevant context
   ```

### Compatibility matrix

| Feature            | v2.x (static)               | v3.0 (ICTM)                                              |
| ------------------ | --------------------------- | -------------------------------------------------------- |
| Expert creation    | `createExpert({ role })`    | Both `createExpert({ role })` and `ictmToExpertConfig()` |
| Context management | Manual, full context passed | Automatic curation via `ContextFilter`                   |
| Model selection    | Global default              | Per-subtask optimization                                 |
| Tool restrictions  | Per-role fixed              | Per-subtask dynamic                                      |
| Observability      | Role name only              | Full inference reasoning + confidence                    |

---

## Context Curation

The context curator prevents long-horizon degradation by filtering context items through a 4-stage pipeline:

```
All Context Items
    │
    ├── 1. Filter history (if includeHistory=false)
    ├── 2. Filter by relevance threshold
    ├── 3. Rank by strategy (recency/importance/hybrid)
    └── 4. Trim to token budget
    │
    ▼
Curated Context Items
```

### Scoring strategies

- **Recency**: `exp(-age × ln(2) / halfLife)` where halfLife = 30 minutes
- **Importance**: Uses pre-assigned `relevance` score from the context item
- **Hybrid**: `0.4 × recency + 0.6 × importance` (recommended default)

### Creating context items

```typescript
import { createContextItem, curateContext } from './agents/ictm/index.js';

const items = [
  createContextItem('task-desc', taskDescription, 'task', 0.9),
  createContextItem('prev-result', previousOutput, 'result', 0.7),
  createContextItem('chat-1', chatMessage, 'history', 0.4),
];

const curated = curateContext(items, ictmConfig.context);
// curated.items: selected items within token budget
// curated.totalTokens: actual token usage
// curated.filteredCount: items removed by relevance/history filter
// curated.trimmedCount: items removed for token budget
```

---

## API Reference

### Types (`ictm-types.ts`)

| Type                   | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `ICTMConfig`           | The 4-tuple: instructions, context, tools, model |
| `ICTMInferenceResult`  | Inferred config + reasoning + confidence         |
| `ContextFilter`        | Context curation configuration                   |
| `ToolSet`              | Capability and restriction lists                 |
| `ModelSelection`       | Per-subtask model parameters                     |
| `CuratedContextItem`   | A ranked and scored context item                 |
| `ReasoningDepth`       | `'minimal' \| 'standard' \| 'extended'`          |
| `ContextPruneStrategy` | `'recency' \| 'importance' \| 'hybrid'`          |

### Functions (`ictm-factory.ts`)

| Function                       | Description                            |
| ------------------------------ | -------------------------------------- |
| `inferICTM(subtask, analysis)` | Infer optimal ICTM config from subtask |
| `ictmToExpertConfig(ictm, id)` | Convert ICTM to ExpertConfig           |
| `validateICTM(config)`         | Validate config with Zod schema        |
| `getRecommendedRole(taskType)` | Get default expert role for task type  |

### Functions (`context-curator.ts`)

| Function                                                        | Description                                 |
| --------------------------------------------------------------- | ------------------------------------------- |
| `curateContext(items, filter, nowMs?)`                          | Curate context through the 4-stage pipeline |
| `createContextItem(id, content, source, relevance, timestamp?)` | Create a context item                       |
| `estimateTokens(text)`                                          | Estimate token count (chars/4 heuristic)    |
| `scoreByRecency(item, nowMs)`                                   | Score by exponential decay                  |
| `scoreByImportance(item)`                                       | Score by pre-assigned relevance             |
| `scoreByHybrid(item, nowMs)`                                    | Weighted average of recency + importance    |

### Functions (`tech-lead-ictm-integration.ts`)

| Function                                                     | Description                                 |
| ------------------------------------------------------------ | ------------------------------------------- |
| `enrichAssignmentsWithICTM(assignments, subtasks, analysis)` | Enrich expert assignments with ICTM configs |

### Zod Schemas

All types have corresponding Zod schemas for runtime validation: `ICTMConfigSchema`, `ContextFilterSchema`, `ToolSetSchema`, `ModelSelectionSchema`, `ICTMInferenceResultSchema`.

---

## Configuration Examples

### Security audit task

```typescript
const config: ICTMConfig = {
  instructions:
    'Audit the payment processing module for OWASP Top 10 vulnerabilities. Focus on SQL injection and XSS.',
  context: {
    maxTokens: 16000,
    relevanceThreshold: 0.6,
    includeHistory: false,
    pruneStrategy: 'importance',
  },
  tools: {
    capabilities: ['code_review', 'research', 'security_analysis'],
    restrictions: ['code_generation', 'deployment'],
  },
  model: {
    reasoning: 'extended',
    temperature: 0.1,
    maxTokens: 8192,
  },
};
```

### Quick code fix

```typescript
const config: ICTMConfig = {
  instructions: 'Fix the off-by-one error in pagination logic at src/api/list.ts:42.',
  context: {
    maxTokens: 4000,
    relevanceThreshold: 0.3,
    includeHistory: true,
    pruneStrategy: 'recency',
  },
  tools: {
    capabilities: ['code_generation', 'testing'],
  },
  model: {
    reasoning: 'minimal',
    temperature: 0.5,
    maxTokens: 2048,
  },
};
```

### Research task

```typescript
const config: ICTMConfig = {
  instructions:
    'Research consensus algorithm alternatives for our voting system. Compare Raft, PBFT, and HotStuff.',
  context: {
    maxTokens: 12000,
    relevanceThreshold: 0.5,
    includeHistory: true,
    pruneStrategy: 'hybrid',
  },
  tools: {
    capabilities: ['research', 'documentation'],
    restrictions: ['code_generation'],
  },
  model: {
    reasoning: 'standard',
    temperature: 0.3,
    maxTokens: 4096,
  },
};
```
