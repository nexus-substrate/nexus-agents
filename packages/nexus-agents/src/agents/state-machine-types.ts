/**
 * nexus-agents/agents - Agent State Machine Types
 *
 * Type definitions and transition configuration for AgentStateMachine.
 *
 * (Source: Nexus Agents CLAUDE.md, Agent State Machine Design)
 */

import type { AgentState } from '../core/index.js';
import type { AgentError } from '../core/index.js';

/**
 * State transition event types.
 */
export type StateTransitionEvent =
  | 'task_assigned'
  | 'plan_completed'
  | 'needs_input'
  | 'task_completed'
  | 'failure'
  | 'input_received'
  | 'recovered';

/**
 * State transition metadata.
 */
export interface StateTransition {
  /** Previous state */
  from: AgentState;
  /** New state */
  to: AgentState;
  /** Event that triggered the transition */
  event: StateTransitionEvent;
  /** Timestamp of the transition */
  timestamp: string;
  /** Optional context data */
  context?: Record<string, unknown>;
}

/**
 * Callback for state change events.
 */
export type StateChangeCallback = (transition: StateTransition) => void;

/**
 * Error callback for invalid transitions.
 */
export type TransitionErrorCallback = (
  currentState: AgentState,
  attemptedEvent: StateTransitionEvent,
  error: AgentError
) => void;

/**
 * State machine options.
 */
export interface StateMachineOptions {
  /** Initial state (defaults to 'idle') */
  initialState?: AgentState;
  /** Maximum error count before permanent error state */
  maxErrorCount?: number;
  /** Enable transition history tracking */
  trackHistory?: boolean;
  /** Maximum history entries to keep */
  maxHistorySize?: number;
}

/**
 * Valid state transitions map.
 * Maps (currentState, event) -> nextState
 */
export const VALID_TRANSITIONS: ReadonlyMap<
  AgentState,
  ReadonlyMap<StateTransitionEvent, AgentState>
> = new Map([
  ['idle', new Map<StateTransitionEvent, AgentState>([['task_assigned', 'thinking']])],
  [
    'thinking',
    new Map<StateTransitionEvent, AgentState>([
      ['plan_completed', 'acting'],
      ['needs_input', 'waiting'],
      ['failure', 'error'],
    ]),
  ],
  [
    'acting',
    new Map<StateTransitionEvent, AgentState>([
      ['task_completed', 'idle'],
      ['failure', 'error'],
      ['needs_input', 'waiting'],
    ]),
  ],
  [
    'waiting',
    new Map<StateTransitionEvent, AgentState>([
      ['input_received', 'thinking'],
      ['failure', 'error'],
    ]),
  ],
  ['error', new Map<StateTransitionEvent, AgentState>([['recovered', 'idle']])],
]);

/**
 * Maps a current/target state pair to the appropriate state machine event.
 * Used for legacy backward compatibility with setState().
 *
 * @param from Current state
 * @param to Target state
 * @returns The event to trigger, or undefined if no mapping exists
 */
export function mapStatesToEvent(
  from: AgentState,
  to: AgentState
): StateTransitionEvent | undefined {
  if (from === 'idle' && to === 'thinking') return 'task_assigned';
  if (from === 'thinking' && to === 'acting') return 'plan_completed';
  if (from === 'acting' && to === 'idle') return 'task_completed';
  if (from === 'error' && to === 'idle') return 'recovered';
  if (to === 'error') return 'failure';
  return undefined;
}
