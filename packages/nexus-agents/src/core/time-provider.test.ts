/**
 * Tests for time-provider utilities
 *
 * @module core/time-provider.test
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  SystemTimeProvider,
  FixedTimeProvider,
  getTimeProvider,
  setTimeProvider,
  resetTimeProvider,
  createTimeProvider,
  type ITimeProvider,
} from './time-provider.js';

describe('time-provider', () => {
  afterEach(() => {
    resetTimeProvider();
    vi.useRealTimers();
  });

  describe('SystemTimeProvider', () => {
    it('returns current time from Date.now()', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

      const provider = new SystemTimeProvider();
      expect(provider.now()).toBe(new Date('2024-06-15T12:00:00Z').getTime());
    });

    it('returns ISO string', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));

      const provider = new SystemTimeProvider();
      expect(provider.nowIso()).toBe('2024-06-15T12:00:00.000Z');
    });

    it('returns Date object', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

      const provider = new SystemTimeProvider();
      const date = provider.nowDate();
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBe(new Date('2024-06-15T12:00:00Z').getTime());
    });

    it('returns date string in YYYY-MM-DD format', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

      const provider = new SystemTimeProvider();
      expect(provider.nowDateString()).toBe('2024-06-15');
    });

    it('applies offset when configured', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

      const provider = new SystemTimeProvider({ offsetMs: 3600000 }); // +1 hour
      const expected = new Date('2024-06-15T13:00:00Z').getTime();
      expect(provider.now()).toBe(expected);
    });

    it('handles negative offset', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

      const provider = new SystemTimeProvider({ offsetMs: -7200000 }); // -2 hours
      const expected = new Date('2024-06-15T10:00:00Z').getTime();
      expect(provider.now()).toBe(expected);
    });

    it('defaults to zero offset', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

      const provider = new SystemTimeProvider();
      const providerNoConfig = new SystemTimeProvider({});
      expect(provider.now()).toBe(providerNoConfig.now());
    });
  });

  describe('FixedTimeProvider', () => {
    it('returns fixed timestamp', () => {
      const fixedTime = 1718452800000; // 2024-06-15T12:00:00Z
      const provider = new FixedTimeProvider(fixedTime);

      expect(provider.now()).toBe(fixedTime);
      expect(provider.now()).toBe(fixedTime); // Same value each time
    });

    it('accepts Date object in constructor', () => {
      const date = new Date('2024-06-15T12:00:00Z');
      const provider = new FixedTimeProvider(date);

      expect(provider.now()).toBe(date.getTime());
    });

    it('returns consistent ISO string', () => {
      const provider = new FixedTimeProvider(new Date('2024-06-15T12:00:00.000Z'));

      expect(provider.nowIso()).toBe('2024-06-15T12:00:00.000Z');
      expect(provider.nowIso()).toBe('2024-06-15T12:00:00.000Z');
    });

    it('returns consistent Date object', () => {
      const fixedTime = new Date('2024-06-15T12:00:00Z');
      const provider = new FixedTimeProvider(fixedTime);

      const date1 = provider.nowDate();
      const date2 = provider.nowDate();
      expect(date1.getTime()).toBe(date2.getTime());
    });

    it('returns date string', () => {
      const provider = new FixedTimeProvider(new Date('2024-06-15T12:00:00Z'));
      expect(provider.nowDateString()).toBe('2024-06-15');
    });

    it('advance() increases time', () => {
      const provider = new FixedTimeProvider(1000000);
      provider.advance(5000);

      expect(provider.now()).toBe(1005000);
    });

    it('advance() accumulates', () => {
      const provider = new FixedTimeProvider(1000000);
      provider.advance(1000);
      provider.advance(2000);

      expect(provider.now()).toBe(1003000);
    });

    it('setTime() changes to new value', () => {
      const provider = new FixedTimeProvider(1000000);
      provider.setTime(2000000);

      expect(provider.now()).toBe(2000000);
    });

    it('setTime() accepts Date object', () => {
      const provider = new FixedTimeProvider(1000000);
      const newDate = new Date('2024-12-25T00:00:00Z');
      provider.setTime(newDate);

      expect(provider.now()).toBe(newDate.getTime());
    });

    it('defaults to current time if no argument', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

      const provider = new FixedTimeProvider();
      expect(provider.now()).toBe(new Date('2024-06-15T12:00:00Z').getTime());
    });
  });

  describe('getTimeProvider / setTimeProvider / resetTimeProvider', () => {
    it('returns default SystemTimeProvider', () => {
      resetTimeProvider();
      const provider = getTimeProvider();
      expect(provider).toBeInstanceOf(SystemTimeProvider);
    });

    it('setTimeProvider changes the global provider', () => {
      const fixed = new FixedTimeProvider(12345);
      setTimeProvider(fixed);

      expect(getTimeProvider().now()).toBe(12345);
    });

    it('resetTimeProvider restores SystemTimeProvider', () => {
      const fixed = new FixedTimeProvider(12345);
      setTimeProvider(fixed);
      resetTimeProvider();

      expect(getTimeProvider()).toBeInstanceOf(SystemTimeProvider);
    });

    it('changes persist until reset', () => {
      const fixed = new FixedTimeProvider(99999);
      setTimeProvider(fixed);

      expect(getTimeProvider().now()).toBe(99999);
      expect(getTimeProvider().now()).toBe(99999);

      resetTimeProvider();
      expect(getTimeProvider()).not.toBe(fixed);
    });
  });

  describe('createTimeProvider', () => {
    it('creates SystemTimeProvider by default', () => {
      const provider = createTimeProvider();
      expect(provider).toBeInstanceOf(SystemTimeProvider);
    });

    it('creates SystemTimeProvider with empty config', () => {
      const provider = createTimeProvider({});
      expect(provider).toBeInstanceOf(SystemTimeProvider);
    });

    it('creates FixedTimeProvider when fixedTime is provided', () => {
      const provider = createTimeProvider({ fixedTime: 12345 });
      expect(provider).toBeInstanceOf(FixedTimeProvider);
      expect(provider.now()).toBe(12345);
    });

    it('creates SystemTimeProvider with offset', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

      const provider = createTimeProvider({ offsetMs: 1000 });
      expect(provider).toBeInstanceOf(SystemTimeProvider);
      expect(provider.now()).toBe(new Date('2024-06-15T12:00:00Z').getTime() + 1000);
    });

    it('fixedTime takes precedence over offsetMs', () => {
      const provider = createTimeProvider({ fixedTime: 50000, offsetMs: 1000 });
      expect(provider).toBeInstanceOf(FixedTimeProvider);
      expect(provider.now()).toBe(50000);
    });
  });

  describe('ITimeProvider interface compliance', () => {
    const providers: Array<{ name: string; create: () => ITimeProvider }> = [
      { name: 'SystemTimeProvider', create: () => new SystemTimeProvider() },
      { name: 'FixedTimeProvider', create: () => new FixedTimeProvider(1000000) },
    ];

    for (const { name, create } of providers) {
      describe(name, () => {
        it('implements now()', () => {
          const provider = create();
          expect(typeof provider.now()).toBe('number');
        });

        it('implements nowIso()', () => {
          const provider = create();
          expect(typeof provider.nowIso()).toBe('string');
          expect(provider.nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });

        it('implements nowDate()', () => {
          const provider = create();
          expect(provider.nowDate()).toBeInstanceOf(Date);
        });

        it('implements nowDateString()', () => {
          const provider = create();
          expect(typeof provider.nowDateString()).toBe('string');
          expect(provider.nowDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
      });
    }
  });
});
