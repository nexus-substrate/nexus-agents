/**
 * Circular Buffer Tests
 * @see Issue #407
 */

import { describe, it, expect } from 'vitest';
import { CircularBuffer } from './circular-buffer.js';

describe('CircularBuffer', () => {
  describe('constructor', () => {
    it('creates buffer with specified capacity', () => {
      const buffer = new CircularBuffer<number>(5);
      expect(buffer.size).toBe(0);
      expect(buffer.isEmpty).toBe(true);
    });

    it('throws on capacity less than 1', () => {
      expect(() => new CircularBuffer(0)).toThrow('capacity must be at least 1');
      expect(() => new CircularBuffer(-1)).toThrow('capacity must be at least 1');
    });
  });

  describe('push', () => {
    it('adds items up to capacity', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.size).toBe(3);
      expect(buffer.isFull).toBe(true);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it('overwrites oldest items when full', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // Overwrites 1

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([2, 3, 4]);
    });

    it('handles multiple overwrites correctly', () => {
      const buffer = new CircularBuffer<number>(3);
      for (let i = 1; i <= 10; i++) {
        buffer.push(i);
      }

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([8, 9, 10]);
    });
  });

  describe('toArray', () => {
    it('returns empty array for empty buffer', () => {
      const buffer = new CircularBuffer<number>(5);
      expect(buffer.toArray()).toEqual([]);
    });

    it('returns items in insertion order', () => {
      const buffer = new CircularBuffer<string>(5);
      buffer.push('a');
      buffer.push('b');
      buffer.push('c');

      expect(buffer.toArray()).toEqual(['a', 'b', 'c']);
    });

    it('returns correct order after wrap-around', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);

      // Should have [3, 4, 5] in order
      expect(buffer.toArray()).toEqual([3, 4, 5]);
    });
  });

  describe('clear', () => {
    it('empties the buffer', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      buffer.clear();

      expect(buffer.size).toBe(0);
      expect(buffer.isEmpty).toBe(true);
      expect(buffer.toArray()).toEqual([]);
    });

    it('allows reuse after clear', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.clear();
      buffer.push(10);
      buffer.push(20);

      expect(buffer.toArray()).toEqual([10, 20]);
    });
  });

  describe('peekNewest', () => {
    it('returns undefined for empty buffer', () => {
      const buffer = new CircularBuffer<number>(3);
      expect(buffer.peekNewest()).toBeUndefined();
    });

    it('returns most recently added item', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.peekNewest()).toBe(3);
    });

    it('returns newest after wrap-around', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);

      expect(buffer.peekNewest()).toBe(4);
    });
  });

  describe('peekOldest', () => {
    it('returns undefined for empty buffer', () => {
      const buffer = new CircularBuffer<number>(3);
      expect(buffer.peekOldest()).toBeUndefined();
    });

    it('returns oldest item', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.peekOldest()).toBe(1);
    });

    it('returns oldest after wrap-around', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);

      expect(buffer.peekOldest()).toBe(2);
    });
  });

  describe('iterator', () => {
    it('iterates in insertion order', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      const items = [...buffer];
      expect(items).toEqual([1, 2, 3]);
    });

    it('works with for...of', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(10);
      buffer.push(20);

      const items: number[] = [];
      for (const item of buffer) {
        items.push(item);
      }

      expect(items).toEqual([10, 20]);
    });

    it('iterates correctly after wrap-around', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);

      const items = [...buffer];
      expect(items).toEqual([3, 4, 5]);
    });
  });

  describe('edge cases', () => {
    it('handles capacity of 1', () => {
      const buffer = new CircularBuffer<number>(1);
      buffer.push(1);
      expect(buffer.toArray()).toEqual([1]);

      buffer.push(2);
      expect(buffer.toArray()).toEqual([2]);

      buffer.push(3);
      expect(buffer.toArray()).toEqual([3]);
    });

    it('handles objects', () => {
      const buffer = new CircularBuffer<{ id: number }>(2);
      buffer.push({ id: 1 });
      buffer.push({ id: 2 });

      expect(buffer.toArray()).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('handles null and undefined values', () => {
      const buffer = new CircularBuffer<number | null | undefined>(3);
      buffer.push(1);
      buffer.push(null);
      buffer.push(undefined);

      expect(buffer.toArray()).toEqual([1, null, undefined]);
    });
  });
});
