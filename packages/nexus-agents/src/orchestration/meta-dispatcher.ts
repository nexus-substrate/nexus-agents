/**
 * nexus-agents/orchestration - MetaDispatcher
 *
 * Executes the strategy a {@link MetaDecision} selected and records the result.
 * Kept separate from the MetaOrchestrator on purpose: the orchestrator stays a
 * thin, pure selector; the dispatcher owns execution. To stay free of the MCP
 * tool dependency graph (and the init-time cycle it would create), the
 * dispatcher does NOT import the engine handlers — the caller injects a
 * per-strategy executor map. Real engine executors are wired in by the
 * outward-facing entry point (a separate, owner-approved sub-step of #3548).
 *
 * Outcomes are recorded as a dedicated {@link MetaOutcomeRecord} keyed by
 * `decisionId` rather than reusing the orchestration/learning `TaskOutcome`
 * types — both of those require CLI/model fields that a strategy-level outcome
 * (which may span many CLIs/models) cannot supply. Joining selection records
 * (#3550) with these outcome records by `decisionId` gives step 3 an
 * uncontaminated dataset.
 *
 * @module orchestration/meta-dispatcher
 * (Source: Issue #3559 — MetaOrchestrator dispatch wiring)
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import type {
  ExecutionStrategy,
  MetaDecision,
  MetaOrchestratorInput,
} from './meta-orchestrator.js';

/**
 * Executes one strategy. Receives the decision and the original input; returns
 * whatever the underlying engine produces. May throw — the dispatcher records
 * the failure and rethrows a {@link MetaDispatchError}.
 */
export type StrategyExecutor = (
  decision: MetaDecision,
  input: MetaOrchestratorInput
) => Promise<unknown>;

/** Per-strategy executor map. Strategies without an executor fail closed. */
export type StrategyExecutorMap = Partial<Record<ExecutionStrategy, StrategyExecutor>>;

/** An observability record of one strategy execution, keyed by decision id. */
export interface MetaOutcomeRecord {
  /** Matches {@link MetaDecision.decisionId}. */
  readonly decisionId: string;
  /** ISO timestamp of when the outcome was recorded. */
  readonly timestamp: string;
  /** The strategy that was executed. */
  readonly strategy: ExecutionStrategy;
  /** Whether execution succeeded. */
  readonly success: boolean;
  /** Wall-clock execution duration in milliseconds. */
  readonly durationMs: number;
  /** Failure reason when {@link success} is false. */
  readonly failureReason?: string;
}

/** A sink that receives every execution outcome. */
export interface MetaOutcomeSink {
  /** Records one outcome. Must not throw (observability is best-effort). */
  recordOutcome(record: MetaOutcomeRecord): void;
}

/** A {@link MetaOutcomeSink} that also exposes its buffered outcomes. */
export interface IRecordingMetaOutcomeSink extends MetaOutcomeSink {
  /** Returns the buffered outcomes, oldest first. */
  getOutcomes(): readonly MetaOutcomeRecord[];
}

/** Result of a successful dispatch. */
export interface DispatchResult {
  /** The decision that was dispatched. */
  readonly decisionId: string;
  /** The strategy that executed. */
  readonly strategy: ExecutionStrategy;
  /** Execution duration in milliseconds. */
  readonly durationMs: number;
  /** The raw result returned by the strategy executor. */
  readonly result: unknown;
}

/** Reason codes for a dispatch failure. */
export type MetaDispatchErrorCode = 'no_executor' | 'executor_failed';

/** Typed error thrown when dispatch fails. An outcome is always recorded first. */
export class MetaDispatchError extends Error {
  readonly code: MetaDispatchErrorCode;
  readonly strategy: ExecutionStrategy;
  readonly decisionId: string;

  constructor(
    code: MetaDispatchErrorCode,
    strategy: ExecutionStrategy,
    decisionId: string,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'MetaDispatchError';
    this.code = code;
    this.strategy = strategy;
    this.decisionId = decisionId;
  }
}

const DEFAULT_MAX_OUTCOMES = 200;

/** Creates a sink that emits each outcome as a structured audit log line. */
export function createAuditLogOutcomeSink(logger: ILogger): MetaOutcomeSink {
  return {
    recordOutcome(record: MetaOutcomeRecord): void {
      logger.info('MetaDispatcher execution outcome', { ...record });
    },
  };
}

