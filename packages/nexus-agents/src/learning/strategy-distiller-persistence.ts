/**
 * Persistent StrategyDistiller — JSON-backed cross-session persistence.
 *
 * Extends StrategyDistiller with atomic disk writes (write tmp + rename)
 * for distilled rules. Hydrates from a versioned JSON snapshot on
 * construction; saves after every distill() call.
 *
 * @module learning/strategy-distiller-persistence
 * (Source: Issue #1009 — Cross-session persistence)
 */

import { writeFileSync, readFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

import type { ILogger } from '../core/index.js';
import { createLogger } from '../core/index.js';
import type { OutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { DistilledRule, DistillerConfig } from './strategy-distiller-types.js';
import { StrategyDistiller, registerPersistentDistillerFactory } from './strategy-distiller.js';
import { ensureLearningDir, RULES_FILE } from '../config/learning-persistence.js';

// ============================================================================
// Versioned Schema
// ============================================================================

const DistilledRuleSchema = z.object({
  id: z.string(),
  patternType: z.enum(['failure-rate', 'success-rate', 'latency-spike']),
  cli: z.enum(['claude', 'gemini', 'codex']),
  category: z.string(),
  action: z.enum(['penalize', 'boost', 'avoid']),
  confidence: z.number(),
  observationCount: z.number(),
  metric: z.number(),
  status: z.enum(['draft', 'active', 'promoted', 'expired']),
  createdAt: z.number(),
  updatedAt: z.number(),
  tainted: z.boolean(),
});

/** Versioned snapshot schema for atomic saves. */
export const RulesSnapshotSchema = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  rules: z.array(DistilledRuleSchema),
});

export type RulesSnapshot = z.infer<typeof RulesSnapshotSchema>;

// ============================================================================
// Configuration
// ============================================================================

export interface PersistentDistillerConfig {
  /** Override the file path (useful for testing). */
  readonly filePath?: string;
  /** Override the data directory (useful for testing). */
  readonly dataDir?: string;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * StrategyDistiller that persists distilled rules to a JSON file.
 *
 * - Construction: hydrates from rules.json via Zod validation
 * - distill(): calls super.distill() then atomically saves snapshot
 * - Corruption: warn + start fresh (no partial loads)
 */
export class PersistentStrategyDistiller extends StrategyDistiller {
  private readonly filePath: string;
  private readonly persistLogger: ILogger;

  constructor(
    outcomeStore: OutcomeStore,
    persistConfig?: PersistentDistillerConfig,
    logger?: ILogger,
    distillerConfig?: Partial<DistillerConfig>
  ) {
    super(outcomeStore, logger, distillerConfig);
    this.filePath = persistConfig?.filePath ?? RULES_FILE;
    this.persistLogger = logger ?? createLogger({ component: 'PersistentStrategyDistiller' });

    const dataDir = persistConfig?.dataDir;
    ensureLearningDir(dataDir);
    this.hydrate();
  }

  /** Override distill to persist rules after each run. */
  override distill(): void {
    super.distill();
    this.saveSnapshot();
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private hydrate(): void {
    if (!existsSync(this.filePath)) {
      this.persistLogger.debug('No rules file found, starting fresh', {
        path: this.filePath,
      });
      return;
    }

    try {
      const content = readFileSync(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      const result = RulesSnapshotSchema.safeParse(parsed);

      if (!result.success) {
        this.persistLogger.warn('Rules file failed validation, starting fresh', {
          path: this.filePath,
          error: result.error.message,
        });
        return;
      }

      this.loadRules(result.data.rules);
      this.persistLogger.info('Hydrated distilled rules from disk', {
        ruleCount: result.data.rules.length,
        savedAt: result.data.savedAt,
        path: this.filePath,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.persistLogger.warn('Failed to hydrate rules from disk', {
        error: msg,
        path: this.filePath,
      });
    }
  }

  private saveSnapshot(): void {
    const rules = this.getRules();
    const snapshot: RulesSnapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      rules: rules as DistilledRule[],
    };

    const tmpPath = this.filePath + '.tmp';
    try {
      // Ensure parent directory exists
      ensureLearningDir(dirname(this.filePath));
      // Atomic write: temp file + rename
      writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8');
      renameSync(tmpPath, this.filePath);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.persistLogger.warn('Failed to persist rules to disk', {
        error: msg,
        path: this.filePath,
      });
      // Clean up temp file on failure
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

// Self-register factory so CompositeRouter can create PersistentStrategyDistiller
// without a circular top-level import.
registerPersistentDistillerFactory(
  (outcomeStore, logger) => new PersistentStrategyDistiller(outcomeStore, undefined, logger)
);
