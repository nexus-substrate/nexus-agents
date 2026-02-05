/**
 * Tests for id-utils utilities
 *
 * @module utils/id-utils.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateId,
  generateHyphenId,
  generateShortUuid,
  generateUUID,
  generateShortUUIDv4,
  generateStepId,
  uuidv4,
} from './id-utils.js';
import * as coreIndex from '../core/index.js';

describe('id-utils', () => {
  describe('generateId', () => {
    beforeEach(() => {
      // Mock providers for deterministic testing
      vi.spyOn(coreIndex, 'getTimeProvider').mockReturnValue({
        now: () => 1000000,
      });
      vi.spyOn(coreIndex, 'getRandomProvider').mockReturnValue({
        random: () => 0.123456789,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('generates ID with correct format', () => {
      const id = generateId('test');
      expect(id).toMatch(/^test_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('uses underscore separator', () => {
      const id = generateId('prefix');
      const parts = id.split('_');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('prefix');
    });

    it('uses default random length of 8', () => {
      const id = generateId('test');
      const randomPart = id.split('_')[2];
      expect(randomPart).toHaveLength(8);
    });

    it('respects custom random length', () => {
      const id = generateId('test', 4);
      const randomPart = id.split('_')[2];
      expect(randomPart).toHaveLength(4);
    });

    it('includes timestamp in base36', () => {
      const id = generateId('test');
      const timestampPart = id.split('_')[1];
      expect(timestampPart).toBe((1000000).toString(36));
    });

    it('generates unique IDs with different timestamps', () => {
      let callCount = 0;
      vi.spyOn(coreIndex, 'getTimeProvider').mockReturnValue({
        now: () => {
          callCount++;
          return 1000000 + callCount;
        },
      });

      const id1 = generateId('test');
      const id2 = generateId('test');
      expect(id1).not.toBe(id2);
    });

    it('handles various prefixes', () => {
      expect(generateId('belief')).toMatch(/^belief_/);
      expect(generateId('exec')).toMatch(/^exec_/);
      expect(generateId('update')).toMatch(/^update_/);
    });
  });

  describe('generateHyphenId', () => {
    beforeEach(() => {
      vi.spyOn(coreIndex, 'getTimeProvider').mockReturnValue({
        now: () => 1769876392192,
      });
      vi.spyOn(coreIndex, 'getRandomProvider').mockReturnValue({
        random: () => 0.123456789,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('generates ID with correct format', () => {
      const id = generateHyphenId('workflow');
      expect(id).toMatch(/^workflow-\d+-[a-z0-9]+$/);
    });

    it('uses hyphen separator', () => {
      const id = generateHyphenId('prefix');
      const parts = id.split('-');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('prefix');
    });

    it('uses decimal timestamp (not base36)', () => {
      const id = generateHyphenId('test');
      const timestampPart = id.split('-')[1];
      expect(timestampPart).toBe('1769876392192');
    });

    it('uses default random length of 6', () => {
      const id = generateHyphenId('test');
      const randomPart = id.split('-')[2];
      expect(randomPart).toHaveLength(6);
    });

    it('respects custom random length', () => {
      const id = generateHyphenId('test', 10);
      const randomPart = id.split('-')[2];
      expect(randomPart).toHaveLength(10);
    });
  });

  describe('generateShortUuid', () => {
    beforeEach(() => {
      let callCount = 0;
      vi.spyOn(coreIndex, 'getRandomProvider').mockReturnValue({
        random: () => {
          callCount++;
          return callCount === 1 ? 0.123456789 : 0.987654321;
        },
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('generates ID with correct format', () => {
      const id = generateShortUuid('workflow');
      expect(id).toMatch(/^workflow-[a-f0-9]+$/);
    });

    it('generates 8-character hex suffix', () => {
      const id = generateShortUuid('test');
      const suffix = id.split('-')[1];
      expect(suffix).toHaveLength(8);
    });

    it('handles different prefixes', () => {
      expect(generateShortUuid('task')).toMatch(/^task-/);
      expect(generateShortUuid('session')).toMatch(/^session-/);
    });
  });

  describe('generateUUID', () => {
    it('generates valid UUID v4 format', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('generates unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });

    it('returns string', () => {
      expect(typeof generateUUID()).toBe('string');
    });
  });

  describe('generateShortUUIDv4', () => {
    it('generates 8-character ID without prefix', () => {
      const id = generateShortUUIDv4();
      expect(id).toHaveLength(8);
      expect(id).toMatch(/^[0-9a-f]{8}$/);
    });

    it('generates prefixed ID when prefix provided', () => {
      const id = generateShortUUIDv4('step');
      expect(id).toMatch(/^step-[0-9a-f]{8}$/);
    });

    it('handles empty string prefix', () => {
      const id = generateShortUUIDv4('');
      expect(id).toMatch(/^-[0-9a-f]{8}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateShortUUIDv4());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateStepId', () => {
    it('uses default prefix of "step"', () => {
      const id = generateStepId();
      expect(id).toMatch(/^step-[0-9a-f]{8}$/);
    });

    it('accepts custom prefix', () => {
      const id = generateStepId('action');
      expect(id).toMatch(/^action-[0-9a-f]{8}$/);
    });

    it('generates unique step IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateStepId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('uuidv4 (deprecated alias)', () => {
    it('is same function as generateUUID', () => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      expect(uuidv4).toBe(generateUUID);
    });

    it('generates valid UUID v4', () => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const uuid = uuidv4();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });
});
