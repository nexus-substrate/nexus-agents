import { describe, expect, it } from 'vitest';

import { allOf, anyOf, verdictOver } from './verdict-aggregation.js';

describe('allOf', () => {
  it('returns whenEmpty for an empty collection, not vacuous true', () => {
    // The whole point: `[].every(p)` is `true`, and that is how a gate with
    // zero checks reports success.
    expect(allOf([], () => true, false)).toBe(false);
  });

  it('honours whenEmpty: true when vacuous truth is genuinely the contract', () => {
    expect(allOf([], () => false, true)).toBe(true);
  });

  it('matches every() on a non-empty collection', () => {
    expect(allOf([1, 2, 3], (n) => n > 0, false)).toBe(true);
    expect(allOf([1, -2, 3], (n) => n > 0, true)).toBe(false);
  });

  it('does not consult whenEmpty when the collection is non-empty', () => {
    // A passing collection must not be overridden by the empty verdict.
    expect(allOf([1], (n) => n > 0, false)).toBe(true);
  });
});

describe('anyOf', () => {
  it('returns whenEmpty for an empty collection', () => {
    expect(anyOf([], () => true, true)).toBe(true);
    expect(anyOf([], () => true, false)).toBe(false);
  });

  it('matches some() on a non-empty collection', () => {
    expect(anyOf([1, -2], (n) => n < 0, false)).toBe(true);
    expect(anyOf([1, 2], (n) => n < 0, true)).toBe(false);
  });
});

describe('verdictOver', () => {
  it('returns whenEmpty rather than folding an empty collection', () => {
    // A severity fold over nothing is `unmeasured`, not the best value —
    // which is the `worstSeverity([])` question in general form.
    expect(verdictOver<number, string>([], () => 'ok', 'unmeasured')).toBe('unmeasured');
  });

  it('folds a non-empty collection', () => {
    expect(verdictOver([1, 2], (xs) => xs.length, 0)).toBe(2);
  });

  it('passes the whole collection to the aggregator', () => {
    expect(verdictOver([3, 1, 2], (xs) => Math.max(...xs), -1)).toBe(3);
  });
});
