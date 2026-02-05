/**
 * Tests for SwarmObserver Zod Schemas
 * @module observability/swarm-observer-schemas.test
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SWARM_OBSERVER_CONFIG,
  SwarmObserverConfigSchema,
  AgentEventSchema,
} from './swarm-observer-schemas.js';

// ============================================================================
// DEFAULT_SWARM_OBSERVER_CONFIG
// ============================================================================

describe('DEFAULT_SWARM_OBSERVER_CONFIG', () => {
  it('has expected maxEvents', () => {
    expect(DEFAULT_SWARM_OBSERVER_CONFIG.maxEvents).toBe(10000);
  });

  it('has expected metricsWindowMs (5 minutes)', () => {
    expect(DEFAULT_SWARM_OBSERVER_CONFIG.metricsWindowMs).toBe(300000);
  });

  it('has logPayloads disabled', () => {
    expect(DEFAULT_SWARM_OBSERVER_CONFIG.logPayloads).toBe(false);
  });

  it('has expected bottleneckThreshold', () => {
    expect(DEFAULT_SWARM_OBSERVER_CONFIG.bottleneckThreshold).toBe(10);
  });

  it('has expected minClusterSize', () => {
    expect(DEFAULT_SWARM_OBSERVER_CONFIG.minClusterSize).toBe(2);
  });

  it('has expected cohesionThreshold', () => {
    expect(DEFAULT_SWARM_OBSERVER_CONFIG.cohesionThreshold).toBe(0.5);
  });

  it('passes its own schema validation', () => {
    const result = SwarmObserverConfigSchema.safeParse(DEFAULT_SWARM_OBSERVER_CONFIG);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// SwarmObserverConfigSchema
// ============================================================================

describe('SwarmObserverConfigSchema', () => {
  it('accepts valid config', () => {
    const result = SwarmObserverConfigSchema.safeParse({
      maxEvents: 5000,
      metricsWindowMs: 60000,
      logPayloads: true,
      bottleneckThreshold: 5,
      minClusterSize: 3,
      cohesionThreshold: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults for missing fields', () => {
    const result = SwarmObserverConfigSchema.parse({});
    expect(result.maxEvents).toBe(10000);
    expect(result.metricsWindowMs).toBe(300000);
    expect(result.logPayloads).toBe(false);
    expect(result.bottleneckThreshold).toBe(10);
    expect(result.minClusterSize).toBe(2);
    expect(result.cohesionThreshold).toBe(0.5);
  });

  it('rejects non-positive maxEvents', () => {
    const result = SwarmObserverConfigSchema.safeParse({ maxEvents: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive metricsWindowMs', () => {
    const result = SwarmObserverConfigSchema.safeParse({ metricsWindowMs: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects minClusterSize < 2', () => {
    const result = SwarmObserverConfigSchema.safeParse({ minClusterSize: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects cohesionThreshold > 1', () => {
    const result = SwarmObserverConfigSchema.safeParse({ cohesionThreshold: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects cohesionThreshold < 0', () => {
    const result = SwarmObserverConfigSchema.safeParse({ cohesionThreshold: -0.1 });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// AgentEventSchema
// ============================================================================

describe('AgentEventSchema', () => {
  const validEvent = {
    eventId: 'evt-001',
    timestamp: '2026-02-05T12:00:00.000Z',
    agentId: 'agent-1',
    eventType: 'task_started' as const,
    traceId: '12345678901234567890123456789012',
    spanId: '1234567890123456',
    payload: { task: 'analyze code' },
  };

  it('accepts valid event', () => {
    const result = AgentEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('accepts event with optional fields', () => {
    const result = AgentEventSchema.safeParse({
      ...validEvent,
      parentSpanId: '9876543210987654',
      durationMs: 1500,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all event types', () => {
    const eventTypes = [
      'state_change',
      'message_sent',
      'message_received',
      'tool_invoked',
      'tool_completed',
      'memory_read',
      'memory_write',
      'task_started',
      'task_completed',
      'error',
    ] as const;

    for (const eventType of eventTypes) {
      const result = AgentEventSchema.safeParse({ ...validEvent, eventType });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid event type', () => {
    const result = AgentEventSchema.safeParse({
      ...validEvent,
      eventType: 'invalid_type',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty eventId', () => {
    const result = AgentEventSchema.safeParse({ ...validEvent, eventId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid timestamp', () => {
    const result = AgentEventSchema.safeParse({
      ...validEvent,
      timestamp: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects traceId with wrong length', () => {
    const result = AgentEventSchema.safeParse({
      ...validEvent,
      traceId: 'tooshort',
    });
    expect(result.success).toBe(false);
  });

  it('rejects spanId with wrong length', () => {
    const result = AgentEventSchema.safeParse({
      ...validEvent,
      spanId: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative durationMs', () => {
    const result = AgentEventSchema.safeParse({
      ...validEvent,
      durationMs: -1,
    });
    expect(result.success).toBe(false);
  });
});
