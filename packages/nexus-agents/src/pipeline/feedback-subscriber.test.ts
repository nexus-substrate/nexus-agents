/**
 * FeedbackSubscriber tests (Issue #915, Phase 7-1)
 *
 * Tests automatic wiring of EventBus → OutcomeStore.
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

beforeEach(() => {
  resetOutcomeStore();
  bus = new EventBus();
  store = new OutcomeStore();
});

// ============================================================================
// Tests
// ============================================================================

describe('createFeedbackSubscriber', () => {
  it('records model.called events as outcomes', () => {
    createFeedbackSubscriber(bus, store);

    const event: PipelineEvent = {
      type: 'model.called',
      executionId: 'exec-1',
      cli: 'claude',
      model: 'claude-sonnet',
      tokensIn: 1000,
      tokensOut: 500,
      durationMs: 250,
      timestamp: Date.now(),
    };
    bus.emit(event);

    expect(store.size).toBe(1);
    const outcomes = store.query({});
    expect(outcomes[0]?.cli).toBe('claude');
    expect(outcomes[0]?.model).toBe('claude-sonnet');
    expect(outcomes[0]?.success).toBe(true);
    expect(outcomes[0]?.durationMs).toBe(250);
  });

  it('records stage.failed events as failed outcomes', () => {
    createFeedbackSubscriber(bus, store);

    const event: PipelineEvent = {
      type: 'stage.failed',
      executionId: 'exec-2',
      stageId: 'analyze',
      error: 'boom',
      timestamp: Date.now(),
    };
    bus.emit(event);

    expect(store.size).toBe(1);
    const outcomes = store.query({});
    expect(outcomes[0]?.success).toBe(false);
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

    bus.emit({
      type: 'model.called',
      executionId: 'exec-1',
      cli: 'gemini',
      model: 'gemini-pro',
      tokensIn: 100,
      tokensOut: 50,
      durationMs: 100,
      timestamp: Date.now(),
    });
    expect(store.size).toBe(1);

    unsub();

    bus.emit({
      type: 'model.called',
      executionId: 'exec-2',
      cli: 'codex',
      model: 'codex-o3',
      tokensIn: 100,
      tokensOut: 50,
      durationMs: 100,
      timestamp: Date.now(),
    });
    expect(store.size).toBe(1);
  });

  it('handles multiple events', () => {
    createFeedbackSubscriber(bus, store);

    for (let i = 0; i < 5; i++) {
      bus.emit({
        type: 'model.called',
        executionId: `exec-${String(i)}`,
        cli: 'claude',
        model: 'claude-sonnet',
        tokensIn: 100,
        tokensOut: 50,
        durationMs: 100,
        timestamp: Date.now(),
      });
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

    bus.emit({
      type: 'model.called',
      executionId: 'exec-lifecycle',
      cli: 'claude',
      model: 'claude-sonnet',
      tokensIn: 100,
      tokensOut: 50,
      durationMs: 100,
      timestamp: Date.now(),
    });

    expect(store.size).toBe(1);
    shutdownFeedbackSubscriber();
  });

  it('is idempotent — repeated start calls do not double-subscribe', () => {
    startFeedbackSubscriber(bus, store);
    startFeedbackSubscriber(bus, store);
    startFeedbackSubscriber(bus, store);

    bus.emit({
      type: 'model.called',
      executionId: 'exec-idem',
      cli: 'gemini',
      model: 'gemini-pro',
      tokensIn: 100,
      tokensOut: 50,
      durationMs: 100,
      timestamp: Date.now(),
    });

    // Subscribed exactly once — the event records exactly one outcome.
    expect(store.size).toBe(1);
    shutdownFeedbackSubscriber();
  });

  it('shutdown releases the subscription so further events are not recorded', () => {
    startFeedbackSubscriber(bus, store);
    shutdownFeedbackSubscriber();

    bus.emit({
      type: 'model.called',
      executionId: 'exec-post-shutdown',
      cli: 'codex',
      model: 'codex-5.3',
      tokensIn: 10,
      tokensOut: 5,
      durationMs: 20,
      timestamp: Date.now(),
    });

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