/** Creates an in-memory recording outcome sink with a bounded buffer. */
export function createRecordingOutcomeSink(
  maxOutcomes = DEFAULT_MAX_OUTCOMES
): IRecordingMetaOutcomeSink {
  const outcomes: MetaOutcomeRecord[] = [];
  return {
    recordOutcome(record: MetaOutcomeRecord): void {
      outcomes.push(record);
      if (outcomes.length > maxOutcomes) {
        outcomes.splice(0, outcomes.length - maxOutcomes);
      }
    },
    getOutcomes(): readonly MetaOutcomeRecord[] {
      return outcomes;
    },
  };
}

/** Public interface for the MetaDispatcher. */
export interface IMetaDispatcher {
  /**
   * Executes the decision's strategy via its injected executor, recording an
   * outcome keyed by `decisionId`. Resolves with a {@link DispatchResult} on
   * success; rejects with a {@link MetaDispatchError} on failure (after the
   * failure outcome is recorded — fail closed, never silent).
   */
  dispatch(decision: MetaDecision, input: MetaOrchestratorInput): Promise<DispatchResult>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface DispatchDeps {
  readonly executors: StrategyExecutorMap;
  readonly outcomeSink: MetaOutcomeSink;
  readonly logger: ILogger;
}

/** Records one outcome to the sink, computing duration from the start timestamp. */
function recordOutcome(
  deps: DispatchDeps,
  decision: MetaDecision,
  start: number,
  success: boolean,
  failureReason?: string
): void {
  deps.outcomeSink.recordOutcome({
    decisionId: decision.decisionId,
    timestamp: new Date(getTimeProvider().now()).toISOString(),
    strategy: decision.strategy,
    success,
    durationMs: Math.max(0, getTimeProvider().now() - start),
    ...(failureReason !== undefined ? { failureReason } : {}),
  });
}

/** Executes one decision and records its outcome. See {@link IMetaDispatcher.dispatch}. */
async function dispatchDecision(
  decision: MetaDecision,
  input: MetaOrchestratorInput,
  deps: DispatchDeps
): Promise<DispatchResult> {
  const { strategy, decisionId } = decision;
  const start = getTimeProvider().now();

  const executor = deps.executors[strategy];
  if (executor === undefined) {
    const reason = `No executor registered for strategy "${strategy}"`;
    recordOutcome(deps, decision, start, false, reason);
    deps.logger.error('MetaDispatcher dispatch failed', undefined, {
      decisionId,
      strategy,
      reason,
    });
    throw new MetaDispatchError('no_executor', strategy, decisionId, reason);
  }

  try {
    const result = await executor(decision, input);
    recordOutcome(deps, decision, start, true);
    return {
      decisionId,
      strategy,
      durationMs: Math.max(0, getTimeProvider().now() - start),
      result,
    };
  } catch (err) {
    const reason = errorMessage(err);
    recordOutcome(deps, decision, start, false, reason);
    deps.logger.error(
      'MetaDispatcher strategy executor threw',
      err instanceof Error ? err : undefined,
      {
        decisionId,
        strategy,
        reason,
      }
    );
    throw new MetaDispatchError('executor_failed', strategy, decisionId, reason, { cause: err });
  }
}

/**
 * Creates a MetaDispatcher.
 *
 * @param options.executors - per-strategy executor map (injected; required).
 * @param options.outcomeSink - outcome sink (default: audit-log sink).
 * @param options.logger - optional logger.
 */
export function createMetaDispatcher(options: {
  readonly executors: StrategyExecutorMap;
  readonly outcomeSink?: MetaOutcomeSink | undefined;
  readonly logger?: ILogger | undefined;
}): IMetaDispatcher {
  const logger = options.logger ?? createLogger({ component: 'MetaDispatcher' });
  const outcomeSink = options.outcomeSink ?? createAuditLogOutcomeSink(logger);
  const deps: DispatchDeps = { executors: options.executors, outcomeSink, logger };

  return {
    dispatch(decision: MetaDecision, input: MetaOrchestratorInput): Promise<DispatchResult> {
      return dispatchDecision(decision, input, deps);
    },
  };
}
