/**
 * FeedbackSubscriber — V2 EventBus → OutcomeStore bridge (Issue #915, Phase 7-1)
 *
 * Subscribes to pipeline events and records outcomes automatically.
 * Closes the feedback loop: execution → events → outcomes → routing.
 *
 * Scope note (#3179): this bridge listens for `stage.failed` only. It used to
 * also subscribe to `model.called`, but that event has **no producer** anywhere
 * in the codebase — `ModelCalledEvent` was added to the event vocabulary (#912)
 * with consumers here and in trace-writer (#952), but the emitter was never
 * built. So the `model.called` branch was dead (it never fired) and, had a
 * producer been added, it would have double-counted against the cli-attributed
 * outcomes that `agent-executor.recordOutcome()` already writes directly. The
 * 3-0 consensus (#3179) was to drop the dead branch and keep outcome-writing on
 * the single direct path. Emitting `model.called` with real model/token
 * attribution (the originally-intended #952 observability) is deferred to a
 * focused follow-up; it needs adapter-level token plumbing and is built only
 * if/when query_trace model-call attribution is actually needed.
 *
 * @see docs/v2/08-observability-eventing.md (Feedback Loop section)
 * @module pipeline/feedback-subscriber
 */
import { getErrorMessage, createLogger } from '../core/index.js';

import type { PipelineEvent, Unsubscribe, IEventBus } from './event-types.js';
import type { OutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import { categorizeOutcomeErrorMessage } from '../orchestration/outcomes/outcome-types.js';
import { DEFAULT_CLI } from '../config/model-capabilities-types.js';

const logger = createLogger({ component: 'FeedbackSubscriber' });

/**
 * Creates a subscriber that bridges EventBus events to OutcomeStore.
 *
 * Listens for `stage.failed` events and records them as failed TaskOutcome
 * entries in the OutcomeStore.
 *
 * Returns an Unsubscribe handle for callers that manage their own
 * subscription lifecycle (e.g. tests). For the server-wide singleton
 * subscription, use `startFeedbackSubscriber` / `shutdownFeedbackSubscriber`.
 *
 * @returns Unsubscribe function to stop the bridge.
 */
export function createFeedbackSubscriber(bus: IEventBus, store: OutcomeStore): Unsubscribe {
  return bus.subscribe({ type: ['stage.failed'] }, (event) => {
    try {
      handleEvent(event, store);
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logger.warn('Feedback subscriber error', { error: msg });
    }
  });
}

// ============================================================================
// Server-wide lifecycle (Issue #2938)
//
// The "feedback loop: execution → events → outcomes → routing" advertised
// in the module docstring requires *someone* to subscribe the bridge once
// at server init and unsubscribe at shutdown. Pre-#2938 nothing wired the
// subscription so the loop never ran. cli-server-tools.ts now calls
// startFeedbackSubscriber() inside `initV2PipelineSubsystems`, paired
// with shutdownFeedbackSubscriber() in cli-server.ts:createShutdownCleanup
// (same lifecycle slot as `shutdownExpertBridge` from #2946).
// ============================================================================

let cachedFeedbackUnsubscribe: Unsubscribe | null = null;

/**
 * Wire the EventBus → OutcomeStore bridge for the process lifetime.
 *
 * Idempotent — repeated calls are no-ops, so the test-suite and cli-server
 * paths can both call it safely. Caller must invoke
 * `shutdownFeedbackSubscriber()` on server shutdown to release the
 * subscription.
 */
export function startFeedbackSubscriber(bus: IEventBus, store: OutcomeStore): void {
  if (cachedFeedbackUnsubscribe !== null) return;
  cachedFeedbackUnsubscribe = createFeedbackSubscriber(bus, store);
}

/**
 * Release the server-wide feedback subscription. Idempotent.
 *
 * Called from cli-server.ts:createShutdownCleanup so SIGTERM teardown
 * releases the EventBus listener.
 */
export function shutdownFeedbackSubscriber(): void {
  if (cachedFeedbackUnsubscribe !== null) {
    cachedFeedbackUnsubscribe();
    cachedFeedbackUnsubscribe = null;
  }
}

// ============================================================================
// Internal
// ============================================================================

function handleEvent(event: PipelineEvent, store: OutcomeStore): void {
  if (event.type === 'stage.failed') {
    recordStageFailed(event, store);
  }
}

function recordStageFailed(
  event: PipelineEvent & { type: 'stage.failed' },
  store: OutcomeStore
): void {
  const outcome: TaskOutcome = {
    id: `fb-fail-${event.executionId}-${String(event.timestamp)}`,
    cli: DEFAULT_CLI, // Stage failures don't carry CLI info; default to canonical fallback
    category: 'code_generation',
    // Real model id when the emitter attributed one (#4194); 'unknown' is
    // reserved for stages that genuinely have no single model — never a guess.
    model: event.model ?? 'unknown',
    success: false,
    durationMs: 0,
    timestamp: new Date(event.timestamp).toISOString(),
    source: 'delegate',
    failureCategory: categorizeOutcomeErrorMessage(event.error),
    errorMessage: event.error.slice(0, 500),
  };
  store.append(outcome);
}
