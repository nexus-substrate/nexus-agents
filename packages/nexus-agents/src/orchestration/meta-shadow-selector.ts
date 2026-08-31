/**
 * MetaOrchestrator step 3 (#3551): shadow-logged learned strategy selection.
 *
 * A learned selector that, given the same task signals the rule-based
 * MetaOrchestrator sees, predicts the best {@link ExecutionStrategy} from
 * accumulated outcomes — run in SHADOW MODE only: its would-be choice is logged
 * alongside the rule-based choice the system actually executes. No action is
 * taken on the learned choice (acting on it is step 4 / #3552, gated behind the
 * shadow-agreement data this layer produces).
 *
 * It REUSES {@link LinUCBBandit} (arms = the ExecutionStrategy values) rather
 * than forking a second learning stack — mirroring CompositeRouter's bandit.
 *
 * Process-scoped singletons ({@link getShadowSelector} / {@link getShadowSink})
 * let the shadow layer accumulate predictions + a comparison surface across
 * `run` calls within a process. Cross-process persistence and feeding live
 * dispatch outcomes into {@link ILearnedStrategySelector.recordOutcome} are
 * tracked follow-ups (the bridge to step 4 enforcement).
 *
 * @module orchestration/meta-shadow-selector
 * (Source: Issue #3551 — MetaOrchestrator step 3)
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

import { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import { NEUTRAL_BANDIT_FEATURE, type BanditContext } from '../cli-adapters/budget-router-types.js';
import { createLogger, getErrorMessage } from '../core/index.js';
import { ensureLearningDir, getMetaOutcomesFile } from '../config/learning-persistence.js';
import type { ExecutionStrategy, MetaDecision } from './meta-orchestrator.js';

/** The strategies the learned selector chooses among — the bandit's arms. */
export const SHADOW_STRATEGY_ARMS: readonly ExecutionStrategy[] = [
  'single-shot',
  'dev-pipeline',
  'pipeline',
  'graph-workflow',
  'orchestrate',
  'consensus',
  'spec',
  'research',
];

/** Reward for a strategy that led to a successful outcome (mirrors LinUCB). */
const SUCCESS_REWARD = 0.7;
/** Reward for a strategy that led to a failed outcome (mirrors LinUCB). */
const FAILURE_REWARD = 0.1;
/** Token count that normalizes to full context utilization (1.0). */
const CONTEXT_TOKEN_NORMALIZER = 100_000;
/** Fallback strategy if the bandit returns an unrecognized arm (defensive). */
const FALLBACK_STRATEGY: ExecutionStrategy = 'pipeline';

/** One shadow comparison: the rule choice vs the would-be learned choice. */
export interface MetaShadowRecord {
  /** Matches {@link MetaDecision.decisionId} — the join key to the rule decision. */
  readonly decisionId: string;
  /** ISO timestamp of the comparison. */
  readonly timestamp: string;
  /** Strategy the system actually executed (rule-based). */
  readonly ruleStrategy: ExecutionStrategy;
  /** Strategy the learned selector WOULD have chosen (not executed). */
  readonly learnedStrategy: ExecutionStrategy;
  /** Whether the two agree. */
  readonly agree: boolean;
  /** Task class (taskType) for per-class offline policy evaluation. */
  readonly taskClass: string;
  /** UCB score the learned selector assigned its choice. */
  readonly learnedScore: number;
  /**
   * Whether the bandit had been trained when this prediction was made (#4825).
   *
   * `false` means every arm still held identical parameters, so the "learned"
   * choice was the tie-break — arm 0, `single-shot` — and carries no learning.
   * Absent means the record predates this field and was produced by that same
   * cold bandit, so it is treated as untrained.
   */
  readonly modelTrained?: boolean;
}

/** A sink that receives every shadow comparison. Must not throw. */
export interface MetaShadowSink {
  record(record: MetaShadowRecord): void;
}

/** A {@link MetaShadowSink} that also exposes its buffered records. */
export interface IRecordingMetaShadowSink extends MetaShadowSink {
  getRecords(): readonly MetaShadowRecord[];
}

