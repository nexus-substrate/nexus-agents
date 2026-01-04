/**
 * @nexus-agents/agents - Agent State Machine Tests
 *
 * Tests all state transitions, callbacks, error handling, and recovery.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentStateMachine, createStateMachine, type StateTransition } from './state-machine.js';

describe('AgentStateMachine', () => {
  let machine: AgentStateMachine;

  beforeEach(() => {
    machine = new AgentStateMachine();
  });

  describe('initialization', () => {
    it('should start in idle state by default', () => {
      expect(machine.state).toBe('idle');
    });

    it('should accept custom initial state', () => {
      const customMachine = new AgentStateMachine({ initialState: 'thinking' });
      expect(customMachine.state).toBe('thinking');
    });

    it('should have zero error count initially', () => {
      expect(machine.errors).toBe(0);
    });

    it('should have empty transition history initially', () => {
      expect(machine.transitionHistory).toHaveLength(0);
    });
  });

  describe('valid transitions', () => {
    it('should transition from idle to thinking on task_assigned', () => {
      const result = machine.transition('task_assigned');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('thinking');
      }
      expect(machine.state).toBe('thinking');
    });

    it('should transition from thinking to acting on plan_completed', () => {
      machine.transition('task_assigned');
      const result = machine.transition('plan_completed');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('acting');
      }
      expect(machine.state).toBe('acting');
    });

    it('should transition from thinking to waiting on needs_input', () => {
      machine.transition('task_assigned');
      const result = machine.transition('needs_input');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('waiting');
      }
      expect(machine.state).toBe('waiting');
    });

    it('should transition from acting to idle on task_completed', () => {
      machine.transition('task_assigned');
      machine.transition('plan_completed');
      const result = machine.transition('task_completed');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('idle');
      }
      expect(machine.state).toBe('idle');
    });

    it('should transition from acting to error on failure', () => {
      machine.transition('task_assigned');
      machine.transition('plan_completed');
      const result = machine.transition('failure');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('error');
      }
      expect(machine.state).toBe('error');
    });

    it('should transition from waiting to thinking on input_received', () => {
      machine.transition('task_assigned');
      machine.transition('needs_input');
      const result = machine.transition('input_received');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('thinking');
      }
      expect(machine.state).toBe('thinking');
    });

    it('should transition from error to idle on recovered', () => {
      machine.transition('task_assigned');
      machine.transition('failure');
      const result = machine.transition('recovered');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('idle');
      }
      expect(machine.state).toBe('idle');
    });

    it('should transition from acting to waiting on needs_input', () => {
      machine.transition('task_assigned');
      machine.transition('plan_completed');
      const result = machine.transition('needs_input');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('waiting');
      }
      expect(machine.state).toBe('waiting');
    });

    it('should transition from thinking to error on failure', () => {
      machine.transition('task_assigned');
      const result = machine.transition('failure');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('error');
      }
      expect(machine.state).toBe('error');
    });

    it('should transition from waiting to error on failure', () => {
      machine.transition('task_assigned');
      machine.transition('needs_input');
      const result = machine.transition('failure');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('error');
      }
      expect(machine.state).toBe('error');
    });
  });

  describe('invalid transitions', () => {
    it('should reject invalid transition from idle', () => {
      const result = machine.transition('plan_completed');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid transition');
        expect(result.error.message).toContain('plan_completed');
        expect(result.error.message).toContain('idle');
      }
      expect(machine.state).toBe('idle');
    });

    it('should reject recovered event when not in error state', () => {
      const result = machine.transition('recovered');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid transition');
      }
      expect(machine.state).toBe('idle');
    });

    it('should reject task_assigned when not in idle state', () => {
      machine.transition('task_assigned');
      const result = machine.transition('task_assigned');
      expect(result.ok).toBe(false);
      expect(machine.state).toBe('thinking');
    });

    it('should reject task_completed when not in acting state', () => {
      machine.transition('task_assigned');
      const result = machine.transition('task_completed');
      expect(result.ok).toBe(false);
      expect(machine.state).toBe('thinking');
    });
  });

  describe('canTransition', () => {
    it('should return true for valid transitions', () => {
      expect(machine.canTransition('task_assigned')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(machine.canTransition('plan_completed')).toBe(false);
      expect(machine.canTransition('recovered')).toBe(false);
    });

    it('should reflect current state', () => {
      machine.transition('task_assigned');
      expect(machine.canTransition('task_assigned')).toBe(false);
      expect(machine.canTransition('plan_completed')).toBe(true);
      expect(machine.canTransition('needs_input')).toBe(true);
    });
  });

  describe('getValidEvents', () => {
    it('should return valid events for idle state', () => {
      const events = machine.getValidEvents();
      expect(events).toEqual(['task_assigned']);
    });

    it('should return valid events for thinking state', () => {
      machine.transition('task_assigned');
      const events = machine.getValidEvents();
      expect(events).toContain('plan_completed');
      expect(events).toContain('needs_input');
      expect(events).toContain('failure');
    });

    it('should return valid events for acting state', () => {
      machine.transition('task_assigned');
      machine.transition('plan_completed');
      const events = machine.getValidEvents();
      expect(events).toContain('task_completed');
      expect(events).toContain('failure');
      expect(events).toContain('needs_input');
    });

    it('should return valid events for error state', () => {
      machine.transition('task_assigned');
      machine.transition('failure');
      const events = machine.getValidEvents();
      expect(events).toEqual(['recovered']);
    });
  });

  describe('state change callbacks', () => {
    it('should invoke callback on state change', () => {
      const callback = vi.fn();
      machine.onStateChange(callback);

      machine.transition('task_assigned');

      expect(callback).toHaveBeenCalledTimes(1);
      const call = callback.mock.calls[0];
      if (call === undefined) {
        throw new Error('Expected callback to be called');
      }
      const transition = call[0] as StateTransition;
      expect(transition.from).toBe('idle');
      expect(transition.to).toBe('thinking');
      expect(transition.event).toBe('task_assigned');
    });

    it('should include context in callback', () => {
      const callback = vi.fn();
      machine.onStateChange(callback);

      const context = { taskId: 'test-123' };
      machine.transition('task_assigned', context);

      const call = callback.mock.calls[0];
      if (call === undefined) {
        throw new Error('Expected callback to be called');
      }
      const transition = call[0] as StateTransition;
      expect(transition.context).toEqual(context);
    });

    it('should support multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      machine.onStateChange(callback1);
      machine.onStateChange(callback2);

      machine.transition('task_assigned');

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscribing', () => {
      const callback = vi.fn();
      const unsubscribe = machine.onStateChange(callback);

      machine.transition('task_assigned');
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      machine.transition('plan_completed');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = vi.fn();

      machine.onStateChange(errorCallback);
      machine.onStateChange(normalCallback);

      // Should not throw
      machine.transition('task_assigned');

      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('transition error callbacks', () => {
    it('should invoke error callback on invalid transition', () => {
      const errorCallback = vi.fn();
      machine.onTransitionError(errorCallback);

      machine.transition('plan_completed');

      expect(errorCallback).toHaveBeenCalledTimes(1);
      const [state, event, error] = errorCallback.mock.calls[0] as [string, string, Error];
      expect(state).toBe('idle');
      expect(event).toBe('plan_completed');
      expect(error.message).toContain('Invalid transition');
    });

    it('should allow unsubscribing from error callbacks', () => {
      const errorCallback = vi.fn();
      const unsubscribe = machine.onTransitionError(errorCallback);

      machine.transition('plan_completed');
      expect(errorCallback).toHaveBeenCalledTimes(1);

      unsubscribe();

      machine.transition('task_completed');
      expect(errorCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling and recovery', () => {
    it('should increment error count on transition to error state', () => {
      machine.transition('task_assigned');
      machine.transition('failure');
      expect(machine.errors).toBe(1);
    });

    it('should allow recovery from error state', () => {
      machine.transition('task_assigned');
      machine.transition('failure');

      const result = machine.recover();
      expect(result.ok).toBe(true);
      expect(machine.state).toBe('idle');
    });

    it('should reject recovery when not in error state', () => {
      const result = machine.recover();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not in error state');
      }
    });

    it('should reject recovery when max error count exceeded', () => {
      const limitedMachine = new AgentStateMachine({ maxErrorCount: 2 });

      // First error cycle
      limitedMachine.transition('task_assigned');
      limitedMachine.transition('failure');
      limitedMachine.recover();

      // Second error cycle
      limitedMachine.transition('task_assigned');
      limitedMachine.transition('failure');
      limitedMachine.recover();

      // Third error - should exceed max
      limitedMachine.transition('task_assigned');
      limitedMachine.transition('failure');

      const result = limitedMachine.recover();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('maximum error count');
      }
    });

    it('should reset error count on successful task completion', () => {
      machine.transition('task_assigned');
      machine.transition('failure');
      expect(machine.errors).toBe(1);

      machine.recover();
      machine.transition('task_assigned');
      machine.transition('plan_completed');
      machine.transition('task_completed');

      expect(machine.errors).toBe(0);
    });

    it('should support forceError for unrecoverable errors', () => {
      machine.transition('task_assigned');
      machine.forceError({ reason: 'critical failure' });

      expect(machine.state).toBe('error');
      expect(machine.errors).toBe(1);
    });

    it('should be idempotent when already in error state', () => {
      machine.transition('task_assigned');
      machine.transition('failure');
      expect(machine.errors).toBe(1);

      machine.forceError();
      expect(machine.errors).toBe(1);
    });

    it('should include recovery context', () => {
      const callback = vi.fn();
      machine.onStateChange(callback);

      machine.transition('task_assigned');
      machine.transition('failure');

      const context = { recoveryReason: 'user-requested' };
      machine.recover(context);

      const lastCall = callback.mock.calls[callback.mock.calls.length - 1];
      if (lastCall === undefined) {
        throw new Error('Expected callback to be called');
      }
      const transition = lastCall[0] as StateTransition;
      expect(transition.context).toEqual(context);
    });
  });

  describe('transition history', () => {
    it('should track transition history', () => {
      machine.transition('task_assigned');
      machine.transition('plan_completed');

      expect(machine.transitionHistory).toHaveLength(2);
      const first = machine.transitionHistory[0];
      const second = machine.transitionHistory[1];
      if (first === undefined || second === undefined) {
        throw new Error('Expected history entries');
      }
      expect(first.from).toBe('idle');
      expect(first.to).toBe('thinking');
      expect(second.from).toBe('thinking');
      expect(second.to).toBe('acting');
    });

    it('should include timestamps in history', () => {
      machine.transition('task_assigned');

      const entry = machine.transitionHistory[0];
      if (entry === undefined) {
        throw new Error('Expected history entry');
      }
      expect(entry.timestamp).toBeDefined();
      expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
    });

    it('should prune history when exceeding max size', () => {
      const smallMachine = new AgentStateMachine({ maxHistorySize: 3 });

      // Cycle through states multiple times
      for (let i = 0; i < 5; i++) {
        smallMachine.transition('task_assigned');
        smallMachine.transition('plan_completed');
        smallMachine.transition('task_completed');
      }

      expect(smallMachine.transitionHistory.length).toBe(3);
    });

    it('should not track history when disabled', () => {
      const noHistoryMachine = new AgentStateMachine({ trackHistory: false });

      noHistoryMachine.transition('task_assigned');
      noHistoryMachine.transition('plan_completed');

      expect(noHistoryMachine.transitionHistory).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('should reset to idle state', () => {
      machine.transition('task_assigned');
      machine.transition('plan_completed');
      machine.reset();

      expect(machine.state).toBe('idle');
    });

    it('should reset error count', () => {
      machine.transition('task_assigned');
      machine.transition('failure');
      machine.reset();

      expect(machine.errors).toBe(0);
    });

    it('should preserve history by default', () => {
      machine.transition('task_assigned');
      machine.reset();

      expect(machine.transitionHistory).toHaveLength(1);
    });

    it('should clear history when requested', () => {
      machine.transition('task_assigned');
      machine.reset(true);

      expect(machine.transitionHistory).toHaveLength(0);
    });
  });

  describe('helper methods', () => {
    it('should correctly report availability', () => {
      expect(machine.isAvailable()).toBe(true);

      machine.transition('task_assigned');
      expect(machine.isAvailable()).toBe(false);

      machine.transition('plan_completed');
      machine.transition('task_completed');
      expect(machine.isAvailable()).toBe(true);
    });

    it('should correctly report working status', () => {
      expect(machine.isWorking()).toBe(false);

      machine.transition('task_assigned');
      expect(machine.isWorking()).toBe(true);

      machine.transition('plan_completed');
      expect(machine.isWorking()).toBe(true);

      machine.transition('task_completed');
      expect(machine.isWorking()).toBe(false);
    });

    it('should correctly report error status', () => {
      expect(machine.hasError()).toBe(false);

      machine.transition('task_assigned');
      machine.transition('failure');
      expect(machine.hasError()).toBe(true);

      machine.recover();
      expect(machine.hasError()).toBe(false);
    });
  });

  describe('createStateMachine factory', () => {
    it('should create a new state machine', () => {
      const created = createStateMachine();
      expect(created).toBeInstanceOf(AgentStateMachine);
      expect(created.state).toBe('idle');
    });

    it('should pass options to constructor', () => {
      const created = createStateMachine({ initialState: 'thinking' });
      expect(created.state).toBe('thinking');
    });
  });
});
