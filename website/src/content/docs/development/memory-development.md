---
title: Memory Development
description: Create custom memory backends implementing the 8-type MIRIX memory architecture for nexus-agents.
---

This guide covers creating custom memory backends for nexus-agents. Memory systems implement the `IMemoryBackend` interface and can integrate with the 8-type MIRIX memory architecture.

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

The MIRIX architecture defines 8 specialized memory types:

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

  it('should handle metadata', async () => {
    await memory.set(
      'important',
      { data: 'critical' },
      {
        importance: 'critical',
        tags: ['security', 'config'],
      }
    );

    expect(await memory.has('important')).toBe(true);
  });

  it('should report correct size', async () => {
    expect(await memory.size()).toBe(0);

    await memory.set('key1', 'value1');
    await memory.set('key2', 'value2');

    expect(await memory.size()).toBe(2);
  });
});
```

## Implementing Typed Memory

### Episodic Memory

Track task experiences for learning:

```typescript
// src/context/episodic-memory.ts
import type { IEpisodicMemory, Episode, EpisodeQuery } from './memory-types.js';

interface Episode {
  id: string;
  timestamp: number;
  taskDescription: string;
  taskType: string;
  outcome: string;
  success: boolean;
  learnings?: string[];
}

interface EpisodeQuery {
  since?: number;
  until?: number;
  taskType?: string;
  success?: boolean;
  limit?: number;
}

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

### Graph Memory

Store entity relationships:

```typescript
// src/context/graph-memory.ts
import type { IGraphMemory } from './memory-types.js';

interface Entity {
  id: string;
  type: string;
  properties: Record<string, unknown>;
}

interface Relationship {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}

export class GraphMemoryBackend implements IGraphMemory {
  private entities = new Map<string, Entity>();
  private relationships: Relationship[] = [];

  async addEntity(entity: Entity): Promise<void> {
    this.entities.set(entity.id, entity);
  }

  async getEntity(id: string): Promise<Entity | undefined> {
    return this.entities.get(id);
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

  async findPath(
    startEntity: string,
    endEntity: string,
    maxDepth: number = 5
  ): Promise<string[] | null> {
    // BFS to find shortest path
    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: startEntity, path: [startEntity] }];

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;

      if (id === endEntity) {
        return path;
      }

      if (path.length >= maxDepth || visited.has(id)) {
        continue;
      }

      visited.add(id);

      const related = await this.getRelatedEntities(id);
      for (const entity of related) {
        if (!visited.has(entity.id)) {
          queue.push({ id: entity.id, path: [...path, entity.id] });
        }
      }
    }

    return null;
  }
}
```

### Adaptive Memory

Priority-based retrieval with recency decay:

```typescript
// src/context/adaptive-memory.ts
import type { IMemoryBackend, MemoryImportance } from './memory-types.js';

interface MemoryItem {
  content: unknown;
  timestamp: number;
  importance?: MemoryImportance;
  accessCount: number;
  _score?: number;
}

interface RetrievalOptions {
  minScore: number;
  limit: number;
  recencyDecay: number; // Higher = slower decay
  weights: {
    recency: number;
    importance: number;
    relevance: number;
  };
}

export class AdaptiveMemoryBackend {
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
    items.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));

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
    const itemText = JSON.stringify(item.content).toLowerCase();
    const matches = queryWords.filter((w) => itemText.includes(w));
    return matches.length / queryWords.length;
  }
}
```

## Session Memory

Persist learnings across sessions:

