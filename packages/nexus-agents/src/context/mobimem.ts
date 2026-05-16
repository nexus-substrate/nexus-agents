/**
 * nexus-agents/context - MobiMEM Implementation
 *
 * Implements MobiMEM post-deployment evolution memory system with
 * Profile, Experience, and Action memory modules.
 *
 * Key features:
 * - Profile Memory: Agent/user preferences and behavioral patterns
 * - Experience Memory: Workflow execution patterns with success tracking
 * - Action Cache: Fast retrieval of successful interaction results
 *
 * @module context/mobimem
 * (Source: Issue #149, arXiv:2512.15784)
 */

import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

type DatabaseType = InstanceType<typeof Database>;
import { createLogger } from '../core/logger.js';
import type { IMobiMem, MobiMemConfig, MobiMemStats } from './mobimem-types.js';
import { DEFAULT_MOBIMEM_CONFIG, MobiMemConfigSchema } from './mobimem-types.js';
import { ProfileMemoryImpl, ExperienceMemoryImpl, ActionCacheImpl } from './mobimem-impl.js';

// Re-export types
export type {
  IMobiMem,
  IProfileMemory,
  IExperienceMemory,
  IActionCache,
  MobiMemConfig,
  MobiMemStats,
  ProfileEntry,
  ExperienceEntry,
  ActionCacheEntry,
  ActionStep,
  ExecutionOutcome,
} from './mobimem-types.js';
export { DEFAULT_MOBIMEM_CONFIG } from './mobimem-types.js';

const logger = createLogger({ component: 'MobiMem' });

/**
 * MobiMEM main implementation.
 * Combines Profile, Experience, and Action memory modules.
 */
export class MobiMem implements IMobiMem {
  readonly profile: ProfileMemoryImpl;
  readonly experience: ExperienceMemoryImpl;
  readonly action: ActionCacheImpl;
  private readonly config: MobiMemConfig;
  private readonly db: DatabaseType | null;

  constructor(config: Partial<MobiMemConfig> = {}) {
    const validated = MobiMemConfigSchema.parse({ ...DEFAULT_MOBIMEM_CONFIG, ...config });
    this.config = validated;
    // #2719: actually open the SQLite handle when `dbPath` is a real file
    // path. Pre-Phase 4 the `dbPath` config was a dead surface — `tool-
    // memory.ts:270` passed it but the impl classes ignored it, so
    // `memory_stats` read an empty DB while routing-memory wrote to
    // in-memory Maps that died on exit. WAL mode keeps concurrent
    // MCP-server + CLI readers coherent.
    if (validated.dbPath === ':memory:' || validated.dbPath === '') {
      this.db = null;
    } else {
      mkdirSync(dirname(validated.dbPath), { recursive: true });
      const db = new Database(validated.dbPath);
      // WAL mode for concurrent MCP-server + CLI readers. The narrowed
      // `ISQLiteDatabase` interface used elsewhere in nexus-agents doesn't
      // expose `pragma`, but the better-sqlite3 default export does.
      (db as unknown as { pragma(s: string): void }).pragma('journal_mode = WAL');
      this.db = db;
    }
    this.profile = new ProfileMemoryImpl(this.config, this.db);
    this.experience = new ExperienceMemoryImpl(this.config, this.db);
    this.action = new ActionCacheImpl(this.config, this.db);
    logger.info('MobiMem initialized', {
      dbPath: validated.dbPath,
      persisted: this.db !== null,
      maxProfileEntries: this.config.maxProfileEntries,
      maxExperiencePatterns: this.config.maxExperiencePatterns,
      maxActionCacheEntries: this.config.maxActionCacheEntries,
    });
  }

  getStats(): MobiMemStats {
    const actionStats = this.action.getStats();

    return {
      profile: {
        totalEntries: this.profile.getEntryCount(),
        uniqueEntities: this.profile.getUniqueEntities(),
        avgConfidence: this.profile.getAverageConfidence(),
      },
      experience: {
        totalPatterns: this.experience.getPatternCount(),
        uniqueTaskTypes: this.experience.getUniqueTaskTypes(),
        avgSuccessRate: this.experience.getAverageSuccessRate(),
      },
      action: {
        totalEntries: actionStats.entries,
        totalHits: actionStats.hits,
        hitRate: actionStats.hitRate,
        timeSavedMs: actionStats.timeSavedMs,
      },
    };
  }

  runMaintenance(): void {
    if (this.config.autoEviction) {
      const evicted = this.action.evictExpired();
      if (evicted > 0) {
        logger.debug('Evicted expired action cache entries', { count: evicted });
      }
    }
  }

  close(): void {
    if (this.db !== null) this.db.close();
    logger.info('MobiMem closed');
  }
}

/**
 * Create a MobiMem instance. Test code should pass `{ dbPath: ':memory:' }`
 * explicitly; production code should prefer {@link getSharedMobiMem} so
 * routing-memory, agent-executor, and the `memory_stats` MCP reader all
 * see the same data (#2719).
 */
export function createMobiMem(config?: Partial<MobiMemConfig>): MobiMem {
  return new MobiMem(config);
}

// ============================================================================
// Shared singleton (#2719)
// ============================================================================

let sharedInstance: MobiMem | null = null;
let resolveSharedDbPath: () => string = defaultSharedDbPath;

/**
 * Process-wide MobiMem singleton. First call lazy-initializes with the
 * canonical SQLite path; subsequent calls return the same instance.
 *
 * This is the production entry point — `RoutingMemory.constructor`
 * (`routing-memory.ts:179`), `tool-memory.ts:270`, and any other caller
 * that wants to share state should use this function.
 *
 * Tests should call {@link setSharedMobiMem} with an in-memory instance
 * in `beforeEach` and {@link resetSharedMobiMem} in `afterEach`.
 */
export function getSharedMobiMem(): MobiMem {
  sharedInstance ??= new MobiMem({ dbPath: resolveSharedDbPath() });
  return sharedInstance;
}

/** Inject an alternate instance for tests. */
export function setSharedMobiMem(instance: MobiMem | null): void {
  sharedInstance = instance;
}

/** Close + null out the singleton. Idempotent. */
export function resetSharedMobiMem(): void {
  if (sharedInstance !== null) {
    sharedInstance.close();
    sharedInstance = null;
  }
}

/** Override how `getSharedMobiMem` resolves its dbPath. Tests only. */
export function setSharedMobiMemDbPathResolver(resolver: () => string): void {
  resolveSharedDbPath = resolver;
}

function defaultSharedDbPath(): string {
  const root = process.env['NEXUS_DATA_DIR'] ?? `${process.env['HOME'] ?? '/tmp'}/.nexus-agents`;
  return `${root}/memory/mobimem.db`;
}
