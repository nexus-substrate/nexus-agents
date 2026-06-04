/**
 * FeedbackSubscriber tests (Issue #915, Phase 7-1; #3179 scope cleanup)
 *
 * Tests automatic wiring of EventBus → OutcomeStore. The bridge listens for
 * `stage.failed` only — the former `model.called` branch was dead (no producer)
 * and was removed in #3179.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { EventBus } from './event-bus.js';
import {
  createFeedbackSubscriber,
  startFeedbackSubscriber,
  shutdownFeedbackSubscriber,
} from './feedback-subscriber.js';
import { OutcomeStore, resetOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { PipelineEvent } from './event-types.js';

// ============================================================================
// Setup
// ============================================================================

let bus: EventBus;
let store: OutcomeStore;

/** A representative stage.failed event — the bridge's only live input. */
function stageFailed(executionId: string, error = 'boom'): PipelineEvent {
  return {
    type: 'stage.failed',
    executionId,
    stageId: 'analyze',
    error,
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

// Server-wide lifecycle (Issue #2938) — pre-2938, nothing ever subscribed
// the bridge so the feedback loop the module advertised didn't exist.
// cli-server-tools.ts:initV2PipelineSubsystems now calls
// startFeedbackSubscriber once at server init, paired with
// shutdownFeedbackSubscriber in cli-server.ts:createShutdownCleanup.
describe('startFeedbackSubscriber / shutdownFeedbackSubscriber lifecycle', () => {
  beforeEach(() => {
    // Make sure no prior test left a subscription wired to a different bus.
    shutdownFeedbackSubscriber();
  });

  it('wires the EventBus → OutcomeStore bridge for the process lifetime', () => {
    startFeedbackSubscriber(bus, store);

    bus.emit(stageFailed('exec-lifecycle'));

    expect(store.size).toBe(1);
    shutdownFeedbackSubscriber();
  });

  it('is idempotent — repeated start calls do not double-subscribe', () => {
    startFeedbackSubscriber(bus, store);
    startFeedbackSubscriber(bus, store);
    startFeedbackSubscriber(bus, store);

    bus.emit(stageFailed('exec-idem'));

    // Subscribed exactly once — the event records exactly one outcome.
    expect(store.size).toBe(1);
    shutdownFeedbackSubscriber();
  });

  it('shutdown releases the subscription so further events are not recorded', () => {
    startFeedbackSubscriber(bus, store);
    shutdownFeedbackSubscriber();

    bus.emit(stageFailed('exec-post-shutdown'));

    expect(store.size).toBe(0);
  });

  it('shutdown is idempotent — calling twice does not throw', () => {
    startFeedbackSubscriber(bus, store);
    expect(() => {
      shutdownFeedbackSubscriber();
      shutdownFeedbackSubscriber();
    }).not.toThrow();
  });
});
