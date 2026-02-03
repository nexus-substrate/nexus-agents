---
title: "Memory Development Guide"
description: "This guide walks through implementing custom memory backends and integrating with the 8-type memory architecture."
---

---

## Overview

This guide walks through implementing custom memory backends and integrating with the 8-type memory architecture.

---

## Memory Architecture

### Core Interface

```typescript
interface IMemoryBackend {
  set<T>(key: string, value: T, metadata?: MemoryMetadata): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  keys(): AsyncIterable<string>;
  entries<T>(): AsyncIterable<[string, T]>;
  size(): Promise<number>;
}

interface MemoryMetadata {
  importance?: MemoryImportance;
  tags?: string[];
  expiresAt?: number;
  source?: string;
}

type MemoryImportance = 'critical' | 'high' | 'medium' | 'low';
```

### 8 Memory Types (MIRIX)

| Type       | Interface           | Purpose                   |
| ---------- | ------------------- | ------------------------- |
| Core       | `ICoreMemory`       | Agent identity, rules     |
| Episodic   | `IEpisodicMemory`   | Task experiences          |
| Semantic   | `ISemanticMemory`   | Domain knowledge          |
| Procedural | `IProceduralMemory` | Skills, workflows         |
| Resource   | `IResourceMemory`   | External references       |
| Vault      | `IKnowledgeVault`   | Cross-session persistence |
| Graph      | `IGraphMemory`      | Entity relationships      |
| Adaptive   | `IAdaptiveMemory`   | Priority-based retrieval  |

---

## Creating a Custom Memory Backend

### Step 1: Implement IMemoryBackend

```typescript
// src/context/custom-memory.ts
import type { IMemoryBackend, MemoryMetadata } from './memory-types.js';

export class CustomMemoryBackend implements IMemoryBackend {
  private storage = new Map<string, { value: unknown; metadata?: MemoryMetadata }>();

  async set<T>(key: string, value: T, metadata?: MemoryMetadata): Promise<void> {
    // Check for expiration
    if (metadata?.expiresAt && Date.now() > metadata.expiresAt) {
      return; // Don't store expired items
    }

    this.storage.set(key, { value, metadata });

    // High-importance items could trigger additional persistence
    if (metadata?.importance === 'critical' || metadata?.importance === 'high') {
      await this.persistToSecondary(key, value, metadata);
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.storage.get(key);
    if (!entry) return undefined;

    // Check expiration
    if (entry.metadata?.expiresAt && Date.now() > entry.metadata.expiresAt) {
      this.storage.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.storage.delete(key);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  async *keys(): AsyncIterable<string> {
    for (const key of this.storage.keys()) {
      yield key;
    }
  }

  async *entries<T>(): AsyncIterable<[string, T]> {
    for (const [key, entry] of this.storage.entries()) {
      yield [key, entry.value as T];
    }
  }

  async size(): Promise<number> {
    return this.storage.size;
  }

  private async persistToSecondary(
    key: string,
    value: unknown,
    metadata?: MemoryMetadata
  ): Promise<void> {
    // Implement secondary persistence (file, database, etc.)
  }
}
```

### Step 2: Add Tests

```typescript
// src/context/custom-memory.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CustomMemoryBackend } from './custom-memory.js';

describe('CustomMemoryBackend', () => {
  let memory: CustomMemoryBackend;

  beforeEach(() => {
    memory = new CustomMemoryBackend();
  });

  it('should store and retrieve values', async () => {
    await memory.set('key1', { data: 'test' });
    const result = await memory.get<{ data: string }>('key1');
    expect(result?.data).toBe('test');
  });

  it('should handle expiration', async () => {
    await memory.set('key1', 'value', {
      expiresAt: Date.now() - 1000, // Already expired
    });
    const result = await memory.get('key1');
    expect(result).toBeUndefined();
  });

  it('should iterate over keys', async () => {
    await memory.set('key1', 'value1');
    await memory.set('key2', 'value2');

    const keys: string[] = [];
    for await (const key of memory.keys()) {
      keys.push(key);
    }

    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
  });
});
```

---

## Implementing Typed Memory

### Episodic Memory Example

```typescript
// src/context/episodic-memory.ts
import type { IEpisodicMemory, Episode, EpisodeQuery } from './memory-types.js';

export class EpisodicMemoryBackend implements IEpisodicMemory {
  private episodes: Episode[] = [];

  async recordEpisode(episode: Episode): Promise<void> {
    this.episodes.push({
      ...episode,
      timestamp: episode.timestamp || Date.now(),
    });

    // Prune old episodes if needed
    await this.pruneOldEpisodes();
  }

  async queryEpisodes(query: EpisodeQuery): Promise<Episode[]> {
    let results = this.episodes;

    // Filter by time range
    if (query.since) {
      results = results.filter((e) => e.timestamp >= query.since!);
    }
    if (query.until) {
      results = results.filter((e) => e.timestamp <= query.until!);
    }

    // Filter by task type
    if (query.taskType) {
      results = results.filter((e) => e.taskType === query.taskType);
    }

    // Filter by success
    if (query.success !== undefined) {
      results = results.filter((e) => e.success === query.success);
    }

    // Sort by relevance (most recent first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  async getSimilarEpisodes(taskDescription: string, limit: number): Promise<Episode[]> {
    // Simple keyword-based similarity
    const keywords = this.extractKeywords(taskDescription);

    const scored = this.episodes.map((episode) => ({
      episode,
      score: this.calculateSimilarity(keywords, episode),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => s.episode);
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
  }

  private calculateSimilarity(keywords: string[], episode: Episode): number {
    const episodeText = `${episode.taskDescription} ${episode.outcome}`.toLowerCase();
    return keywords.filter((k) => episodeText.includes(k)).length / keywords.length;
  }

  private async pruneOldEpisodes(): Promise<void> {
    const maxEpisodes = 1000;
    if (this.episodes.length > maxEpisodes) {
      // Keep most recent episodes
      this.episodes = this.episodes.slice(-maxEpisodes);
    }
  }
}
```

