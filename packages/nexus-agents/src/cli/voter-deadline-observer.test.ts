/** Deadline cancellation must survive a failing measurement observer (#6851). */
import { afterEach, expect, it, vi } from 'vitest';
import type { IModelAdapter, ILogger } from '../core/index.js';
import { launchVotesWithOverallDeadline } from './voter-agents-deadline.js';

vi.mock('./voter-late-settlement.js', () => ({
  observeLateVoter: () => ({
    register: () => undefined,
    afterDeadline: () => {
      throw new Error('observer failed');
    },
  }),
}));

afterEach(() => vi.useRealTimers());

it('still aborts the voter when the deadline observer throws', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const logger = { warn: vi.fn() } as unknown as ILogger;
  const pending = launchVotesWithOverallDeadline({
    roles: ['architect'],
    proposal: 'test',
    roleAdapters: new Map(),
    fallbackAdapter: { modelId: 'fake', providerId: 'fake' } as IModelAdapter,
    logger,
    voteOptions: { timeoutMs: 10_000, maxRetries: 0, allowSimulation: false },
    interDelay: 0,
    overallDeadlineMs: 100,
    voteFn: (_role, _proposal, _adapter, _logger, options) => {
      signal = options.signal;
      return new Promise(() => undefined);
    },
  });
  // Must not reject: a throw here is an uncaught exception in production.
  await vi.advanceTimersByTimeAsync(100);
  expect(logger.warn).toHaveBeenCalledWith(
    'Late-settlement observer failed; deadline unaffected',
    expect.objectContaining({ error: 'observer failed' })
  );
  expect(signal?.aborted).toBe(true);
  expect(signal?.reason).toMatchObject({ name: 'TimeoutError' });
  expect((await pending)[0]?.error).toBe('overall consensus deadline exceeded');
});
