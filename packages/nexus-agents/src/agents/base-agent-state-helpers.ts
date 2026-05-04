/**
 * nexus-agents/agents - BaseAgent State Helpers
 *
 * Helper functions for state management in BaseAgent.
 * Extracted to reduce file size in base-agent.ts.
 */

import type { ILogger, AgentState } from '../core/index.js';
import type { AgentStateMachine } from './state-machine.js';
import { mapStatesToEvent } from './state-machine-types.js';

/** Parameters for transitioning to a target state. */
export interface SetStateParams {
  stateMachine: AgentStateMachine;
  logger: ILogger;
  newState: AgentState;
}

/**
 * Transition the state machine to a target state by deriving the
 * appropriate event from (current → target). Used by BaseAgent's
 * internal lifecycle hooks where the call site knows the target
 * state but not the underlying event name.
 *
 * For state machines with explicit event names known at the call
 * site, prefer `stateMachine.transition(event)` directly.
 */
export function transitionToState(params: SetStateParams): void {
  const { stateMachine, logger, newState } = params;
  const currentState = stateMachine.state;

  if (newState === 'error') {
    stateMachine.forceError({ reason: 'transitionToState called with error' });
    return;
  }

  const event = mapStatesToEvent(currentState, newState);
  if (event !== undefined && stateMachine.canTransition(event)) {
    const result = stateMachine.transition(event);
    if (!result.ok) {
      logger.warn('State transition failed', {
        from: currentState,
        to: newState,
        event,
        error: result.error.message,
      });
    }
  } else if (currentState !== newState) {
    logger.debug('Unmapped state change', { from: currentState, to: newState });
  }
}
