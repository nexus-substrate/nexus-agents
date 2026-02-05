/**
 * Tests for random-provider utilities
 *
 * @module core/random-provider.test
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  SystemRandomProvider,
  SeededRandomProvider,
  getRandomProvider,
  setRandomProvider,
  resetRandomProvider,
  createRandomProvider,
  type IRandomProvider,
} from './random-provider.js';

describe('random-provider', () => {
  afterEach(() => {
    resetRandomProvider();
  });

  describe('SystemRandomProvider', () => {
    it('random() returns number between 0 and 1', () => {
      const provider = new SystemRandomProvider();
      for (let i = 0; i < 100; i++) {
        const value = provider.random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('randomInt() returns integer in range', () => {
      const provider = new SystemRandomProvider();
      for (let i = 0; i < 100; i++) {
        const value = provider.randomInt(5, 15);
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThan(15);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('randomInt() handles single value range', () => {
      const provider = new SystemRandomProvider();
      const value = provider.randomInt(10, 11);
      expect(value).toBe(10);
    });

    it('randomString() returns string of correct length', () => {
      const provider = new SystemRandomProvider();
      expect(provider.randomString(8)).toHaveLength(8);
      expect(provider.randomString(16)).toHaveLength(16);
      expect(provider.randomString(0)).toBe('');
    });

    it('randomString() contains only alphanumeric chars', () => {
      const provider = new SystemRandomProvider();
      const str = provider.randomString(100);
      expect(str).toMatch(/^[a-z0-9]+$/);
    });

    it('randomChoice() returns element from array', () => {
      const provider = new SystemRandomProvider();
      const items = ['a', 'b', 'c', 'd'];
      for (let i = 0; i < 100; i++) {
        const choice = provider.randomChoice(items);
        expect(items).toContain(choice);
      }
    });

    it('randomChoice() returns undefined for empty array', () => {
      const provider = new SystemRandomProvider();
      const emptyArray: string[] = [];
      const result = provider.randomChoice(emptyArray);
      expect(result).toBeUndefined();
    });

    it('shuffle() returns new array with same elements', () => {
      const provider = new SystemRandomProvider();
      const original = [1, 2, 3, 4, 5];
      const shuffled = provider.shuffle(original);

      expect(shuffled).not.toBe(original); // New array
      expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]); // Same elements
    });

    it('shuffle() does not modify original', () => {
      const provider = new SystemRandomProvider();
      const original = [1, 2, 3, 4, 5];
      const copy = [...original];
      provider.shuffle(original);

      expect(original).toEqual(copy);
    });

    it('shuffle() handles empty array', () => {
      const provider = new SystemRandomProvider();
      expect(provider.shuffle([])).toEqual([]);
    });

    it('shuffle() handles single element', () => {
      const provider = new SystemRandomProvider();
      expect(provider.shuffle([42])).toEqual([42]);
    });

    it('uuid() returns valid UUID v4 format', () => {
      const provider = new SystemRandomProvider();
      const uuid = provider.uuid();
      // UUID v4 format with version 4 in position 13
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('uuid() generates unique values', () => {
      const provider = new SystemRandomProvider();
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(provider.uuid());
      }
      expect(uuids.size).toBe(100);
    });
  });

  describe('SeededRandomProvider', () => {
    it('produces deterministic sequence with same seed', () => {
      const provider1 = new SeededRandomProvider(12345);
      const provider2 = new SeededRandomProvider(12345);

      for (let i = 0; i < 10; i++) {
        expect(provider1.random()).toBe(provider2.random());
      }
    });

    it('produces different sequence with different seed', () => {
      const provider1 = new SeededRandomProvider(12345);
      const provider2 = new SeededRandomProvider(54321);

      // Very unlikely to be equal by chance
      expect(provider1.random()).not.toBe(provider2.random());
    });

    it('random() returns values in [0, 1)', () => {
      const provider = new SeededRandomProvider(42);
      for (let i = 0; i < 100; i++) {
        const value = provider.random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('randomInt() is deterministic with seed', () => {
      const provider1 = new SeededRandomProvider(999);
      const provider2 = new SeededRandomProvider(999);

      for (let i = 0; i < 10; i++) {
        expect(provider1.randomInt(0, 100)).toBe(provider2.randomInt(0, 100));
      }
    });

    it('randomString() is deterministic with seed', () => {
      const provider1 = new SeededRandomProvider(777);
      const provider2 = new SeededRandomProvider(777);

      expect(provider1.randomString(20)).toBe(provider2.randomString(20));
    });

    it('randomChoice() is deterministic with seed', () => {
      const items = ['apple', 'banana', 'cherry', 'date'];
      const provider1 = new SeededRandomProvider(888);
      const provider2 = new SeededRandomProvider(888);

      for (let i = 0; i < 10; i++) {
        expect(provider1.randomChoice(items)).toBe(provider2.randomChoice(items));
      }
    });

    it('shuffle() is deterministic with seed', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const provider1 = new SeededRandomProvider(111);
      const provider2 = new SeededRandomProvider(111);

      expect(provider1.shuffle(items)).toEqual(provider2.shuffle(items));
    });

    it('uuid() is deterministic with seed', () => {
      const provider1 = new SeededRandomProvider(222);
      const provider2 = new SeededRandomProvider(222);

      expect(provider1.uuid()).toBe(provider2.uuid());
    });

    it('reset() restarts the sequence', () => {
      const provider = new SeededRandomProvider(12345);
      const firstValue = provider.random();
      provider.random();
      provider.random();

      provider.reset(12345);
      expect(provider.random()).toBe(firstValue);
    });

    it('reset() with different seed changes sequence', () => {
      const provider = new SeededRandomProvider(12345);
      const value1 = provider.random();

      provider.reset(54321);
      const value2 = provider.random();

      expect(value1).not.toBe(value2);
    });

    it('produces uniform distribution', () => {
      const provider = new SeededRandomProvider(42);
      const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const samples = 10000;

      for (let i = 0; i < samples; i++) {
        const bucket = Math.floor(provider.random() * 10);
        buckets[bucket] = (buckets[bucket] ?? 0) + 1;
      }

      // Each bucket should have ~1000 samples (±20%)
      for (const count of buckets) {
        expect(count).toBeGreaterThan(800);
        expect(count).toBeLessThan(1200);
      }
    });
  });

  describe('getRandomProvider / setRandomProvider / resetRandomProvider', () => {
    it('returns default SystemRandomProvider', () => {
      resetRandomProvider();
      const provider = getRandomProvider();
      expect(provider).toBeInstanceOf(SystemRandomProvider);
    });

    it('setRandomProvider changes the global provider', () => {
      const seeded = new SeededRandomProvider(12345);
      setRandomProvider(seeded);

      expect(getRandomProvider()).toBe(seeded);
    });

    it('resetRandomProvider restores SystemRandomProvider', () => {
      const seeded = new SeededRandomProvider(12345);
      setRandomProvider(seeded);
      resetRandomProvider();

      expect(getRandomProvider()).toBeInstanceOf(SystemRandomProvider);
    });

    it('changes persist until reset', () => {
      const seeded = new SeededRandomProvider(99999);
      setRandomProvider(seeded);

      expect(getRandomProvider()).toBe(seeded);
      expect(getRandomProvider()).toBe(seeded);

      resetRandomProvider();
      expect(getRandomProvider()).not.toBe(seeded);
    });
  });

  describe('createRandomProvider', () => {
    it('creates SystemRandomProvider by default', () => {
      const provider = createRandomProvider();
      expect(provider).toBeInstanceOf(SystemRandomProvider);
    });

    it('creates SystemRandomProvider with empty config', () => {
      const provider = createRandomProvider({});
      expect(provider).toBeInstanceOf(SystemRandomProvider);
    });

    it('creates SeededRandomProvider when seed is provided', () => {
      const provider = createRandomProvider({ seed: 12345 });
      expect(provider).toBeInstanceOf(SeededRandomProvider);
    });

    it('seeded provider produces deterministic output', () => {
      const provider1 = createRandomProvider({ seed: 42 });
      const provider2 = createRandomProvider({ seed: 42 });

      expect(provider1.random()).toBe(provider2.random());
    });
  });

  describe('IRandomProvider interface compliance', () => {
    const providers: Array<{ name: string; create: () => IRandomProvider }> = [
      { name: 'SystemRandomProvider', create: () => new SystemRandomProvider() },
      { name: 'SeededRandomProvider', create: () => new SeededRandomProvider(42) },
    ];

    for (const { name, create } of providers) {
      describe(name, () => {
        it('implements random()', () => {
          const provider = create();
          const value = provider.random();
          expect(typeof value).toBe('number');
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        });

        it('implements randomInt()', () => {
          const provider = create();
          const value = provider.randomInt(0, 10);
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(10);
        });

        it('implements randomString()', () => {
          const provider = create();
          const str = provider.randomString(10);
          expect(typeof str).toBe('string');
          expect(str).toHaveLength(10);
        });

        it('implements randomChoice()', () => {
          const provider = create();
          const items = ['x', 'y', 'z'];
          const choice = provider.randomChoice(items);
          expect(items).toContain(choice);
        });

        it('implements shuffle()', () => {
          const provider = create();
          const items = [1, 2, 3];
          const shuffled = provider.shuffle(items);
          expect(Array.isArray(shuffled)).toBe(true);
          expect(shuffled.sort()).toEqual([1, 2, 3]);
        });

        it('implements uuid()', () => {
          const provider = create();
          const uuid = provider.uuid();
          expect(typeof uuid).toBe('string');
          expect(uuid).toMatch(/-/); // Contains hyphens
        });
      });
    }
  });
});
