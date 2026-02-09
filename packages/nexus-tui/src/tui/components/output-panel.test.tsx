/**
 * OutputPanel — Tests.
 *
 * @module tui/components/output-panel.test
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { OutputPanel } from './output-panel.js';
import { StateContext, INITIAL_STATE } from '../state.js';
import type { AppState, OutputLine } from '../state.js';

function renderWithState(state: AppState, focused: boolean): ReturnType<typeof render> {
  return render(
    <StateContext.Provider value={state}>
      <OutputPanel focused={focused} />
    </StateContext.Provider>
  );
}

describe('OutputPanel', () => {
  it('shows empty state message', () => {
    const { lastFrame } = renderWithState(INITIAL_STATE, false);
    expect(lastFrame()).toContain('No output yet');
  });

  it('renders output lines', () => {
    const lines: OutputLine[] = [{ text: 'hello world', isError: false, timestamp: 1 }];
    const state: AppState = { ...INITIAL_STATE, commandOutput: lines };
    const { lastFrame } = renderWithState(state, false);
    expect(lastFrame()).toContain('hello world');
  });

  it('renders error lines', () => {
    const lines: OutputLine[] = [{ text: 'something failed', isError: true, timestamp: 1 }];
    const state: AppState = { ...INITIAL_STATE, commandOutput: lines };
    const { lastFrame } = renderWithState(state, false);
    expect(lastFrame()).toContain('something failed');
  });

  it('shows panel title', () => {
    const { lastFrame } = renderWithState(INITIAL_STATE, true);
    expect(lastFrame()).toContain('Output');
  });
});