/** Default cap for the in-memory recording sink, matching the decision sink. */
const DEFAULT_MAX_RECORDS = 200;

/** Creates an in-memory shadow sink with a bounded buffer (oldest evicted). */
export function createRecordingShadowSink(
  maxRecords = DEFAULT_MAX_RECORDS
): IRecordingMetaShadowSink {
  const records: MetaShadowRecord[] = [];
  return {
    record(record: MetaShadowRecord): void {
      records.push(record);
      if (records.length > maxRecords) {
        records.splice(0, records.length - maxRecords);
      }
    },
    getRecords(): readonly MetaShadowRecord[] {
      return records;
    },
  };
}

/**
 * Per-arm learning telemetry (#3593). Exposes whether the bandit is actually
 * moving: pull counts + reward mean per strategy. With a success-only signal the
 * reward means would collapse to ~SUCCESS_REWARD for every arm (learning
 * nothing); surfacing pulls + mean makes that observable.
 */
export interface ShadowArmStat {
  readonly strategy: string;
  readonly pulls: number;
  readonly rewardMean: number;
}

/** The learned selector: predict a strategy + learn from outcomes. */
export interface ILearnedStrategySelector {
  /**
   * Predict the best strategy for a decision's signals (shadow — not executed).
   *
   * `trained` is false while no arm has been pulled: the bandit then scores
   * every arm identically and `select` resolves the tie to arm 0, so the
   * returned strategy is a constant, not a prediction (#4825).
   */
  predict(decision: MetaDecision): {
    strategy: ExecutionStrategy;
    score: number;
    trained: boolean;
  };
  /** Train: record whether `strategy` succeeded for a decision's context. */
  recordOutcome(strategy: ExecutionStrategy, decision: MetaDecision, success: boolean): void;
  /** Per-arm pull counts + reward means — bandit-movement telemetry (#3593). */
  stats(): readonly ShadowArmStat[];
}

/** Clamps a value to [0, 1]; NaN → 0. */
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Maps a decision's task analysis onto the 6-feature bandit context. */
export function toBanditContext(decision: MetaDecision): BanditContext {
  const a = decision.analysis;
  const isCode =
    a.taskType === 'code_implementation' ||
    a.taskType === 'code_review' ||
    a.taskType === 'test_generation' ||
    a.taskType === 'security_review';
  return {
    taskComplexity: clamp01(a.complexityScore),
    contextLengthNormalized: clamp01(a.estimatedTokens / CONTEXT_TOKEN_NORMALIZER),
    isCodeTask: isCode ? 1 : 0,
    isReasoningTask: a.reasoningType === 'reasoning' ? clamp01(a.reasoningConfidence) : 0,
    // No budget/urgency signal is available at selection time, so both take
    // the shared neutral (#5284). These were `0`, under this same "left
    // neutral" comment — but neutral for these features is 0.5, because zero
    // reads as a claim and because `warmStart` replays at 0.5. Records written
    // at 0 also let the bandit tell shadow-selector origin from live-router
    // origin through the feature value alone: accidental signal, not none.
    budgetUtilization: NEUTRAL_BANDIT_FEATURE,
    timePressure: NEUTRAL_BANDIT_FEATURE,
  };
}

/**
 * A learned selector that also lets the persistence layer replay a stored
 * {@link BanditContext} directly (without a full MetaDecision), used by
 * {@link hydrateShadowSelector}. Kept internal to the module.
 */
interface IHydratableSelector extends ILearnedStrategySelector {
  /** Replay one persisted outcome from its raw feature context (#3593). */
  recordFromContext(strategy: ExecutionStrategy, context: BanditContext, success: boolean): void;
}

/** Creates a learned strategy selector backed by a fresh LinUCB bandit. */
export function createLearnedStrategySelector(): ILearnedStrategySelector {
  return createHydratableSelector();
}

