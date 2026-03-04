/**
 * FeedbackSubscriber — V2 EventBus → OutcomeStore bridge (Issue #915, Phase 7-1)
 *
 * Subscribes to pipeline events and records outcomes automatically.
 * Closes the feedback loop: execution → events → outcomes → routing.
 *
 * @see docs/v2/08-observability-eventing.md (Feedback Loop section)
 * @module pipeline/feedback-subscriber
 */
import { getErrorMessage, createLogger } from '../core/index.js';

import type { PipelineEvent, Unsubscribe, IEventBus } from './event-types.js';
import type { OutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import { categorizeOutcomeErrorMessage } from '../orchestration/outcomes/outcome-types.js';
import { CLI_NAMES, DEFAULT_CLI } from '../config/model-capabilities-types.js';
import type { CliNameLiteral } from '../config/model-capabilities-types.js';

const logger = createLogger({ component: 'FeedbackSubscriber' });

const VALID_CLIS: ReadonlySet<string> = new Set<string>(CLI_NAMES);

/**
 * Creates a subscriber that bridges EventBus events to OutcomeStore.
 *
 * Listens for `model.called` and `stage.failed` events and records
 * them as TaskOutcome entries in the OutcomeStore.
 *
 * @returns Unsubscribe function to stop the bridge.
 */
export function createFeedbackSubscriber(bus: IEventBus, store: OutcomeStore): Unsubscribe {
  return bus.subscribe({ type: ['model.called', 'stage.failed'] }, (event) => {
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
  if (event.type === 'model.called') {
    recordModelCall(event, store);
  } else if (event.type === 'stage.failed') {
    recordStageFailed(event, store);
  }
}

function recordModelCall(
  event: PipelineEvent & { type: 'model.called' },
  store: OutcomeStore
): void {
  const cli = normalizeCli(event.cli);
  if (cli === undefined) return;

  const outcome: TaskOutcome = {
    id: `fb-${event.executionId}-${String(event.timestamp)}`,
    cli,
    category: 'code_generation',
    model: event.model,
    success: true,
    durationMs: event.durationMs,
    timestamp: new Date(event.timestamp).toISOString(),
    source: 'delegate',
  };
  store.append(outcome);
}

function recordStageFailed(
  event: PipelineEvent & { type: 'stage.failed' },
  store: OutcomeStore
): void {
  const outcome: TaskOutcome = {
    id: `fb-fail-${event.executionId}-${String(event.timestamp)}`,
    cli: DEFAULT_CLI, // Stage failures don't carry CLI info; default to canonical fallback
    category: 'code_generation',
    model: 'unknown',
    success: false,
    durationMs: 0,
    timestamp: new Date(event.timestamp).toISOString(),
    source: 'delegate',
    failureCategory: categorizeOutcomeErrorMessage(event.error),
  };
  store.append(outcome);
}

function normalizeCli(cli: string): CliNameLiteral | undefined {
  if (VALID_CLIS.has(cli)) {
    return cli as CliNameLiteral;
  }
  logger.warn('Unknown CLI in event', { cli });
  return undefined;
}
