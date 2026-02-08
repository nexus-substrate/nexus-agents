/**
 * VotePanel — Rendering tests.
 *
 * @module tui/components/vote-panel.test
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { VotePanel } from './vote-panel.js';

describe('VotePanel', () => {
  it('renders empty state', () => {
    const { lastFrame } = render(<VotePanel activeVote={null} />);
    expect(lastFrame()).toContain('Vote');
    expect(lastFrame()).toContain('No active vote');
  });

  it('renders vote entries', () => {
    const vote = {
      proposal: 'Should we use TypeScript strict mode?',
      votes: [
        { role: 'architect', decision: 'APPROVE' as const, confidence: 0.82 },
        { role: 'security', decision: 'APPROVE' as const, confidence: 0.9 },
        { role: 'pm', decision: 'PENDING' as const, confidence: 0 },
      ],
      outcome: null,
    };
    const { lastFrame } = render(<VotePanel activeVote={vote} />);
    const frame = lastFrame();
    expect(frame).toContain('architect');
    expect(frame).toContain('security');
    expect(frame).toContain('pm');
    expect(frame).toContain('APPROVE');
  });

  it('renders outcome when present', () => {
    const vote = {
      proposal: 'Test proposal',
      votes: [{ role: 'architect', decision: 'APPROVE' as const, confidence: 0.85 }],
      outcome: 'approved',
    };
    const { lastFrame } = render(<VotePanel activeVote={vote} />);
    expect(lastFrame()).toContain('approved');
  });
});
