/**
 * HelpOverlay — Tests.
 *
 * @module tui/components/help-overlay.test
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { HelpOverlay } from './help-overlay.js';

describe('HelpOverlay', () => {
  it('renders keybinding title', () => {
    const { lastFrame } = render(<HelpOverlay />);
    expect(lastFrame()).toContain('Keybindings');
  });

  it('shows Tab keybinding', () => {
    const { lastFrame } = render(<HelpOverlay />);
    expect(lastFrame()).toContain('Tab');
    expect(lastFrame()).toContain('Cycle focus');
  });

  it('shows Ctrl+C keybinding', () => {
    const { lastFrame } = render(<HelpOverlay />);
    expect(lastFrame()).toContain('Ctrl+C');
    expect(lastFrame()).toContain('Exit');
  });

  it('shows close instruction', () => {
    const { lastFrame } = render(<HelpOverlay />);
    expect(lastFrame()).toContain('Press ? to close');
  });
});
