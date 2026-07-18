/**
 * nexus-agents/agents/experts - Expert Execution Recovery (#4286)
 *
 * Wires the resilience {@link FailureDetector} + {@link RecoveryManager} into an
 * opt-in expert-execution recovery policy. {@link RecoverableExpert} overrides
 * `execute()` to wrap the base run in the canonical `withRetry` primitive
 * (adapters/retry.ts) with a transient-vs-permanent classification predicate:
 *
 *  1. caller cancellation (`options.signal` aborted)     → PERMANENT
 *  2. transport-retryable (429/408/5xx/network/NexusError) → TRANSIENT
 *  3. behavioral archetype (arxiv:2512.07497)            → per-strategy action
 *  4. otherwise                                          → PERMANENT (fail closed)
 *
 * PRIMARY shipped behavior is transport retry (step 2): the common recoverable
 * case is a transient 429/5xx/network blip. The archetype path (step 3) is a
 * SECONDARY guidance channel that only fires when the error cause-chain TEXT
 * carries ≥2 independent indicator families (see
 * {@link EXPERT_ERROR_TEXT_CONFIDENCE_THRESHOLD}); a lone one-family signal
 * (e.g. a 401 "Invalid API key") stays permanent and fails closed.
 *
 * The retry loop, backoff, and jitter are NOT reimplemented here — they are the
 * shared `withRetry`/`isRetryableError` primitives (adapters/retry.ts:9-19
 * forbids a third retry loop). Delay/attempt knobs default to
 * `DEFAULT_RETRY_CONFIG` (derived from config/defaults.ts RETRY_DEFAULTS).
 */

import type {
  Result,
  Task,
  TaskResult,
  TaskHistoryItem,
  Message,
  ILogger,
} from '../../core/index.js';
import {
  ok,
  err,
  AgentError,
  getErrorMessage,
  getTimeProvider,
  createLogger,
} from '../../core/index.js';
import type { BaseAgentOptions } from '../base-agent.js';
import {
  withRetry,
  isRetryableError,
  DEFAULT_RETRY_CONFIG,
  RetryExhaustedError,
  type RetryConfig,
  type RetryAttemptInfo,
} from '../../adapters/index.js';
import {
  FailureDetector,
  RecoveryManager,
  DEFAULT_RECOVERY_STRATEGIES,
  type DetectorConfig,
  type FailureArchetype,
  type DetectedFailure,
  type RecoveryAction,
} from '../resilience/index.js';
import { Expert } from './expert-agent.js';
import type { ExpertConfig } from './expert-config.js';

/**
 * Confidence threshold for THIS consumer's detector instance. `classifyExpertFailure`
 * feeds the detector error-text only (no full transcript, no toolCalls), so each
 * indicator family can contribute at most one regex hit: error-text-only input
 * yields at most one family per regex hit; 0.4 = "two independent indicator
 * families", the MINIMUM a genuine two-family match produces (a single family
 * tops out at 0.25, so 0.4 excludes every one-family signal). 0.6 (the detector
 * default) is still reachable from error text when all three families of one
 * archetype match; it is not the ceiling. Not applied to the global
 * DEFAULT_DETECTOR_CONFIG — that default is correct for the detector's designed
 * full-transcript + toolCalls input.
 */
const EXPERT_ERROR_TEXT_CONFIDENCE_THRESHOLD = 0.4;

/**
 * Default retries for a recovery policy that omits `maxRetries` (attempts =
 * maxRetries + 1 = 2). Conservative: transport blips clear on a single retry;
 * unbounded retries on a permanent-looking failure waste model calls.
 */
const EXPERT_RECOVERY_DEFAULT_MAX_RETRIES = 1;

/** Depth guard for cause-chain walks, complementing the seen-set cycle guard. */
const MAX_CAUSE_DEPTH = 10;

/**
 * Opt-in recovery policy attached to an expert at creation time. All fields are
 * optional and fall through to {@link DEFAULT_RETRY_CONFIG} (retry knobs) and
 * this module's detector defaults.
 */
export interface ExpertRecoveryPolicy {
  /**
   * Maximum retries (attempts = maxRetries + 1). Default:
   * {@link EXPERT_RECOVERY_DEFAULT_MAX_RETRIES} (1 → 2 attempts), NOT
   * DEFAULT_RETRY_CONFIG.maxRetries (3).
   */
  maxRetries?: number;
  /** Base backoff delay (ms). Default: DEFAULT_RETRY_CONFIG. */
  baseDelayMs?: number;
  /** Maximum backoff delay (ms). Default: DEFAULT_RETRY_CONFIG. */
  maxDelayMs?: number;
  /** Jitter factor (0-1). Default: DEFAULT_RETRY_CONFIG. */
  jitterFactor?: number;
  /** Override the failure detector configuration. */
  detectorConfig?: Partial<DetectorConfig>;
}

