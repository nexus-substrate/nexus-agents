/**
 * nexus-agents/agents - BaseAgent State Helpers
 *
 * Helper functions for state management in BaseAgent.
 * Extracted to reduce file size in base-agent.ts.
 */

import type { ILogger, AgentState } from '../core/index.js';
import type { AgentStateMachine } from './state-machine.js';
import { mapStatesToEvent } from './state-machine-types.js';

/** Parameters for legacy setState operation. */
export interface SetStateParams {
  stateMachine: AgentStateMachine;
  logger: ILogger;
  newState: AgentState;
}

/**
 * Attempts a state transition using the state machine.
 * Maps legacy state names to state machine events for backward compatibility.
 * @deprecated Use stateMachine.transition() directly for new code
 */
export function performLegacyStateTransition(params: SetStateParams): void {
  const { stateMachine, logger, newState } = params;
  const currentState = stateMachine.state;

  if (newState === 'error') {
    stateMachine.forceError({ reason: 'setState called with error' });
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
    logger.debug('Unmapped state change (legacy)', { from: currentState, to: newState });
  }
}
