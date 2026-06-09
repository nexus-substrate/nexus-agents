/**
 * Shared append-only JSONL store primitive (#3762).
 *
 * Factors the hydrate-on-construct / append-on-write / Zod-validate-each-line
 * mechanism out of {@link PersistentOutcomeStore} so durable JSONL sinks don't
 * each fork the same fs plumbing. This is the MECHANISM only — callers supply
 * the record TYPE (a Zod schema) and a path. Corrupt lines are skipped on
 * hydrate (graceful degradation), and the file is bounded by oldest-eviction
 * rotation so it can never grow without limit (disk-fill DoS).
 *
 * NOT a parallel persistence framework: it's a thin, generic wrapper over the
 * exact append/read/rewrite calls {@link PersistentOutcomeStore} already makes.
 *
 * @module config/jsonl-store
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { z } from 'zod';

import type { ILogger } from '../core/index.js';
import { createLogger, getErrorMessage } from '../core/index.js';

/** Directory mode for created parent dirs: owner-only (rwx------). */
const DIR_MODE = 0o700;

/** Configuration for a {@link JsonlStore}. */
export interface JsonlStoreConfig<T> {
  /** Absolute path to the JSONL file. Parent dirs are created on construct. */
  readonly filePath: string;
  /** Zod schema validating each line on hydrate AND each record on append. */
  readonly schema: z.ZodType<T>;
  /**
   * Maximum records retained. Once exceeded, the oldest are evicted and the
   * file is rewritten in place. Bounds disk usage (Contrarian condition, #3762).
   */
  readonly maxRecords: number;
  /** Component name for log context. */
  readonly component?: string;
  readonly logger?: ILogger;
}

/**
 * Append-only JSONL store with hydrate-on-construct and bounded retention.
 *
 * - Construction: creates the parent dir, then hydrates from the file if it
 *   exists, Zod-validating each line and skipping corrupt/invalid ones.
 * - {@link append}: validates the record, pushes it in-memory, and either
 *   appends one line (fast path) or — if the cap is exceeded — evicts the
 *   oldest in memory and rewrites the file so it stays bounded.
 * - All fs failures are caught and logged; persistence never throws into the
 *   caller (an observability sink must not break the operation it observes).
 */
export class JsonlStore<T> {
  private readonly filePath: string;
  private readonly schema: z.ZodType<T>;
  private readonly maxRecords: number;
  private readonly logger: ILogger;
  private readonly records: T[] = [];

  constructor(config: JsonlStoreConfig<T>) {
    this.filePath = config.filePath;
    this.schema = config.schema;
    this.maxRecords = Math.max(1, config.maxRecords);
    this.logger = config.logger ?? createLogger({ component: config.component ?? 'JsonlStore' });
    this.ensureDir();
    this.hydrate();
  }

  /** Append one record durably. Validates at the boundary; never throws. */
  append(record: T): void {
    const result = this.schema.safeParse(record);
    if (!result.success) {
      this.logger.warn('Refusing to persist invalid JSONL record', {
        path: this.filePath,
        issues: result.error.issues.map((i) => i.message).join('; '),
      });
      return;
    }
    this.records.push(result.data);
    if (this.records.length > this.maxRecords) {
      // Over the cap: evict oldest in memory and rewrite the whole file so the
      // on-disk line count matches the bounded in-memory set.
      this.records.splice(0, this.records.length - this.maxRecords);
      this.rewriteFile();
      return;
    }
    this.persistLine(result.data);
  }

  /** All retained records, oldest first. */
  all(): readonly T[] {
    return this.records;
  }

  /** Number of retained records. */
  count(): number {
    return this.records.length;
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private ensureDir(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true, mode: DIR_MODE });
    } catch (error: unknown) {
      this.logger.warn('Failed to create JSONL store directory', {
        error: getErrorMessage(error),
        path: this.filePath,
      });
    }
  }

  private hydrate(): void {
    if (!existsSync(this.filePath)) {
      this.logger.debug('No JSONL file found, starting fresh', { path: this.filePath });
      return;
    }
    let loaded = 0;
    let skipped = 0;
    try {
      const content = readFileSync(this.filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim().length > 0);
      for (const line of lines) {
        try {
          const parsed: unknown = JSON.parse(line);
          const result = this.schema.safeParse(parsed);
          if (result.success) {
            this.records.push(result.data);
            loaded++;
          } else {
            skipped++;
          }
        } catch {
          skipped++;
        }
      }
    } catch (error: unknown) {
      this.logger.warn('Failed to hydrate JSONL store from disk', {
        error: getErrorMessage(error),
        path: this.filePath,
      });
      return;
    }
    // Enforce the bound on hydrate too — a file grown past the cap out-of-band
    // (e.g. an older build with a larger cap) is trimmed back on first load.
    if (this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords);
      this.rewriteFile();
    }
    this.logger.debug('Hydrated JSONL store from disk', {
      loaded,
      skipped,
      retained: this.records.length,
      path: this.filePath,
    });
  }

  private persistLine(record: T): void {
    try {
      appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf-8');
    } catch (error: unknown) {
      this.logger.warn('Failed to append JSONL record to disk', {
        error: getErrorMessage(error),
        path: this.filePath,
      });
    }
  }

  private rewriteFile(): void {
    try {
      const content = this.records.map((r) => JSON.stringify(r)).join('\n') + '\n';
      writeFileSync(this.filePath, content, 'utf-8');
    } catch (error: unknown) {
      this.logger.warn('Failed to rewrite JSONL store file', {
        error: getErrorMessage(error),
        path: this.filePath,
      });
    }
  }
}
