/**
 * Tests for attempt-level voter usage (#6821): every outer completion a seat
 * settled is counted, not just the answer that was kept.
 */

import { describe, it, expect } from 'vitest';
import {
  AttemptUsageSchema,
  ObservedAttemptUsageSchema,
  foldCompletionUsage,
  mergeAttemptUsage,
  summarizeAttemptUsage,
} from './attempt-usage.js';

describe('foldCompletionUsage', () => {
  it('starts a seat at one completion with that completion’s counters', () => {
    expect(foldCompletionUsage(undefined, { inputTokens: 11, outputTokens: 7 })).toEqual({
      completions: 1,
      reportedCompletions: 1,
      inputTokens: 11,
      outputTokens: 7,
    });
  });

  it('sums every completion, not just the last', () => {
    const first = foldCompletionUsage(undefined, { inputTokens: 100, outputTokens: 40 });
    const both = foldCompletionUsage(first, { inputTokens: 30, outputTokens: 9 });
    expect(both).toEqual({
      completions: 2,
      reportedCompletions: 2,
      inputTokens: 130,
      outputTokens: 49,
    });
  });

  it('keeps an unreported completion UNMEASURED: counters absent, never 0', () => {
    const folded = foldCompletionUsage(undefined, {});
    expect(folded).toEqual({ completions: 1, reportedCompletions: 0 });
    expect('inputTokens' in folded).toBe(false);
    expect('outputTokens' in folded).toBe(false);
  });

  it('marks a mixed seat as a lower bound: fewer reported than settled', () => {
    const folded = foldCompletionUsage(foldCompletionUsage(undefined, {}), {
      inputTokens: 5,
      outputTokens: 2,
    });
    expect(folded.completions).toBe(2);
    expect(folded.reportedCompletions).toBe(1);
    expect(folded.inputTokens).toBe(5);
  });

  it('keeps an explicit zero as a measurement', () => {
    const folded = foldCompletionUsage(undefined, { inputTokens: 0, outputTokens: 0 });
    expect(folded).toEqual({
      completions: 1,
      reportedCompletions: 1,
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it('does not count a one-counter completion as reported', () => {
    const folded = foldCompletionUsage(undefined, { outputTokens: 3 });
    expect(folded).toEqual({ completions: 1, reportedCompletions: 0, outputTokens: 3 });
  });

  it('sums the cache counters only where reported', () => {
    const a = foldCompletionUsage(undefined, {
      inputTokens: 1,
      outputTokens: 1,
      cachedInputTokens: 40,
    });
    const b = foldCompletionUsage(a, {
      inputTokens: 1,
      outputTokens: 1,
      cachedInputTokens: 2,
      cacheCreationInputTokens: 9,
    });
    expect(b.cachedInputTokens).toBe(42);
    expect(b.cacheCreationInputTokens).toBe(9);
  });
});

describe('mergeAttemptUsage', () => {
  it('is undefined only when neither side observed a completion', () => {
    expect(mergeAttemptUsage(undefined, undefined)).toBeUndefined();
  });

  it('returns the one side that observed completions', () => {
    const only = { completions: 2, reportedCompletions: 1, inputTokens: 4 };
    expect(mergeAttemptUsage(undefined, only)).toEqual(only);
    expect(mergeAttemptUsage(only, undefined)).toEqual(only);
  });

  it('adds completions and counters across a primary and its replacement', () => {
    expect(
      mergeAttemptUsage(
        { completions: 1, reportedCompletions: 1, inputTokens: 100, outputTokens: 20 },
        { completions: 2, reportedCompletions: 1, inputTokens: 8, outputTokens: 3 }
      )
    ).toEqual({ completions: 3, reportedCompletions: 2, inputTokens: 108, outputTokens: 23 });
  });

  it('keeps a counter absent when neither side reported it', () => {
    const merged = mergeAttemptUsage(
      { completions: 1, reportedCompletions: 0 },
      { completions: 1, reportedCompletions: 0 }
    );
    expect(merged).toEqual({ completions: 2, reportedCompletions: 0 });
  });
});

describe('summarizeAttemptUsage', () => {
  it('is undefined when no seat carried attempt usage (empty cohort)', () => {
    expect(summarizeAttemptUsage([])).toBeUndefined();
    expect(summarizeAttemptUsage([undefined, undefined])).toBeUndefined();
  });

  it('totals seats and counts an incomplete seat so the total reads as a floor', () => {
    const summary = summarizeAttemptUsage([
      { completions: 3, reportedCompletions: 3, inputTokens: 300, outputTokens: 60 },
      { completions: 2, reportedCompletions: 1, inputTokens: 10, outputTokens: 4 },
      undefined,
    ]);
    expect(summary).toEqual({
      seats: 2,
      incompleteSeats: 1,
      completions: 5,
      reportedCompletions: 4,
      inputTokens: 310,
      outputTokens: 64,
      totalTokens: 374,
    });
  });

  it('round-trips through its persisted schema', () => {
    const summary = summarizeAttemptUsage([{ completions: 1, reportedCompletions: 0 }]);
    expect(ObservedAttemptUsageSchema.parse(summary)).toEqual(summary);
    expect(summary?.incompleteSeats).toBe(1);
  });

  it('rejects a seat claiming more reported than settled completions', () => {
    expect(AttemptUsageSchema.safeParse({ completions: 1, reportedCompletions: 2 }).success).toBe(
      false
    );
    expect(AttemptUsageSchema.safeParse({ completions: 0, reportedCompletions: 0 }).success).toBe(
      false
    );
  });
});
