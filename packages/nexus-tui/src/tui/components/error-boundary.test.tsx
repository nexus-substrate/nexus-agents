/**
 * ErrorBoundary — Tests.
 *
 * @module tui/components/error-boundary.test
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ErrorBoundary } from './error-boundary.js';
import { Text } from 'ink';

function GoodChild(): React.ReactElement {
  return <Text>All good</Text>;
}

function BadChild(): React.ReactElement {
  throw new Error('Test render error');
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const { lastFrame } = render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );
    expect(lastFrame()).toContain('All good');
  });

  it('catches render errors and shows fallback', () => {
    const { lastFrame } = render(
      <ErrorBoundary>
        <BadChild />
      </ErrorBoundary>
    );
    const frame = lastFrame();
    expect(frame).toContain('TUI Error');
    expect(frame).toContain('Test render error');
    expect(frame).toContain('--repl');
  });
});
