import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, map, mapErr, unwrap, unwrapOr, type Result } from './result.js';

describe('Result', () => {
  describe('ok()', () => {
    it('creates a successful result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it('works with objects', () => {
      const result = ok({ name: 'test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ name: 'test' });
      }
    });
  });

  describe('err()', () => {
    it('creates a failed result', () => {
      const result = err('something went wrong');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('something went wrong');
      }
    });

    it('works with error objects', () => {
      const error = new Error('test error');
      const result = err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe('isOk()', () => {
    it('returns true for ok results', () => {
      const result = ok(42);
      expect(isOk(result)).toBe(true);
    });

    it('returns false for err results', () => {
      const result = err('error');
      expect(isOk(result)).toBe(false);
    });

    it('narrows the type correctly', () => {
      const result: Result<number, string> = ok(42);
      if (isOk(result)) {
        // Type should be narrowed to { ok: true; value: number }
        const value: number = result.value;
        expect(value).toBe(42);
      }
    });
  });

  describe('isErr()', () => {
    it('returns false for ok results', () => {
      const result = ok(42);
      expect(isErr(result)).toBe(false);
    });

    it('returns true for err results', () => {
      const result = err('error');
      expect(isErr(result)).toBe(true);
    });

    it('narrows the type correctly', () => {
      const result: Result<number, string> = err('error');
      if (isErr(result)) {
        // Type should be narrowed to { ok: false; error: string }
        const error: string = result.error;
        expect(error).toBe('error');
      }
    });
  });

  describe('map()', () => {
    it('transforms ok values', () => {
      const result = ok(5);
      const mapped = map(result, (x) => x * 2);
      expect(mapped).toEqual({ ok: true, value: 10 });
    });

    it('passes through err values unchanged', () => {
      const result = err('error');
      const mapped = map(result, (x: number) => x * 2);
      expect(mapped).toEqual({ ok: false, error: 'error' });
    });
  });

  describe('mapErr()', () => {
    it('transforms err values', () => {
      const result = err('error');
      const mapped = mapErr(result, (e) => `wrapped: ${e}`);
      expect(mapped).toEqual({ ok: false, error: 'wrapped: error' });
    });

    it('passes through ok values unchanged', () => {
      const result = ok(42);
      const mapped = mapErr(result, (e: string) => `wrapped: ${e}`);
      expect(mapped).toEqual({ ok: true, value: 42 });
    });
  });

  describe('unwrap()', () => {
    it('returns value for ok results', () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it('throws wrapped error for err results with string', () => {
      const result = err('something went wrong');
      expect(() => unwrap(result)).toThrow('something went wrong');
    });

    it('throws error object for err results with Error', () => {
      const error = new Error('test error');
      const result = err(error);
      expect(() => unwrap(result)).toThrow(error);
    });
  });

  describe('unwrapOr()', () => {
    it('returns value for ok results', () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    it('returns default for err results', () => {
      const result = err('error');
      expect(unwrapOr(result, 0)).toBe(0);
    });
  });
});
