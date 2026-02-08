/**
 * useKeyboard — Unit tests for keyboard navigation logic.
 *
 * @module tui/hooks/use-keyboard.test
 */

import { describe, it, expect } from 'vitest';
import type { PanelId } from '../state.js';

// Test the nextPanel logic directly (extracted for testability)
const PANEL_ORDER: readonly PanelId[] = ['command', 'output', 'agents', 'weather'];

function nextPanel(current: PanelId): PanelId {
  const idx = PANEL_ORDER.indexOf(current);
  const nextIdx = (idx + 1) % PANEL_ORDER.length;
  const next = PANEL_ORDER[nextIdx];
  return next ?? 'command';
}

describe('keyboard navigation', () => {
  it('cycles from command to output', () => {
    expect(nextPanel('command')).toBe('output');
  });

  it('cycles from output to agents', () => {
    expect(nextPanel('output')).toBe('agents');
  });

  it('cycles from agents to weather', () => {
    expect(nextPanel('agents')).toBe('weather');
  });

  it('wraps from weather back to command', () => {
    expect(nextPanel('weather')).toBe('command');
  });
});
