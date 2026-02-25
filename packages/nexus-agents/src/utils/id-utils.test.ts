/**
 * Tests for id-utils utilities
 *
 * @module utils/id-utils.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateId,
  generateHyphenId,
  generateShortUuid,
  generateUUID,
  generateShortUUIDv4,
  generateStepId,
} from './id-utils.js';
import { setTimeProvider, resetTimeProvider, FixedTimeProvider } from '../core/time-provider.js';
import {
  setRandomProvider,
  resetRandomProvider,
  SeededRandomProvider,
} from '../core/random-provider.js';

describe('id-utils', () => {
  describe('generateId', () => {
    beforeEach(() => {
      // Use fixed providers for deterministic testing
      setTimeProvider(new FixedTimeProvider(1000000));
      setRandomProvider(new SeededRandomProvider(12345));
    });

    afterEach(() => {
      resetTimeProvider();
      resetRandomProvider();
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

    it('generates consistent IDs with same seed', () => {
      const id1 = generateId('test');
      setRandomProvider(new SeededRandomProvider(12345));
      const id2 = generateId('test');
      // Timestamps are same, random parts should match with same seed
      expect(id1).toBe(id2);
    });

    it('handles various prefixes', () => {
      expect(generateId('belief')).toMatch(/^belief_/);
      expect(generateId('exec')).toMatch(/^exec_/);
      expect(generateId('update')).toMatch(/^update_/);
    });
  });

  describe('generateHyphenId', () => {
    beforeEach(() => {
      setTimeProvider(new FixedTimeProvider(1769876392192));
      setRandomProvider(new SeededRandomProvider(12345));
    });

    afterEach(() => {
      resetTimeProvider();
      resetRandomProvider();
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
      setRandomProvider(new SeededRandomProvider(12345));
    });

    afterEach(() => {
      resetRandomProvider();
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

    it('generates consistent IDs with same seed', () => {
      const id1 = generateShortUuid('test');
      setRandomProvider(new SeededRandomProvider(12345));
      const id2 = generateShortUuid('test');
      expect(id1).toBe(id2);
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
});
