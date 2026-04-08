/* eslint-disable @typescript-eslint/require-await */
/**
 * QA Loop Tests (#1707)
 */

import { describe, it, expect, vi } from 'vitest';
import { runQaLoop } from './qa-loop.js';
import type { QaReviewOutput } from './qa-loop.js';

describe('runQaLoop', () => {
  it('passes on first try when review approves', async () => {
    const result = await runQaLoop(
      async () => 'good code',
      async () => ({ verdict: 'pass', feedback: 'Looks good', issues: [] })
    );
    expect(result.approved).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.output).toBe('good code');
  });

  it('iterates when review rejects then approves', async () => {
    let callCount = 0;
    const result = await runQaLoop(
      async (feedback) => {
        callCount++;
        return callCount === 1 ? 'bad code' : `fixed code (${feedback ?? ''})`;
      },
      async (code): Promise<QaReviewOutput> => {
        if (code === 'bad code')
          return { verdict: 'needs_work', feedback: 'Fix the bug', issues: ['Bug'] };
        return { verdict: 'pass', feedback: 'Fixed', issues: [] };
      }
    );
    expect(result.approved).toBe(true);
    expect(result.iterations).toBe(2);
    expect(result.output).toContain('fixed code');
    expect(result.output).toContain('Fix the bug');
  });

  it('passes feedback to implement on retry', async () => {
    const implementFn = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
    await runQaLoop(implementFn, async (output): Promise<QaReviewOutput> => {
      if (output === 'v1')
        return { verdict: 'needs_work', feedback: 'Add tests', issues: ['No tests'] };
      return { verdict: 'pass', feedback: 'OK', issues: [] };
    });
    expect(implementFn).toHaveBeenCalledTimes(2);
    expect(implementFn.mock.calls[0]?.[0]).toBeUndefined();
    expect(implementFn.mock.calls[1]?.[0]).toBe('Add tests');
  });

  it('stops after maxIterations', async () => {
    const result = await runQaLoop(
      async () => 'always bad',
      async (): Promise<QaReviewOutput> => ({
        verdict: 'reject',
        feedback: 'Still bad',
        issues: ['Bad'],
      }),
      2
    );
    expect(result.approved).toBe(false);
    expect(result.iterations).toBe(2);
    expect(result.verdict).toBe('reject');
  });

  it('handles reject verdict', async () => {
    const result = await runQaLoop(
      async () => 'terrible code',
      async (): Promise<QaReviewOutput> => ({
        verdict: 'reject',
        feedback: 'Fundamental flaw',
        issues: ['Design wrong'],
      }),
      1
    );
    expect(result.approved).toBe(false);
    expect(result.verdict).toBe('reject');
  });

  it('works with typed output', async () => {
    interface CodeResult {
      code: string;
      tests: string;
    }
    const result = await runQaLoop<CodeResult>(
      async () => ({ code: 'fn()', tests: 'test()' }),
      async () => ({ verdict: 'pass', feedback: 'OK', issues: [] })
    );
    expect(result.output.code).toBe('fn()');
    expect(result.output.tests).toBe('test()');
  });
});
