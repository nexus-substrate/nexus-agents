import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { raceAgainstDeadline } from './race-against-deadline.js';

describe('raceAgainstDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the promise value when it settles before the deadline', async () => {
    const promise = Promise.resolve('ok');
    const onTimeout = vi.fn((_elapsed: number) => 'timeout' as const);

    const result = await raceAgainstDeadline(promise, 1_000, onTimeout);

    expect(result).toBe('ok');
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('invokes onTimeout when the deadline fires before the promise settles', async () => {
    const hanging = new Promise<string>(() => {
      // never settles
    });
    const onTimeout = vi.fn((elapsed: number) => `timeout:${String(elapsed)}`);

    const resultP = raceAgainstDeadline(hanging, 500, onTimeout);
    await vi.advanceTimersByTimeAsync(500);
    const result = await resultP;

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(500);
    expect(result).toMatch(/^timeout:/);
  });

  it('clamps deadlineMs <= 0 to fire on the next microtask', async () => {
    const hanging = new Promise<string>(() => {});
    const onTimeout = vi.fn(() => 'timed-out');

    const resultP = raceAgainstDeadline(hanging, -100, onTimeout);
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultP;

    expect(result).toBe('timed-out');
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not call onTimeout when the promise rejects before the deadline', async () => {
    const rejecting = Promise.reject(new Error('boom'));
    const onTimeout = vi.fn(() => 'timeout' as const);

    await expect(raceAgainstDeadline(rejecting, 1_000, onTimeout)).rejects.toThrow('boom');
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('clears the timer when the promise wins the race (no dangling handle)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const promise = Promise.resolve('quick');
    const onTimeout = vi.fn(() => 'late');

    await raceAgainstDeadline(promise, 10_000, onTimeout);

    expect(clearSpy).toHaveBeenCalled();
  });

  it('passes the elapsed ms (approximately deadlineMs) to onTimeout', async () => {
    const hanging = new Promise<number>(() => {});
    let captured = -1;
    const onTimeout = (elapsed: number): number => {
      captured = elapsed;
      return elapsed;
    };

    const resultP = raceAgainstDeadline(hanging, 1_234, onTimeout);
    await vi.advanceTimersByTimeAsync(1_234);
    await resultP;

    expect(captured).toBeGreaterThanOrEqual(1_234);
  });

  it('preserves the generic type of the promise', async () => {
    interface Shape {
      ok: boolean;
      data: number;
    }
    const promise = Promise.resolve<Shape>({ ok: true, data: 42 });
    const onTimeout = (): Shape => ({ ok: false, data: 0 });

    const result = await raceAgainstDeadline(promise, 1_000, onTimeout);

    expect(result.ok).toBe(true);
    expect(result.data).toBe(42);
  });

  // Audit #2824: if onTimeout throws, the previous implementation let the
  // exception escape the setTimeout callback and crash the process under
  // strict-mode error handling. Now the throw must reject the promise so
  // Promise.race surfaces it to the caller.
  it('rejects the promise when onTimeout throws instead of crashing the process', async () => {
    const hanging = new Promise<string>(() => {});
    const boom = (): string => {
      throw new Error('onTimeout exploded');
    };

    const resultP = raceAgainstDeadline(hanging, 500, boom);
    await vi.advanceTimersByTimeAsync(500);

    await expect(resultP).rejects.toThrow('onTimeout exploded');
  });

  it('wraps non-Error throws from onTimeout so the rejection is always an Error', async () => {
    const hanging = new Promise<string>(() => {});
    const nonErrorPayload = 'plain string error';
    const stringThrow = (): string => {
      // Cast to bypass `no-throw-literal` — the whole point of this test
      // is to exercise the non-Error throw path in the production wrap.
      // eslint-disable-next-line no-throw-literal
      throw nonErrorPayload as unknown as Error;
    };

    const resultP = raceAgainstDeadline(hanging, 500, stringThrow);
    await vi.advanceTimersByTimeAsync(500);

    await expect(resultP).rejects.toThrow('plain string error');
  });
});
