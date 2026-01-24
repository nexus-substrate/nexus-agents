---
title: Memory Systems
description: Research-backed memory architectures for AI agents
---

Research on memory architectures for AI agents including long-term memory, context compression, graph-based memory, and multi-type memory systems. All 6 memory techniques have been implemented.

## Implementation Status

| Technique                         | Paper                                                | Priority | Status      | Issue                                                               |
| --------------------------------- | ---------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------- |
| A-MEM Agentic Memory              | [arXiv:2502.12110](https://arxiv.org/abs/2502.12110) | P1       | Implemented | [#122](https://github.com/williamzujkowski/nexus-agents/issues/122) |
| Mem0 Long-Term Memory             | [arXiv:2504.19413](https://arxiv.org/abs/2504.19413) | P2       | Implemented | [#156](https://github.com/williamzujkowski/nexus-agents/issues/156) |
| MIRIX Six-Type Memory             | [arXiv:2507.07957](https://arxiv.org/abs/2507.07957) | P2       | Implemented | [#157](https://github.com/williamzujkowski/nexus-agents/issues/157) |
| MobiMem Post-Deployment Evolution | [arXiv:2512.15784](https://arxiv.org/abs/2512.15784) | P2       | Implemented | [#149](https://github.com/williamzujkowski/nexus-agents/issues/149) |
| Graph-Based Memory                | [arXiv:2504.19413](https://arxiv.org/abs/2504.19413) | P3       | Implemented | [#142](https://github.com/williamzujkowski/nexus-agents/issues/142) |
| Adaptive Memory                   | [arXiv:2310.08560](https://arxiv.org/abs/2310.08560) | P2       | Implemented | [#143](https://github.com/williamzujkowski/nexus-agents/issues/143) |

## A-MEM Agentic Memory

**Paper:** [A-MEM: Agentic Memory for LLM Agents](https://arxiv.org/abs/2502.12110)

Zettelkasten-inspired agentic memory where memories are treated as notes with attributes (keywords, tags, entities, context description). Dynamic linking and evolution detection enables semantic organization.

### Key Metrics

| Metric                | Value                                         |
| --------------------- | --------------------------------------------- |
| Semantic Organization | Automatic attribute extraction and linking    |
| Evolution Detection   | Refinement, extension, supersession detection |

### Implementation

Implemented as `AgenticMemoryBackend` class with:

- Automatic attribute extraction (keywords, tags, entities, context)
- Dynamic link suggestion based on similarity (60% keyword, 40% entity)
- Memory evolution detection (refinement, extension, supersession, contradiction)
- PII filtering in entity extraction
- Composition with HybridMemoryBackend and GraphMemoryBackend
- Phase 1 uses rule-based extraction; Phase 2 will add embeddings
- 31 comprehensive tests

**Source Files:**

- `src/context/agentic-memory-types.ts`
- `src/context/agentic-memory-helpers.ts`
- `src/context/agentic-memory-linking.ts`
- `src/context/agentic-memory.ts`

### Usage

```typescript
import { AgenticMemoryBackend } from 'nexus-agents';

const memory = new AgenticMemoryBackend();

// Store memory with automatic attribute extraction
await memory.set('memory-1', {
  content: 'User prefers TypeScript for backend development',
  timestamp: Date.now(),
});

// Automatic extraction results in:
// - keywords: ['typescript', 'backend', 'development']
// - tags: ['preference', 'language', 'backend']
// - entities: ['TypeScript']

// Find related memories
const related = await memory.findRelated('memory-1');
```

## Mem0 Scalable Long-Term Memory

**Paper:** [Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413)

Scalable memory architecture with dynamic extraction of salient information and consolidation across sessions.

### Key Metrics

| Metric              | Value         |
| ------------------- | ------------- |
| Latency Reduction   | 91% lower p95 |
| Token Savings       | 90%           |
| Quality Improvement | 26%           |

### Implementation

Core features implemented via agentic-memory, adaptive-memory, and graph-memory. Provides dynamic extraction, cross-session consolidation, and scalable retrieval.

**Source Files:**

- `src/context/agentic-memory.ts`
- `src/context/adaptive-memory.ts`
- `src/context/graph-memory.ts`
- `src/context/memory-backend.ts`

### Usage

```typescript
import { HybridMemoryBackend } from 'nexus-agents';

const memory = new HybridMemoryBackend({
  sqlitePath: './memory.db',
  markdownExportPath: './memory-export/',
});

// High-importance memories are persisted to both SQLite and Markdown
await memory.set('critical-learning', data, {
  importance: 'high',
});
```

## MIRIX Six-Type Memory System

**Paper:** [MIRIX: Six-Type Memory System](https://arxiv.org/abs/2507.07957)

Six-type memory system with multi-agent management architecture.

### Memory Types

| Type            | Purpose                          |
| --------------- | -------------------------------- |
| Core            | Agent identity, constraints      |
| Episodic        | Task experiences                 |
| Semantic        | Domain knowledge                 |
| Procedural      | Skills, workflows                |
| Resource        | External references              |
| Knowledge Vault | Persistent cross-session storage |

### Key Metrics

| Metric             | Value |
| ------------------ | ----- |
| Accuracy vs RAG    | +35%  |
| Storage Reduction  | 99.9% |
| Benchmark Accuracy | 85.4% |

### Implementation

All six memory types present in `typed-memory.ts`. Code explicitly cites arXiv:2507.07957 in comments. Implementation exceeds MIRIX with A-MEM and Voyager integration.

**Source Files:**

- `src/context/typed-memory.ts`
- `src/context/typed-memory-impl.ts`
- `src/context/memory-types.ts`

### Usage

```typescript
import { TypedMemory } from 'nexus-agents';

const memory = new TypedMemory();

// Access different memory types
await memory.core.set('agent-identity', { role: 'code-reviewer' });
await memory.episodic.record('task-123', { outcome: 'success' });
await memory.semantic.store('typescript-patterns', knowledge);
await memory.procedural.addSkill('refactoring', skill);

// Query by type with relevance filtering
const relevant = await memory.queryByType('semantic', 'async patterns');
```

## MobiMem Post-Deployment Evolution

**Paper:** [MobiMem: Post-Deployment Evolution via Memory Modules](https://arxiv.org/abs/2512.15784)

Post-deployment evolution via Profile, Experience, and Action memory modules for continuous agent improvement without retraining.

### Key Metrics

| Metric                   | Value                     |
| ------------------------ | ------------------------- |
| Profile Alignment        | 83.1%                     |
| Retrieval Speed          | 280x faster than GraphRAG |
| Task Success Improvement | 50.3%                     |

### Implementation

Implemented `MobiMemBackend` with Profile, Experience, and Action modules. Enables post-deployment evolution without retraining. Experience Memory tracks workflow patterns for improvement.

**Source Files:**

- `src/context/mobimem.ts`
- `src/context/mobimem-impl.ts`
- `src/context/mobimem-types.ts`

### Usage

```typescript
import { MobiMemBackend } from 'nexus-agents';

const memory = new MobiMemBackend();

// Profile memory - user preferences
await memory.profile.set('user-1', {
  preferredLanguage: 'TypeScript',
  codeStyle: 'functional',
});

// Experience memory - workflow patterns
await memory.experience.record({
  workflow: 'code-review',
  outcome: 'success',
  duration: 120,
});

// Action memory - cached operations
await memory.action.cache('lint-fix', cachedResult);
```

## Graph-Based Memory

**Paper:** [Mem0: Building Production-Ready AI Agents](https://arxiv.org/abs/2504.19413)

Graph-based relational structures for entity relationships extracted from context with semantic retrieval.

### Key Metrics

| Metric                  | Value |
| ----------------------- | ----- |
| Performance Improvement | +2%   |

### Implementation

Extension of Mem0 architecture with graph-based entity relationships.

**Source Files:**

- `src/context/graph-memory.ts`
- `src/context/graph-memory-types.ts`
- `src/context/graph-memory-helpers.ts`

### Usage

```typescript
import { GraphMemoryBackend } from 'nexus-agents';

const memory = new GraphMemoryBackend();

// Store entities with relationships
await memory.addEntity('TypeScript', { type: 'language' });
await memory.addEntity('Node.js', { type: 'runtime' });
await memory.addRelation('TypeScript', 'runs-on', 'Node.js');

// Query relationships
const related = await memory.getRelated('TypeScript');
```

## Adaptive Memory

**Paper:** [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2310.08560)

Priority-based memory retrieval combining recency decay, importance weighting, and context relevance scoring.

### Key Metrics

| Metric      | Value                         |
| ----------- | ----------------------------- |
| Performance | Configurable priority scoring |

### Implementation

Complements graph-based-memory with temporal and importance scoring.

**Source Files:**

- `src/context/adaptive-memory.ts`
- `src/context/adaptive-memory-types.ts`
- `src/context/adaptive-memory-helpers.ts`

### Usage

```typescript
import { AdaptiveMemory } from 'nexus-agents';

const memory = new AdaptiveMemory({
  recencyWeight: 0.3,
  importanceWeight: 0.5,
  relevanceWeight: 0.2,
  decayRate: 0.95,
});

// Memories are scored based on recency, importance, and relevance
const topMemories = await memory.retrieve(query, { limit: 10 });
```

## Memory Architecture

The memory systems are composed together:

```
┌─────────────────────────────────────────────────────────────┐
│                    TypedMemory (MIRIX)                      │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │  Core   │ │Episodic │ │ Semantic │ │   Procedural     │  │
│  └─────────┘ └─────────┘ └──────────┘ └──────────────────┘  │
│  ┌──────────────────────┐ ┌────────────────────────────────┐│
│  │      Resource        │ │       Knowledge Vault          ││
│  └──────────────────────┘ └────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                AgenticMemoryBackend (A-MEM)                 │
│  - Automatic attribute extraction                           │
│  - Dynamic linking                                          │
│  - Evolution detection                                      │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 HybridMemoryBackend (Mem0)                  │
│  ┌────────────────────┐  ┌────────────────────────────────┐ │
│  │      SQLite        │  │       Markdown Export          │ │
│  │   (persistence)    │  │   (high-importance only)       │ │
│  └────────────────────┘  └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│               GraphMemoryBackend + AdaptiveMemory           │
│  - Entity relationships                                     │
│  - Recency/importance scoring                               │
│  - Semantic retrieval                                       │
└─────────────────────────────────────────────────────────────┘
```

## Source Papers

| Paper                                                          | Year | Key Contribution                     |
| -------------------------------------------------------------- | ---- | ------------------------------------ |
| [A-MEM](https://arxiv.org/abs/2502.12110)                      | 2025 | Zettelkasten-inspired agentic memory |
| [Mem0](https://arxiv.org/abs/2504.19413)                       | 2025 | Scalable long-term memory            |
| [MIRIX](https://arxiv.org/abs/2507.07957)                      | 2025 | Six-type memory system               |
| [MobiMem](https://arxiv.org/abs/2512.15784)                    | 2025 | Post-deployment evolution            |
| [Context Engineering Survey](https://arxiv.org/abs/2507.13334) | 2025 | Context management taxonomy          |
| [ICAL](https://arxiv.org/abs/2406.14596)                       | 2024 | Continual learning                   |

## Related Topics

- [Memory System](/nexus-agents/architecture/memory-system) - How memory integrates with context
- [Consensus](/nexus-agents/research/consensus) - Reflexion for iterative improvement
