/**
 * App — Root Ink component for the nexus-tui TUI.
 *
 * Provides state context to all child components and wires up
 * the command execution hook to the existing REPL command registry.
 *
 * @module tui/app
 */

import React, { useReducer, useCallback, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { CommandHandler } from '../types.js';
import { Layout } from './layout.js';
import { appReducer, INITIAL_STATE, StateContext, DispatchContext } from './state.js';
import { useCommand } from './hooks/use-command.js';
import { useKeyboard } from './hooks/use-keyboard.js';
import { HelpOverlay } from './components/help-overlay.js';
import { useAppState } from './state.js';

interface AppProps {
  readonly registry: ReadonlyMap<string, CommandHandler>;
  readonly jsonMode: boolean;
}

/** Try to load the EventBus singleton from nexus-agents. */
function useEventBusLoader(): { subscribe: (...args: unknown[]) => () => void } | null {
  const [bus, setBus] = useState<{ subscribe: (...args: unknown[]) => () => void } | null>(null);

  useEffect(() => {
    void loadBus(setBus);
  }, []);

  return bus;
}

type BusLike = { subscribe: (...args: unknown[]) => () => void };

async function loadBus(setBus: (b: BusLike | null) => void): Promise<void> {
  try {
    const mod: Record<string, unknown> = (await import('nexus-agents')) as Record<string, unknown>;
    const getter = mod['getEventBus'];
    if (typeof getter === 'function') {
      const typedGetter = getter as () => unknown;
      const bus = typedGetter();
      if (
        bus !== null &&
        typeof bus === 'object' &&
        'subscribe' in (bus as Record<string, unknown>)
      ) {
        setBus(bus as BusLike);
      }
    }
  } catch {
    // EventBus not available — panels will show defaults
  }
}

function AppInner({ registry, jsonMode }: AppProps): React.ReactElement {
  const { execute } = useCommand(registry, jsonMode);
  const eventBus = useEventBusLoader();
  const { showHelp } = useAppState();

  useKeyboard();

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
      {showHelp ? <HelpOverlay /> : <Layout onCommand={handleCommand} eventBus={eventBus} />}
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
