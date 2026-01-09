/**
 * nexus-agents/context - MobiMEM Implementation Details
 *
 * Internal implementation classes for MobiMEM modules.
 *
 * @module context/mobimem-impl
 * (Source: Issue #149, arXiv:2512.15784)
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type {
  IProfileMemory,
  IExperienceMemory,
  IActionCache,
  MobiMemConfig,
  ProfileEntry,
  ExperienceEntry,
  ActionCacheEntry,
  ActionStep,
  ExecutionOutcome,
} from './mobimem-types.js';

/**
 * Profile Memory implementation.
 * Tracks agent/user preferences with confidence scoring.
 */
export class ProfileMemoryImpl implements IProfileMemory {
  private readonly entries: Map<string, ProfileEntry> = new Map();
  private readonly config: MobiMemConfig;

  constructor(config: MobiMemConfig) {
    this.config = config;
  }

  observe(
    entityId: string,
    entityType: 'agent' | 'user',
    preferenceKey: string,
    preferenceValue: unknown
  ): ProfileEntry {
    const key = `${entityId}:${preferenceKey}`;
    const existing = this.entries.get(key);
    const now = new Date();

    if (existing !== undefined) {
      const newObservationCount = existing.observationCount + 1;
      const updated: ProfileEntry = {
        ...existing,
        preferenceValue,
        confidence: this.calculateConfidence(newObservationCount),
        observationCount: newObservationCount,
        updatedAt: now,
      };
      this.entries.set(key, updated);
      return updated;
    }

    const entry: ProfileEntry = {
      id: randomUUID(),
      entityId,
      entityType,
      preferenceKey,
      preferenceValue,
      confidence: this.calculateConfidence(1),
      observationCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.enforceLimit(entityId);
    this.entries.set(key, entry);
    return entry;
  }

  getPreferences(entityId: string): readonly ProfileEntry[] {
    const results: ProfileEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.entityId === entityId) {
        results.push(entry);
      }
    }
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  getPreference(entityId: string, preferenceKey: string): ProfileEntry | null {
    const key = `${entityId}:${preferenceKey}`;
    return this.entries.get(key) ?? null;
  }

  getEstablishedPreferences(entityId: string): readonly ProfileEntry[] {
    return this.getPreferences(entityId).filter(
      (p) => p.confidence >= this.config.minProfileConfidence
    );
  }

  clearPreferences(entityId: string): number {
    let count = 0;
    for (const [key, entry] of this.entries) {
      if (entry.entityId === entityId) {
        this.entries.delete(key);
        count++;
      }
    }
    return count;
  }

  getEntryCount(): number {
    return this.entries.size;
  }

  getUniqueEntities(): number {
    const entities = new Set<string>();
    for (const entry of this.entries.values()) {
      entities.add(entry.entityId);
    }
    return entities.size;
  }

  getAverageConfidence(): number {
    if (this.entries.size === 0) return 0;
    let total = 0;
    for (const entry of this.entries.values()) {
      total += entry.confidence;
    }
    return total / this.entries.size;
  }

  private calculateConfidence(observationCount: number): number {
    return Math.min(1, Math.log10(observationCount + 1) / 2);
  }

  private enforceLimit(entityId: string): void {
    const entityPrefs = this.getPreferences(entityId);
    if (entityPrefs.length >= this.config.maxProfileEntries) {
      const toRemove = entityPrefs[entityPrefs.length - 1];
      if (toRemove !== undefined) {
        const key = `${entityId}:${toRemove.preferenceKey}`;
        this.entries.delete(key);
      }
    }
  }
}

/**
 * Experience Memory implementation.
 * Tracks workflow execution patterns with success rates.
 */
export class ExperienceMemoryImpl implements IExperienceMemory {
  private readonly patterns: Map<string, ExperienceEntry> = new Map();
  private readonly config: MobiMemConfig;

  constructor(config: MobiMemConfig) {
    this.config = config;
  }

  recordExecution(
    taskType: string,
    actionSequence: readonly ActionStep[],
    outcome: ExecutionOutcome,
    contextSignature: string
  ): ExperienceEntry {
    const patternKey = this.generatePatternKey(taskType, actionSequence, contextSignature);
    const existing = this.patterns.get(patternKey);
    const now = new Date();

    if (existing !== undefined) {
      const newAttemptCount = existing.attemptCount + 1;
      const newSuccessCount = existing.successCount + (outcome.success ? 1 : 0);
      const updated: ExperienceEntry = {
        ...existing,
        outcome,
        successCount: newSuccessCount,
        attemptCount: newAttemptCount,
        successRate: newSuccessCount / newAttemptCount,
        lastUsedAt: now,
      };
      this.patterns.set(patternKey, updated);
      return updated;
    }

    const entry: ExperienceEntry = {
      id: randomUUID(),
      taskType,
      actionSequence,
      outcome,
      contextSignature,
      successCount: outcome.success ? 1 : 0,
      attemptCount: 1,
      successRate: outcome.success ? 1 : 0,
      createdAt: now,
      lastUsedAt: now,
    };

    this.enforceLimit(taskType);
    this.patterns.set(patternKey, entry);
    return entry;
  }

  findPatterns(taskType: string, limit = 10): readonly ExperienceEntry[] {
    const results: ExperienceEntry[] = [];
    for (const entry of this.patterns.values()) {
      if (entry.taskType === taskType) {
        results.push(entry);
      }
    }
    return results.sort((a, b) => b.successRate - a.successRate).slice(0, limit);
  }

  findReliablePatterns(taskType: string): readonly ExperienceEntry[] {
    return this.findPatterns(taskType, 100).filter(
      (p) => p.successRate >= this.config.minExperienceSuccessRate && p.attemptCount >= 3
    );
  }

