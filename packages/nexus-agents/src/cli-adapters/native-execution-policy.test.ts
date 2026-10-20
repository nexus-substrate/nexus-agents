import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixedTimeProvider, resetTimeProvider, setTimeProvider } from '../core/index.js';
import {
  NATIVE_EXECUTION_POLICY,
  consumeNativeSpawnPermit,
  issueNativeExecutionPolicy,
  nativeExecutionOptions,
} from './native-execution-policy.js';

describe('host-issued native execution policy (#7533)', () => {
  let clock: FixedTimeProvider;
  beforeEach(() => {
    clock = new FixedTimeProvider(1_000);
    setTimeProvider(clock);
  });
  afterEach(() => {
    resetTimeProvider();
  });

  it('keeps one attempted-spawn allowance through symbol/default spreads', () => {
    const issued = issueNativeExecutionPolicy({ deadlineAt: 2_000 });
    expect(issued.ok).toBe(true);
    if (!issued.ok) throw new Error('Expected an issued policy');
    expect(Object.isFrozen(issued.value)).toBe(true);
    const opts = nativeExecutionOptions(issued.value);
    if (!opts.ok) throw new Error('Expected valid native options');
    const spread = { allowRetry: true, maxRetries: 2, ...opts.value };

    expect(spread.allowRetry).toBe(false);
    expect(spread.maxRetries).toBe(0);
    expect(spread[NATIVE_EXECUTION_POLICY]).toBe(issued.value);
    expect(consumeNativeSpawnPermit(spread[NATIVE_EXECUTION_POLICY]).ok).toBe(true);
    expect(consumeNativeSpawnPermit(issued.value)).toEqual({
      ok: false,
      error: { reason: 'permit-consumed' },
    });
  });

  it.each([undefined, null, {}, { deadlineAt: 2_000 }])(
    'rejects a forged or absent capability %j',
    (value) => {
      expect(nativeExecutionOptions(value)).toEqual({
        ok: false,
        error: { reason: 'invalid-policy' },
      });
      expect(consumeNativeSpawnPermit(value)).toEqual({
        ok: false,
        error: { reason: 'invalid-policy' },
      });
    }
  );

  it('does not accept an object copying even the real capability symbol', () => {
    const issued = issueNativeExecutionPolicy({ deadlineAt: 2_000 });
    if (!issued.ok) throw new Error('Expected policy');
    expect(consumeNativeSpawnPermit({ ...issued.value })).toEqual({
      ok: false,
      error: { reason: 'invalid-policy' },
    });
  });

  it.each([NaN, Infinity, 0, 999, 1_000])(
    'refuses invalid or already-expired deadline %s',
    (deadlineAt) => {
      expect(issueNativeExecutionPolicy({ deadlineAt })).toEqual({
        ok: false,
        error: { reason: 'invalid-deadline' },
      });
    }
  );

  it('keeps the absolute deadline after elapsed preflight time', () => {
    const issued = issueNativeExecutionPolicy({ deadlineAt: 2_000 });
    if (!issued.ok) throw new Error('Expected policy');
    clock.advance(400);
    const opts = nativeExecutionOptions(issued.value);
    expect(opts.ok && opts.value.timeoutMs).toBe(600);
    clock.advance(600);
    expect(consumeNativeSpawnPermit(issued.value)).toEqual({
      ok: false,
      error: { reason: 'expired-before-spawn' },
    });
  });

  it('preserves actual caller cancellation without consuming the allowance', () => {
    const controller = new AbortController();
    const issued = issueNativeExecutionPolicy({ deadlineAt: 2_000, signal: controller.signal });
    if (!issued.ok) throw new Error('Expected policy');
    controller.abort('operator cancelled');
    expect(consumeNativeSpawnPermit(issued.value)).toEqual({
      ok: false,
      error: { reason: 'cancelled-before-spawn' },
    });
  });
});
