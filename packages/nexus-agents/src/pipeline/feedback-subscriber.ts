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
import { lookupInTreeCapability } from '../config/model-config-helpers.js';

const logger = createLogger({ component: 'FeedbackSubscriber' });

/**
 * Creates a subscriber that bridges EventBus events to OutcomeStore.
 *
 * Listens for `stage.failed` events and records them as failed TaskOutcome
 * entries in the OutcomeStore.
 *
 * Returns an Unsubscribe handle; the caller owns the lifecycle.
 *
 * There is deliberately no server-wide singleton. #2938 added a
 * `startFeedbackSubscriber` / `shutdownFeedbackSubscriber` pair, and #5003's
 * panel then removed this bridge from the server: `StageFailedEvent` carries no
 * `cli`, so the subscriber hardcoded `cli: 'claude'` on every stage failure and
 * double-counted against `agent-executor`, which is now the single canonical
 * outcome writer. The `start` half was dropped from `initV2PipelineSubsystems`
 * and the pair was left behind — `shutdown` still called from `cli-server.ts`
 * as an unconditional no-op, and the init log still reporting
 * `feedbackSubscriber: 'active'`. Both are gone; this function stays because it
 * is public API for SDK embedders who DO manage their own store.
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
  // #5003: `StageFailedEvent` carries no `cli`, and this used to hardcode
  // `DEFAULT_CLI` — fabricating claude attribution on every stage failure,
  // including stages where no CLI ran at all. `agent-executor.ts:131-152`
  // documents that exact bug (#2823 — "silently corrupted weather-report +
  // LinUCB cold-start warmStart() with false claude credit on every pipeline
  // run") and SKIPS the record rather than lie. This bridge re-introduced,
  // through the event bus, the record the executor suppresses.
  //
  // The model IS carried when the emitter knows it (#4194), so the CLI is
  // recoverable for a real CLI stage. When it is not, no record is written:
  // an unattributable failure teaches the routing learner nothing true.
  const cli = event.model === undefined ? undefined : lookupInTreeCapability(event.model)?.cliName;
  if (cli === undefined) {
    logger.debug('Skipping stage-failure outcome — no attributable CLI', {
      stageId: event.stageId,
      model: event.model ?? 'absent',
    });
    return;
  }
  const outcome: TaskOutcome = {
    id: `fb-fail-${event.executionId}-${String(event.timestamp)}`,
    cli,
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
