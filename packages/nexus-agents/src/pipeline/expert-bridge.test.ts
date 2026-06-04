/**
 * Tests for expert-bridge token-usage propagation (#3396).
 *
 * The full executeExpert path depends on a cached global router built from live
 * CLI adapters, so it's exercised in integration. Here we unit-test the pure
 * usage→total reducer that decides what `ExpertBridgeResult.tokensUsed` carries.
 */
import { describe, it, expect } from 'vitest';

import { totalTokensFromUsage } from './expert-bridge.js';

describe('totalTokensFromUsage (#3396)', () => {
  it('returns undefined when no usage was reported', () => {
    // CLI-subprocess paths whose extractUsage() returns null land here — the
    // caller must distinguish "unknown" from a real (never-zero) call.
    expect(totalTokensFromUsage(undefined)).toBeUndefined();
  });

  it('prefers the reported totalTokens when present', () => {
    expect(totalTokensFromUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 160 })).toBe(
      160
    );
  });

  it('falls back to input + output when totalTokens is absent', () => {
    expect(totalTokensFromUsage({ inputTokens: 100, outputTokens: 50 })).toBe(150);
  });

  it('honours a reported totalTokens of 0 (does not fall back)', () => {
    // An explicit 0 total is respected; only a missing total triggers the sum.
    expect(totalTokensFromUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })).toBe(0);
  });

  it('returns undefined when input+output sum to zero (no real signal)', () => {
    expect(totalTokensFromUsage({ inputTokens: 0, outputTokens: 0 })).toBeUndefined();
  });

  it('treats missing input/output fields as zero', () => {
    expect(totalTokensFromUsage({ outputTokens: 42 })).toBe(42);
    expect(totalTokensFromUsage({ inputTokens: 7 })).toBe(7);
  });
});
