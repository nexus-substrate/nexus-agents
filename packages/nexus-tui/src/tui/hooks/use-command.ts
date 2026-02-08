/**
 * useCommand — Hook for dispatching commands through the REPL engine.
 *
 * Wraps processLine() from the existing REPL module so that the Ink
 * TUI uses the same command dispatch path as the readline REPL.
 *
 * @module tui/hooks/use-command
 */

import { useCallback, useRef } from 'react';
import type { CommandHandler } from '../../types.js';
import { processLine } from '../../repl.js';
import { useDispatch } from '../state.js';

interface UseCommandResult {
  /** Execute a command string. Returns formatted output or null. */
  readonly execute: (line: string) => Promise<string | null>;
}

/** Hook that dispatches commands to the existing registry. */
export function useCommand(
  registry: ReadonlyMap<string, CommandHandler>,
  jsonMode: boolean
): UseCommandResult {
  const dispatch = useDispatch();
  const running = useRef(false);

  const execute = useCallback(
    async (line: string): Promise<string | null> => {
      const trimmed = line.trim();
      if (trimmed === '' || running.current) return null;

      running.current = true;
      dispatch({ type: 'SET_LOADING', loading: true });
      dispatch({ type: 'ADD_HISTORY', command: trimmed });

      try {
        const output = await processLine(trimmed, registry, jsonMode);
        if (output !== null) {
          dispatch({ type: 'ADD_OUTPUT', text: output, isError: false });
        }
        return output;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        dispatch({ type: 'ADD_OUTPUT', text: `Error: ${msg}`, isError: true });
        return null;
      } finally {
        running.current = false;
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    },
    [registry, jsonMode, dispatch]
  );

  return { execute };
}
