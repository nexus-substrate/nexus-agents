/**
 * FeedbackSubscriber tests (Issue #915, Phase 7-1; #3179 scope cleanup)
 *
 * Tests automatic wiring of EventBus → OutcomeStore. The bridge listens for
 * `stage.failed` only — the former `model.called` branch was dead (no producer)
 * and was removed in #3179.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { EventBus } from './event-bus.js';
import { createFeedbackSubscriber } from './feedback-subscriber.js';
import { OutcomeStore, resetOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { PipelineEvent } from './event-types.js';

// ============================================================================
// Setup
// ============================================================================

let bus: EventBus;
let store: OutcomeStore;

/**
 * A representative stage.failed event — the bridge's only live input.
 *
 * Carries a model by default (#5003): without one the CLI is unattributable
 * and the bridge writes nothing, so a model-less fixture would make every
 * recording assertion below vacuous.
 */
function stageFailed(executionId: string, error = 'boom'): PipelineEvent {
  return {
    type: 'stage.failed',
    executionId,
    stageId: 'analyze',
    error,
    model: 'claude-opus-4',
    timestamp: Date.now(),
  };
}

beforeEach(() => {
  resetOutcomeStore();
  bus = new EventBus();
  store = new OutcomeStore();
});

// ============================================================================
// Tests
// ============================================================================

describe('createFeedbackSubscriber', () => {
  it('records stage.failed events as failed outcomes', () => {
    createFeedbackSubscriber(bus, store);

    bus.emit(stageFailed('exec-2'));

    expect(store.size).toBe(1);
    const outcomes = store.query({});
    expect(outcomes[0]?.success).toBe(false);
    expect(outcomes[0]?.failureCategory).toBeDefined();
    // #5003: attributed from the event's model, never defaulted. The CLI used
    // to be hardcoded to `claude` regardless of what actually ran.
    expect(outcomes[0]?.cli).toBe('claude');
  });

  it('records nothing when the failure cannot be attributed to a CLI (#5003)', () => {
    // `StageFailedEvent` carries no `cli`. It used to be defaulted to `claude`,
    // fabricating attribution for every stage failure — including local gates
    // where no CLI ran at all. `agent-executor` documents that bug (#2823) and
    // skips the record; this bridge re-introduced it through the event bus.
    createFeedbackSubscriber(bus, store);

    bus.emit({
      type: 'stage.failed',
      executionId: 'exec-local-gate',
      stageId: 'security',
      error: 'semgrep not installed',
      timestamp: Date.now(),
    });

    expect(store.size).toBe(0);
  });

  it('records nothing when the model does not resolve to a known CLI (#5003)', () => {
    // The pair: an unrecognised model is not an excuse to guess either.
    createFeedbackSubscriber(bus, store);

    bus.emit({
      type: 'stage.failed',
      executionId: 'exec-unknown-model',
      stageId: 'impl-t1',
      error: 'boom',
      model: 'some-private-model',
      timestamp: Date.now(),
    });

    expect(store.size).toBe(0);
  });

  it('records the real model id when the stage.failed event carries one (#4194)', () => {
    createFeedbackSubscriber(bus, store);

    bus.emit({
      type: 'stage.failed',
      executionId: 'exec-model',
      stageId: 'impl-t1',
      error: 'boom',
      model: 'claude-opus-4',
      timestamp: Date.now(),
    });

    expect(store.size).toBe(1);
    expect(store.query({})[0]?.model).toBe('claude-opus-4');
  });

  it('ignores model.called events — that event has no producer (#3179)', () => {
    // The bridge no longer subscribes to model.called. Even if some future
    // producer emitted one, outcome-writing stays on agent-executor's direct
    // recordOutcome path to avoid double-counting.
    createFeedbackSubscriber(bus, store);

    bus.emit({
      type: 'model.called',
      executionId: 'exec-1',
      cli: 'claude',
      model: 'claude-sonnet',
      tokensIn: 1000,
      tokensOut: 500,
      durationMs: 250,
      timestamp: Date.now(),
    });

    expect(store.size).toBe(0);
  });

  it('ignores unrelated event types', () => {
    createFeedbackSubscriber(bus, store);

    bus.emit({
      type: 'task.created',
      taskId: 'task-1',
      timestamp: Date.now(),
    });

    expect(store.size).toBe(0);
  });

  it('returns unsubscribe function', () => {
    const unsub = createFeedbackSubscriber(bus, store);

    bus.emit(stageFailed('exec-1'));
    expect(store.size).toBe(1);

    unsub();

    bus.emit(stageFailed('exec-2'));
    expect(store.size).toBe(1);
  });

  it('handles multiple events', () => {
    createFeedbackSubscriber(bus, store);

    for (let i = 0; i < 5; i++) {
      bus.emit(stageFailed(`exec-${String(i)}`));
    }

    expect(store.size).toBe(5);
  });
});

// ============================================================================
// The server does NOT run this subscriber, and nothing should claim it does
// ============================================================================

describe('there is no server-wide feedback subscription', () => {
  // #2938 added a `startFeedbackSubscriber` / `shutdownFeedbackSubscriber`
  // singleton pair. #5003's panel then removed the bridge from the server: the
  // subscriber hardcoded `cli: 'claude'` on every stage failure (StageFailedEvent
  // carries no `cli`) and double-counted against `agent-executor`, which is the
  // single canonical outcome writer. Only the START half was removed — shutdown
  // stayed wired into `createShutdownCleanup` as an unconditional no-op, and the
  // init log kept reporting `feedbackSubscriber: 'active'` for a subscription
  // that no longer existed.
  it('exposes only the caller-managed factory', async () => {
    const mod: Record<string, unknown> = await import('./feedback-subscriber.js');

    expect(typeof mod['createFeedbackSubscriber']).toBe('function');
    // A singleton pair here is what the server used to hold. If it comes back,
    // it must come back with a caller — not as a shutdown with no start.
    expect(mod['startFeedbackSubscriber']).toBeUndefined();
    expect(mod['shutdownFeedbackSubscriber']).toBeUndefined();
  });

  it('still records outcomes for a caller that manages its own subscription', () => {
    // The public API an SDK embedder uses, and the reason the module stays.
    const unsubscribe = createFeedbackSubscriber(bus, store);

    bus.emit(stageFailed('exec-embedder'));
    expect(store.size).toBe(1);

    unsubscribe();
    bus.emit(stageFailed('exec-after-unsubscribe'));
    expect(store.size).toBe(1);
  });
});
