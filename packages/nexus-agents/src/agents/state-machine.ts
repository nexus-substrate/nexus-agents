/**
 * nexus-agents/agents - Agent State Machine
 *
 * Manages agent state transitions with validation, events, and error recovery.
 *
 * States:
 * - idle: Agent is ready for tasks
 * - thinking: Agent is analyzing/planning
 * - acting: Agent is performing work
 * - waiting: Agent is waiting for input/response
 * - error: Agent encountered an error
 *
 * (Source: Nexus Agents CLAUDE.md, Agent State Machine Design)
 */

import type { AgentState } from '../core/index.js';
import { type Result, ok, err, AgentError, getTimeProvider } from '../core/index.js';
import {
  type StateTransitionEvent,
  type StateTransition,
  type StateChangeCallback,
  type TransitionErrorCallback,
  type StateMachineOptions,
  VALID_TRANSITIONS,
} from './state-machine-types.js';

// Re-export types for backward compatibility
export type {
  StateTransitionEvent,
  StateTransition,
  StateChangeCallback,
  TransitionErrorCallback,
  StateMachineOptions,
} from './state-machine-types.js';

/**
 * Agent State Machine.
 *
 * Manages agent lifecycle states with validation, event callbacks,
 * and error recovery mechanisms.
 */
export class AgentStateMachine {
  private currentState: AgentState;
  private readonly stateChangeCallbacks: Set<StateChangeCallback> = new Set();
  private readonly errorCallbacks: Set<TransitionErrorCallback> = new Set();
  private readonly history: StateTransition[] = [];
  private errorCount = 0;

  private readonly maxErrorCount: number;
  private readonly trackHistory: boolean;
  private readonly maxHistorySize: number;

  constructor(options: StateMachineOptions = {}) {
    this.currentState = options.initialState ?? 'idle';
    this.maxErrorCount = options.maxErrorCount ?? 3;
    this.trackHistory = options.trackHistory ?? true;
    this.maxHistorySize = options.maxHistorySize ?? 100;
  }

  /**
   * Gets the current state.
   */
  get state(): AgentState {
    return this.currentState;
  }

  /**
   * Gets the transition history.
   */
  get transitionHistory(): readonly StateTransition[] {
    return this.history;
  }

  /**
   * Gets the current error count.
   */
  get errors(): number {
    return this.errorCount;
  }

  /**
   * Checks if a transition is valid from the current state.
   */
  canTransition(event: StateTransitionEvent): boolean {
    const stateTransitions = VALID_TRANSITIONS.get(this.currentState);
    return stateTransitions?.has(event) ?? false;
  }

  /**
   * Gets the next state for an event, if valid.
   */
  getNextState(event: StateTransitionEvent): AgentState | undefined {
    const stateTransitions = VALID_TRANSITIONS.get(this.currentState);
    return stateTransitions?.get(event);
  }

  /**
   * Gets all valid events from the current state.
   */
  getValidEvents(): StateTransitionEvent[] {
    const stateTransitions = VALID_TRANSITIONS.get(this.currentState);
    return stateTransitions ? Array.from(stateTransitions.keys()) : [];
  }

  /**
   * Attempts a state transition.
   *
   * @param event - The event triggering the transition
   * @param context - Optional context data for the transition
   * @returns Result with the new state or an AgentError
   */
  transition(
    event: StateTransitionEvent,
    context?: Record<string, unknown>
  ): Result<AgentState, AgentError> {
    const nextState = this.getNextState(event);

    if (nextState === undefined) {
      const error = new AgentError(
        `Invalid transition: cannot apply event '${event}' in state '${this.currentState}'`,
        {
          context: {
            currentState: this.currentState,
            event,
            validEvents: this.getValidEvents(),
          },
        }
      );

      this.notifyErrorCallbacks(this.currentState, event, error);
      return err(error);
    }

    const transition = this.createTransition(nextState, event, context);
    this.applyTransition(transition);

    return ok(this.currentState);
  }

