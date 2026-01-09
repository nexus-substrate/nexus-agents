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

  constructor(config: Partial<MobiMemConfig> = {}) {
    const validated = MobiMemConfigSchema.parse({ ...DEFAULT_MOBIMEM_CONFIG, ...config });
    this.config = validated;
    this.profile = new ProfileMemoryImpl(this.config);
    this.experience = new ExperienceMemoryImpl(this.config);
    this.action = new ActionCacheImpl(this.config);
    logger.info('MobiMem initialized', {
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
    logger.info('MobiMem closed');
  }
}

/**
 * Create a MobiMem instance.
 */
export function createMobiMem(config?: Partial<MobiMemConfig>): MobiMem {
  return new MobiMem(config);
}
