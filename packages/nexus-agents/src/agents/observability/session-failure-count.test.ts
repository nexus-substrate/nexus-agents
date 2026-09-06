/**
 * `SessionMetrics.failureCount` must be able to count (#5793).
 *
 * It could not. `onResultSubmitted` incremented `successCount` on every
 * submission, and `failureCount` was written in exactly one place in the whole
 * package — `createInitialSessionMetrics`, setting it to `0`. There was no
 * increment anywhere, because there was nothing to increment on:
 * `CollaborationSession.submitResult` emitted `session.result_submitted` on the
 * bus while `markExpertFailed` emitted nothing at all, so an observer saw every
 * success and no failure. Any ratio built from the pair was 100% by
 * construction.
 *
 * These tests drive the real bus with the real session emitting, so the wire —
 * not just each end of it — is what is under test.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { CollaborationEventBus, createEvent } from '../collaboration/event-bus.js';
import { CollaborationSession } from '../collaboration/collaboration-session.js';
import { OrchestrationObserver } from './orchestration-observer.js';

describe('an expert failure reaches the session metrics', () => {
  let eventBus: CollaborationEventBus;
  let observer: OrchestrationObserver;

  beforeEach(() => {
    eventBus = new CollaborationEventBus();
    observer = new OrchestrationObserver(eventBus);
    observer.start();
    eventBus.emit(
      createEvent('session.created', {
        sessionId: 'sess-1',
        pattern: 'parallel',
        experts: ['expert-a', 'expert-b'],
      })
    );
  });

  afterEach(() => {
    observer.stop();
  });

  function emitFailure(expertId: string, terminal: boolean, retryCount = 1): void {
    eventBus.emit(
      createEvent(
        'session.expert_failed',
        { expertId, error: 'adapter timed out', retryCount, terminal },
        { sessionId: 'sess-1' }
      )
    );
  }

  it('counts a terminal failure', () => {
    emitFailure('expert-a', true, 3);

    const metrics = observer.getSessionMetrics('sess-1');
    expect(metrics[0]?.failureCount).toBe(1);
    expect(metrics[0]?.taskCount).toBe(1);
  });

  it('does not count a retryable failure — it may still succeed', () => {
    // Counting it would make successCount + failureCount exceed the work
    // actually attempted, since the participant returns to `pending` and can
    // still submit a result.
    emitFailure('expert-a', false, 1);

    expect(observer.getSessionMetrics('sess-1')[0]?.failureCount).toBe(0);
  });

  it('keeps successes and failures separable in one session', () => {
    // The shape the issue named: two submissions and one terminal failure used
    // to read as successCount 2, failureCount 0.
    eventBus.emit(
      createEvent('session.result_submitted', { expertId: 'expert-b' }, { sessionId: 'sess-1' })
    );
    eventBus.emit(
      createEvent('session.result_submitted', { expertId: 'expert-c' }, { sessionId: 'sess-1' })
    );
    emitFailure('expert-a', true, 3);

    const metrics = observer.getSessionMetrics('sess-1')[0];
    expect(metrics?.successCount).toBe(2);
    expect(metrics?.failureCount).toBe(1);
    expect(metrics?.taskCount).toBe(3);
  });

  it('leaves failureCount at zero for a session with no failures', () => {
    // The empty case, named: zero must still mean "none happened", which is
    // only meaningful now that a non-zero value is reachable.
    eventBus.emit(
      createEvent('session.result_submitted', { expertId: 'expert-b' }, { sessionId: 'sess-1' })
    );

    expect(observer.getSessionMetrics('sess-1')[0]?.failureCount).toBe(0);
  });
});

describe('the wire from the session to the observer', () => {
  // The middle link, driven end to end: a real CollaborationSession emitting on
  // a real bus into a real observer. The tests above emit synthetic events, so
  // they would still pass with `markExpertFailed` emitting nothing — which is
  // exactly the state that shipped.
  it('carries a real markExpertFailed through to failureCount', () => {
    const eventBus = new CollaborationEventBus();
    const observer = new OrchestrationObserver(eventBus);
    observer.start();

    const session = new CollaborationSession({ eventBus });
    session.start({
      sessionId: 'sess-wire',
      pattern: 'parallel',
      experts: ['expert-1', 'expert-2'],
      task: { id: 't1', description: 'Do the thing', context: {} },
      timeout: 60_000,
      maxRetries: 1,
    });

    // First failure is retryable, second exhausts `maxRetries: 1`.
    session.markExpertFailed('expert-1', 'adapter timed out');
    session.markExpertFailed('expert-1', 'adapter timed out again');

    const metrics = observer.getSessionMetrics('sess-wire')[0];
    expect(metrics?.failureCount).toBe(1);
    expect(metrics?.successCount).toBe(0);
    observer.stop();
  });

  it('records nothing when the session has no bus — the emit is optional', () => {
    // `emitBusEvent` no-ops without a bus. Pinning it so the new emit cannot
    // become a hard dependency for a session constructed without one.
    const session = new CollaborationSession();
    const started = session.start({
      sessionId: 'sess-nobus',
      pattern: 'parallel',
      experts: ['expert-1', 'expert-2'],
      task: { id: 't1', description: 'Do the thing', context: {} },
      timeout: 60_000,
    });

    expect(started.ok).toBe(true);
    expect(session.markExpertFailed('expert-1', 'boom').ok).toBe(true);
  });
});
