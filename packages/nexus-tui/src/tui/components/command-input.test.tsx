/**
 * CommandInput — Rendering and input tests.
 *
 * @module tui/components/command-input.test
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { CommandInput } from './command-input.js';
import { StateContext, DispatchContext, INITIAL_STATE } from '../state.js';

function renderWithState(props: {
  focused: boolean;
  onSubmit: (line: string) => void;
  isLoading: boolean;
}): ReturnType<typeof render> {
  const dispatch = vi.fn();
  return render(
    <StateContext.Provider value={INITIAL_STATE}>
      <DispatchContext.Provider value={dispatch}>
        <CommandInput {...props} />
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

describe('CommandInput', () => {
  it('renders the prompt', () => {
    const { lastFrame } = renderWithState({
      focused: true,
      onSubmit: vi.fn(),
      isLoading: false,
    });
    expect(lastFrame()).toContain('nexus>');
  });

  it('shows cursor when focused', () => {
    const { lastFrame } = renderWithState({
      focused: true,
      onSubmit: vi.fn(),
      isLoading: false,
    });
    expect(lastFrame()).toContain('_');
  });

  it('hides cursor when not focused', () => {
    const { lastFrame } = renderWithState({
      focused: false,
      onSubmit: vi.fn(),
      isLoading: false,
    });
    expect(lastFrame()).not.toContain('_');
  });

  it('shows loading indicator', () => {
    const { lastFrame } = renderWithState({
      focused: true,
      onSubmit: vi.fn(),
      isLoading: true,
    });
    expect(lastFrame()).toContain('running...');
  });
});
