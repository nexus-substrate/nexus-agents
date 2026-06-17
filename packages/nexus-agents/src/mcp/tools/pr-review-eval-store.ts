/**
 * JSONL-backed store for per-voter pr_review eval verdicts (#3848).
 *
 * Mirrors the {@link PersistentOutcomeStore} idiom (Issue #1009): an in-memory
 * append-only list backed by an append-only JSONL file under the shared
 * learning dir. Hydrates (Zod-validating each line, skipping corruption) on
 * construction; appends one line per write. The persisted unit is the
 * rubric-scored {@link VoterEvalVerdict} — TP/FP/FN tallies only, never raw
 * diffs or model outputs.
 *
 * This is the persistence target for #3848: per-voter precision/recall queryable
 * over time, the evidence an Epic D / ADR-0017 voter demotion would cite. Record
 * + measure ONLY — no live routing or weighting change.
 *
 * @module mcp/tools/pr-review-eval-store
 * (Source: #3848 — per-voter precision/recall in the outcome store)
 */

// @export-no-consumer-yet — see #3848. This is the persistence + report surface
// (the data plumbing). The live recording hookup — populating it from an actual
// pr_review eval run — is a separate, gated activity (#3849 / Epic D ADR-0017);
// acting on the metrics (voter demotion) is explicitly out of scope here.

import { appendFileSync, readFileSync, existsSync } from 'node:fs';

import type { ILogger } from '../../core/index.js';
import { createLogger, getErrorMessage } from '../../core/index.js';
import { ensureLearningDir, getPrReviewEvalFile } from '../../config/learning-persistence.js';
import { VoterEvalVerdictSchema, VoterEvalVerdictQuerySchema } from './pr-review-eval-types.js';
import type { VoterEvalVerdict, VoterEvalVerdictQuery } from './pr-review-eval-types.js';
import { computePerVoterPrecisionRecall } from './pr-review-eval-scoring.js';
import type { PerVoterPrecisionRecallReport } from './pr-review-eval-types.js';

export interface PrReviewEvalStoreConfig {
  /** Override the JSONL file path (defaults to the shared learning dir). */
  readonly filePath?: string;
  /** Override the data directory used for `ensureLearningDir` (testing). */
  readonly dataDir?: string;
}

/**
 * Append-only, JSONL-backed store of per-voter eval verdicts.
 *
 * Construction hydrates from disk (corrupt/invalid lines skipped with a debug
 * log). `append` writes through to disk. `query` filters the in-memory list;
 * `reportPrecisionRecall` is the report surface — it folds the queried window
 * through the pure {@link computePerVoterPrecisionRecall}.
 */
export class PrReviewEvalStore {
  private readonly verdicts: VoterEvalVerdict[] = [];
  private readonly filePath: string;
  private readonly logger: ILogger;

  constructor(config?: PrReviewEvalStoreConfig, logger?: ILogger) {
    this.filePath = config?.filePath ?? getPrReviewEvalFile();
    this.logger = logger ?? createLogger({ component: 'PrReviewEvalStore' });
    ensureLearningDir(config?.dataDir);
    this.hydrate();
  }

  get size(): number {
    return this.verdicts.length;
  }

  /** Record one scored verdict and persist it as a JSONL line. */
  append(verdict: VoterEvalVerdict): void {
    const parsed = VoterEvalVerdictSchema.parse(verdict);
    this.verdicts.push(parsed);
    this.persistLine(parsed);
  }

  /** Filter the in-memory verdicts. Returns most-recent-first when `limit` set. */
  query(filter?: VoterEvalVerdictQuery): readonly VoterEvalVerdict[] {
    const f = filter === undefined ? {} : VoterEvalVerdictQuerySchema.parse(filter);
    const preds: Array<(v: VoterEvalVerdict) => boolean> = [];
    if (f.role !== undefined) preds.push((v) => v.role === f.role);
    if (f.runId !== undefined) preds.push((v) => v.runId === f.runId);
    if (f.caseClass !== undefined) preds.push((v) => v.caseClass === f.caseClass);
    if (f.rubricVersion !== undefined) preds.push((v) => v.rubricVersion === f.rubricVersion);
    if (f.since !== undefined) {
      const since = f.since;
      preds.push((v) => v.timestamp >= since);
    }

    const matched = this.verdicts.filter((v) => preds.every((p) => p(v)));
    if (f.limit !== undefined && matched.length > f.limit) {
      return matched.slice(matched.length - f.limit);
    }
    return matched;
  }

  /**
   * The report surface (#3848): per-voter + aggregate precision/recall over the
   * window selected by `filter` (defaults to all recorded verdicts).
   */
  reportPrecisionRecall(filter?: VoterEvalVerdictQuery): PerVoterPrecisionRecallReport {
    return computePerVoterPrecisionRecall(this.query(filter));
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private hydrate(): void {
    if (!existsSync(this.filePath)) {
      this.logger.debug('No pr_review eval file found, starting fresh', { path: this.filePath });
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
          const result = VoterEvalVerdictSchema.safeParse(parsed);
          if (result.success) {
            this.verdicts.push(result.data);
            loaded++;
          } else {
            skipped++;
          }
        } catch (parseErr: unknown) {
          this.logger.debug('Skipping malformed pr_review eval line during hydration', {
            error: getErrorMessage(parseErr),
            linePreview: line.slice(0, 80),
          });
          skipped++;
        }
      }
      this.logger.info('Hydrated pr_review eval verdicts from disk', {
        loaded,
        skipped,
        total: lines.length,
        path: this.filePath,
      });
    } catch (error: unknown) {
      this.logger.warn('Failed to hydrate pr_review eval verdicts from disk', {
        error: getErrorMessage(error),
        path: this.filePath,
      });
    }
  }

  private persistLine(verdict: VoterEvalVerdict): void {
    try {
      appendFileSync(this.filePath, JSON.stringify(verdict) + '\n', 'utf-8');
    } catch (error: unknown) {
      this.logger.warn('Failed to persist pr_review eval verdict to disk', {
        error: getErrorMessage(error),
        path: this.filePath,
      });
    }
  }
}