---

## Graph Memory Implementation

### Creating Entity Relationships

```typescript
// src/context/graph-memory.ts
import type { IGraphMemory, Entity, Relationship } from './memory-types.js';

export class GraphMemoryBackend implements IGraphMemory {
  private entities = new Map<string, Entity>();
  private relationships: Relationship[] = [];

  async addEntity(entity: Entity): Promise<void> {
    this.entities.set(entity.id, entity);
  }

  async addRelationship(relationship: Relationship): Promise<void> {
    // Validate entities exist
    if (!this.entities.has(relationship.source)) {
      throw new Error(`Source entity not found: ${relationship.source}`);
    }
    if (!this.entities.has(relationship.target)) {
      throw new Error(`Target entity not found: ${relationship.target}`);
    }

    this.relationships.push(relationship);
  }

  async getRelatedEntities(entityId: string, relationshipType?: string): Promise<Entity[]> {
    const related = this.relationships
      .filter(
        (r) =>
          (r.source === entityId || r.target === entityId) &&
          (!relationshipType || r.type === relationshipType)
      )
      .map((r) => (r.source === entityId ? r.target : r.source));

    return related.map((id) => this.entities.get(id)).filter((e): e is Entity => e !== undefined);
  }

  async queryByPath(startEntity: string, path: string[]): Promise<Entity[]> {
    let current = [startEntity];

    for (const relationshipType of path) {
      const next: string[] = [];
      for (const entityId of current) {
        const related = await this.getRelatedEntities(entityId, relationshipType);
        next.push(...related.map((e) => e.id));
      }
      current = [...new Set(next)];
    }

    return current.map((id) => this.entities.get(id)).filter((e): e is Entity => e !== undefined);
  }
}
```

---

## Adaptive Memory Integration

### Priority-Based Retrieval

```typescript
// src/context/adaptive-memory.ts
export class AdaptiveMemoryBackend implements IAdaptiveMemory {
  private backend: IMemoryBackend;

  constructor(backend: IMemoryBackend) {
    this.backend = backend;
  }

  async retrieve(query: string, options: RetrievalOptions): Promise<MemoryItem[]> {
    const items: MemoryItem[] = [];

    for await (const [key, value] of this.backend.entries<MemoryItem>()) {
      const score = this.calculateScore(value, query, options);
      if (score > options.minScore) {
        items.push({ ...value, _score: score });
      }
    }

    // Sort by score
    items.sort((a, b) => b._score - a._score);

    return items.slice(0, options.limit);
  }

  private calculateScore(item: MemoryItem, query: string, options: RetrievalOptions): number {
    let score = 0;

    // Recency factor (decay over time)
    const age = Date.now() - item.timestamp;
    const recencyScore = Math.exp(-age / options.recencyDecay);
    score += recencyScore * options.weights.recency;

    // Importance factor
    const importanceScore = this.importanceToScore(item.importance);
    score += importanceScore * options.weights.importance;

    // Relevance factor (keyword match)
    const relevanceScore = this.calculateRelevance(item, query);
    score += relevanceScore * options.weights.relevance;

    return score;
  }

  private importanceToScore(importance?: MemoryImportance): number {
    switch (importance) {
      case 'critical':
        return 1.0;
      case 'high':
        return 0.75;
      case 'medium':
        return 0.5;
      case 'low':
        return 0.25;
      default:
        return 0.5;
    }
  }

  private calculateRelevance(item: MemoryItem, query: string): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const itemText = JSON.stringify(item).toLowerCase();
    const matches = queryWords.filter((w) => itemText.includes(w));
    return matches.length / queryWords.length;
  }
}
```

---

## Best Practices

### Memory Lifecycle

1. **Initialize** - Set up storage backends
2. **Populate** - Load from persistent storage
3. **Use** - Read/write during session
4. **Persist** - Save important memories
5. **Cleanup** - Prune expired/low-importance items

### Performance Considerations

```typescript
// Use async iteration for large datasets
for await (const [key, value] of memory.entries()) {
  // Process one at a time
}

// Cache frequently accessed items
const cache = new Map<string, CachedItem>();

// Batch writes when possible
const batch: WriteOperation[] = [];
batch.push({ key, value, metadata });
await memory.batchWrite(batch);
```

### Memory Limits

| Type     | Recommended Limit | Rationale            |
| -------- | ----------------- | -------------------- |
| Episodic | 1,000 episodes    | Keep recent history  |
| Semantic | 10,000 facts      | Domain knowledge     |
| Graph    | 5,000 entities    | Relationship limit   |
| Session  | 100 learnings     | Current session only |

---

## Source Files

| File                             | Purpose                  |
| -------------------------------- | ------------------------ |
| `src/context/memory-types.ts`    | Type definitions         |
| `src/context/memory-backend.ts`  | Hybrid SQLite+Markdown   |
| `src/context/typed-memory.ts`    | 8-type memory system     |
| `src/context/graph-memory.ts`    | Graph-based memory       |
| `src/context/adaptive-memory.ts` | Priority-based retrieval |
| `src/context/agentic-memory.ts`  | A-MEM implementation     |
| `src/context/session-memory.ts`  | Cross-session storage    |

---

## Related Documents

- **Memory Architecture:** [MEMORY_SYSTEM.md](/nexus-agents/architecture/memory-system/)
- **Agent System:** [AGENT_SYSTEM.md](/nexus-agents/architecture/agent-system/)
- **Research:** [RESEARCH_INDEX.md](../research/RESEARCH_INDEX.md)