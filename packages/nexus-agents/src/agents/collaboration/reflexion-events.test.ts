/**
 * Tests for reflexion-events.ts
 *
 * Covers Reflexion (MAR) protocol lifecycle events (started, iteration, completed)
 * and phase events (critique_started, critique_completed, synthesis).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  emitReflexionStarted,
  emitReflexionIteration,
  emitReflexionCompleted,
  emitCritiqueStarted,
  emitCritiqueCompleted,
  emitSynthesis,
} from './reflexion-events.js';
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
// emitReflexionStarted
// ============================================================================

describe('emitReflexionStarted', () => {
  it('emits protocol.started with protocolType reflexion', () => {
    const bus = makeMockEventBus();
    emitReflexionStarted(bus, {
      sessionId: 's1',
      personaCount: 3,
      reflexionConfig: { maxIterations: 5, severityThreshold: 0.3 } as never,
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.started');
    expect(event.payload.protocolType).toBe('reflexion');
  });

  it('passes config from reflexionConfig', () => {
    const bus = makeMockEventBus();
    emitReflexionStarted(bus, {
      sessionId: 's1',
      personaCount: 4,
      reflexionConfig: { maxIterations: 10, severityThreshold: 0.5 } as never,
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.config.maxRounds).toBe(10);
    expect(event.payload.config.confidenceThreshold).toBe(0.5);
    expect(event.payload.config.agentCount).toBe(4);
  });

  it('sets byzantineTolerance to 0', () => {
    const bus = makeMockEventBus();
    emitReflexionStarted(bus, {
      sessionId: 's1',
      personaCount: 2,
      reflexionConfig: { maxIterations: 3, severityThreshold: 0.1 } as never,
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.config.byzantineTolerance).toBe(0);
  });
});

// ============================================================================
// emitReflexionIteration
// ============================================================================

describe('emitReflexionIteration', () => {
  it('emits protocol.iteration', () => {
    const bus = makeMockEventBus();
    emitReflexionIteration(bus, {
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
    emitReflexionIteration(bus, {
      round: 0,
      maxRounds: 5,
      status: 'in_progress',
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.round).toBe(1);
  });

  it('passes max_reached status', () => {
    const bus = makeMockEventBus();
    emitReflexionIteration(bus, {
      round: 4,
      maxRounds: 5,
      status: 'max_reached',
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.status).toBe('max_reached');
  });
});

// ============================================================================
// emitReflexionCompleted
// ============================================================================

describe('emitReflexionCompleted', () => {
  it('emits protocol.completed', () => {
    const bus = makeMockEventBus();
    emitReflexionCompleted(bus, {
      result: { converged: true, totalIterations: 3 } as never,
      startTime: 1000,
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.completed');
  });

  it('maps converged to success', () => {
    const bus = makeMockEventBus();
    emitReflexionCompleted(bus, {
      result: { converged: false, totalIterations: 5 } as never,
      startTime: 1000,
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.success).toBe(false);
  });

  it('maps totalIterations to iterations', () => {
    const bus = makeMockEventBus();
    emitReflexionCompleted(bus, {
      result: { converged: true, totalIterations: 8 } as never,
      startTime: 1000,
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.iterations).toBe(8);
  });

  it('includes sessionId when provided', () => {
    const bus = makeMockEventBus();
    emitReflexionCompleted(bus, {
      result: { converged: true, totalIterations: 1 } as never,
      startTime: 1000,
      sessionId: 's2',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.sessionId).toBe('s2');
  });
});

// ============================================================================
// emitCritiqueStarted
// ============================================================================

describe('emitCritiqueStarted', () => {
  it('emits protocol.reflexion.critique_started', () => {
    const bus = makeMockEventBus();
    emitCritiqueStarted(bus, {
      iteration: 0,
      personaId: 'p1',
      personaRole: 'security',
      sessionId: 's1',
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.reflexion.critique_started');
  });

  it('includes persona details', () => {
    const bus = makeMockEventBus();
    emitCritiqueStarted(bus, {
      iteration: 2,
      personaId: 'persona-sec',
      personaRole: 'security_reviewer',
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.personaId).toBe('persona-sec');
    expect(event.payload.personaRole).toBe('security_reviewer');
    expect(event.payload.iteration).toBe(2);
  });
});

// ============================================================================
// emitCritiqueCompleted
// ============================================================================

describe('emitCritiqueCompleted', () => {
  it('emits protocol.reflexion.critique_completed', () => {
    const bus = makeMockEventBus();
    emitCritiqueCompleted(bus, {
      iteration: 1,
      personaId: 'p1',
      severity: 0.7,
      issueCount: 3,
      sessionId: 's1',
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.reflexion.critique_completed');
  });

  it('includes severity and issue count', () => {
    const bus = makeMockEventBus();
    emitCritiqueCompleted(bus, {
      iteration: 0,
      personaId: 'p2',
      severity: 0.9,
      issueCount: 5,
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.severity).toBe(0.9);
    expect(event.payload.issueCount).toBe(5);
  });
});

// ============================================================================
// emitSynthesis
// ============================================================================

describe('emitSynthesis', () => {
  it('emits protocol.reflexion.synthesis', () => {
    const bus = makeMockEventBus();
    emitSynthesis(bus, {
      iteration: 2,
      consensusSeverity: 0.4,
      actionItemCount: 2,
      sessionId: 's1',
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('protocol.reflexion.synthesis');
  });

  it('includes synthesis details', () => {
    const bus = makeMockEventBus();
    emitSynthesis(bus, {
      iteration: 1,
      consensusSeverity: 0.6,
      actionItemCount: 4,
      sessionId: 's1',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.iteration).toBe(1);
    expect(event.payload.consensusSeverity).toBe(0.6);
    expect(event.payload.actionItemCount).toBe(4);
  });
});
