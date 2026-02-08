/**
 * HelpOverlay — Modal with keybinding reference.
 *
 * Displayed when the user presses ? to toggle help.
 *
 * @module tui/components/help-overlay
 */

import React from 'react';
import { Box, Text } from 'ink';

const KEYBINDINGS: ReadonlyArray<readonly [string, string]> = [
  ['Tab', 'Cycle focus between panels'],
  ['?', 'Toggle this help overlay'],
  ['Up/Down', 'Navigate command history'],
  ['Enter', 'Execute command'],
  ['Ctrl+C', 'Exit'],
];

export function HelpOverlay(): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={2} paddingY={1}>
      <Text bold color="yellow">
        Keybindings
      </Text>
      <Text>{''}</Text>
      {KEYBINDINGS.map(([key, desc]) => (
        <Text key={key}>{`  ${key.padEnd(12)} ${desc}`}</Text>
      ))}
      <Text>{''}</Text>
      <Text dimColor>Press ? to close</Text>
    </Box>
  );
}
