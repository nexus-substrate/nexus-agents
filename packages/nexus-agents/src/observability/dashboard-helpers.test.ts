/**
 * Tests for Dashboard Helpers
 * @module observability/dashboard-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { AgentEvent } from './swarm-observer-types.js';
import {
  extractState,
  summarizeStateChange,
  summarizeMessage,
  summarizeTool,
  summarizeMemory,
  summarizeTask,
  summarizeError,
  summarizeEvent,
  getEventSeverity,
} from './dashboard-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeEvent(payload: AgentEvent['payload'], eventType?: string): AgentEvent {
  return {
    agentId: 'agent-1',
    eventType: eventType ?? payload.type,
    timestamp: Date.now(),
    traceId: 'trace-1',
    payload,
  } as AgentEvent;
}

// ============================================================================
// extractState
// ============================================================================

describe('extractState', () => {
  it('extracts state from state_change event', () => {
    const event = makeEvent({
      type: 'state_change',
      previousState: 'idle',
      newState: 'executing',
    } as AgentEvent['payload']);
    expect(extractState(event)).toBe('executing');
  });

  it('returns idle for non-state_change events', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'fail',
      errorCode: 'ERR',
    } as AgentEvent['payload']);
    expect(extractState(event)).toBe('idle');
  });
});

// ============================================================================
// summarizeStateChange
// ============================================================================

describe('summarizeStateChange', () => {
  it('formats state transition', () => {
    const event = makeEvent({
      type: 'state_change',
      previousState: 'idle',
      newState: 'executing',
    } as AgentEvent['payload']);
    expect(summarizeStateChange(event)).toBe('idle → executing');
  });

  it('returns empty for non-state_change', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'fail',
      errorCode: 'ERR',
    } as AgentEvent['payload']);
    expect(summarizeStateChange(event)).toBe('');
  });
});

// ============================================================================
// summarizeMessage
// ============================================================================

describe('summarizeMessage', () => {
  it('summarizes sent message', () => {
    const event = makeEvent({
      type: 'message',
      direction: 'sent',
      messageType: 'request',
      targetAgentId: 'agent-2',
    } as AgentEvent['payload']);
    expect(summarizeMessage(event)).toBe('sent request to agent-2');
  });

  it('summarizes received message', () => {
    const event = makeEvent({
      type: 'message',
      direction: 'received',
      messageType: 'response',
      sourceAgentId: 'agent-3',
    } as AgentEvent['payload']);
    expect(summarizeMessage(event)).toBe('recv response from agent-3');
  });

  it('returns empty for non-message', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'x',
      errorCode: 'ERR',
    } as AgentEvent['payload']);
    expect(summarizeMessage(event)).toBe('');
  });
});

// ============================================================================
// summarizeTool
// ============================================================================

describe('summarizeTool', () => {
  it('summarizes tool invocation', () => {
    const event = makeEvent({
      type: 'tool',
      phase: 'invoked',
      toolName: 'search',
    } as AgentEvent['payload']);
    expect(summarizeTool(event)).toBe('invoking search');
  });

  it('summarizes tool success', () => {
    const event = makeEvent({
      type: 'tool',
      phase: 'completed',
      toolName: 'search',
      success: true,
    } as AgentEvent['payload']);
    expect(summarizeTool(event)).toBe('search succeeded');
  });

  it('summarizes tool failure', () => {
    const event = makeEvent({
      type: 'tool',
      phase: 'completed',
      toolName: 'search',
      success: false,
    } as AgentEvent['payload']);
    expect(summarizeTool(event)).toBe('search failed');
  });
});

// ============================================================================
// summarizeMemory
// ============================================================================

describe('summarizeMemory', () => {
  it('summarizes memory operation', () => {
    const event = makeEvent({
      type: 'memory',
      operation: 'store',
      memoryType: 'belief',
    } as AgentEvent['payload']);
    expect(summarizeMemory(event)).toBe('store belief');
  });

  it('returns empty for non-memory', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'x',
      errorCode: 'ERR',
    } as AgentEvent['payload']);
    expect(summarizeMemory(event)).toBe('');
  });
});

// ============================================================================
// summarizeTask
// ============================================================================

describe('summarizeTask', () => {
  it('summarizes task start with description', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'started',
      taskId: 't-1',
      taskDescription: 'analyze code',
    } as AgentEvent['payload']);
    expect(summarizeTask(event)).toBe('started: analyze code');
  });

  it('summarizes task start with id when no description', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'started',
      taskId: 't-1',
    } as AgentEvent['payload']);
    expect(summarizeTask(event)).toBe('started: t-1');
  });

  it('summarizes completed task', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'completed',
      taskId: 't-1',
      success: true,
    } as AgentEvent['payload']);
    expect(summarizeTask(event)).toBe('completed: t-1');
  });

  it('summarizes failed task', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'completed',
      taskId: 't-1',
      success: false,
    } as AgentEvent['payload']);
    expect(summarizeTask(event)).toBe('failed: t-1');
  });
});

// ============================================================================
// summarizeError
// ============================================================================

describe('summarizeError', () => {
  it('truncates long error messages', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'A very long error message that exceeds thirty characters',
      errorCode: 'ERR',
    } as AgentEvent['payload']);
    const result = summarizeError(event);
    expect(result).toContain('error:');
    expect(result.length).toBeLessThanOrEqual(37); // "error: " + 30 chars
  });

  it('returns empty for non-error', () => {
    const event = makeEvent({
      type: 'memory',
      operation: 'store',
      memoryType: 'belief',
    } as AgentEvent['payload']);
    expect(summarizeError(event)).toBe('');
  });
});

// ============================================================================
// summarizeEvent
// ============================================================================

describe('summarizeEvent', () => {
  it('delegates to state_change handler', () => {
    const event = makeEvent({
      type: 'state_change',
      previousState: 'idle',
      newState: 'executing',
    } as AgentEvent['payload']);
    expect(summarizeEvent(event)).toContain('→');
  });

  it('returns eventType for unknown payload type', () => {
    const event = makeEvent({ type: 'unknown_type' } as unknown as AgentEvent['payload'], 'custom');
    expect(summarizeEvent(event)).toBe('custom');
  });
});

// ============================================================================
// getEventSeverity
// ============================================================================

describe('getEventSeverity', () => {
  it('returns error for error events', () => {
    const event = makeEvent(
      { type: 'error', errorMessage: 'fail', errorCode: 'ERR' } as AgentEvent['payload'],
      'error'
    );
    expect(getEventSeverity(event)).toBe('error');
  });

  it('returns warning for failed tool', () => {
    const event = makeEvent(
      { type: 'tool', phase: 'completed', toolName: 'x', success: false } as AgentEvent['payload'],
      'tool'
    );
    expect(getEventSeverity(event)).toBe('warning');
  });

  it('returns warning for failed task', () => {
    const event = makeEvent(
      { type: 'task', phase: 'completed', taskId: 't', success: false } as AgentEvent['payload'],
      'task'
    );
    expect(getEventSeverity(event)).toBe('warning');
  });

  it('returns error for state_change to error state', () => {
    const event = makeEvent(
      {
        type: 'state_change',
        previousState: 'executing',
        newState: 'error',
      } as AgentEvent['payload'],
      'state_change'
    );
    expect(getEventSeverity(event)).toBe('error');
  });

  it('returns info for normal events', () => {
    const event = makeEvent(
      { type: 'memory', operation: 'store', memoryType: 'belief' } as AgentEvent['payload'],
      'memory'
    );
    expect(getEventSeverity(event)).toBe('info');
  });
});
