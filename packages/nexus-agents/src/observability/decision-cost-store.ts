/**
 * decision-cost-store — durable per-decision cost rollups.
 *
 * Source: Issue #3855 (epic #3854 child, M4).
 *
 * Persists one {@link DecisionCostRecord} per governed decision (a
 * `consensus_vote` / `pr_review` run) so the question "what did this decision
 * cost?" can be answered from recorded data later — feeding Epic G's
 * weather_report / manifest cost profiles (#3856) and the governed-decision
 * cost doc (#3857).
 *
 * Mirrors the established persistence idiom: it reuses the shared
 * {@link JsonlStore} primitive ({@link module:config/jsonl-store}, #3762) rather
 * than re-forking the hydrate/append/rotate fs plumbing, and writes under the
 * shared learning dir like {@link module:orchestration/outcomes/outcome-store}.
 * Record + measure ONLY — no routing or weighting change (#3855 acceptance).
 *
 * @module observability/decision-cost-store
 */

import { z } from 'zod';

import { JsonlStore } from '../config/jsonl-store.js';
import { ensureLearningDir, getDecisionCostFile } from '../config/learning-persistence.js';
import { rollupDecisionCost } from './decision-cost.js';
import type { DecisionBillingMode, DecisionCostSummary, VoterCostInput } from './decision-cost.js';

/** Decision surface that incurred the cost — the gate type (#3854). */
export const DecisionGateSchema = z.enum(['consensus_vote', 'pr_review']);
export type DecisionGate = z.infer<typeof DecisionGateSchema>;

const VoterCostBreakdownSchema = z.object({
  role: z.string().min(1).max(64),
  model: z.string().min(1).max(120),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  // #4435 — optional: absent means the adapter reported no cache activity,
  // which is a different claim from "zero cache tokens were used".
  cachedInputTokens: z.number().int().nonnegative().optional(),
  cacheCreationInputTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative(),
  unmeasured: z.boolean(),
});

const ModelCostBreakdownSchema = z.object({
  model: z.string().min(1).max(120),
  voterCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
});

const DecisionCostSummarySchema = z.object({
  billingMode: z.enum(['plan', 'api']),
  voterCount: z.number().int().nonnegative(),
  measuredVoters: z.number().int().nonnegative(),
  unmeasuredVoters: z.number().int().nonnegative(),
  totalInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  perVoter: z.array(VoterCostBreakdownSchema).readonly(),
  perModel: z.array(ModelCostBreakdownSchema).readonly(),
});

/** One persisted per-decision cost rollup. */
export const DecisionCostRecordSchema = z.object({
  /** Stable id for the decision (correlation id / jobId / minted decision id). */
  decisionId: z.string().min(1).max(160),
  /** Which gate type incurred the cost. */
  gate: DecisionGateSchema,
  /** ISO 8601 timestamp the rollup was recorded. */
  timestamp: z.string().min(1).max(40),
  /** The rolled-up cost summary. */
  summary: DecisionCostSummarySchema,
});
export type DecisionCostRecord = z.infer<typeof DecisionCostRecordSchema>;

/** Bounded retention — keep the most recent N decision rollups. */
const MAX_DECISION_COST_RECORDS = 5000;

export interface DecisionCostStoreConfig {
  /** Override the JSONL file path (defaults to the shared learning dir). */
  readonly filePath?: string;
  /** Override the data directory used for `ensureLearningDir` (testing). */
  readonly dataDir?: string;
  /** Override retention cap. */
  readonly maxRecords?: number;
}

export interface RecordDecisionCostInput {
  readonly decisionId: string;
  readonly gate: DecisionGate;
  readonly voters: readonly VoterCostInput[];
  readonly billingMode: DecisionBillingMode;
  /** ISO timestamp; the caller supplies the clock (keeps the store deterministic). */
  readonly timestamp: string;
}

/**
 * Append-only, JSONL-backed store of per-decision cost rollups, built on the
 * shared {@link JsonlStore} primitive.
 *
 * `record` rolls the per-voter inputs up (via the pure {@link rollupDecisionCost})
 * and persists the resulting summary; `query` filters the in-memory window;
 * `report` re-derives the cross-decision rollup the caller asks for.
 */
export class DecisionCostStore {
  private readonly store: JsonlStore<DecisionCostRecord>;

  constructor(config?: DecisionCostStoreConfig) {
    ensureLearningDir(config?.dataDir);
    this.store = new JsonlStore<DecisionCostRecord>({
      filePath: config?.filePath ?? getDecisionCostFile(),
      schema: DecisionCostRecordSchema,
      maxRecords: config?.maxRecords ?? MAX_DECISION_COST_RECORDS,
      component: 'DecisionCostStore',
    });
  }

  get size(): number {
    return this.store.count();
  }

  /**
   * Roll up one decision's per-voter costs and persist the summary. Returns the
   * persisted record so the caller can attach `record.summary` to the existing
   * decision response (riding the existing surface — no new MCP tool, #3855).
   *
   * The boolean `persisted` flag (#3910) tells the caller whether the rollup was
   * durably written: the underlying {@link JsonlStore} never throws on an fs/
   * validation failure (an observability sink must not break the decision), so
   * `false` is the ONLY signal that billing data was dropped — the recording
   * bridge logs + counts it rather than letting it vanish silently.
   */
  record(input: RecordDecisionCostInput): { record: DecisionCostRecord; persisted: boolean } {
    const summary = rollupDecisionCost(input.voters, input.billingMode);
    const record: DecisionCostRecord = {
      decisionId: input.decisionId,
      gate: input.gate,
      timestamp: input.timestamp,
      summary,
    };
    const persisted = this.store.append(record);
    return { record, persisted };
  }

  /** All retained records, oldest first. */
  all(): readonly DecisionCostRecord[] {
    return this.store.all();
  }

  /** Filter retained records by gate and/or a since-timestamp. */
  query(filter?: { gate?: DecisionGate; since?: string }): readonly DecisionCostRecord[] {
    const records = this.store.all();
    if (filter === undefined) return records;
    return records.filter((r) => {
      if (filter.gate !== undefined && r.gate !== filter.gate) return false;
      if (filter.since !== undefined && r.timestamp < filter.since) return false;
      return true;
    });
  }
}

/** Re-export the summary type for ergonomic consumer imports. */
export type { DecisionCostSummary };
