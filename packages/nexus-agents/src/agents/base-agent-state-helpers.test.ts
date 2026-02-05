/**
 * Tests for BaseAgent State Helpers
 * @module agents/base-agent-state-helpers.test
 */

/* eslint-disable @typescript-eslint/no-deprecated -- testing deprecated function */

import { describe, it, expect, vi } from 'vitest';
import type { AgentState } from '../core/index.js';
import { performLegacyStateTransition, type SetStateParams } from './base-agent-state-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockStateMachine(currentState: AgentState = 'idle') {
  return {
    state: currentState,
    forceError: vi.fn(),
    canTransition: vi.fn(() => true),
    transition: vi.fn((): { ok: boolean; value?: undefined; error?: Error } => ({
      ok: true,
      value: undefined,
    })),
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// ============================================================================
// performLegacyStateTransition
// ============================================================================

describe('performLegacyStateTransition', () => {
  it('calls forceError when newState is error', () => {
    const sm = makeMockStateMachine('acting');
    const logger = makeMockLogger();
    performLegacyStateTransition({
      stateMachine: sm,
      logger,
      newState: 'error',
    } as unknown as SetStateParams);
    expect(sm.forceError).toHaveBeenCalledWith({ reason: 'setState called with error' });
    expect(sm.transition).not.toHaveBeenCalled();
  });

  it('transitions via mapped event for idle->thinking', () => {
    const sm = makeMockStateMachine('idle');
    const logger = makeMockLogger();
    performLegacyStateTransition({
      stateMachine: sm,
      logger,
      newState: 'thinking',
    } as unknown as SetStateParams);
    expect(sm.canTransition).toHaveBeenCalledWith('task_assigned');
    expect(sm.transition).toHaveBeenCalledWith('task_assigned');
  });

  it('transitions via mapped event for thinking->acting', () => {
    const sm = makeMockStateMachine('thinking');
    const logger = makeMockLogger();
    performLegacyStateTransition({
      stateMachine: sm,
      logger,
      newState: 'acting',
    } as unknown as SetStateParams);
    expect(sm.transition).toHaveBeenCalledWith('plan_completed');
  });

  it('transitions via mapped event for acting->idle', () => {
    const sm = makeMockStateMachine('acting');
    const logger = makeMockLogger();
    performLegacyStateTransition({
      stateMachine: sm,
      logger,
      newState: 'idle',
    } as unknown as SetStateParams);
    expect(sm.transition).toHaveBeenCalledWith('task_completed');
  });

  it('transitions via mapped event for error->idle (recovered)', () => {
    const sm = makeMockStateMachine('error');
    const logger = makeMockLogger();
    performLegacyStateTransition({
      stateMachine: sm,
      logger,
      newState: 'idle',
    } as unknown as SetStateParams);
    expect(sm.transition).toHaveBeenCalledWith('recovered');
  });

  it('logs warning when transition fails', () => {
    const sm = makeMockStateMachine('idle');
    sm.transition.mockReturnValue({ ok: false, error: new Error('Invalid transition') });
    const logger = makeMockLogger();
    performLegacyStateTransition({
      stateMachine: sm,
      logger,
      newState: 'thinking',
    } as unknown as SetStateParams);
    expect(logger.warn).toHaveBeenCalledWith(
      'State transition failed',
      expect.objectContaining({ from: 'idle', to: 'thinking' })
    );
  });

  it('skips transition when canTransition returns false', () => {
    const sm = makeMockStateMachine('idle');
    sm.canTransition.mockReturnValue(false);
    const logger = makeMockLogger();
    performLegacyStateTransition({
      stateMachine: sm,
      logger,
      newState: 'thinking',
    } as unknown as SetStateParams);
    expect(sm.transition).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
  });

  it('logs debug for unmapped state change', () => {
    const sm = makeMockStateMachine('idle');
    const logger = makeMockLogger();
    // idle -> waiting has no mapping
    performLegacyStateTransition({
      stateMachine: sm,
      logger,
      newState: 'waiting',
    } as unknown as SetStateParams);
    expect(sm.transition).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Unmapped state change (legacy)',
      expect.objectContaining({ from: 'idle', to: 'waiting' })
    );
  });

  it('does nothing for same state (no mapping, same state)', () => {
    const sm = makeMockStateMachine('idle');
    const logger = makeMockLogger();
    performLegacyStateTransition({
      stateMachine: sm,
      logger,
      newState: 'idle',
    } as unknown as SetStateParams);
    expect(sm.transition).not.toHaveBeenCalled();
    // Should not log debug for same state
    expect(logger.debug).not.toHaveBeenCalled();
  });
});