/**
 * The outcome of classifying a single failed execution attempt.
 * - `transient`: retry (transport error, or a recoverable behavioral archetype)
 * - `permanent`: fail closed (cancelled, non-retryable, or a terminal archetype)
 */
export type FailureClassification = {
  kind: 'transient' | 'permanent';
  source: 'transport' | 'archetype' | 'default';
  archetype?: FailureArchetype;
  confidence?: number;
};

/** Archetype recovery actions that warrant a retry (vs. terminate). */
const RECOVERABLE_ACTIONS: ReadonlySet<RecoveryAction> = new Set<RecoveryAction>([
  'retry_with_inspection',
  'tool_validation',
  'context_reset',
]);

/**
 * Walks an error's `cause` chain, returning true if any link is a transport-
 * retryable error. `execute()` wraps the underlying transport error as the
 * `cause` of an AgentError, so the top-level error alone is not enough.
 */
function isRetryableErrorChain(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  for (
    let depth = 0;
    current !== null && current !== undefined && depth < MAX_CAUSE_DEPTH;
    depth++
  ) {
    if (seen.has(current)) break;
    seen.add(current);
    if (isRetryableError(current)) return true;
    current = current instanceof Error ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

/**
 * Collects the messages from an error and its `cause` chain so the behavioral
 * detector sees the underlying failure text (not just the AgentError wrapper).
 */
function extractErrorMessage(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  for (
    let depth = 0;
    current !== null && current !== undefined && depth < MAX_CAUSE_DEPTH;
    depth++
  ) {
    if (seen.has(current)) break;
    seen.add(current);
    parts.push(getErrorMessage(current));
    current = current instanceof Error ? (current as { cause?: unknown }).cause : undefined;
  }
  return parts.join(' :: ');
}

/** Selects the highest-confidence detected failure. */
function highestConfidenceFailure(
  failures: readonly DetectedFailure[]
): DetectedFailure | undefined {
  return failures.reduce<DetectedFailure | undefined>((best, f) => {
    if (best === undefined || f.confidence > best.confidence) return f;
    return best;
  }, undefined);
}

/**
 * Classifies a single failed execution attempt as transient or permanent.
 *
 * See the module header for the ordered decision procedure. `signal` is checked
 * first (mandatory guard): RETRYABLE_ERROR_PATTERNS matches /aborted/i, so
 * without this a cancelled task would otherwise be retried.
 *
 * Fails CLOSED on a throwing classifier (#4303): the body reads `error.message`
 * and walks `.cause` (via getErrorMessage/extractErrorMessage/isRetryableErrorChain)
 * and calls `detector.detect`. An Error-like object with a throwing `.message` or
 * `.cause` getter would make any of those throw. `execute()` runs this INSIDE
 * `withRetry`'s isRetryable predicate and again in annotateExhausted, neither of
 * which is try-guarded by withRetry (adapters/retry.ts:339-363 catches only
 * `operation()`), so an escaping throw would reject the `Promise<Result<…>>` and
 * break the never-throws contract `execute_expert` relies on. This single outer
 * guard covers BOTH call sites: any throw during classification → permanent.
 */
export function classifyExpertFailure(
  error: unknown,
  detector: FailureDetector,
  taskDescription?: string,
  signal?: AbortSignal
): FailureClassification {
  try {
    // 1. Caller cancellation → permanent (fail closed, do not retry).
    if (signal?.aborted === true) {
      return { kind: 'permanent', source: 'default' };
    }

    // 2. Transport-retryable (429/408/5xx/ECONNRESET/…, NexusError rate-limit/
    //    timeout/unavailable codes) anywhere in the cause chain → transient.
    if (isRetryableErrorChain(error)) {
      return { kind: 'transient', source: 'transport' };
    }

    // 3. Behavioral archetype (arxiv:2512.07497) → map to its recovery action.
    const detection = detector.detect({
      messages: [{ role: 'assistant', content: extractErrorMessage(error) }],
      ...(taskDescription !== undefined ? { taskDescription } : {}),
    });
    if (detection.hasFailure) {
      const top = highestConfidenceFailure(detection.failures);
      if (top !== undefined) {
        const action = DEFAULT_RECOVERY_STRATEGIES[top.archetype].action;
        return {
          kind: RECOVERABLE_ACTIONS.has(action) ? 'transient' : 'permanent',
          source: 'archetype',
          archetype: top.archetype,
          confidence: top.confidence,
        };
      }
    }

    // 4. Fail closed.
    return { kind: 'permanent', source: 'default' };
  } catch {
    // A throwing `.message`/`.cause` getter (or any classifier fault) MUST NOT
    // escape — fail closed so `execute()` still resolves to a Result.
    return { kind: 'permanent', source: 'default' };
  }
}

/**
 * Merges a policy's retry knobs over DEFAULT_RETRY_CONFIG (no magic numbers).
 * `maxRetries` is the one exception: it falls through to
 * {@link EXPERT_RECOVERY_DEFAULT_MAX_RETRIES} (1), NOT DEFAULT_RETRY_CONFIG's 3,
 * so an empty `{}` policy yields a conservative 2-attempt run. Delay/jitter knobs
 * still fall through to DEFAULT_RETRY_CONFIG.
 */
function mergeRecoveryConfig(policy: ExpertRecoveryPolicy): RetryConfig {
  return {
    maxRetries: policy.maxRetries ?? EXPERT_RECOVERY_DEFAULT_MAX_RETRIES,
    baseDelayMs: policy.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs: policy.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
    jitterFactor: policy.jitterFactor ?? DEFAULT_RETRY_CONFIG.jitterFactor,
  };
}

/** Builds the `context.recovery` trace object. */
function buildRecoveryTrace(
  exhausted: RetryExhaustedError,
  classification: FailureClassification
): Record<string, unknown> {
  const recovery: Record<string, unknown> = {
    attempts: exhausted.attempts,
    classification: classification.kind,
    source: classification.source,
  };
  if (classification.archetype !== undefined) recovery.archetype = classification.archetype;
  return recovery;
}

/** Resolves the cause to preserve on the annotated error. */
function resolveRecoveryCause(base: AgentError | undefined, lastError: unknown): Error | undefined {
  if (base?.cause !== undefined) return base.cause;
  return lastError instanceof Error ? lastError : undefined;
}

/**
 * Builds the AgentError returned when recovery is exhausted or the failure is
 * permanent. Unwraps the last underlying error (returns it enriched if it is an
 * AgentError, else wraps it) and annotates `context.recovery` with the trace.
 */
function annotateRecoveryFailure(
  exhausted: RetryExhaustedError,
  classification: FailureClassification,
  expertId: string
): AgentError {
  const lastError = exhausted.lastError;
  const base = lastError instanceof AgentError ? lastError : undefined;
  const context: Record<string, unknown> = {
    ...(base?.context ?? {}),
    expertId,
    recovery: buildRecoveryTrace(exhausted, classification),
  };
  const opts: { context: Record<string, unknown>; cause?: Error } = { context };
  const cause = resolveRecoveryCause(base, lastError);
  if (cause !== undefined) opts.cause = cause;
  return new AgentError(base?.message ?? getErrorMessage(lastError), opts);
}

/**
 * An {@link Expert} whose `execute()` applies a transient-vs-permanent recovery
 * policy. Wrapping at `execute()` (not `executeTask()`) reuses the base
 * state-machine auto-reset (#1060) and per-attempt heartbeat/timeout.
 */
export class RecoverableExpert extends Expert {
  private readonly detector: FailureDetector;
  private readonly recoveryManager: RecoveryManager;
  private readonly recoveryConfig: RetryConfig;
  private readonly recoveryLogger: ILogger;

  constructor(options: BaseAgentOptions, config: ExpertConfig, policy: ExpertRecoveryPolicy) {
    super(options, config);
    // Calibrate the threshold for error-text-only input (spread last so an explicit
    // caller detectorConfig.confidenceThreshold still wins). See
    // EXPERT_ERROR_TEXT_CONFIDENCE_THRESHOLD.
    this.detector = new FailureDetector({
      confidenceThreshold: EXPERT_ERROR_TEXT_CONFIDENCE_THRESHOLD,
      ...policy.detectorConfig,
    });
    this.recoveryManager = new RecoveryManager();
    this.recoveryConfig = mergeRecoveryConfig(policy);
    this.recoveryLogger =
      options.logger ?? createLogger({ component: 'RecoverableExpert', expert: config.id });
  }

  override async execute(
    task: Task,
    options?: { signal?: AbortSignal }
  ): Promise<Result<TaskResult, AgentError>> {
    let currentTask = task;
    let lastClassification: FailureClassification | undefined;
    const signal = options?.signal;

    const outcome = await withRetry<TaskResult>(
      async () => {
        const r = await super.execute(currentTask, options);
        // Convert err() → throw so withRetry drives the retry loop.
        if (!r.ok) throw r.error;
        return r.value;
      },
      {
        config: this.recoveryConfig,
        isRetryable: (error: unknown): boolean => {
          lastClassification = classifyExpertFailure(
            error,
            this.detector,
            currentTask.description,
            signal
          );
          return lastClassification.kind === 'transient';
        },
        onRetry: (info: RetryAttemptInfo): void => {
          currentTask = this.handleRetry(info, lastClassification, currentTask);
        },
      }
    );

    if (outcome.ok) return ok(outcome.value);
    return err(this.annotateExhausted(outcome.error, currentTask, signal));
  }

  /**
   * Per-retry callback: logs the attempt and, for a recoverable archetype,
   * injects archetype-specific guidance into the next attempt's task.
   *
   * Returns the (possibly augmented) task. onRetry runs INSIDE withRetry's catch
   * but is NOT itself try-guarded (adapters/retry.ts:352-359 — the try wraps only
   * `operation()`), so a throw here would escape withRetry and reject the Promise.
   * The guidance path re-reads the error (extractErrorMessage) and calls
   * detector.detect, so a pathological error (#4303 throwing getter) could throw —
   * guard it: on failure, skip injection and retry with the un-augmented task.
   */
  private handleRetry(
    info: RetryAttemptInfo,
    classification: FailureClassification | undefined,
    currentTask: Task
  ): Task {
    this.recoveryLogger.info('Expert execution retry', {
      expertId: this.expertConfig.id,
      attempt: info.attempt,
      delayMs: info.delayMs,
      classification: classification?.kind,
      source: classification?.source,
      archetype: classification?.archetype,
    });
    if (classification?.source !== 'archetype' || classification.archetype === undefined) {
      return currentTask;
    }
    try {
      return this.injectRecoveryGuidance(currentTask, classification.archetype, info);
    } catch (guidanceError: unknown) {
      this.recoveryLogger.warn('Skipping recovery guidance injection (threw)', {
        expertId: this.expertConfig.id,
        archetype: classification.archetype,
        error: getErrorMessage(guidanceError),
      });
      return currentTask;
    }
  }

  /**
   * Builds the annotated failure returned when recovery is exhausted. withRetry
   * skips isRetryable on the final attempt, so the per-attempt `lastClassification`
   * can be stale (or undefined for maxRetries:0). Re-classify the actual `lastError`
   * so the recovery trace labels the failure that was truly returned.
   */
  private annotateExhausted(
    exhausted: RetryExhaustedError,
    currentTask: Task,
    signal: AbortSignal | undefined
  ): AgentError {
    const finalClassification = classifyExpertFailure(
      exhausted.lastError,
      this.detector,
      currentTask.description,
      signal
    );
    return annotateRecoveryFailure(exhausted, finalClassification, this.expertConfig.id);
  }

  /** Appends archetype recovery guidance to a mutable copy of the task. */
  private injectRecoveryGuidance(
    task: Task,
    archetype: FailureArchetype,
    info: RetryAttemptInfo
  ): Task {
    const failure = this.buildDetectedFailure(archetype, info.error, task.description);
    const instructions = this.recoveryManager.generateRecoveryInstructions({
      task,
      messages: [],
      failure,
      attemptNumber: info.attempt,
    });
    const historyItem: TaskHistoryItem = {
      role: 'user',
      content: instructions.systemPromptAddition,
      timestamp: getTimeProvider().nowIso(),
    };
    const history = task.context.history ?? [];
    return {
      ...task,
      context: { ...task.context, history: [...history, historyItem] },
    };
  }

  /** Recovers the DetectedFailure for an archetype (re-detect, else synthesize). */
  private buildDetectedFailure(
    archetype: FailureArchetype,
    error: unknown,
    taskDescription: string
  ): DetectedFailure {
    const messages: Message[] = [{ role: 'assistant', content: extractErrorMessage(error) }];
    const detection = this.detector.detect({ messages, taskDescription });
    const match = detection.failures.find((f) => f.archetype === archetype);
    if (match !== undefined) return match;
    return {
      archetype,
      severity: 'medium',
      description: DEFAULT_RECOVERY_STRATEGIES[archetype].instructions,
      indicators: [],
      confidence: EXPERT_ERROR_TEXT_CONFIDENCE_THRESHOLD,
      timestamp: getTimeProvider().now(),
    };
  }
}
