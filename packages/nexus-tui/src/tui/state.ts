/**
 * TUI State — Application state type and React context.
 *
 * Minimal state container for the Ink-based TUI. Panels read from
 * this state; only the App root and hooks write to it.
 *
 * @module tui/state
 */

import { createContext, useContext } from 'react';

/** A single line of command output. */
export interface OutputLine {
  readonly text: string;
  readonly isError: boolean;
  readonly timestamp: number;
}

/** Application state for the TUI. */
export interface AppState {
  readonly commandOutput: readonly OutputLine[];
  readonly inputHistory: readonly string[];
  readonly focusedPanel: PanelId;
  readonly showHelp: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
}

/** Identifiers for focusable panels. */
export type PanelId = 'command' | 'output' | 'agents' | 'weather';

/** Actions that can mutate state. */
export type AppAction =
  | { type: 'ADD_OUTPUT'; text: string; isError: boolean }
  | { type: 'ADD_HISTORY'; command: string }
  | { type: 'SET_FOCUS'; panel: PanelId }
  | { type: 'TOGGLE_HELP' }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'CLEAR_OUTPUT' };

/** Reduce state transitions. */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_OUTPUT':
      return {
        ...state,
        commandOutput: [
          ...state.commandOutput.slice(-199),
          { text: action.text, isError: action.isError, timestamp: Date.now() },
        ],
      };
    case 'ADD_HISTORY':
      return { ...state, inputHistory: [...state.inputHistory.slice(-99), action.command] };
    case 'SET_FOCUS':
      return { ...state, focusedPanel: action.panel };
    case 'TOGGLE_HELP':
      return { ...state, showHelp: !state.showHelp };
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'CLEAR_OUTPUT':
      return { ...state, commandOutput: [] };
  }
}

/** Initial application state. */
export const INITIAL_STATE: AppState = {
  commandOutput: [],
  inputHistory: [],
  focusedPanel: 'command',
  showHelp: false,
  isLoading: false,
  error: null,
};

/** Dispatch context for state mutations. */
export const DispatchContext = createContext<React.Dispatch<AppAction>>(() => {
  /* noop default */
});

/** State context for reading current state. */
export const StateContext = createContext<AppState>(INITIAL_STATE);

/** Hook to read current app state. */
export function useAppState(): AppState {
  return useContext(StateContext);
}

/** Hook to get the dispatch function. */
export function useDispatch(): React.Dispatch<AppAction> {
  return useContext(DispatchContext);
}
