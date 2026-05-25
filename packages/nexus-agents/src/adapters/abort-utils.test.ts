/**
 * Tests for abort-utils (#3036).
 */

import { describe, it, expect } from 'vitest';

import { AbortError, raceAbort } from './abort-utils.js';

describe('raceAbort', () => {
  it('resolves with the promise value when no signal is provided', async () => {
    const result = await raceAbort(Promise.resolve(42), undefined);
    expect(result).toBe(42);
  });

  it('rejects with the promise error when no signal is provided', async () => {
    await expect(raceAbort(Promise.reject(new Error('inner')), undefined)).rejects.toThrow('inner');
  });

  it('rejects synchronously with AbortError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(raceAbort(Promise.resolve(42), controller.signal)).rejects.toBeInstanceOf(
      AbortError
    );
  });

  it('resolves with the promise value when the signal stays clean', async () => {
    const controller = new AbortController();
    const result = await raceAbort(Promise.resolve('done'), controller.signal);
    expect(result).toBe('done');
  });

  it('rejects with AbortError when the signal aborts before the promise settles', async () => {
    const controller = new AbortController();
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve('late');
      }, 50);
    });
    const racePromise = raceAbort(slow, controller.signal);

    controller.abort();
    await expect(racePromise).rejects.toBeInstanceOf(AbortError);
  });

  it('resolves with promise value when promise wins the race', async () => {
    const controller = new AbortController();
    const fast = Promise.resolve('fast');
    const result = await raceAbort(fast, controller.signal);
    expect(result).toBe('fast');
    // Aborting after settle is a no-op — no late rejection should land.
    controller.abort();
  });

  it('propagates the original Error type (not wrapped) when the promise rejects', async () => {
    const controller = new AbortController();
    class CustomError extends Error {
      override readonly name = 'CustomError';
    }
    await expect(
      raceAbort(Promise.reject(new CustomError('boom')), controller.signal)
    ).rejects.toBeInstanceOf(CustomError);
  });
});
