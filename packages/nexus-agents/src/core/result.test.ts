/**
 * Tests for result.ts
 *
 * Covers ok, err, isOk, isErr, map, mapErr, unwrap, unwrapOr.
 */

import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, map, mapErr, unwrap, unwrapOr } from './result.js';

// ============================================================================
// ok / err constructors
// ============================================================================

describe('ok', () => {
  it('creates a Result with ok=true', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('works with string values', () => {
    const result = ok('hello');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('hello');
    }
  });

  it('works with null', () => {
    const result = ok(null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('works with undefined', () => {
    const result = ok(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it('works with objects', () => {
    const obj = { a: 1, b: [2, 3] };
    const result = ok(obj);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(obj);
    }
  });
});

describe('err', () => {
  it('creates a Result with ok=false', () => {
    const error = new Error('fail');
    const result = err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
    }
  });

  it('works with string errors', () => {
    const result = err('something went wrong');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('something went wrong');
    }
  });

  it('works with number errors', () => {
    const result = err(404);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(404);
    }
  });
});

// ============================================================================
// isOk / isErr type guards
// ============================================================================

describe('isOk', () => {
  it('returns true for ok result', () => {
    expect(isOk(ok(42))).toBe(true);
  });

  it('returns false for err result', () => {
    expect(isOk(err('fail'))).toBe(false);
  });
});

describe('isErr', () => {
  it('returns true for err result', () => {
    expect(isErr(err('fail'))).toBe(true);
  });

  it('returns false for ok result', () => {
    expect(isErr(ok(42))).toBe(false);
  });
});

// ============================================================================
// map
// ============================================================================

describe('map', () => {
  it('transforms ok value', () => {
    const result = map(ok(5), (x) => x * 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(10);
    }
  });

  it('passes through err unchanged', () => {
    const original = err('fail');
    const result = map(original, (x: number) => x * 2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('fail');
    }
  });

  it('can change value type', () => {
    const result = map(ok(42), (x) => String(x));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('42');
    }
  });
});

// ============================================================================
// mapErr
// ============================================================================

describe('mapErr', () => {
  it('transforms err value', () => {
    const result = mapErr(err('fail'), (e) => new Error(e));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe('fail');
    }
  });

  it('passes through ok unchanged', () => {
    const original = ok(42);
    const result = mapErr(original, (e: string) => new Error(e));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('can change error type', () => {
    const result = mapErr(err('not found'), () => 404);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(404);
    }
  });
});

// ============================================================================
// unwrap
// ============================================================================

describe('unwrap', () => {
  it('returns value from ok result', () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it('throws Error from err result', () => {
    const error = new Error('boom');
    expect(() => unwrap(err(error))).toThrow('boom');
  });

  it('throws the original Error instance', () => {
    const error = new Error('original');
    try {
      unwrap(err(error));
    } catch (e) {
      expect(e).toBe(error);
    }
  });

  it('wraps non-Error values in Error', () => {
    expect(() => unwrap(err('string error'))).toThrow('string error');
  });

  it('wraps number errors in Error', () => {
    expect(() => unwrap(err(404))).toThrow('404');
  });
});

// ============================================================================
// unwrapOr
// ============================================================================

describe('unwrapOr', () => {
  it('returns value from ok result', () => {
    expect(unwrapOr(ok(42), 0)).toBe(42);
  });

  it('returns default for err result', () => {
    expect(unwrapOr(err('fail'), 0)).toBe(0);
  });

  it('returns null default for err result', () => {
    expect(unwrapOr(err('fail'), null)).toBeNull();
  });

  it('returns value even when default provided', () => {
    expect(unwrapOr(ok('actual'), 'default')).toBe('actual');
  });
});
