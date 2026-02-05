/**
 * Tests for type-coercion utilities
 *
 * @module utils/type-coercion.test
 */

import { describe, it, expect } from 'vitest';
import {
  asRecord,
  isRecord,
  asString,
  asNumber,
  asBoolean,
  asArray,
  extractStringField,
  extractNumberField,
  extractBooleanField,
  extractRecordField,
  safeJsonParse,
  safeJsonParseRecord,
} from './type-coercion.js';

describe('type-coercion', () => {
  describe('asRecord', () => {
    it('returns object for valid record', () => {
      const obj = { name: 'test', value: 42 };
      expect(asRecord(obj)).toBe(obj);
    });

    it('returns null for null', () => {
      expect(asRecord(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(asRecord(undefined)).toBeNull();
    });

    it('returns null for array', () => {
      expect(asRecord([1, 2, 3])).toBeNull();
    });

    it('returns null for string', () => {
      expect(asRecord('test')).toBeNull();
    });

    it('returns null for number', () => {
      expect(asRecord(42)).toBeNull();
    });

    it('returns null for boolean', () => {
      expect(asRecord(true)).toBeNull();
    });

    it('handles empty object', () => {
      const obj = {};
      expect(asRecord(obj)).toBe(obj);
    });
  });

  describe('isRecord', () => {
    it('returns true for valid record', () => {
      expect(isRecord({ key: 'value' })).toBe(true);
    });

    it('returns true for empty object', () => {
      expect(isRecord({})).toBe(true);
    });

    it('returns false for null', () => {
      expect(isRecord(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isRecord(undefined)).toBe(false);
    });

    it('returns false for array', () => {
      expect(isRecord([])).toBe(false);
    });

    it('returns false for string', () => {
      expect(isRecord('test')).toBe(false);
    });

    it('returns false for number', () => {
      expect(isRecord(123)).toBe(false);
    });

    it('returns false for boolean', () => {
      expect(isRecord(false)).toBe(false);
    });
  });

  describe('asString', () => {
    it('returns string for valid string', () => {
      expect(asString('hello')).toBe('hello');
    });

    it('returns empty string for empty string', () => {
      expect(asString('')).toBe('');
    });

    it('returns null for number', () => {
      expect(asString(42)).toBeNull();
    });

    it('returns null for boolean', () => {
      expect(asString(true)).toBeNull();
    });

    it('returns null for object', () => {
      expect(asString({})).toBeNull();
    });

    it('returns null for array', () => {
      expect(asString([])).toBeNull();
    });

    it('returns null for null', () => {
      expect(asString(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(asString(undefined)).toBeNull();
    });
  });

  describe('asNumber', () => {
    it('returns number for valid integer', () => {
      expect(asNumber(42)).toBe(42);
    });

    it('returns number for valid float', () => {
      expect(asNumber(3.14)).toBe(3.14);
    });

    it('returns number for zero', () => {
      expect(asNumber(0)).toBe(0);
    });

    it('returns number for negative', () => {
      expect(asNumber(-100)).toBe(-100);
    });

    it('returns null for NaN', () => {
      expect(asNumber(NaN)).toBeNull();
    });

    it('returns null for Infinity', () => {
      expect(asNumber(Infinity)).toBeNull();
    });

    it('returns null for negative Infinity', () => {
      expect(asNumber(-Infinity)).toBeNull();
    });

    it('returns null for string', () => {
      expect(asNumber('42')).toBeNull();
    });

    it('returns null for boolean', () => {
      expect(asNumber(true)).toBeNull();
    });

    it('returns null for null', () => {
      expect(asNumber(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(asNumber(undefined)).toBeNull();
    });
  });

  describe('asBoolean', () => {
    it('returns true for true', () => {
      expect(asBoolean(true)).toBe(true);
    });

    it('returns false for false', () => {
      expect(asBoolean(false)).toBe(false);
    });

    it('returns null for truthy number', () => {
      expect(asBoolean(1)).toBeNull();
    });

    it('returns null for falsy number', () => {
      expect(asBoolean(0)).toBeNull();
    });

    it('returns null for truthy string', () => {
      expect(asBoolean('true')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(asBoolean('')).toBeNull();
    });

    it('returns null for null', () => {
      expect(asBoolean(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(asBoolean(undefined)).toBeNull();
    });

    it('returns null for object', () => {
      expect(asBoolean({})).toBeNull();
    });
  });

  describe('asArray', () => {
    it('returns array for valid array', () => {
      const arr = [1, 2, 3];
      expect(asArray(arr)).toBe(arr);
    });

    it('returns empty array for empty array', () => {
      const arr: unknown[] = [];
      expect(asArray(arr)).toBe(arr);
    });

    it('returns array for mixed types', () => {
      const arr = [1, 'two', { three: 3 }];
      expect(asArray(arr)).toBe(arr);
    });

    it('returns null for object', () => {
      expect(asArray({})).toBeNull();
    });

    it('returns null for string', () => {
      expect(asArray('test')).toBeNull();
    });

    it('returns null for number', () => {
      expect(asArray(42)).toBeNull();
    });

    it('returns null for null', () => {
      expect(asArray(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(asArray(undefined)).toBeNull();
    });
  });

  describe('extractStringField', () => {
    it('extracts valid string field', () => {
      const record = { name: 'test', value: 42 };
      expect(extractStringField(record, 'name')).toBe('test');
    });

    it('extracts empty string field', () => {
      const record = { name: '' };
      expect(extractStringField(record, 'name')).toBe('');
    });

    it('returns undefined for missing field', () => {
      const record = { name: 'test' };
      expect(extractStringField(record, 'missing')).toBeUndefined();
    });

    it('returns undefined for non-string field', () => {
      const record = { name: 42 };
      expect(extractStringField(record, 'name')).toBeUndefined();
    });

    it('returns undefined for null field', () => {
      const record = { name: null };
      expect(extractStringField(record, 'name')).toBeUndefined();
    });
  });

  describe('extractNumberField', () => {
    it('extracts valid number field', () => {
      const record = { count: 42 };
      expect(extractNumberField(record, 'count')).toBe(42);
    });

    it('extracts zero', () => {
      const record = { count: 0 };
      expect(extractNumberField(record, 'count')).toBe(0);
    });

    it('extracts negative number', () => {
      const record = { count: -10 };
      expect(extractNumberField(record, 'count')).toBe(-10);
    });

    it('extracts float', () => {
      const record = { ratio: 0.5 };
      expect(extractNumberField(record, 'ratio')).toBe(0.5);
    });

    it('returns null for missing field', () => {
      const record = { count: 42 };
      expect(extractNumberField(record, 'missing')).toBeNull();
    });

    it('returns null for string field', () => {
      const record = { count: '42' };
      expect(extractNumberField(record, 'count')).toBeNull();
    });

    it('returns null for NaN', () => {
      const record = { count: NaN };
      expect(extractNumberField(record, 'count')).toBeNull();
    });

    it('returns null for Infinity', () => {
      const record = { count: Infinity };
      expect(extractNumberField(record, 'count')).toBeNull();
    });
  });

  describe('extractBooleanField', () => {
    it('extracts true', () => {
      const record = { active: true };
      expect(extractBooleanField(record, 'active')).toBe(true);
    });

    it('extracts false', () => {
      const record = { active: false };
      expect(extractBooleanField(record, 'active')).toBe(false);
    });

    it('returns undefined for missing field', () => {
      const record = { active: true };
      expect(extractBooleanField(record, 'missing')).toBeUndefined();
    });

    it('returns undefined for string field', () => {
      const record = { active: 'true' };
      expect(extractBooleanField(record, 'active')).toBeUndefined();
    });

    it('returns undefined for number field', () => {
      const record = { active: 1 };
      expect(extractBooleanField(record, 'active')).toBeUndefined();
    });
  });

  describe('extractRecordField', () => {
    it('extracts nested record', () => {
      const nested = { inner: 'value' };
      const record = { data: nested };
      expect(extractRecordField(record, 'data')).toBe(nested);
    });

    it('extracts empty record', () => {
      const nested = {};
      const record = { data: nested };
      expect(extractRecordField(record, 'data')).toBe(nested);
    });

    it('returns null for missing field', () => {
      const record = { data: {} };
      expect(extractRecordField(record, 'missing')).toBeNull();
    });

    it('returns null for array field', () => {
      const record = { data: [1, 2, 3] };
      expect(extractRecordField(record, 'data')).toBeNull();
    });

    it('returns null for string field', () => {
      const record = { data: 'not an object' };
      expect(extractRecordField(record, 'data')).toBeNull();
    });

    it('returns null for null field', () => {
      const record = { data: null };
      expect(extractRecordField(record, 'data')).toBeNull();
    });
  });

  describe('safeJsonParse', () => {
    it('parses valid JSON object', () => {
      expect(safeJsonParse('{"name":"test"}')).toEqual({ name: 'test' });
    });

    it('parses valid JSON array', () => {
      expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('parses valid JSON string', () => {
      expect(safeJsonParse('"hello"')).toBe('hello');
    });

    it('parses valid JSON number', () => {
      expect(safeJsonParse('42')).toBe(42);
    });

    it('parses valid JSON boolean', () => {
      expect(safeJsonParse('true')).toBe(true);
    });

    it('parses valid JSON null', () => {
      expect(safeJsonParse('null')).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(safeJsonParse('not valid json')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(safeJsonParse('')).toBeNull();
    });

    it('returns null for incomplete JSON', () => {
      expect(safeJsonParse('{"name":')).toBeNull();
    });

    it('returns null for trailing comma', () => {
      expect(safeJsonParse('{"name": "test",}')).toBeNull();
    });
  });

  describe('safeJsonParseRecord', () => {
    it('parses valid JSON object', () => {
      expect(safeJsonParseRecord('{"name":"test"}')).toEqual({ name: 'test' });
    });

    it('parses empty JSON object', () => {
      expect(safeJsonParseRecord('{}')).toEqual({});
    });

    it('returns null for JSON array', () => {
      expect(safeJsonParseRecord('[1,2,3]')).toBeNull();
    });

    it('returns null for JSON string', () => {
      expect(safeJsonParseRecord('"hello"')).toBeNull();
    });

    it('returns null for JSON number', () => {
      expect(safeJsonParseRecord('42')).toBeNull();
    });

    it('returns null for JSON null', () => {
      expect(safeJsonParseRecord('null')).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(safeJsonParseRecord('invalid')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(safeJsonParseRecord('')).toBeNull();
    });
  });
});
