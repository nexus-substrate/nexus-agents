/**
 * ErrorBoundary — React error boundary for the TUI.
 *
 * Catches rendering errors in child components and shows
 * a fallback message instead of crashing the entire TUI.
 *
 * @module tui/components/error-boundary
 */

import React from 'react';
import { Box, Text } from 'ink';

interface ErrorBoundaryProps {
  readonly children: React.ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: msg };
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column" borderStyle="single" borderColor="red" paddingX={1}>
          <Text bold color="red">
            TUI Error
          </Text>
          <Text>{this.state.errorMessage}</Text>
          <Text dimColor>The TUI encountered an error. Try restarting with --repl.</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}