/** Internal factory exposing the hydration hook. */
function createHydratableSelector(): IHydratableSelector {
  const bandit = new LinUCBBandit(SHADOW_STRATEGY_ARMS);
  const apply = (strategy: ExecutionStrategy, context: BanditContext, success: boolean): void => {
    const idx = SHADOW_STRATEGY_ARMS.indexOf(strategy);
    if (idx < 0) return;
    bandit.update(idx, context, success ? SUCCESS_REWARD : FAILURE_REWARD);
  };
  return {
    predict(decision: MetaDecision): {
      strategy: ExecutionStrategy;
      score: number;
      trained: boolean;
    } {
      const { armName, ucbScore } = bandit.select(toBanditContext(decision));
      const strategy = SHADOW_STRATEGY_ARMS.includes(armName as ExecutionStrategy)
        ? (armName as ExecutionStrategy)
        : FALLBACK_STRATEGY;
      const trained = bandit.getStats().some((st) => st.pullCount > 0);
      return { strategy, score: ucbScore, trained };
    },
    recordOutcome(strategy: ExecutionStrategy, decision: MetaDecision, success: boolean): void {
      apply(strategy, toBanditContext(decision), success);
    },
    recordFromContext(strategy: ExecutionStrategy, context: BanditContext, success: boolean): void {
      apply(strategy, context, success);
    },
    stats(): readonly ShadowArmStat[] {
      return bandit.getStats().map((s) => ({
        strategy: s.name,
        pulls: s.pullCount,
        rewardMean: s.avgReward,
      }));
    },
  };
}

/** Per-class agreement breakdown for offline policy evaluation. */
export interface TaskClassAgreement {
  readonly total: number;
  readonly agree: number;
  readonly rate: number;
}

/** Offline policy-evaluation summary: agreement overall + per task class. */
export interface ShadowAgreementSummary {
  readonly total: number;
  /**
   * Records whose prediction came from a trained bandit (#4825).
   *
   * `agreementRate` is taken over these only. When it is 0 the rate is 0 over
   * nothing — which is what the default configuration produces, since
   * `NEXUS_META_SHADOW_TRAIN` is off and the bandit never learns.
   */
  readonly trainedRecords: number;
  readonly agreements: number;
  readonly agreementRate: number;
  readonly perTaskClass: Readonly<Record<string, TaskClassAgreement>>;
}

/**
 * Summarizes how often the learned (shadow) choice matched the executed
 * rule-based choice, overall and per task class — the comparison surface for
 * offline policy evaluation before step 4 acts on the learned choice.
 */
export function summarizeShadowAgreement(
  records: readonly MetaShadowRecord[]
): ShadowAgreementSummary {
  const perTaskClass: Record<string, { total: number; agree: number; rate: number }> = {};
  let agreements = 0;
  // Only a trained bandit produces a comparison. An untrained one returns its
  // tie-break arm every time, so counting those would report the rules'
  // preference for that strategy as a learned agreement rate (#4825).
  const trained = records.filter((r) => r.modelTrained === true);
  for (const r of trained) {
    if (r.agree) agreements++;
    const cur = perTaskClass[r.taskClass] ?? { total: 0, agree: 0, rate: 0 };
    cur.total++;
    if (r.agree) cur.agree++;
    cur.rate = cur.agree / cur.total;
    perTaskClass[r.taskClass] = cur;
  }
  return {
    total: records.length,
    trainedRecords: trained.length,
    agreements,
    agreementRate: trained.length === 0 ? 0 : agreements / trained.length,
    perTaskClass,
  };
}

// ============================================================================
// Cross-process persistence (#3593)
// ============================================================================

/**
 * Schema version for persisted meta-outcome lines. Bump on any breaking change
 * to the on-disk shape so old/new lines can be told apart and filtered.
 */
export const META_OUTCOME_SCHEMA_VERSION = 1;

/** Lookback window for replaying persisted outcomes on hydration. */
const HYDRATE_LOOKBACK_DAYS = 30;
const HYDRATE_LOOKBACK_MS = HYDRATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

