/**
 * Tests for byzantine-events.ts
 *
 * Covers weight update, pattern detection, agent flagging,
 * and collusion suspected event emission through a mock event bus.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  emitWeightUpdated,
  emitPatternDetected,
  emitAgentFlagged,
  emitCollusionSuspected,
} from './byzantine-events.js';
import type { IEventBus } from './event-bus-types.js';

// ============================================================================
// Mock event bus
// ============================================================================

function makeMockEventBus(): IEventBus & { emit: ReturnType<typeof vi.fn> } {
  return {
    emit: vi.fn(),
    emitAsync: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn(),
    listenerCount: vi.fn(),
  } as unknown as IEventBus & { emit: ReturnType<typeof vi.fn> };
}

// ============================================================================
// emitWeightUpdated
// ============================================================================

describe('emitWeightUpdated', () => {
  it('emits event with correct topic', () => {
    const bus = makeMockEventBus();
    emitWeightUpdated(bus, {
      agentId: 'agent-1',
      previousWeight: 1.0,
      newWeight: 0.5,
      reason: 'flag_penalty',
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0][0];
    expect(event.topic).toBe('byzantine.weight_updated');
  });

  it('includes all weight fields in payload', () => {
    const bus = makeMockEventBus();
    emitWeightUpdated(bus, {
      agentId: 'agent-1',
      previousWeight: 1.0,
      newWeight: 0.3,
      reason: 'performance_update',
    });
    const event = bus.emit.mock.calls[0][0];
    expect(event.payload.agentId).toBe('agent-1');
    expect(event.payload.previousWeight).toBe(1.0);
    expect(event.payload.newWeight).toBe(0.3);
    expect(event.payload.reason).toBe('performance_update');
  });

  it('includes optional metadata', () => {
    const bus = makeMockEventBus();
    emitWeightUpdated(bus, {
      agentId: 'a',
      previousWeight: 1,
      newWeight: 0.5,
      reason: 'recalibration',
      sessionId: 's1',
      correlationId: 'c1',
    });
    const event = bus.emit.mock.calls[0][0];
    expect(event.sessionId).toBe('s1');
    expect(event.correlationId).toBe('c1');
  });

  it('omits optional metadata when undefined', () => {
    const bus = makeMockEventBus();
    emitWeightUpdated(bus, {
      agentId: 'a',
      previousWeight: 1,
      newWeight: 0.5,
      reason: 'recalibration',
    });
    const event = bus.emit.mock.calls[0][0];
    expect(event.sessionId).toBeUndefined();
    expect(event.correlationId).toBeUndefined();
  });
});

// ============================================================================
// emitPatternDetected
// ============================================================================

describe('emitPatternDetected', () => {
  it('emits event with correct topic', () => {
    const bus = makeMockEventBus();
    emitPatternDetected(bus, {
      patternType: 'contrarian',
      agentIds: ['a1'],
      confidence: 0.9,
      details: 'Consistently disagrees',
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0][0];
    expect(event.topic).toBe('byzantine.pattern_detected');
  });

  it('includes all pattern fields in payload', () => {
    const bus = makeMockEventBus();
    emitPatternDetected(bus, {
      patternType: 'collusion',
      agentIds: ['a1', 'a2'],
      confidence: 0.85,
      details: 'Coordinated voting',
    });
    const event = bus.emit.mock.calls[0][0];
    expect(event.payload.patternType).toBe('collusion');
    expect(event.payload.agentIds).toEqual(['a1', 'a2']);
    expect(event.payload.confidence).toBe(0.85);
    expect(event.payload.details).toBe('Coordinated voting');
  });

  it('includes optional metadata', () => {
    const bus = makeMockEventBus();
    emitPatternDetected(bus, {
      patternType: 'contrarian',
      agentIds: ['a1'],
      confidence: 0.7,
      details: 'test',
      sessionId: 's2',
      correlationId: 'c2',
    });
    const event = bus.emit.mock.calls[0][0];
    expect(event.sessionId).toBe('s2');
    expect(event.correlationId).toBe('c2');
  });
});

// ============================================================================
// emitAgentFlagged
// ============================================================================

describe('emitAgentFlagged', () => {
  it('emits event with correct topic', () => {
    const bus = makeMockEventBus();
    emitAgentFlagged(bus, {
      agentId: 'bad-agent',
      reason: 'Repeated contrarian votes',
      previousWeight: 1.0,
      canVote: false,
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0][0];
    expect(event.topic).toBe('byzantine.agent_flagged');
  });

  it('includes all flagging fields in payload', () => {
    const bus = makeMockEventBus();
    emitAgentFlagged(bus, {
      agentId: 'bad-agent',
      reason: 'Suspected collusion',
      previousWeight: 0.8,
      canVote: true,
    });
    const event = bus.emit.mock.calls[0][0];
    expect(event.payload.agentId).toBe('bad-agent');
    expect(event.payload.reason).toBe('Suspected collusion');
    expect(event.payload.previousWeight).toBe(0.8);
    expect(event.payload.canVote).toBe(true);
  });

  it('includes optional metadata', () => {
    const bus = makeMockEventBus();
    emitAgentFlagged(bus, {
      agentId: 'a',
      reason: 'r',
      previousWeight: 1,
      canVote: false,
      sessionId: 's3',
      correlationId: 'c3',
    });
    const event = bus.emit.mock.calls[0][0];
    expect(event.sessionId).toBe('s3');
    expect(event.correlationId).toBe('c3');
  });
});

// ============================================================================
// emitCollusionSuspected
// ============================================================================

describe('emitCollusionSuspected', () => {
  it('emits event with correct topic', () => {
    const bus = makeMockEventBus();
    emitCollusionSuspected(bus, {
      groupAgentIds: ['a1', 'a2', 'a3'],
      groupSize: 3,
      votingBlock: 0.6,
      threshold: 0.5,
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0][0];
    expect(event.topic).toBe('byzantine.collusion_suspected');
  });

  it('includes all collusion fields in payload', () => {
    const bus = makeMockEventBus();
    emitCollusionSuspected(bus, {
      groupAgentIds: ['a1', 'a2'],
      groupSize: 2,
      votingBlock: 0.4,
      threshold: 0.3,
    });
    const event = bus.emit.mock.calls[0][0];
    expect(event.payload.groupAgentIds).toEqual(['a1', 'a2']);
    expect(event.payload.groupSize).toBe(2);
    expect(event.payload.votingBlock).toBe(0.4);
    expect(event.payload.threshold).toBe(0.3);
  });

  it('includes optional metadata', () => {
    const bus = makeMockEventBus();
    emitCollusionSuspected(bus, {
      groupAgentIds: ['a1'],
      groupSize: 1,
      votingBlock: 0.2,
      threshold: 0.1,
      sessionId: 's4',
      correlationId: 'c4',
    });
    const event = bus.emit.mock.calls[0][0];
    expect(event.sessionId).toBe('s4');
    expect(event.correlationId).toBe('c4');
  });
});
