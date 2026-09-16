/**
 * Tests for the per-call token-usage conversions (#4440).
 *
 * The two per-call `TokenUsage` types stay two (see the module doc for why);
 * what these tests pin is that the ONE conversion in each direction carries
 * every field the target can hold, and that absence stays absence.
 */
import { describe, it, expect } from 'vitest';

import { toCliTokenUsage, toModelTokenUsage } from './token-usage-bridge.js';
import type { TokenUsage as CliTokenUsage } from './types-core.js';
import type { TokenUsage as ModelTokenUsage } from '../core/types/model.js';

/** Every field the CLI-side type can hold, each with a distinct value. */
const FULL_CLI: Required<CliTokenUsage> = {
  inputTokens: 11,
  outputTokens: 22,
  totalTokens: 33,
  cachedInputTokens: 44,
  cacheCreationInputTokens: 55,
  inputTokensMeasured: false,
};

/** Every field the model-side type can hold, each with a distinct value. */
const FULL_MODEL: Required<ModelTokenUsage> = {
  inputTokens: 11,
  outputTokens: 22,
  totalTokens: 33,
  cachedInputTokens: 44,
  cacheCreationInputTokens: 55,
  inputTokensMeasured: false,
};

describe('toModelTokenUsage (CLI parser output → adapter response contract)', () => {
  it('carries every field the model-side type has', () => {
    expect(toModelTokenUsage(FULL_CLI)).toEqual(FULL_MODEL);
  });

  it('derives totalTokens as input + output when the CLI did not report one', () => {
    const result = toModelTokenUsage({ inputTokens: 7, outputTokens: 5 });
    expect(result.totalTokens).toBe(12);
  });

  it('keeps a reported totalTokens even when it differs from input + output', () => {
    // A vendor total can include tokens neither counter covers; the reported
    // figure is the measurement, the sum is only the fallback.
    const result = toModelTokenUsage({ inputTokens: 7, outputTokens: 5, totalTokens: 40 });
    expect(result.totalTokens).toBe(40);
  });

  it('leaves unreported cache fields ABSENT rather than zero', () => {
    const result = toModelTokenUsage({ inputTokens: 7, outputTokens: 5, totalTokens: 12 });
    expect(result).not.toHaveProperty('cachedInputTokens');
    expect(result).not.toHaveProperty('cacheCreationInputTokens');
    expect(result).not.toHaveProperty('inputTokensMeasured');
  });

  it('carries a reported zero cache read as a present 0, not as absence', () => {
    const result = toModelTokenUsage({ inputTokens: 7, outputTokens: 5, cachedInputTokens: 0 });
    expect(result.cachedInputTokens).toBe(0);
  });
});

describe('toCliTokenUsage (adapter response contract → CLI response)', () => {
  it('carries every field the CLI-side type has', () => {
    expect(toCliTokenUsage(FULL_MODEL)).toEqual(FULL_CLI);
  });

  it('leaves unreported cache fields ABSENT rather than zero', () => {
    const result = toCliTokenUsage({ inputTokens: 7, outputTokens: 5, totalTokens: 12 });
    expect(result).not.toHaveProperty('cachedInputTokens');
    expect(result).not.toHaveProperty('cacheCreationInputTokens');
    expect(result).not.toHaveProperty('inputTokensMeasured');
  });

  it('carries inputTokensMeasured: false so a placeholder input count is not laundered', () => {
    // #4835: false means inputTokens is a placeholder 0 and totalTokens a
    // lower bound. Dropping the flag would turn that into a measured 0.
    const result = toCliTokenUsage({
      inputTokens: 0,
      outputTokens: 5,
      totalTokens: 5,
      inputTokensMeasured: false,
    });
    expect(result.inputTokensMeasured).toBe(false);
  });

  it('round-trips a fully populated usage without loss in either direction', () => {
    expect(toModelTokenUsage(toCliTokenUsage(FULL_MODEL))).toEqual(FULL_MODEL);
    expect(toCliTokenUsage(toModelTokenUsage(FULL_CLI))).toEqual(FULL_CLI);
  });
});
