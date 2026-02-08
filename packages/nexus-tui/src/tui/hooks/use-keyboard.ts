/**
 * useKeyboard — Global keyboard navigation hook.
 *
 * Tab cycles focus between panels.
 * ? toggles the help overlay.
 * Ctrl+C exits the application.
 *
 * @module tui/hooks/use-keyboard
 */

import { useCallback } from 'react';
import { useInput, useApp } from 'ink';
import { useDispatch, useAppState } from '../state.js';
import type { PanelId } from '../state.js';

const PANEL_ORDER: readonly PanelId[] = ['command', 'output', 'agents', 'weather'];

/** Cycle to the next panel in tab order. */
function nextPanel(current: PanelId): PanelId {
  const idx = PANEL_ORDER.indexOf(current);
  const nextIdx = (idx + 1) % PANEL_ORDER.length;
  const next = PANEL_ORDER[nextIdx];
  return next ?? 'command';
}

/** Global keyboard handler for panel navigation. */
export function useKeyboard(): void {
  const dispatch = useDispatch();
  const { focusedPanel } = useAppState();
  const { exit } = useApp();

  const handleTab = useCallback(() => {
    dispatch({ type: 'SET_FOCUS', panel: nextPanel(focusedPanel) });
  }, [dispatch, focusedPanel]);

  const handleHelp = useCallback(() => {
    dispatch({ type: 'TOGGLE_HELP' });
  }, [dispatch]);

  useInput((input, key) => {
    if (key.tab) {
      handleTab();
      return;
    }
    if (input === '?' && !key.ctrl && !key.meta) {
      handleHelp();
      return;
    }
    if (key.ctrl && input === 'c') {
      exit();
    }
  });
}