  /**
   * Forces a transition to the error state.
   * Use for unrecoverable errors that should bypass normal transition rules.
   *
   * @param context - Optional context data about the error
   */
  forceError(context?: Record<string, unknown>): void {
    if (this.currentState === 'error') {
      return;
    }

    const transition = this.createTransition('error', 'failure', context);
    this.applyTransition(transition);
  }

  /**
   * Attempts recovery from the error state.
   *
   * @param context - Optional context data about the recovery
   * @returns Result with the new state or an AgentError if recovery failed
   */
  recover(context?: Record<string, unknown>): Result<AgentState, AgentError> {
    if (this.currentState !== 'error') {
      return err(
        new AgentError(
          `Cannot recover: agent is not in error state (current: ${this.currentState})`,
          {
            context: { currentState: this.currentState },
          }
        )
      );
    }

    if (this.errorCount >= this.maxErrorCount) {
      return err(
        new AgentError(
          `Recovery failed: maximum error count (${String(this.maxErrorCount)}) exceeded`,
          {
            context: { errorCount: this.errorCount, maxErrorCount: this.maxErrorCount },
          }
        )
      );
    }

    return this.transition('recovered', context);
  }

  /**
   * Resets the error count. Call after successful task completion.
   */
  resetErrorCount(): void {
    this.errorCount = 0;
  }

  /**
   * Resets the state machine to its initial state.
   *
   * @param clearHistory - Whether to clear the transition history
   */
  reset(clearHistory = false): void {
    this.currentState = 'idle';
    this.errorCount = 0;
    if (clearHistory) {
      this.history.length = 0;
    }
  }

  /**
   * Subscribes to state change events.
   *
   * @param callback - Callback to invoke on state changes
   * @returns Unsubscribe function
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  /**
   * Subscribes to transition error events.
   *
   * @param callback - Callback to invoke on transition errors
   * @returns Unsubscribe function
   */
  onTransitionError(callback: TransitionErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }

  /**
   * Checks if the agent is in a state where it can accept new tasks.
   */
  isAvailable(): boolean {
    return this.currentState === 'idle';
  }

  /**
   * Checks if the agent is currently working.
   */
  isWorking(): boolean {
    return this.currentState === 'thinking' || this.currentState === 'acting';
  }

  /**
   * Checks if the agent is in an error state.
   */
  hasError(): boolean {
    return this.currentState === 'error';
  }

  private createTransition(
    to: AgentState,
    event: StateTransitionEvent,
    context?: Record<string, unknown>
  ): StateTransition {
    const transition: StateTransition = {
      from: this.currentState,
      to,
      event,
      timestamp: new Date(getTimeProvider().now()).toISOString(),
    };
    if (context !== undefined) {
      transition.context = context;
    }
    return transition;
  }

  private applyTransition(transition: StateTransition): void {
    const previousState = this.currentState;
    this.currentState = transition.to;

    // Track error count
    if (transition.to === 'error') {
      this.errorCount++;
    }

    // Record history
    if (this.trackHistory) {
      this.history.push(transition);
      this.pruneHistory();
    }

    // Notify callbacks
    this.notifyStateChangeCallbacks(transition);

    // Reset error count on successful task completion
    if (previousState === 'acting' && transition.to === 'idle') {
      this.resetErrorCount();
    }
  }

  private pruneHistory(): void {
    if (this.history.length > this.maxHistorySize) {
      const excess = this.history.length - this.maxHistorySize;
      this.history.splice(0, excess);
    }
  }

  private notifyStateChangeCallbacks(transition: StateTransition): void {
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(transition);
      } catch {
        // Silently ignore callback errors to prevent cascading failures
      }
    }
  }

  private notifyErrorCallbacks(
    currentState: AgentState,
    event: StateTransitionEvent,
    error: AgentError
  ): void {
    for (const callback of this.errorCallbacks) {
      try {
        callback(currentState, event, error);
      } catch {
        // Silently ignore callback errors
      }
    }
  }
}

/**
 * Creates a new agent state machine.
 *
 * @param options - State machine options
 * @returns A new AgentStateMachine instance
 */
export function createStateMachine(options?: StateMachineOptions): AgentStateMachine {
  return new AgentStateMachine(options);
}
