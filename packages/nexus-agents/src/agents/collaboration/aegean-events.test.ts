/**
 * Tests for aegean-events.ts
 *
 * Covers Aegean protocol lifecycle events (started, iteration, completed)
 * and phase events (round_started, vote_collected, quorum_detected).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  emitProtocolStarted,
  emitProtocolIteration,
  emitProtocolCompleted,
  emitAegeanRoundStarted,
  emitAegeanVoteCollected,
  emitAegeanQuorumDetected,
} from './aegean-events.js';
import type { ICollaborationEventBus } from './event-bus-types.js';

// ============================================================================
// Mock
// ============================================================================

function makeMockEventBus(): ICollaborationEventBus & { emit: ReturnType<typeof vi.fn> } {
  return {
    emit: vi.fn(),
    emitAsync: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn(),
    listenerCount: vi.fn(),
  } as unknown as ICollaborationEventBus & { emit: ReturnType<typeof vi.fn> };
}

// ============================================================================
// emitProtocolStarted
// ============================================================================

describe('emitProtocolStarted', () => {
  it('emits protocol.started with protocolType aegean', () => {
    const bus = makeMockEventBus();
    emitProtocolStarted(bus, {
      sessionId: 's1',
      agentCount: 5,
      aegeanConfig: {
        maxRounds: 3,
        confidenceThreshold: 0.8,
        byzantineTolerance: 1,
      } as never,
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.started');
    expect(event.payload.protocolType).toBe('aegean');
  });

  it('passes config from aegeanConfig', () => {
    const bus = makeMockEventBus();
    emitProtocolStarted(bus, {
      sessionId: 's1',
      agentCount: 7,
      aegeanConfig: {
        maxRounds: 10,
        confidenceThreshold: 0.9,
        byzantineTolerance: 2,
      } as never,
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.config.maxRounds).toBe(10);
    expect(event.payload.config.confidenceThreshold).toBe(0.9);
    expect(event.payload.config.byzantineTolerance).toBe(2);
    expect(event.payload.config.agentCount).toBe(7);
  });

  it('includes sessionId', () => {
    const bus = makeMockEventBus();
    emitProtocolStarted(bus, {
      sessionId: 'my-session',
      agentCount: 3,
      aegeanConfig: {
        maxRounds: 5,
        confidenceThreshold: 0.7,
        byzantineTolerance: 1,
      } as never,
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.sessionId).toBe('my-session');
  });
});

// ============================================================================
// emitProtocolIteration
// ============================================================================

describe('emitProtocolIteration', () => {
  it('emits protocol.iteration', () => {
    const bus = makeMockEventBus();
    emitProtocolIteration(bus, {
      round: 0,
      maxRounds: 5,
      status: 'in_progress',
      sessionId: 's1',
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.iteration');
  });

  it('converts round to 1-indexed', () => {
    const bus = makeMockEventBus();
    emitProtocolIteration(bus, {
      round: 2,
      maxRounds: 5,
      status: 'in_progress',
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.round).toBe(3);
  });

  it('passes status and maxRounds through', () => {
    const bus = makeMockEventBus();
    emitProtocolIteration(bus, {
      round: 0,
      maxRounds: 10,
      status: 'converged',
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.status).toBe('converged');
    expect(event.payload.maxRounds).toBe(10);
  });
});

// ============================================================================
// emitProtocolCompleted
// ============================================================================

describe('emitProtocolCompleted', () => {
  it('emits protocol.completed', () => {
    const bus = makeMockEventBus();
    emitProtocolCompleted(bus, {
      result: { consensusReached: true, totalRounds: 3 } as never,
      startTime: 1000,
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.completed');
  });

  it('maps consensusReached to success', () => {
    const bus = makeMockEventBus();
    emitProtocolCompleted(bus, {
      result: { consensusReached: false, totalRounds: 5 } as never,
      startTime: 1000,
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.success).toBe(false);
  });

  it('maps totalRounds to iterations', () => {
    const bus = makeMockEventBus();
    emitProtocolCompleted(bus, {
      result: { consensusReached: true, totalRounds: 7 } as never,
      startTime: 1000,
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.iterations).toBe(7);
  });

  it('includes sessionId when provided', () => {
    const bus = makeMockEventBus();
    emitProtocolCompleted(bus, {
      result: { consensusReached: true, totalRounds: 1 } as never,
      startTime: 1000,
      sessionId: 's2',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.sessionId).toBe('s2');
  });
});

// ============================================================================
// emitAegeanRoundStarted
// ============================================================================

describe('emitAegeanRoundStarted', () => {
  it('emits protocol.aegean.round_started', () => {
    const bus = makeMockEventBus();
    emitAegeanRoundStarted(bus, {
      round: 1,
      maxRounds: 5,
      leaderId: 'leader-1',
      sessionId: 's1',
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.aegean.round_started');
  });

  it('includes round, maxRounds, and leaderId', () => {
    const bus = makeMockEventBus();
    emitAegeanRoundStarted(bus, {
      round: 2,
      maxRounds: 10,
      leaderId: 'lead-x',
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.round).toBe(2);
    expect(event.payload.maxRounds).toBe(10);
    expect(event.payload.leaderId).toBe('lead-x');
  });
});

// ============================================================================
// emitAegeanVoteCollected
// ============================================================================

describe('emitAegeanVoteCollected', () => {
  it('emits protocol.aegean.vote_collected', () => {
    const bus = makeMockEventBus();
    emitAegeanVoteCollected(bus, {
      round: 1,
      voterId: 'voter-1',
      voteCount: 3,
      requiredQuorum: 4,
      sessionId: 's1',
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.aegean.vote_collected');
  });

  it('includes all vote fields', () => {
    const bus = makeMockEventBus();
    emitAegeanVoteCollected(bus, {
      round: 2,
      voterId: 'v2',
      voteCount: 5,
      requiredQuorum: 6,
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.voterId).toBe('v2');
    expect(event.payload.voteCount).toBe(5);
    expect(event.payload.requiredQuorum).toBe(6);
  });
});

// ============================================================================
// emitAegeanQuorumDetected
// ============================================================================

describe('emitAegeanQuorumDetected', () => {
  it('emits protocol.aegean.quorum_detected', () => {
    const bus = makeMockEventBus();
    emitAegeanQuorumDetected(bus, {
      round: 1,
      quorumSize: 4,
      earlyTermination: false,
      sessionId: 's1',
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.aegean.quorum_detected');
  });

  it('includes all quorum fields', () => {
    const bus = makeMockEventBus();
    emitAegeanQuorumDetected(bus, {
      round: 3,
      quorumSize: 5,
      earlyTermination: true,
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.round).toBe(3);
    expect(event.payload.quorumSize).toBe(5);
    expect(event.payload.earlyTermination).toBe(true);
  });
});
