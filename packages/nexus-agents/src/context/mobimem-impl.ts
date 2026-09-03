/**
 * nexus-agents/context - MobiMEM Implementation Details
 *
 * Internal implementation classes for MobiMEM modules.
 *
 * @module context/mobimem-impl
 * (Source: Issue #149, arXiv:2512.15784)
 */

import { randomUUID } from 'node:crypto';
import type { ISQLiteDatabase } from '../core/types/database-types.js';
type DatabaseType = ISQLiteDatabase;
import { getTimeProvider } from '../core/index.js';
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
import {
  calculateConfidence,
  generatePatternKey,
  hashInput,
  calculatePatternScore,
  computeUpdatedMetrics,
  countUnique,
  computeAverage,
} from './mobimem-impl-helpers.js';
import { MobiMemPersistence } from './mobimem-persistence.js';

/**
 * JSON.stringify drops the `Date` constructor; entries written before a
 * process restart and reloaded from SQLite come back with `string`
 * timestamps where the runtime expects `Date`. Re-hydrate the named keys
 * so downstream `entry.expiresAt < now` style comparisons keep working.
 */
function hydrateDates<T>(value: T, dateKeys: readonly (keyof T)[]): T {
  const out = value as unknown as Record<string, unknown>;
  for (const key of dateKeys) {
    const v = out[key as string];
    if (typeof v === 'string') out[key as string] = new Date(v);
  }
  return value;
}

/**
 * Profile Memory implementation.
 * Tracks agent/user preferences with confidence scoring.
 */
export class ProfileMemoryImpl implements IProfileMemory {
  private readonly entries: Map<string, ProfileEntry> = new Map();
  private readonly config: MobiMemConfig;
  private readonly persist: MobiMemPersistence<ProfileEntry>;

  constructor(config: MobiMemConfig, db: DatabaseType | null = null) {
    this.config = config;
    this.persist = new MobiMemPersistence<ProfileEntry>({ db, domain: 'mobimem_profile' });
    // Hydrate from SQLite when active (#2719 fix: process-boundary persistence).
    for (const [k, v] of this.persist.load()) {
      this.entries.set(k, hydrateDates<ProfileEntry>(v, ['createdAt', 'updatedAt']));
    }
  }

