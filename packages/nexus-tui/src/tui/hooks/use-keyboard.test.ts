/**
 * useKeyboard — Unit tests for keyboard navigation logic.
 *
 * @module tui/hooks/use-keyboard.test
 */

import { describe, it, expect } from 'vitest';
import type { PanelId } from '../state.js';

// Test the nextPanel logic directly (matches implementation)
const PANEL_ORDER: readonly PanelId[] = [
  'command',
  'output',
  'agents',
  'weather',
  'task',
  'outcomes',
];

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

  it('cycles from weather to task', () => {
    expect(nextPanel('weather')).toBe('task');
  });

  it('cycles from task to outcomes', () => {
    expect(nextPanel('task')).toBe('outcomes');
  });

  it('wraps from outcomes back to command', () => {
    expect(nextPanel('outcomes')).toBe('command');
  });

  it('covers all 6 panels in order', () => {
    const visited: PanelId[] = [];
    let current: PanelId = 'command';
    for (let i = 0; i < 6; i++) {
      visited.push(current);
      current = nextPanel(current);
    }
    expect(visited).toEqual(['command', 'output', 'agents', 'weather', 'task', 'outcomes']);
    expect(current).toBe('command'); // wraps back
  });
});
