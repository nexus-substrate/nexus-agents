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
  DEFAULT_DETECTOR_CONFIG,
  type DetectorConfig,
  type FailureArchetype,
  type DetectedFailure,
  type RecoveryAction,
} from '../resilience/index.js';
import { Expert } from './expert-agent.js';
import type { ExpertConfig } from './expert-config.js';

/**
 * Opt-in recovery policy attached to an expert at creation time. All fields are
 * optional and fall through to {@link DEFAULT_RETRY_CONFIG} (retry knobs) and
 * {@link DEFAULT_DETECTOR_CONFIG} (detector).
 */
export interface ExpertRecoveryPolicy {
  /** Maximum retries (attempts = maxRetries + 1). Default: DEFAULT_RETRY_CONFIG. */
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
  for (let depth = 0; current !== null && current !== undefined && depth < 10; depth++) {
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
  for (let depth = 0; current !== null && current !== undefined && depth < 10; depth++) {
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
 */
export function classifyExpertFailure(
  error: unknown,
  detector: FailureDetector,
  taskDescription?: string,
  signal?: AbortSignal
): FailureClassification {
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
}

/** Merges a policy's retry knobs over DEFAULT_RETRY_CONFIG (no magic numbers). */
function mergeRecoveryConfig(policy: ExpertRecoveryPolicy): RetryConfig {
  return {
    maxRetries: policy.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
    baseDelayMs: policy.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs: policy.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
    jitterFactor: policy.jitterFactor ?? DEFAULT_RETRY_CONFIG.jitterFactor,
  };
}

/** Builds the `context.recovery` trace object. */
function buildRecoveryTrace(
  exhausted: RetryExhaustedError,
  classification: FailureClassification | undefined
): Record<string, unknown> {
  const recovery: Record<string, unknown> = {
    attempts: exhausted.attempts,
    classification: classification?.kind ?? 'permanent',
  };
  if (classification?.source !== undefined) recovery.source = classification.source;
  if (classification?.archetype !== undefined) recovery.archetype = classification.archetype;
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
  classification: FailureClassification | undefined,
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
    this.detector = new FailureDetector(policy.detectorConfig ?? {});
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
          this.recoveryLogger.info('Expert execution retry', {
            expertId: this.expertConfig.id,
            attempt: info.attempt,
            delayMs: info.delayMs,
            classification: lastClassification?.kind,
            source: lastClassification?.source,
            archetype: lastClassification?.archetype,
          });
          // Archetype recovery: inject archetype-specific guidance into the next
          // attempt's prompt via a mutable task copy.
          if (
            lastClassification?.source === 'archetype' &&
            lastClassification.archetype !== undefined
          ) {
            currentTask = this.injectRecoveryGuidance(
              currentTask,
              lastClassification.archetype,
              info
            );
          }
        },
      }
    );

    if (outcome.ok) return ok(outcome.value);
    return err(annotateRecoveryFailure(outcome.error, lastClassification, this.expertConfig.id));
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
      confidence: DEFAULT_DETECTOR_CONFIG.confidenceThreshold,
      timestamp: getTimeProvider().now(),
    };
  }
}