  getBestPattern(taskType: string, contextSignature: string): ExperienceEntry | null {
    let best: ExperienceEntry | null = null;
    let bestScore = -1;

    for (const entry of this.patterns.values()) {
      if (entry.taskType !== taskType) continue;

      const contextMatch = entry.contextSignature === contextSignature ? 1 : 0.5;
      const score = entry.successRate * contextMatch * Math.log10(entry.attemptCount + 1);

      if (score > bestScore && entry.successRate >= this.config.minExperienceSuccessRate) {
        best = entry;
        bestScore = score;
      }
    }

    return best;
  }

  updatePatternMetrics(patternId: string, success: boolean): void {
    for (const [key, entry] of this.patterns) {
      if (entry.id === patternId) {
        const newAttemptCount = entry.attemptCount + 1;
        const newSuccessCount = entry.successCount + (success ? 1 : 0);
        this.patterns.set(key, {
          ...entry,
          successCount: newSuccessCount,
          attemptCount: newAttemptCount,
          successRate: newSuccessCount / newAttemptCount,
          lastUsedAt: new Date(),
        });
        return;
      }
    }
  }

  getPatternCount(): number {
    return this.patterns.size;
  }

  getUniqueTaskTypes(): number {
    const types = new Set<string>();
    for (const entry of this.patterns.values()) {
      types.add(entry.taskType);
    }
    return types.size;
  }

  getAverageSuccessRate(): number {
    if (this.patterns.size === 0) return 0;
    let total = 0;
    for (const entry of this.patterns.values()) {
      total += entry.successRate;
    }
    return total / this.patterns.size;
  }

  private generatePatternKey(
    taskType: string,
    actionSequence: readonly ActionStep[],
    contextSignature: string
  ): string {
    const sequenceHash = createHash('sha256')
      .update(
        JSON.stringify(actionSequence.map((a) => ({ type: a.actionType, params: a.parameters })))
      )
      .digest('hex')
      .slice(0, 16);
    return `${taskType}:${contextSignature}:${sequenceHash}`;
  }

  private enforceLimit(taskType: string): void {
    const typePatterns = this.findPatterns(taskType, 1000);
    if (typePatterns.length >= this.config.maxExperiencePatterns) {
      const toRemove = typePatterns[typePatterns.length - 1];
      if (toRemove !== undefined) {
        for (const [key, entry] of this.patterns) {
          if (entry.id === toRemove.id) {
            this.patterns.delete(key);
            break;
          }
        }
      }
    }
  }
}

/**
 * Action Cache implementation.
 * Caches successful interaction results for fast retrieval.
 */
export class ActionCacheImpl implements IActionCache {
  private readonly entries: Map<string, ActionCacheEntry> = new Map();
  private readonly config: MobiMemConfig;
  private totalHits = 0;
  private totalRequests = 0;

  constructor(config: MobiMemConfig) {
    this.config = config;
  }

  cache(input: unknown, result: unknown, durationMs: number): ActionCacheEntry {
    const inputHash = this.hashInput(input);
    const now = new Date();

    const entry: ActionCacheEntry = {
      id: randomUUID(),
      inputHash,
      input,
      result,
      originalDurationMs: durationMs,
      hitCount: 0,
      timeSavedMs: 0,
      cachedAt: now,
      lastAccessedAt: now,
      expiresAt: new Date(now.getTime() + this.config.actionCacheTtlMs),
    };

    this.enforceLimit();
    this.entries.set(inputHash, entry);
    return entry;
  }

  get(input: unknown): ActionCacheEntry | null {
    this.totalRequests++;
    const inputHash = this.hashInput(input);
    const entry = this.entries.get(inputHash);

    if (entry === undefined) return null;

    if (entry.expiresAt < new Date()) {
      this.entries.delete(inputHash);
      return null;
    }

    this.totalHits++;
    return entry;
  }

  recordHit(entryId: string): void {
    for (const [hash, entry] of this.entries) {
      if (entry.id === entryId) {
        const updated: ActionCacheEntry = {
          ...entry,
          hitCount: entry.hitCount + 1,
          timeSavedMs: entry.timeSavedMs + entry.originalDurationMs,
          lastAccessedAt: new Date(),
        };
        this.entries.set(hash, updated);
        return;
      }
    }
  }

  evictExpired(): number {
    const now = new Date();
    let evicted = 0;

    for (const [hash, entry] of this.entries) {
      if (entry.expiresAt < now) {
        this.entries.delete(hash);
        evicted++;
      }
    }

    return evicted;
  }

  clear(): number {
    const count = this.entries.size;
    this.entries.clear();
    this.totalHits = 0;
    this.totalRequests = 0;
    return count;
  }

  getStats(): { entries: number; hits: number; hitRate: number; timeSavedMs: number } {
    let totalTimeSaved = 0;
    for (const entry of this.entries.values()) {
      totalTimeSaved += entry.timeSavedMs;
    }

    return {
      entries: this.entries.size,
      hits: this.totalHits,
      hitRate: this.totalRequests > 0 ? this.totalHits / this.totalRequests : 0,
      timeSavedMs: totalTimeSaved,
    };
  }

  private hashInput(input: unknown): string {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }

  private enforceLimit(): void {
    if (this.entries.size >= this.config.maxActionCacheEntries) {
      this.evictExpired();

      if (this.entries.size >= this.config.maxActionCacheEntries) {
        const sorted = [...this.entries.entries()].sort(
          (a, b) => a[1].lastAccessedAt.getTime() - b[1].lastAccessedAt.getTime()
        );
        const toRemove = sorted[0];
        if (toRemove !== undefined) {
          this.entries.delete(toRemove[0]);
        }
      }
    }
  }
}
