/**
 * Tests for the per-job AbortController registry (#4086).
 */

import { afterEach, describe, it, expect } from 'vitest';

import {
  registerJobAbort,
  abortJob,
  unregisterJobAbort,
  jobAbortRegistrySize,
} from './job-abort-registry.js';

describe('job-abort-registry (#4086)', () => {
  afterEach(() => {
    // Clean any leftovers so size assertions stay isolated.
    for (const id of ['j1', 'j2', 'unknown']) unregisterJobAbort(id);
  });

  it('registers a controller and exposes its signal', () => {
    const controller = registerJobAbort('j1');
    expect(controller.signal.aborted).toBe(false);
    expect(jobAbortRegistrySize()).toBeGreaterThanOrEqual(1);
    unregisterJobAbort('j1');
  });

  it('abortJob aborts the registered signal and returns true', () => {
    const controller = registerJobAbort('j1');
    let firedReason: unknown;
    controller.signal.addEventListener('abort', () => {
      firedReason = controller.signal.reason;
    });
    expect(abortJob('j1', 'user cancel')).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(String(firedReason)).toContain('user cancel');
  });

  it('removes the entry on abort so a late settle cannot double-fire', () => {
    registerJobAbort('j1');
    expect(abortJob('j1')).toBe(true);
    // Already removed → a second abort is a no-op miss.
    expect(abortJob('j1')).toBe(false);
  });

  it('abortJob returns false for an unknown / already-settled job', () => {
    expect(abortJob('unknown')).toBe(false);
  });

  it('unregisterJobAbort removes the controller and is idempotent', () => {
    registerJobAbort('j2');
    unregisterJobAbort('j2');
    unregisterJobAbort('j2'); // idempotent — no throw
    expect(abortJob('j2')).toBe(false);
  });
});
