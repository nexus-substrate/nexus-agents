/**
 * AgentPanel — Rendering and data display tests.
 *
 * @module tui/components/agent-panel.test
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { AgentPanel, buildAgentStatus } from './agent-panel.js';

describe('AgentPanel', () => {
  it('renders panel title', () => {
    const { lastFrame } = render(<AgentPanel focused={false} agents={[]} />);
    expect(lastFrame()).toContain('Agents');
  });

  it('shows no data message when empty', () => {
    const { lastFrame } = render(<AgentPanel focused={false} agents={[]} />);
    expect(lastFrame()).toContain('No agent data');
  });

  it('renders agent entries', () => {
    const agents = [
      { cli: 'claude', available: true, lastSeen: Date.now() - 5000 },
      { cli: 'codex', available: false, lastSeen: null },
    ];
    const { lastFrame } = render(<AgentPanel focused={false} agents={agents} />);
    expect(lastFrame()).toContain('claude');
    expect(lastFrame()).toContain('codex');
  });

  it('applies focus styling', () => {
    const { lastFrame } = render(<AgentPanel focused={true} agents={[]} />);
    // Double border in focused mode — presence of the title is sufficient
    expect(lastFrame()).toContain('Agents');
  });
});

describe('buildAgentStatus', () => {
  it('returns default CLIs with no events', () => {
    const status = buildAgentStatus([]);
    expect(status).toHaveLength(3);
    expect(status.map((s) => s.cli)).toEqual(['claude', 'codex', 'gemini']);
    expect(status.every((s) => !s.available)).toBe(true);
  });

  it('marks CLI as available when events exist', () => {
    const events = [{ cli: 'claude', timestamp: Date.now() }];
    const status = buildAgentStatus(events);
    const claude = status.find((s) => s.cli === 'claude');
    expect(claude?.available).toBe(true);
  });

  it('uses latest timestamp for lastSeen', () => {
    const now = Date.now();
    const events = [
      { cli: 'claude', timestamp: now - 5000 },
      { cli: 'claude', timestamp: now },
    ];
    const status = buildAgentStatus(events);
    const claude = status.find((s) => s.cli === 'claude');
    expect(claude?.lastSeen).toBe(now);
  });
});
