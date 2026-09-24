/**
 * `throwIfVoteCancelled` (#6735): what the thrown error says, and when it fires.
 */

import { describe, it, expect } from 'vitest';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import { throwIfVoteCancelled, VoteCancelledError } from './consensus-vote-cancelled.js';

const CAST = { role: 'architect', source: 'llm' } as unknown as AgentVoteResult;
const ERRORED = { role: 'security', source: 'error' } as unknown as AgentVoteResult;

function thrown(signal: AbortSignal): VoteCancelledError {
  try {
    throwIfVoteCancelled(signal, [CAST, ERRORED], 3);
  } catch (error: unknown) {
    if (error instanceof VoteCancelledError) return error;
    throw error;
  }
  throw new Error('did not throw');
}

describe('throwIfVoteCancelled (#6735)', () => {
  it('does nothing without a signal, or before it fires', () => {
    expect(() => {
      throwIfVoteCancelled(undefined, [CAST], 3);
    }).not.toThrow();
    expect(() => {
      throwIfVoteCancelled(new AbortController().signal, [CAST], 3);
    }).not.toThrow();
  });

  it('a cancel says cancelled and carries only the seats that cast', () => {
    const controller = new AbortController();
    controller.abort(new Error('user requested abort'));
    const error = thrown(controller.signal);
    expect(error.timedOut).toBe(false);
    expect(error.message).toBe('Vote cancelled before a verdict: 1 of 3 seats had cast a vote');
    expect(error.votesCast).toEqual([CAST]);
  });

  it('the runaway guard says it timed out, not that it was cancelled', () => {
    const controller = new AbortController();
    controller.abort(new DOMException('runaway guard exceeded', 'TimeoutError'));
    const error = thrown(controller.signal);
    expect(error.timedOut).toBe(true);
    expect(error.message).toMatch(/^Vote timed out \(runaway guard\) before a verdict/);
    expect(error.message).not.toMatch(/cancelled/);
  });
});
