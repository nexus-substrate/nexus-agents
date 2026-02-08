/**
 * App — Smoke and integration tests.
 *
 * Mocks the repl module to avoid transitive nexus-agents deep imports
 * that fail in the vitest environment.
 *
 * @module tui/app.test
 */

import { describe, it, expect, vi } from 'vitest';

// Mock repl.js to break the transitive dependency on commands/index → vote → nexus-agents
vi.mock('../repl.js', () => ({
  processLine: vi.fn().mockResolvedValue(null),
}));

import React from 'react';
import { render } from 'ink-testing-library';
import { App } from './app.js';
import type { CommandHandler } from '../types.js';

function createTestRegistry(): Map<string, CommandHandler> {
  const registry = new Map<string, CommandHandler>();
  registry.set('echo', {
    name: 'echo',
    description: 'Echo input',
    usage: 'echo <text>',
    execute: (args) => Promise.resolve({ output: args.join(' ') }),
  });
  return registry;
}

describe('App', () => {
  it('renders the TUI banner', () => {
    const registry = createTestRegistry();
    const { lastFrame } = render(<App registry={registry} jsonMode={false} />);
    const frame = lastFrame();
    expect(frame).toContain('Nexus Agents TUI');
  });

  it('renders the command prompt', () => {
    const registry = createTestRegistry();
    const { lastFrame } = render(<App registry={registry} jsonMode={false} />);
    const frame = lastFrame();
    expect(frame).toContain('nexus>');
  });

  it('renders output panel placeholder', () => {
    const registry = createTestRegistry();
    const { lastFrame } = render(<App registry={registry} jsonMode={false} />);
    const frame = lastFrame();
    expect(frame).toContain('Output');
    expect(frame).toContain('No output yet');
  });

  it('renders with json mode', () => {
    const registry = createTestRegistry();
    const { lastFrame } = render(<App registry={registry} jsonMode={true} />);
    const frame = lastFrame();
    expect(frame).toContain('nexus>');
  });
});
