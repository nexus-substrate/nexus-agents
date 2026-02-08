/**
 * Spinner — Tests.
 *
 * @module tui/components/spinner.test
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Spinner } from './spinner.js';

describe('Spinner', () => {
  it('renders without label', () => {
    const { lastFrame } = render(<Spinner />);
    const frame = lastFrame();
    // Should render one of the frame characters
    expect(frame.length).toBeGreaterThan(0);
  });

  it('renders with label', () => {
    const { lastFrame } = render(<Spinner label="Loading..." />);
    expect(lastFrame()).toContain('Loading...');
  });
});
