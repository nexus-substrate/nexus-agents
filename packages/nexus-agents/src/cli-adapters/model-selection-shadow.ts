/**
 * Shadow-mode recording for route-time tier model selection (#4197, epic #4175).
 *
 * `NEXUS_ROUTE_MODEL_SELECTION` (#3394) lets the CompositeRouter resolve a
 * concrete model from the difficulty tier, but it is default OFF with no
 * evidence it should flip. Following the #3552 shadow-eval precedent (and the
 * #3593 `NEXUS_META_SHADOW_TRAIN` persistence pattern this module MIRRORS),
 * this layer records — per routed decision that later receives an outcome —
 * the model the tier resolver WOULD have picked next to the model actually
 * used, so `evaluateModelSelectionReadiness` can judge the flip offline on a
 * pre-declared win metric. SHADOW ONLY: nothing here alters routing, and every
 * entry point is exception-guarded (a shadow failure increments a counter and
 * is logged, never thrown into the routing hot path).
 *
 * STORAGE — a DEDICATED JSONL log (`learning/model-selection-shadow.jsonl`,
 * mirroring `meta-outcomes.jsonl`), NOT extra OutcomeStore fields. The
 * OutcomeStore is already replayed by BOTH the weather report and LinUCB
 * warm-start (the pre-existing double-counting boundary the #4194 vote
 * excluded); a dedicated log keeps the shadow eval's volume + delta counts
 * single-sourced and unaffected by that replay.
 *
 * SECURITY INVARIANT (mirrors #3593): a persisted line carries ONLY the CLI
 * slot, tier, model ids, agreement, success, and (where measured) costUsd —
 * never task content, prompts, or model outputs.
 *
 * Gated behind `NEXUS_ROUTE_MODEL_SHADOW=1` (default OFF) AND learning
 * persistence being enabled, exactly like `isShadowTrainEnabled` (#3593).
 *
 * @module cli-adapters/model-selection-shadow
 * (Source: Issue #4197 — shadow-mode eval for NEXUS_ROUTE_MODEL_SELECTION)
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

import { createLogger, getErrorMessage } from '../core/index.js';
import {
  ensureLearningDir,
  getModelSelectionShadowFile,
  isPersistenceEnabled,
} from '../config/learning-persistence.js';
import { getDefaultModelForCli } from '../config/model-config-helpers.js';
import { resolveModelForTier } from './resolve-model-for-tier.js';

import type { ModelTier } from './zero-router-types.js';
import type { CliNameLiteral } from '../config/model-capabilities-types.js';

/**
 * Whether shadow recording of route-time model selection is enabled (#4197).
 * Default OFF; requires learning persistence (mirrors `isShadowTrainEnabled`).
 */
export function isRouteModelShadowEnabled(): boolean {
  return process.env['NEXUS_ROUTE_MODEL_SHADOW'] === '1' && isPersistenceEnabled();
}

/**
 * Schema version for persisted shadow lines. Bump on any breaking change to
 * the on-disk shape so old/new lines can be told apart and filtered.
 */
export const MODEL_SELECTION_SHADOW_SCHEMA_VERSION = 1;

/** Lookback window when reading persisted shadow records (mirrors #3593). */
const READ_LOOKBACK_DAYS = 30;
const READ_LOOKBACK_MS = READ_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

const ModelTierSchema = z.enum(['fast', 'balanced', 'powerful']);

/**
 * One persisted shadow comparison, validated at the persistence boundary.
 * Sanitized by construction — no free-text fields beyond bounded model ids.
 */
export const ModelSelectionShadowRecordSchema = z.object({
  schema: z.literal(MODEL_SELECTION_SHADOW_SCHEMA_VERSION),
  /** ISO timestamp of the outcome join. */
  timestamp: z.string().min(1),
  /** Display slot of the routed CLI (api:* arms collapse to their slot). */
  cli: z.string().min(1).max(40),
  /** Difficulty tier the ZeroRouter computed for the task. */
  tier: ModelTierSchema,
  /** Model the live decision actually used (or the CLI default when route-time selection is off). */
  actualModel: z.string().min(1).max(120),
  /** Model `resolveModelForTier` WOULD have picked (never executed). */
  shadowModel: z.string().min(1).max(120),
  /** Whether shadow and actual agree. */
  agree: z.boolean(),
  /** Whether the actually-executed decision succeeded. */
  success: z.boolean(),
  /** Measured cost of the actual execution, when available (unmeasured today on the routing path). */
  costUsd: z.number().nonnegative().optional(),
});

