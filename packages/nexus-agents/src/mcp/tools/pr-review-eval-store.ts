/**
 * JSONL-backed store for per-voter pr_review eval verdicts (#3848).
 *
 * An append-only list of rubric-scored {@link VoterEvalVerdict} records backed
 * by an append-only JSONL file under the shared learning dir. The persisted
 * unit is TP/FP/FN tallies only — never raw diffs or model outputs.
 *
 * ## Persistence idiom (#3906)
 *
 * Persistence is delegated wholesale to the shared {@link JsonlStore} primitive
 * (`config/jsonl-store`, #3762) rather than hand-rolling the
 * hydrate-on-construct / append-on-write / Zod-validate-each-line / corrupt-
 * line-skip / rotation machinery — the same alignment the sibling
 * tool-fitness ledger (#3851) follows. This module owns ONLY the eval schema,
 * the query filtering, and the report surface; all file I/O is JsonlStore's.
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

import { JsonlStore } from '../../config/jsonl-store.js';
import { ensureLearningDir, getPrReviewEvalFile } from '../../config/learning-persistence.js';
import type { ILogger } from '../../core/index.js';
import { computePerVoterPrecisionRecall } from './pr-review-eval-scoring.js';
import { VoterEvalVerdictSchema, VoterEvalVerdictQuerySchema } from './pr-review-eval-types.js';
import type { VoterEvalVerdict, VoterEvalVerdictQuery } from './pr-review-eval-types.js';
import type { PerVoterPrecisionRecallReport } from './pr-review-eval-types.js';

/**
 * Default retained-verdict cap. Bounds disk + hydrate cost of the underlying
 * JSONL file via JsonlStore's oldest-eviction rotation (the #3762 size-cap
 * concern). Tunable per-instance via {@link PrReviewEvalStoreConfig.maxRecords}.
 */
const DEFAULT_MAX_RECORDS = 100_000;

export interface PrReviewEvalStoreConfig {
  /** Override the JSONL file path (defaults to the shared learning dir). */
  readonly filePath?: string;
  /** Override the data directory used for `ensureLearningDir` (testing). */
  readonly dataDir?: string;
  /** Max retained verdicts before oldest-eviction. Defaults to {@link DEFAULT_MAX_RECORDS}. */
  readonly maxRecords?: number;
}

/**
 * Append-only, JSONL-backed store of per-voter eval verdicts.
 *
 * Construction hydrates from disk (corrupt/invalid lines skipped). `append`
 * writes through to disk. `query` filters the in-memory list;
 * `reportPrecisionRecall` is the report surface — it folds the queried window
 * through the pure {@link computePerVoterPrecisionRecall}. All persistence is
 * delegated to {@link JsonlStore} (#3906).
 */
export class PrReviewEvalStore {
  private readonly store: JsonlStore<VoterEvalVerdict>;

  constructor(config?: PrReviewEvalStoreConfig, logger?: ILogger) {
    ensureLearningDir(config?.dataDir);
    this.store = new JsonlStore<VoterEvalVerdict>({
      filePath: config?.filePath ?? getPrReviewEvalFile(),
      schema: VoterEvalVerdictSchema,
      maxRecords: config?.maxRecords ?? DEFAULT_MAX_RECORDS,
      component: 'PrReviewEvalStore',
      ...(logger !== undefined ? { logger } : {}),
    });
  }

  get size(): number {
    return this.store.count();
  }

  /** Record one scored verdict and persist it as a JSONL line. */
  append(verdict: VoterEvalVerdict): void {
    const parsed = VoterEvalVerdictSchema.parse(verdict);
    this.store.append(parsed);
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

    const matched = this.store.all().filter((v) => preds.every((p) => p(v)));
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
}