/**
 * The bandit-feature context, validated at the persistence boundary. SECURITY
 * INVARIANT (#3593): a persisted line carries ONLY these numeric features +
 * strategy + success — never raw task text, prompts, or paths.
 */
const PersistedContextSchema = z.object({
  taskComplexity: z.number(),
  contextLengthNormalized: z.number(),
  isCodeTask: z.number(),
  isReasoningTask: z.number(),
  budgetUtilization: z.number(),
  timePressure: z.number(),
});

/** One persisted training outcome — feature values only, no free text. */
const PersistedMetaOutcomeSchema = z.object({
  schema: z.literal(META_OUTCOME_SCHEMA_VERSION),
  timestamp: z.string(),
  strategy: z.enum(SHADOW_STRATEGY_ARMS as unknown as [string, ...string[]]),
  success: z.boolean(),
  context: PersistedContextSchema,
});

type PersistedMetaOutcome = z.infer<typeof PersistedMetaOutcomeSchema>;

const persistLogger = createLogger({ component: 'MetaShadowSelector' });

/**
 * Append one training outcome to the meta-outcomes JSONL file (#3593). Writes
 * ONLY the sanitized bandit-feature context ({@link toBanditContext}) — the raw
 * MetaDecision (goal/reasoning/analysis text) is NEVER serialized. Best-effort:
 * a write failure is logged, not thrown (matches the outcome-store pattern).
 */
export function persistMetaOutcome(
  strategy: ExecutionStrategy,
  decision: MetaDecision,
  success: boolean
): void {
  const record: PersistedMetaOutcome = {
    schema: META_OUTCOME_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    strategy,
    success,
    context: toBanditContext(decision),
  };
  try {
    ensureLearningDir();
    appendFileSync(getMetaOutcomesFile(), JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    persistLogger.warn('Failed to persist meta-outcome (ignored)', {
      error: getErrorMessage(err),
    });
  }
}

/**
 * Replay persisted outcomes into a selector on construction (#3593). Mirrors the
 * warmStart/PersistentOutcomeStore pattern: corrupt lines are skipped (never
 * throw), and only records within the {@link HYDRATE_LOOKBACK_DAYS} window are
 * replayed. Returns the number of outcomes replayed.
 */
export function hydrateShadowSelector(selector: ILearnedStrategySelector): number {
  const hydratable = selector as IHydratableSelector;
  if (typeof hydratable.recordFromContext !== 'function') return 0;

  const file = getMetaOutcomesFile();
  if (!existsSync(file)) return 0;

  let replayed = 0;
  try {
    const cutoff = Date.now() - HYDRATE_LOOKBACK_MS;
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
      const result = PersistedMetaOutcomeSchema.safeParse(parsed);
      if (!result.success) continue;
      const ts = Date.parse(result.data.timestamp);
      if (Number.isNaN(ts) || ts < cutoff) continue;
      hydratable.recordFromContext(
        result.data.strategy as ExecutionStrategy,
        result.data.context,
        result.data.success
      );
      replayed++;
    }
  } catch (err) {
    persistLogger.warn('Failed to hydrate shadow selector from disk (ignored)', {
      error: getErrorMessage(err),
    });
  }
  return replayed;
}

let singletonSelector: ILearnedStrategySelector | undefined;
let singletonSink: IRecordingMetaShadowSink | undefined;

/**
 * Process-scoped learned selector — accumulates across `run` calls. Hydrates
 * once from persisted outcomes on first construction (#3593) so shadow
 * agreement reflects accumulated learning, not a cold start.
 */
export function getShadowSelector(): ILearnedStrategySelector {
  if (singletonSelector === undefined) {
    singletonSelector = createLearnedStrategySelector();
    const replayed = hydrateShadowSelector(singletonSelector);
    if (replayed > 0) {
      persistLogger.info('Hydrated shadow selector from persisted outcomes', { replayed });
    }
  }
  return singletonSelector;
}

/** Process-scoped shadow sink — the queryable comparison surface. */
export function getShadowSink(): IRecordingMetaShadowSink {
  singletonSink ??= createRecordingShadowSink();
  return singletonSink;
}
