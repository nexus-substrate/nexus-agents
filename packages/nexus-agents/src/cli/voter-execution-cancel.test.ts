/**
 * A cancel reaches the seat's adapter call, and a deadline is still a deadline
 * (#6729).
 *
 * `buildVoteRequest` used to hand the adapter `AbortSignal.timeout(timeoutMs)`
 * alone, so `cancel_job` could stop LAUNCHING seats (#5393) but a seat already
 * inside its CLI call ran to completion — 90–120 s after the cancel on a live
 * panel. These rows assert on the signal the adapter RECEIVED: a real
 * `AbortSignal`, aborted with the caller's reason on a cancel, and with a
 * `TimeoutError` reason when the per-seat deadline fires, so #6709's
 * classifier (`isTimeoutAbortReason`) keeps telling the two apart.
 *
 * @module cli/voter-execution-cancel.test
 */
import { describe, it, expect, vi } from 'vitest';
import type { CompletionRequest, IModelAdapter, ILogger } from '../core/index.js';
import { isTimeoutAbortReason } from '../adapters/abort-utils.js';
import { executeWithRetries } from './voter-execution.js';

const LOGGER: ILogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => LOGGER,
} as unknown as ILogger;

/**
 * An adapter whose call never answers on its own: it settles only when the
 * signal it was handed aborts, and records every signal it saw.
 */
function makeParkedAdapter(): { adapter: IModelAdapter; signals: (AbortSignal | undefined)[] } {
  const signals: (AbortSignal | undefined)[] = [];
  const adapter = {
    modelId: 'claude-fable-5',
    providerId: 'fake',
    complete: (request: CompletionRequest) => {
      signals.push(request.signal);
      return new Promise((resolve) => {
        request.signal?.addEventListener(
          'abort',
          () => {
            resolve({
              ok: false,
              error: { message: `aborted: ${String(request.signal?.reason)}` },
            });
          },
          { once: true }
        );
      });
    },
  } as unknown as IModelAdapter;
  return { adapter, signals };
}

const LONG_TIMEOUT_MS = 60_000;

describe('a cancel aborts the seat in flight (#6729)', () => {
  it('aborts the signal the adapter received, with the cancel reason', async () => {
    const fake = makeParkedAdapter();
    const controller = new AbortController();
    const pending = executeWithRetries({
      role: 'architect',
      proposal: 'p',
      adapter: fake.adapter,
      logger: LOGGER,
      timeoutMs: LONG_TIMEOUT_MS,
      maxRetries: 2,
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(fake.signals).toHaveLength(1);
    });
    const seen = fake.signals[0];
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen?.aborted).toBe(false);

    controller.abort('cancelled via cancel_job');
    const result = await pending;

    expect(seen?.aborted).toBe(true);
    expect(seen?.reason).toBe('cancelled via cancel_job');
    expect(isTimeoutAbortReason(seen?.reason)).toBe(false);
    expect(result.ok).toBe(false);
    // A cancelled seat is not retried: one call, not maxRetries + 1.
    expect(fake.signals).toHaveLength(1);
  });

  it('makes no adapter call at all when the cancel already fired', async () => {
    const fake = makeParkedAdapter();
    const controller = new AbortController();
    controller.abort('cancelled via cancel_job');

    const result = await executeWithRetries({
      role: 'architect',
      proposal: 'p',
      adapter: fake.adapter,
      logger: LOGGER,
      timeoutMs: LONG_TIMEOUT_MS,
      maxRetries: 2,
      signal: controller.signal,
    });

    expect(result.ok).toBe(false);
    expect(fake.signals).toHaveLength(0);
  });
});

describe('a cancel is not awaited behind an adapter that ignores it (#6729)', () => {
  it('settles the seat even when the adapter never looks at its signal', async () => {
    let calls = 0;
    const deaf = {
      modelId: 'claude-fable-5',
      providerId: 'fake',
      complete: () => {
        calls += 1;
        return new Promise(() => undefined);
      },
    } as unknown as IModelAdapter;
    const controller = new AbortController();
    const pending = executeWithRetries({
      role: 'architect',
      proposal: 'p',
      adapter: deaf,
      logger: LOGGER,
      timeoutMs: LONG_TIMEOUT_MS,
      maxRetries: 2,
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(calls).toBe(1);
    });

    controller.abort('cancelled via cancel_job');
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });
});

describe('the per-seat deadline is still a timeout (#6729)', () => {
  it('aborts with a TimeoutError reason when a cancel signal is present but never fires', async () => {
    const fake = makeParkedAdapter();
    const result = await executeWithRetries({
      role: 'architect',
      proposal: 'p',
      adapter: fake.adapter,
      logger: LOGGER,
      timeoutMs: 30,
      maxRetries: 0,
      signal: new AbortController().signal,
    });

    // `withTimeout` and the signal's own timer share the deadline; whichever
    // wins the race, the adapter's signal fires with the deadline's reason.
    const seen = fake.signals[0];
    await vi.waitFor(() => {
      expect(seen?.aborted).toBe(true);
    });
    expect(isTimeoutAbortReason(seen?.reason)).toBe(true);
    expect(result.ok).toBe(false);
  });

  it('aborts with a TimeoutError reason when no cancel signal is supplied', async () => {
    const fake = makeParkedAdapter();
    await executeWithRetries({
      role: 'architect',
      proposal: 'p',
      adapter: fake.adapter,
      logger: LOGGER,
      timeoutMs: 30,
      maxRetries: 0,
    });

    await vi.waitFor(() => {
      expect(fake.signals[0]?.aborted).toBe(true);
    });
    expect(isTimeoutAbortReason(fake.signals[0]?.reason)).toBe(true);
  });
});
