/**
 * Tests for Swarm Observer Helpers
 * @module observability/swarm-observer-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { AgentEvent, ContributionScore } from './swarm-observer-types.js';
import {
  calculateSeverity,
  calculateContribution,
  normalizeScores,
} from './swarm-observer-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeEvent(payload: AgentEvent['payload'], durationMs?: number): AgentEvent {
  return {
    agentId: 'agent-1',
    eventType: payload.type,
    timestamp: Date.now(),
    traceId: 'trace-1',
    payload,
    ...(durationMs !== undefined ? { durationMs } : {}),
  } as unknown as AgentEvent;
}

// ============================================================================
// calculateSeverity
// ============================================================================

describe('calculateSeverity', () => {
  it('returns low for small values', () => {
    expect(calculateSeverity(1, 0)).toBe('low');
  });

  it('returns medium for score >= 5', () => {
    expect(calculateSeverity(5, 0)).toBe('medium');
  });

  it('returns high for score >= 10', () => {
    expect(calculateSeverity(10, 0)).toBe('high');
  });

  it('returns critical for score >= 20', () => {
    expect(calculateSeverity(20, 0)).toBe('critical');
  });

  it('weights blocked agents by 2', () => {
    // 0 queued + 3 blocked * 2 = 6 -> medium
    expect(calculateSeverity(0, 3)).toBe('medium');
    // 0 queued + 5 blocked * 2 = 10 -> high
    expect(calculateSeverity(0, 5)).toBe('high');
  });

  it('combines queued messages and blocked agents', () => {
    // 8 queued + 6 blocked * 2 = 20 -> critical
    expect(calculateSeverity(8, 6)).toBe('critical');
  });
});

// ============================================================================
// calculateContribution
// ============================================================================

describe('calculateContribution', () => {
  it('counts sent messages', () => {
    const events = [
      makeEvent({
        type: 'message',
        direction: 'sent',
        messageType: 'request',
      } as AgentEvent['payload']),
      makeEvent({
        type: 'message',
        direction: 'sent',
        messageType: 'request',
      } as AgentEvent['payload']),
    ];
    const result = calculateContribution('agent-1', events);
    expect(result.messagesSent).toBe(2);
    expect(result.messagesReceived).toBe(0);
  });

  it('counts received messages', () => {
    const events = [
      makeEvent({
        type: 'message',
        direction: 'received',
        messageType: 'response',
      } as AgentEvent['payload']),
    ];
    const result = calculateContribution('agent-1', events);
    expect(result.messagesReceived).toBe(1);
  });

  it('counts successful tools', () => {
    const events = [
      makeEvent({
        type: 'tool',
        phase: 'completed',
        toolName: 'search',
        success: true,
      } as AgentEvent['payload']),
    ];
    const result = calculateContribution('agent-1', events);
    expect(result.successfulTools).toBe(1);
  });

  it('counts errors', () => {
    const events = [
      makeEvent({ type: 'error', errorMessage: 'fail', errorCode: 'ERR' } as AgentEvent['payload']),
    ];
    const result = calculateContribution('agent-1', events);
    expect(result.errorCount).toBe(1);
  });

  it('tracks active time', () => {
    const events = [
      makeEvent(
        { type: 'message', direction: 'sent', messageType: 'request' } as AgentEvent['payload'],
        100
      ),
      makeEvent(
        { type: 'message', direction: 'sent', messageType: 'request' } as AgentEvent['payload'],
        200
      ),
    ];
    const result = calculateContribution('agent-1', events);
    expect(result.activeTimeMs).toBe(300);
  });

  it('calculates score with weighting', () => {
    // 2 sent * 0.1 + 1 tool * 0.3 - 0 errors = 0.5
    const events = [
      makeEvent({
        type: 'message',
        direction: 'sent',
        messageType: 'req',
      } as AgentEvent['payload']),
      makeEvent({
        type: 'message',
        direction: 'sent',
        messageType: 'req',
      } as AgentEvent['payload']),
      makeEvent({
        type: 'tool',
        phase: 'completed',
        toolName: 'x',
        success: true,
      } as AgentEvent['payload']),
    ];
    const result = calculateContribution('agent-1', events);
    expect(result.score).toBeCloseTo(0.5);
  });

  it('clamps score to [0, 1]', () => {
    // Many errors: 0 - 5 * 0.2 = -1.0 -> clamped to 0
    const events = Array.from({ length: 5 }, () =>
      makeEvent({ type: 'error', errorMessage: 'fail', errorCode: 'ERR' } as AgentEvent['payload'])
    );
    const result = calculateContribution('agent-1', events);
    expect(result.score).toBe(0);
  });

  it('returns zero scores for no events', () => {
    const result = calculateContribution('agent-1', []);
    expect(result.score).toBe(0);
    expect(result.messagesSent).toBe(0);
    expect(result.successfulTools).toBe(0);
  });
});

// ============================================================================
// normalizeScores
// ============================================================================

describe('normalizeScores', () => {
  it('normalizes scores to sum to 1', () => {
    const scores = new Map<string, ContributionScore>([
      [
        'a',
        {
          agentId: 'a',
          score: 0.6,
          messagesSent: 0,
          messagesReceived: 0,
          activeTimeMs: 0,
          successfulTools: 0,
          errorCount: 0,
        },
      ],
      [
        'b',
        {
          agentId: 'b',
          score: 0.4,
          messagesSent: 0,
          messagesReceived: 0,
          activeTimeMs: 0,
          successfulTools: 0,
          errorCount: 0,
        },
      ],
    ]);
    const normalized = normalizeScores(scores);
    const sum = Array.from(normalized.values()).reduce((s, c) => s + c.score, 0);
    expect(sum).toBeCloseTo(1.0);
    expect(normalized.get('a')?.score).toBeCloseTo(0.6);
    expect(normalized.get('b')?.score).toBeCloseTo(0.4);
  });

  it('returns same map when total is 0', () => {
    const scores = new Map<string, ContributionScore>([
      [
        'a',
        {
          agentId: 'a',
          score: 0,
          messagesSent: 0,
          messagesReceived: 0,
          activeTimeMs: 0,
          successfulTools: 0,
          errorCount: 0,
        },
      ],
    ]);
    const normalized = normalizeScores(scores);
    expect(normalized.get('a')?.score).toBe(0);
  });
});
