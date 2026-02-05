/**
 * Tests for command-result utilities
 *
 * @module core/command-result.test
 */

import { describe, it, expect } from 'vitest';
import {
  commandOk,
  commandErr,
  isCommandOk,
  isCommandErr,
  getCommandData,
  type CommandResult,
} from './command-result.js';

describe('command-result', () => {
  describe('commandOk', () => {
    it('creates success result without message or data', () => {
      const result = commandOk();
      expect(result.success).toBe(true);
      expect(result.message).toBeUndefined();
      expect(result.data).toBeUndefined();
    });

    it('creates success result with message', () => {
      const result = commandOk('Operation completed');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Operation completed');
      expect(result.data).toBeUndefined();
    });

    it('creates success result with data', () => {
      const result = commandOk('Success', { key: 'value' });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Success');
      expect(result.data).toEqual({ key: 'value' });
    });

    it('creates success result with undefined message and data', () => {
      const result = commandOk(undefined, { count: 42 });
      expect(result.success).toBe(true);
      expect(result.message).toBeUndefined();
      expect(result.data).toEqual({ count: 42 });
    });

    it('preserves complex data types', () => {
      const data = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        date: '2024-01-01',
      };
      const result = commandOk('Done', data);
      expect(result.data).toEqual(data);
    });
  });

  describe('commandErr', () => {
    it('creates error result with message', () => {
      const result = commandErr('Something went wrong');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Something went wrong');
      expect(result.error).toBeUndefined();
    });

    it('creates error result with message and error details', () => {
      const result = commandErr('Failed', 'ENOENT: file not found');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed');
      expect(result.error).toBe('ENOENT: file not found');
    });

    it('does not include data in error result', () => {
      const result = commandErr('Error');
      expect(result.data).toBeUndefined();
    });
  });

  describe('isCommandOk', () => {
    it('returns true for success result', () => {
      const result = commandOk('Done');
      expect(isCommandOk(result)).toBe(true);
    });

    it('returns false for error result', () => {
      const result = commandErr('Failed');
      expect(isCommandOk(result)).toBe(false);
    });

    it('narrows type correctly on success', () => {
      const result: CommandResult<{ value: number }> = commandOk('Done', { value: 42 });
      if (isCommandOk(result)) {
        // TypeScript should know result.success is true
        expect(result.success).toBe(true);
      }
    });
  });

  describe('isCommandErr', () => {
    it('returns true for error result', () => {
      const result = commandErr('Failed');
      expect(isCommandErr(result)).toBe(true);
    });

    it('returns false for success result', () => {
      const result = commandOk('Done');
      expect(isCommandErr(result)).toBe(false);
    });

    it('narrows type correctly on error', () => {
      const result: CommandResult = commandErr('Failed');
      if (isCommandErr(result)) {
        // TypeScript should know result.success is false
        expect(result.success).toBe(false);
      }
    });
  });

  describe('getCommandData', () => {
    it('returns data from successful result', () => {
      const result = commandOk('Done', { value: 42 });
      expect(getCommandData(result)).toEqual({ value: 42 });
    });

    it('returns undefined from success result without data', () => {
      const result = commandOk('Done');
      expect(getCommandData(result)).toBeUndefined();
    });

    it('returns undefined from error result', () => {
      const result = commandErr('Failed');
      expect(getCommandData(result)).toBeUndefined();
    });

    it('returns undefined from error result even if it somehow had data', () => {
      // Manually construct an invalid result for edge case testing
      const result: CommandResult<{ value: number }> = {
        success: false,
        message: 'Failed',
        data: { value: 42 }, // This shouldn't happen but let's be safe
      };
      expect(getCommandData(result)).toBeUndefined();
    });

    it('handles typed results correctly', () => {
      interface MyData {
        name: string;
        count: number;
      }
      const result: CommandResult<MyData> = commandOk('Done', { name: 'test', count: 5 });
      const data = getCommandData(result);
      expect(data?.name).toBe('test');
      expect(data?.count).toBe(5);
    });
  });

  describe('CommandResult type', () => {
    it('allows void generic type (default)', () => {
      const result: CommandResult = { success: true };
      expect(result.success).toBe(true);
    });

    it('allows typed data generic', () => {
      const result: CommandResult<{ id: string }> = {
        success: true,
        message: 'Created',
        data: { id: 'abc123' },
      };
      expect(result.data?.id).toBe('abc123');
    });

    it('allows error with generic type', () => {
      const result: CommandResult<{ id: string }> = {
        success: false,
        message: 'Not found',
        error: 'Resource does not exist',
      };
      expect(result.success).toBe(false);
      expect(result.error).toBe('Resource does not exist');
    });
  });
});
