/**
 * Tests for concurrent expert admission control.
 *
 * @module agents/expert-pool.test
 * (Source: Issue #1029 — Concurrent expert admission control)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpertPool, getExpertPool, resetExpertPool } from './expert-pool.js';

describe('ExpertPool', () => {
  beforeEach(() => {
    resetExpertPool();
    delete process.env.NEXUS_MAX_CONCURRENT_EXPERTS;
  });

  afterEach(() => {
    resetExpertPool();
    delete process.env.NEXUS_MAX_CONCURRENT_EXPERTS;
  });

  describe('constructor', () => {
    it('should default to capacity 6', () => {
      const pool = new ExpertPool();
      expect(pool.getStatus().capacity).toBe(6);
    });

    it('should accept custom capacity', () => {
      const pool = new ExpertPool({ capacity: 3 });
      expect(pool.getStatus().capacity).toBe(3);
    });

    it('should clamp capacity to minimum 1', () => {
      const pool = new ExpertPool({ capacity: 0 });
      expect(pool.getStatus().capacity).toBe(1);
    });

    it('should clamp capacity to maximum 20', () => {
      const pool = new ExpertPool({ capacity: 100 });
      expect(pool.getStatus().capacity).toBe(20);
    });

    it('should read capacity from NEXUS_MAX_CONCURRENT_EXPERTS', () => {
      process.env.NEXUS_MAX_CONCURRENT_EXPERTS = '4';
      const pool = new ExpertPool();
      expect(pool.getStatus().capacity).toBe(4);
    });
  });

  describe('acquire/release', () => {
    it('should issue permit immediately when under capacity', async () => {
      const pool = new ExpertPool({ capacity: 2 });
      const permit = await pool.acquire();
      expect(permit.id).toBe(1);
      expect(permit.acquiredAt).toBeGreaterThan(0);
      expect(pool.getStatus().active).toBe(1);
    });

    it('should track active count correctly', async () => {
      const pool = new ExpertPool({ capacity: 3 });
      const p1 = await pool.acquire();
      const p2 = await pool.acquire();
      expect(pool.getStatus().active).toBe(2);

      pool.release(p1);
      expect(pool.getStatus().active).toBe(1);

      pool.release(p2);
      expect(pool.getStatus().active).toBe(0);
    });

    it('should queue when at capacity and dequeue on release', async () => {
      const pool = new ExpertPool({ capacity: 1 });
      const p1 = await pool.acquire();
      expect(pool.getStatus().active).toBe(1);

      // This will queue since capacity is 1
      const p2Promise = pool.acquire();
      expect(pool.getStatus().queued).toBe(1);

      // Release first permit — should dequeue the waiter
      pool.release(p1);
      const p2 = await p2Promise;
      expect(p2.id).toBe(2);
      expect(pool.getStatus().active).toBe(1);
      expect(pool.getStatus().queued).toBe(0);

      pool.release(p2);
    });

    it('should support 6 concurrent acquires at default capacity', async () => {
      const pool = new ExpertPool();
      const permits = await Promise.all(Array.from({ length: 6 }, () => pool.acquire()));
      expect(pool.getStatus().active).toBe(6);
      expect(permits).toHaveLength(6);

      for (const p of permits) {
        pool.release(p);
      }
      expect(pool.getStatus().active).toBe(0);
    });

    it('should timeout queued acquire after acquireTimeoutMs', async () => {
      const pool = new ExpertPool({ capacity: 1, acquireTimeoutMs: 50 });
      await pool.acquire(); // fills capacity

      await expect(pool.acquire()).rejects.toThrow('Expert pool full');
      await expect(pool.acquire()).rejects.toThrow('timed out');
    });

    it('should not go negative on extra release', async () => {
      const pool = new ExpertPool({ capacity: 2 });
      const p1 = await pool.acquire();
      pool.release(p1);
      pool.release(p1); // extra release
      expect(pool.getStatus().active).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return correct status snapshot', async () => {
      const pool = new ExpertPool({ capacity: 2 });
      expect(pool.getStatus()).toEqual({ active: 0, queued: 0, capacity: 2 });

      const p1 = await pool.acquire();
      await pool.acquire();
      expect(pool.getStatus()).toEqual({ active: 2, queued: 0, capacity: 2 });

      pool.release(p1);
      expect(pool.getStatus()).toEqual({ active: 1, queued: 0, capacity: 2 });
    });
  });

  describe('singleton', () => {
    it('should return same instance from getExpertPool()', () => {
      const a = getExpertPool();
      const b = getExpertPool();
      expect(a).toBe(b);
    });

    it('should create fresh instance after resetExpertPool()', () => {
      const a = getExpertPool();
      resetExpertPool();
      const b = getExpertPool();
      expect(a).not.toBe(b);
    });
  });
});