  observe(
    entityId: string,
    entityType: 'agent' | 'user',
    preferenceKey: string,
    preferenceValue: unknown
  ): ProfileEntry {
    const key = `${entityId}:${preferenceKey}`;
    const existing = this.entries.get(key);
    const now = new Date(getTimeProvider().now());

    if (existing !== undefined) {
      const newObservationCount = existing.observationCount + 1;
      const updated: ProfileEntry = {
        ...existing,
        preferenceValue,
        confidence: calculateConfidence(newObservationCount),
        observationCount: newObservationCount,
        updatedAt: now,
      };
      this.entries.set(key, updated);
      this.persist.upsert(key, updated);
      return updated;
    }

    const entry: ProfileEntry = {
      id: randomUUID(),
      entityId,
      entityType,
      preferenceKey,
      preferenceValue,
      confidence: calculateConfidence(1),
      observationCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.enforceLimit(entityId);
    this.entries.set(key, entry);
    this.persist.upsert(key, entry);
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
        this.persist.delete(key);
        count++;
      }
    }
    return count;
  }

  getEntryCount(): number {
    return this.entries.size;
  }

  getUniqueEntities(): number {
    return countUnique(this.entries.values(), (e) => e.entityId);
  }

  getAverageConfidence(): number {
    return computeAverage(this.entries.values(), (e) => e.confidence);
  }

  private enforceLimit(entityId: string): void {
    const entityPrefs = this.getPreferences(entityId);
    if (entityPrefs.length >= this.config.maxProfileEntries) {
      const toRemove = entityPrefs[entityPrefs.length - 1];
      if (toRemove !== undefined) {
        const key = `${entityId}:${toRemove.preferenceKey}`;
        this.entries.delete(key);
        this.persist.delete(key);
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
  private readonly persist: MobiMemPersistence<ExperienceEntry>;

  constructor(config: MobiMemConfig, db: DatabaseType | null = null) {
    this.config = config;
    this.persist = new MobiMemPersistence<ExperienceEntry>({ db, domain: 'mobimem_experience' });
    for (const [k, v] of this.persist.load()) {
      this.patterns.set(k, hydrateDates<ExperienceEntry>(v, ['createdAt', 'lastUsedAt']));
    }
  }

  recordExecution(
    taskType: string,
    actionSequence: readonly ActionStep[],
    outcome: ExecutionOutcome,
    contextSignature: string
  ): ExperienceEntry {
    const patternKey = generatePatternKey(taskType, actionSequence, contextSignature);
    const existing = this.patterns.get(patternKey);
    const now = new Date(getTimeProvider().now());

    if (existing !== undefined) {
      const metrics = computeUpdatedMetrics(
        existing.successCount,
        existing.attemptCount,
        outcome.success
      );
      const updated: ExperienceEntry = {
        ...existing,
        outcome,
        ...metrics,
        lastUsedAt: now,
      };
      this.patterns.set(patternKey, updated);
      this.persist.upsert(patternKey, updated);
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
    this.persist.upsert(patternKey, entry);
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

  /** #3234: all recorded entries across task types — for the research-maturity measurement surface. */
  getAllPatterns(): readonly ExperienceEntry[] {
    return [...this.patterns.values()];
  }

  getBestPattern(taskType: string, contextSignature: string): ExperienceEntry | null {
    let best: ExperienceEntry | null = null;
    let bestScore = -1;

    for (const entry of this.patterns.values()) {
      if (entry.taskType !== taskType) continue;

      const contextMatches = entry.contextSignature === contextSignature;
      const score = calculatePatternScore(entry.successRate, contextMatches, entry.attemptCount);

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
        const metrics = computeUpdatedMetrics(entry.successCount, entry.attemptCount, success);
        const updated: ExperienceEntry = {
          ...entry,
          ...metrics,
          lastUsedAt: new Date(getTimeProvider().now()),
        };
        this.patterns.set(key, updated);
        this.persist.upsert(key, updated);
        return;
      }
    }
  }

  getPatternCount(): number {
    return this.patterns.size;
  }

  getUniqueTaskTypes(): number {
    return countUnique(this.patterns.values(), (e) => e.taskType);
  }

  getAverageSuccessRate(): number {
    return computeAverage(this.patterns.values(), (e) => e.successRate);
  }

  private enforceLimit(taskType: string): void {
    const typePatterns = this.findPatterns(taskType, 1000);
    if (typePatterns.length >= this.config.maxExperiencePatterns) {
      const toRemove = typePatterns[typePatterns.length - 1];
      if (toRemove !== undefined) {
        for (const [key, entry] of this.patterns) {
          if (entry.id === toRemove.id) {
            this.patterns.delete(key);
            this.persist.delete(key);
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
  private readonly persist: MobiMemPersistence<ActionCacheEntry>;
  private totalHits = 0;
  private totalRequests = 0;

  constructor(config: MobiMemConfig, db: DatabaseType | null = null) {
    this.config = config;
    this.persist = new MobiMemPersistence<ActionCacheEntry>({ db, domain: 'mobimem_action' });
    for (const [k, v] of this.persist.load()) {
      this.entries.set(
        k,
        hydrateDates<ActionCacheEntry>(v, ['cachedAt', 'lastAccessedAt', 'expiresAt'])
      );
    }
  }

  cache(input: unknown, result: unknown, durationMs: number): ActionCacheEntry {
    const inputHash = hashInput(input);
    const now = new Date(getTimeProvider().now());

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
    this.persist.upsert(inputHash, entry);
    return entry;
  }

  get(input: unknown): ActionCacheEntry | null {
    this.totalRequests++;
    const inputHash = hashInput(input);
    const entry = this.entries.get(inputHash);

    if (entry === undefined) return null;

    if (entry.expiresAt < new Date(getTimeProvider().now())) {
      this.entries.delete(inputHash);
      this.persist.delete(inputHash);
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
          lastAccessedAt: new Date(getTimeProvider().now()),
        };
        this.entries.set(hash, updated);
        this.persist.upsert(hash, updated);
        return;
      }
    }
  }

  evictExpired(): number {
    const now = new Date(getTimeProvider().now());
    let evicted = 0;

    for (const [hash, entry] of this.entries) {
      if (entry.expiresAt < now) {
        this.entries.delete(hash);
        this.persist.delete(hash);
        evicted++;
      }
    }

    return evicted;
  }

  clear(): number {
    const count = this.entries.size;
    this.entries.clear();
    this.persist.clear();
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

  /** Drop one entry to stay under the cache limit. SQLite mirror updated. */
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
          this.persist.delete(toRemove[0]);
        }
      }
    }
  }
}
