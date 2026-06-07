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

import { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import type { BanditContext } from '../cli-adapters/budget-router-types.js';
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

/** The learned selector: predict a strategy + learn from outcomes. */
export interface ILearnedStrategySelector {
  /** Predict the best strategy for a decision's signals (shadow — not executed). */
  predict(decision: MetaDecision): { strategy: ExecutionStrategy; score: number };
  /** Train: record whether `strategy` succeeded for a decision's context. */
  recordOutcome(strategy: ExecutionStrategy, decision: MetaDecision, success: boolean): void;
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
    // No budget/urgency signal is available at selection time; left neutral.
    budgetUtilization: 0,
    timePressure: 0,
  };
}

/** Creates a learned strategy selector backed by a fresh LinUCB bandit. */
export function createLearnedStrategySelector(): ILearnedStrategySelector {
  const bandit = new LinUCBBandit(SHADOW_STRATEGY_ARMS);
  return {
    predict(decision: MetaDecision): { strategy: ExecutionStrategy; score: number } {
      const { armName, ucbScore } = bandit.select(toBanditContext(decision));
      const strategy = SHADOW_STRATEGY_ARMS.includes(armName as ExecutionStrategy)
        ? (armName as ExecutionStrategy)
        : FALLBACK_STRATEGY;
      return { strategy, score: ucbScore };
    },
    recordOutcome(strategy: ExecutionStrategy, decision: MetaDecision, success: boolean): void {
      const idx = SHADOW_STRATEGY_ARMS.indexOf(strategy);
      if (idx < 0) return;
      bandit.update(idx, toBanditContext(decision), success ? SUCCESS_REWARD : FAILURE_REWARD);
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
  for (const r of records) {
    if (r.agree) agreements++;
    const cur = perTaskClass[r.taskClass] ?? { total: 0, agree: 0, rate: 0 };
    cur.total++;
    if (r.agree) cur.agree++;
    cur.rate = cur.agree / cur.total;
    perTaskClass[r.taskClass] = cur;
  }
  const total = records.length;
  return {
    total,
    agreements,
    agreementRate: total === 0 ? 0 : agreements / total,
    perTaskClass,
  };
}

let singletonSelector: ILearnedStrategySelector | undefined;
let singletonSink: IRecordingMetaShadowSink | undefined;

/** Process-scoped learned selector — accumulates across `run` calls. */
export function getShadowSelector(): ILearnedStrategySelector {
  singletonSelector ??= createLearnedStrategySelector();
  return singletonSelector;
}

/** Process-scoped shadow sink — the queryable comparison surface. */
export function getShadowSink(): IRecordingMetaShadowSink {
  singletonSink ??= createRecordingShadowSink();
  return singletonSink;
}