```typescript
// src/context/session-memory.ts
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

interface Learning {
  id: string;
  content: string;
  confidence: number;
  timestamp: number;
  sessionId: string;
}

interface SessionMemoryConfig {
  storagePath: string;
  minConfidence: number;
}

export class SessionMemory {
  private config: SessionMemoryConfig;
  private learnings: Learning[] = [];
  private currentSessionId: string | null = null;

  constructor(config: SessionMemoryConfig) {
    this.config = config;
  }

  async startSession(sessionId: string): Promise<void> {
    this.currentSessionId = sessionId;

    // Load previous learnings
    await this.loadLearnings();
  }

  async endSession(): Promise<void> {
    // Persist current session's learnings
    await this.saveLearnings();
    this.currentSessionId = null;
  }

  async recordLearning(content: string, confidence: number): Promise<void> {
    if (!this.currentSessionId) {
      throw new Error('No active session');
    }

    this.learnings.push({
      id: crypto.randomUUID(),
      content,
      confidence,
      timestamp: Date.now(),
      sessionId: this.currentSessionId,
    });
  }

  async getRelevantLearnings(query: string, limit: number = 10): Promise<Learning[]> {
    // Filter by minimum confidence
    const filtered = this.learnings.filter((l) => l.confidence >= this.config.minConfidence);

    // Simple keyword matching for relevance
    const keywords = query.toLowerCase().split(/\s+/);
    const scored = filtered.map((learning) => {
      const text = learning.content.toLowerCase();
      const matches = keywords.filter((k) => text.includes(k)).length;
      return { learning, score: matches / keywords.length };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.learning);
  }

  private async loadLearnings(): Promise<void> {
    try {
      const path = join(this.config.storagePath, 'learnings.json');
      const data = await readFile(path, 'utf-8');
      this.learnings = JSON.parse(data);
    } catch {
      this.learnings = [];
    }
  }

  private async saveLearnings(): Promise<void> {
    await mkdir(this.config.storagePath, { recursive: true });
    const path = join(this.config.storagePath, 'learnings.json');
    await writeFile(path, JSON.stringify(this.learnings, null, 2));
  }
}
```

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
  // Process one at a time to avoid memory pressure
}

// Cache frequently accessed items
const cache = new Map<string, { value: unknown; fetchedAt: number }>();
const CACHE_TTL = 60000; // 1 minute

async function getCached<T>(key: string): Promise<T | undefined> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.value as T;
  }

  const value = await memory.get<T>(key);
  if (value !== undefined) {
    cache.set(key, { value, fetchedAt: Date.now() });
  }
  return value;
}

// Batch writes when possible
interface WriteOperation {
  key: string;
  value: unknown;
  metadata?: MemoryMetadata;
}

async function batchWrite(operations: WriteOperation[]): Promise<void> {
  await Promise.all(operations.map((op) => memory.set(op.key, op.value, op.metadata)));
}
```

### Memory Limits

| Type     | Recommended Limit | Rationale            |
| -------- | ----------------- | -------------------- |
| Episodic | 1,000 episodes    | Keep recent history  |
| Semantic | 10,000 facts      | Domain knowledge     |
| Graph    | 5,000 entities    | Relationship limit   |
| Session  | 100 learnings     | Current session only |

### Importance Guidelines

| Importance | Use For                                |
| ---------- | -------------------------------------- |
| `critical` | Security rules, core configuration     |
| `high`     | Frequently accessed, important context |
| `medium`   | Standard memories (default)            |
| `low`      | Temporary, easily reconstructed        |

## Testing Memory Backends

### Unit Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MemoryBackend', () => {
  let memory: IMemoryBackend;

  beforeEach(async () => {
    memory = new CustomMemoryBackend();
  });

  afterEach(async () => {
    await memory.clear();
  });

  it('should handle concurrent writes', async () => {
    const writes = Array.from({ length: 100 }, (_, i) => memory.set(`key${i}`, `value${i}`));

    await Promise.all(writes);

    expect(await memory.size()).toBe(100);
  });

  it('should respect expiration during iteration', async () => {
    await memory.set('expired', 'value', { expiresAt: Date.now() - 1000 });
    await memory.set('valid', 'value', { expiresAt: Date.now() + 60000 });

    const keys: string[] = [];
    for await (const key of memory.keys()) {
      keys.push(key);
    }

    expect(keys).not.toContain('expired');
    expect(keys).toContain('valid');
  });
});
```

### Integration Tests

```typescript
describe('Memory Integration', () => {
  it('should persist across sessions', async () => {
    const sessionMemory = new SessionMemory({
      storagePath: './test-storage',
      minConfidence: 0.5,
    });

    // Session 1
    await sessionMemory.startSession('session-1');
    await sessionMemory.recordLearning('Important fact', 0.9);
    await sessionMemory.endSession();

    // Session 2
    await sessionMemory.startSession('session-2');
    const learnings = await sessionMemory.getRelevantLearnings('Important');

    expect(learnings).toHaveLength(1);
    expect(learnings[0].content).toBe('Important fact');
  });
});
```

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

## Next Steps

- [Agent Development](/nexus-agents/development/agent-development) - Create agents that use memory
- [Tool Development](/nexus-agents/development/tool-development) - Build tools with memory access
- [Architecture Overview](/nexus-agents/architecture/overview) - System design details
