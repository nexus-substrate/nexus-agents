/**
 * State — Reducer tests.
 *
 * @module tui/state.test
 */

import { describe, it, expect } from 'vitest';
import { appReducer, INITIAL_STATE } from './state.js';
import type { AppState } from './state.js';

describe('appReducer', () => {
  it('ADD_OUTPUT appends a line', () => {
    const next = appReducer(INITIAL_STATE, { type: 'ADD_OUTPUT', text: 'hello', isError: false });
    expect(next.commandOutput).toHaveLength(1);
    expect(next.commandOutput[0]?.text).toBe('hello');
    expect(next.commandOutput[0]?.isError).toBe(false);
  });

  it('ADD_OUTPUT caps at 200 lines', () => {
    let state: AppState = INITIAL_STATE;
    for (let i = 0; i < 210; i++) {
      state = appReducer(state, { type: 'ADD_OUTPUT', text: `line ${String(i)}`, isError: false });
    }
    expect(state.commandOutput).toHaveLength(200);
  });

  it('ADD_HISTORY appends command', () => {
    const next = appReducer(INITIAL_STATE, { type: 'ADD_HISTORY', command: 'help' });
    expect(next.inputHistory).toEqual(['help']);
  });

  it('ADD_HISTORY caps at 100 entries', () => {
    let state: AppState = INITIAL_STATE;
    for (let i = 0; i < 110; i++) {
      state = appReducer(state, { type: 'ADD_HISTORY', command: `cmd ${String(i)}` });
    }
    expect(state.inputHistory).toHaveLength(100);
  });

  it('SET_FOCUS changes focused panel', () => {
    const next = appReducer(INITIAL_STATE, { type: 'SET_FOCUS', panel: 'output' });
    expect(next.focusedPanel).toBe('output');
  });

  it('TOGGLE_HELP toggles showHelp', () => {
    const s1 = appReducer(INITIAL_STATE, { type: 'TOGGLE_HELP' });
    expect(s1.showHelp).toBe(true);
    const s2 = appReducer(s1, { type: 'TOGGLE_HELP' });
    expect(s2.showHelp).toBe(false);
  });

  it('SET_LOADING sets loading flag', () => {
    const next = appReducer(INITIAL_STATE, { type: 'SET_LOADING', loading: true });
    expect(next.isLoading).toBe(true);
  });

  it('SET_ERROR sets error message', () => {
    const next = appReducer(INITIAL_STATE, { type: 'SET_ERROR', error: 'boom' });
    expect(next.error).toBe('boom');
  });

  it('CLEAR_OUTPUT empties output', () => {
    const withOutput = appReducer(INITIAL_STATE, { type: 'ADD_OUTPUT', text: 'x', isError: false });
    const cleared = appReducer(withOutput, { type: 'CLEAR_OUTPUT' });
    expect(cleared.commandOutput).toHaveLength(0);
  });
});
