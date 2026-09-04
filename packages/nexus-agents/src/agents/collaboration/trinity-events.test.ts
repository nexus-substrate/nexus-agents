/**
 * Tests for trinity-events.ts
 *
 * Covers Trinity protocol lifecycle events (started, iteration, completed)
 * and phase events (phase_started, phase_completed).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  emitTrinityStarted,
  emitTrinityIteration,
  emitTrinityCompleted,
  emitPhaseStarted,
  emitPhaseCompleted,
} from './trinity-events.js';
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
// emitTrinityStarted
// ============================================================================

describe('emitTrinityStarted', () => {
  it('emits protocol.started with protocolType trinity', () => {
    const bus = makeMockEventBus();
    emitTrinityStarted(bus, {
      sessionId: 's1',
      trinityConfig: { maxIterations: 5 },
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.started');
    expect(event.payload.protocolType).toBe('trinity');
  });

  it('sets agentCount to 3', () => {
    const bus = makeMockEventBus();
    emitTrinityStarted(bus, {
      sessionId: 's1',
      trinityConfig: { maxIterations: 3 },
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.config.agentCount).toBe(3);
  });

  it('uses maxIterations from config', () => {
    const bus = makeMockEventBus();
    emitTrinityStarted(bus, {
      sessionId: 's1',
      trinityConfig: { maxIterations: 10 },
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.config.maxRounds).toBe(10);
  });

  it('includes sessionId', () => {
    const bus = makeMockEventBus();
    emitTrinityStarted(bus, {
      sessionId: 'my-session',
      trinityConfig: { maxIterations: 5 },
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.sessionId).toBe('my-session');
  });
});

// ============================================================================
// emitTrinityIteration
// ============================================================================

describe('emitTrinityIteration', () => {
  it('emits protocol.iteration', () => {
    const bus = makeMockEventBus();
    emitTrinityIteration(bus, {
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
    emitTrinityIteration(bus, {
      round: 0,
      maxRounds: 5,
      status: 'in_progress',
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.round).toBe(1);
  });

  it('passes status through', () => {
    const bus = makeMockEventBus();
    emitTrinityIteration(bus, {
      round: 2,
      maxRounds: 5,
      status: 'converged',
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.status).toBe('converged');
  });
});

// ============================================================================
// emitTrinityCompleted
// ============================================================================

describe('emitTrinityCompleted', () => {
  it('emits protocol.completed', () => {
    const bus = makeMockEventBus();
    emitTrinityCompleted(bus, {
      result: { success: true, iterations: 3 } as never,
      startTime: 1000,
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.completed');
  });

  it('includes success and iterations from result', () => {
    const bus = makeMockEventBus();
    emitTrinityCompleted(bus, {
      result: { success: false, iterations: 5 } as never,
      startTime: 1000,
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.success).toBe(false);
    expect(event.payload.iterations).toBe(5);
  });

  it('includes sessionId when provided', () => {
    const bus = makeMockEventBus();
    emitTrinityCompleted(bus, {
      result: { success: true, iterations: 1 } as never,
      startTime: 1000,
      sessionId: 's2',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.sessionId).toBe('s2');
  });

  it('computes durationMs', () => {
    const bus = makeMockEventBus();
    emitTrinityCompleted(bus, {
      result: { success: true, iterations: 1 } as never,
      startTime: 1000,
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(typeof event.payload.durationMs).toBe('number');
  });
});

// ============================================================================
// emitPhaseStarted
// ============================================================================

describe('emitPhaseStarted', () => {
  it('emits protocol.trinity.phase_started', () => {
    const bus = makeMockEventBus();
    emitPhaseStarted(bus, { iteration: 0, phase: 'thinker', sessionId: 's1' });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.trinity.phase_started');
  });

  it('includes iteration and phase', () => {
    const bus = makeMockEventBus();
    emitPhaseStarted(bus, { iteration: 2, phase: 'worker', sessionId: 's1' });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.iteration).toBe(2);
    expect(event.payload.phase).toBe('worker');
  });
});

// ============================================================================
// emitPhaseCompleted
// ============================================================================

describe('emitPhaseCompleted', () => {
  it('emits protocol.trinity.phase_completed', () => {
    const bus = makeMockEventBus();
    emitPhaseCompleted(bus, {
      iteration: 1,
      phase: 'verifier',
      durationMs: 500,
      tokensUsed: 100,
      sessionId: 's1',
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.trinity.phase_completed');
  });

  it('includes duration and token metrics', () => {
    const bus = makeMockEventBus();
    emitPhaseCompleted(bus, {
      iteration: 0,
      phase: 'thinker',
      durationMs: 1200,
      tokensUsed: 350,
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.durationMs).toBe(1200);
    expect(event.payload.tokensUsed).toBe(350);
  });
});
