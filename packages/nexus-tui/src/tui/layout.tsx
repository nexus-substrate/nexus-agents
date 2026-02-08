/**
 * Layout — Box-based layout for the Ink TUI.
 *
 * Two-row layout: output panel on top, command input on bottom.
 * Panels expand in Sub-phase 3B.
 *
 * @module tui/layout
 */

import React from 'react';
import { Box } from 'ink';
import { OutputPanel } from './components/output-panel.js';
import { CommandInput } from './components/command-input.js';
import { useAppState } from './state.js';

interface LayoutProps {
  readonly onCommand: (line: string) => void;
}

export function Layout({ onCommand }: LayoutProps): React.ReactElement {
  const { focusedPanel, isLoading } = useAppState();

  return (
    <Box flexDirection="column" height={24}>
      <OutputPanel focused={focusedPanel === 'output'} />
      <CommandInput
        focused={focusedPanel === 'command'}
        onSubmit={onCommand}
        isLoading={isLoading}
      />
    </Box>
  );
}