/** One shadow comparison joined with its outcome. */
export type ModelSelectionShadowRecord = z.infer<typeof ModelSelectionShadowRecordSchema>;

/** The decision-time half of a shadow comparison (before the outcome join). */
export interface ModelSelectionShadowComparison {
  readonly cli: CliNameLiteral;
  readonly tier: ModelTier;
  readonly actualModel: string;
  readonly shadowModel: string;
  readonly agree: boolean;
}

/**
 * Compute the shadow comparison for a routed decision. Pure registry reads —
 * safe on the routing hot path (`resolveModelForTier` is registry-only).
 *
 * `actualModel` is the model the live decision carries when route-time
 * selection is enabled; when absent (the default-OFF production reality) the
 * adapter resolves `getDefaultModelForCli` late, so that default IS the actual
 * model the comparison must use.
 *
 * CALLER CONTRACT (#4218 review): do NOT sample tasks with a pinned
 * `CliTask.model` — the adapter executes the pinned model, not the default
 * assumed here, so the comparison would attribute a model that never ran and
 * mislabel the agree/diverge cohorts.
 */
export function computeModelSelectionShadow(
  cli: CliNameLiteral,
  tier: ModelTier,
  actualModel?: string
): ModelSelectionShadowComparison {
  const shadowModel = resolveModelForTier(cli, tier);
  const actual = actualModel ?? getDefaultModelForCli(cli);
  return { cli, tier, actualModel: actual, shadowModel, agree: shadowModel === actual };
}

// ============================================================================
// Failure counter (#4197 constraint: try/catch + counter, never break routing)
// ============================================================================

let shadowFailureCount = 0;

/** Increment and return the shadow-failure counter. */
export function recordModelSelectionShadowFailure(): number {
  return ++shadowFailureCount;
}

/** Total shadow failures this process (compute or persist). Observability only. */
export function getModelSelectionShadowFailureCount(): number {
  return shadowFailureCount;
}

/** Reset the failure counter. For tests. */
export function resetModelSelectionShadowFailureCount(): void {
  shadowFailureCount = 0;
}

// ============================================================================
// Persistence (mirrors persistMetaOutcome / hydrateShadowSelector, #3593)
// ============================================================================

const persistLogger = createLogger({ component: 'ModelSelectionShadow' });

/**
 * Append one outcome-joined shadow record to the dedicated JSONL log.
 * Best-effort: a write failure is logged + counted, never thrown (the caller
 * is the routing outcome path and must not break).
 */
export function persistModelSelectionShadowRecord(record: ModelSelectionShadowRecord): void {
  try {
    ensureLearningDir();
    appendFileSync(getModelSelectionShadowFile(), JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    recordModelSelectionShadowFailure();
    persistLogger.warn('Failed to persist model-selection shadow record (ignored)', {
      error: getErrorMessage(err),
    });
  }
}

/**
 * Read persisted shadow records for offline evaluation. Mirrors the #3593
 * hydrate pattern: corrupt/invalid lines are skipped (never throw) and only
 * records within the {@link READ_LOOKBACK_DAYS} window are returned.
 */
export function readModelSelectionShadowRecords(): ModelSelectionShadowRecord[] {
  const file = getModelSelectionShadowFile();
  if (!existsSync(file)) return [];

  const records: ModelSelectionShadowRecord[] = [];
  try {
    const cutoff = Date.now() - READ_LOOKBACK_MS;
    const lines = readFileSync(file, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue; // corrupt line — skip
      }
      const result = ModelSelectionShadowRecordSchema.safeParse(parsed);
      if (!result.success) continue;
      const ts = Date.parse(result.data.timestamp);
      if (Number.isNaN(ts) || ts < cutoff) continue;
      records.push(result.data);
    }
  } catch (err) {
    persistLogger.warn('Failed to read model-selection shadow records (ignored)', {
      error: getErrorMessage(err),
    });
  }
  return records;
}
