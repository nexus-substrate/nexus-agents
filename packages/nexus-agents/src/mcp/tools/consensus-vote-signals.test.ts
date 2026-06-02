/**
 * Tests for the consensus → pipeline-bus signal emitter (#3147, epic #3143 P2;
 * scope per #3289 Option 2 — observability signals route through the typed bus).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ILogger } from '../../core/index.js';
import type { ConsensusResult } from '../../consensus/types.js';
import type { Vote } from '../../consensus/types.js';
import type {
  PipelineEvent,
  IEventBus,
  EventFilter,
  EventHandler,
} from '../../pipeline/event-types.js';
import { emitVoteRejectedSignal } from './consensus-vote-signals.js';
import { EventBus } from '../../pipeline/event-bus.js';
import { startTuneStage, shutdownTuneStage } from '../../pipeline/tune-stage.js';

function spyLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: ILogger) {
      return this;
    }),
    setLevel: vi.fn(),
  };
}

/** Minimal capturing bus. */
function captureBus(emitImpl?: (e: PipelineEvent) => void): {
  bus: IEventBus;
  emitted: PipelineEvent[];
} {
  const emitted: PipelineEvent[] = [];
  const bus: IEventBus = {
    emit: (e: PipelineEvent) => {
      if (emitImpl) emitImpl(e);
      emitted.push(e);
    },
    subscribe: (_f: EventFilter, _h: EventHandler) => () => undefined,
    query: () => [],
    get totalEmitted() {
      return emitted.length;
    },
    get bufferSize() {
      return emitted.length;
    },
  };
  return { bus, emitted };
}

function vote(decision: Vote['decision'], rejectionCategories?: Vote['rejectionCategories']): Vote {
  return {
    decision,
    reasoning: 'because',
    confidence: 0.8,
    ...(rejectionCategories !== undefined ? { rejectionCategories } : {}),
  };
}

function makeResult(
  outcome: ConsensusResult['outcome'],
  votes: Map<string, Vote> = new Map()
): ConsensusResult {
  return {
    proposalId: 'prop-1',
    proposal: { title: 't', description: 'd', algorithm: 'simple_majority' },
    outcome,
    votes,
    voteCounts: { approve: 0, reject: 1, abstain: 0, total: 1 },
    approvalPercentage: 25,
    quorumReached: true,
    startedAt: '2026-06-01T00:00:00Z',
    closedAt: '2026-06-01T00:00:01Z',
    durationMs: 1000,
  };
}

describe('emitVoteRejectedSignal (#3147)', () => {
  it('emits signal.vote_rejected with proposalId + approvalPercentage when outcome is rejected', () => {
    const { bus, emitted } = captureBus();
    emitVoteRejectedSignal(makeResult('rejected'), bus, spyLogger());
    expect(emitted).toHaveLength(1);
    const ev = emitted[0];
    expect(ev?.type).toBe('signal.vote_rejected');
    if (ev?.type === 'signal.vote_rejected') {
      expect(ev.proposalId).toBe('prop-1');
      expect(ev.approvalPercentage).toBe(25);
    }
  });

  it('collects distinct rejectionRules from the reject votes', () => {
    const votes = new Map<string, Vote>([
      ['a', vote('reject', ['SCOPE_CREEP', 'SECURITY_RISK'])],
      ['b', vote('reject', ['SCOPE_CREEP'])],
      ['c', vote('approve')],
    ]);
    const { emitted, bus } = captureBus();
    emitVoteRejectedSignal(makeResult('rejected', votes), bus, spyLogger());
    const ev = emitted[0];
    if (ev?.type === 'signal.vote_rejected') {
      expect(ev.rejectionRules).toEqual(expect.arrayContaining(['SCOPE_CREEP', 'SECURITY_RISK']));
      expect(ev.rejectionRules).toHaveLength(2); // distinct
    } else {
      throw new Error('expected signal.vote_rejected');
    }
  });

  it('is a no-op when the outcome is not rejected', () => {
    const { emitted, bus } = captureBus();
    emitVoteRejectedSignal(makeResult('approved'), bus, spyLogger());
    expect(emitted).toHaveLength(0);
  });

  it('swallows + logs a bus.emit error (emission must never break the vote path)', () => {
    const logger = spyLogger();
    const { bus } = captureBus(() => {
      throw new Error('bus boom');
    });
    expect(() => {
      emitVoteRejectedSignal(makeResult('rejected'), bus, logger);
    }).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to emit signal.vote_rejected',
      expect.objectContaining({ error: expect.stringContaining('bus boom') })
    );
  });
});

describe('end-to-end: rejected vote → signal → shadow TuneStage (#3147 loop closure)', () => {
  afterEach(() => {
    shutdownTuneStage(); // release the module-level subscription between tests
  });

  it('a rejected vote emitted on the typed bus is consumed by the wired TuneStage in shadow mode', () => {
    const bus = new EventBus();
    const tuneLogger = spyLogger();
    startTuneStage(bus, { logger: tuneLogger, enabled: false }); // shadow (default is now enforce, #3323)

    emitVoteRejectedSignal(makeResult('rejected'), bus, spyLogger());

    expect(tuneLogger.info).toHaveBeenCalledWith(
      'TuneStage (shadow) — intended action',
      expect.objectContaining({ kind: 'record_rejection', signal: 'signal.vote_rejected' })
    );
  });

  it('startTuneStage is idempotent and shutdownTuneStage releases the subscription', () => {
    const bus = new EventBus();
    const tuneLogger = spyLogger();
    startTuneStage(bus, { logger: tuneLogger });
    startTuneStage(bus, { logger: tuneLogger }); // second call is a no-op (still one subscription)
    expect(bus.subscriptionCount).toBe(1);

    shutdownTuneStage();
    emitVoteRejectedSignal(makeResult('rejected'), bus, spyLogger());
    expect(tuneLogger.info).not.toHaveBeenCalled(); // unsubscribed → no consumption
  });
});
