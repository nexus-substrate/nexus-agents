/**
 * Tests for Self-Development Workflow Engine Helpers
 * @module workflows/self-development/engine-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { SelfDevWorkflowState, WorkflowPhase } from './types.js';
import type { WorkflowEvent } from './interfaces.js';
import { emitEvent, getPhase, updateStatus } from './engine-helpers.js';

// ============================================================================
// emitEvent
// ============================================================================

describe('emitEvent', () => {
  it('calls all listeners with the event', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const event: WorkflowEvent = {
      type: 'phase_started',
      phase: 'analyze',
      timestamp: '2026-01-01T00:00:00Z',
    };
    emitEvent([listener1, listener2], event);
    expect(listener1).toHaveBeenCalledWith(event);
    expect(listener2).toHaveBeenCalledWith(event);
  });

  it('handles empty listeners array', () => {
    const event: WorkflowEvent = {
      type: 'phase_started',
      phase: 'analyze',
      timestamp: '2026-01-01T00:00:00Z',
    };
    expect(() => {
      emitEvent([], event);
    }).not.toThrow();
  });

  it('continues after listener throws', () => {
    const listener1 = vi.fn(() => {
      throw new Error('listener error');
    });
    const listener2 = vi.fn();
    const event: WorkflowEvent = {
      type: 'workflow_completed',
      timestamp: '2026-01-01T00:00:00Z',
    };
    emitEvent([listener1, listener2], event);
    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });
});

// ============================================================================
// getPhase
// ============================================================================

describe('getPhase', () => {
  it('returns phase for existing execution', () => {
    const states = new Map<string, SelfDevWorkflowState>();
    states.set('exec-1', {
      currentPhase: 'implement' as WorkflowPhase,
    } as SelfDevWorkflowState);
    expect(getPhase(states, 'exec-1')).toBe('implement');
  });

  it('returns undefined for missing execution', () => {
    const states = new Map<string, SelfDevWorkflowState>();
    expect(getPhase(states, 'missing')).toBeUndefined();
  });
});

// ============================================================================
// updateStatus
// ============================================================================

describe('updateStatus', () => {
  it('updates status for existing execution', () => {
    const states = new Map<string, SelfDevWorkflowState>();
    const state = {
      status: 'running',
      currentPhase: 'analyze',
    } as SelfDevWorkflowState;
    states.set('exec-1', state);

    updateStatus(states, 'exec-1', 'completed');
    expect(states.get('exec-1')?.status).toBe('completed');
  });

  it('does nothing for missing execution', () => {
    const states = new Map<string, SelfDevWorkflowState>();
    updateStatus(states, 'missing', 'failed');
    expect(states.size).toBe(0);
  });

  it('creates a new state object (immutable update)', () => {
    const states = new Map<string, SelfDevWorkflowState>();
    const original = {
      status: 'running',
      currentPhase: 'analyze',
    } as SelfDevWorkflowState;
    states.set('exec-1', original);

    updateStatus(states, 'exec-1', 'completed');
    const updated = states.get('exec-1');
    expect(updated).not.toBe(original);
    expect(original.status).toBe('running');
  });
});
