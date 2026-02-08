/**
 * OutputPanel — Scrollable command output display.
 *
 * Shows the most recent command output lines. Automatically
 * scrolls to the latest entry when new output arrives.
 *
 * @module tui/components/output-panel
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useAppState } from '../state.js';
import { sanitizeOutput } from '../../sanitize.js';

const MAX_VISIBLE = 20;

interface OutputPanelProps {
  readonly focused: boolean;
}

export function OutputPanel({ focused }: OutputPanelProps): React.ReactElement {
  const { commandOutput } = useAppState();
  const visible = commandOutput.slice(-MAX_VISIBLE);

  return (
    <Box
      flexDirection="column"
      borderStyle={focused ? 'double' : 'single'}
      borderColor={focused ? 'cyan' : 'gray'}
      paddingX={1}
      flexGrow={1}
    >
      <Text bold color="cyan">
        Output
      </Text>
      {visible.length === 0 ? (
        <Text dimColor>No output yet. Type a command below.</Text>
      ) : (
        visible.map((line, i) =>
          line.isError ? (
            <Text key={`${String(line.timestamp)}-${String(i)}`} color="red">
              {sanitizeOutput(line.text)}
            </Text>
          ) : (
            <Text key={`${String(line.timestamp)}-${String(i)}`}>{sanitizeOutput(line.text)}</Text>
          )
        )
      )}
    </Box>
  );
}
