/**
 * Persistent OutcomeStore — JSONL-backed cross-session persistence.
 *
 * Extends the in-memory OutcomeStore with disk-backed append-only
 * JSONL storage. Hydrates on construction, appends on every write.
 * Corrupt lines are skipped with a warning (graceful degradation).
 *
 * @module orchestration/outcomes/outcome-store-persistence
 * (Source: Issue #1009 — Cross-session persistence)
 */

import { appendFileSync, readFileSync, existsSync } from 'node:fs';

import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import { TaskOutcomeSchema } from './outcome-types.js';
import type { TaskOutcome } from './outcome-types.js';
import { OutcomeStore, registerPersistentOutcomeStoreFactory } from './outcome-store.js';
import type { OutcomeStoreConfig } from './outcome-store.js';
import { ensureLearningDir, OUTCOMES_FILE } from '../../config/learning-persistence.js';

// ============================================================================
// Configuration
// ============================================================================

export interface PersistentOutcomeStoreConfig extends OutcomeStoreConfig {
  /** Override the file path (useful for testing). */
  readonly filePath?: string;
  /** Override the data directory (useful for testing). */
  readonly dataDir?: string;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * OutcomeStore that persists entries to a JSONL file on disk.
 *
 * - Construction: hydrates from existing JSONL file (Zod-validates each line)
 * - Append: calls super.append() then appendFileSync one JSON line
 * - Corruption: bad lines are skipped with a warning log
 */
export class PersistentOutcomeStore extends OutcomeStore {
  private readonly filePath: string;
  private readonly logger: ILogger;

  constructor(config?: PersistentOutcomeStoreConfig, logger?: ILogger) {
    super(config);
    this.filePath = config?.filePath ?? OUTCOMES_FILE;
    this.logger = logger ?? createLogger({ component: 'PersistentOutcomeStore' });

    const dataDir = config?.dataDir;
    ensureLearningDir(dataDir);
    this.hydrate();
  }

  /** Override append to persist each entry to disk. */
  override append(outcome: TaskOutcome): void {
    super.append(outcome);
    this.persistLine(outcome);
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private hydrate(): void {
    if (!existsSync(this.filePath)) {
      this.logger.debug('No outcomes file found, starting fresh', {
        path: this.filePath,
      });
      return;
    }

    try {
      const content = readFileSync(this.filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim().length > 0);
      let loaded = 0;
      let skipped = 0;

      for (const line of lines) {
        try {
          const parsed: unknown = JSON.parse(line);
          const result = TaskOutcomeSchema.safeParse(parsed);
          if (result.success) {
            super.append(result.data);
            loaded++;
          } else {
            skipped++;
          }
        } catch {
          skipped++;
        }
      }

      this.logger.info('Hydrated outcomes from disk', {
        loaded,
        skipped,
        total: lines.length,
        path: this.filePath,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to hydrate outcomes from disk', {
        error: msg,
        path: this.filePath,
      });
    }
  }

  private persistLine(outcome: TaskOutcome): void {
    try {
      appendFileSync(this.filePath, JSON.stringify(outcome) + '\n', 'utf-8');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to persist outcome to disk', {
        error: msg,
        path: this.filePath,
      });
    }
  }
}

// Self-register factory so getOutcomeStore() can create PersistentOutcomeStore
// without a circular top-level import.
registerPersistentOutcomeStoreFactory(() => new PersistentOutcomeStore());
