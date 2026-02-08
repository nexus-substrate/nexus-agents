/**
 * App — Root Ink component for the nexus-tui TUI.
 *
 * Provides state context to all child components and wires up
 * the command execution hook to the existing REPL command registry.
 *
 * @module tui/app
 */

import React, { useReducer, useCallback } from 'react';
import { Box, Text } from 'ink';
import type { CommandHandler } from '../types.js';
import { Layout } from './layout.js';
import { appReducer, INITIAL_STATE, StateContext, DispatchContext } from './state.js';
import { useCommand } from './hooks/use-command.js';

interface AppProps {
  readonly registry: ReadonlyMap<string, CommandHandler>;
  readonly jsonMode: boolean;
}

function AppInner({ registry, jsonMode }: AppProps): React.ReactElement {
  const { execute } = useCommand(registry, jsonMode);

  const handleCommand = useCallback(
    (line: string) => {
      void execute(line);
    },
    [execute]
  );

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        {'  Nexus Agents TUI v0.1.0'}
      </Text>
      <Text dimColor>{"  Type 'help' for commands. Press ? for keybindings."}</Text>
      <Layout onCommand={handleCommand} />
    </Box>
  );
}

export function App({ registry, jsonMode }: AppProps): React.ReactElement {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        <AppInner registry={registry} jsonMode={jsonMode} />
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}
