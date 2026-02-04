/**
 * Tests for research auto-catalog module.
 *
 * Covers: pattern extraction, duplicate detection, persistence,
 * pending/review/dismiss/flush operations, and error handling.
 *
 * @module mcp/tools/research-auto-catalog.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { ResearchAutoCatalog, resetAutoCatalog, getAutoCatalog } from './research-auto-catalog.js';

// Mock fs and tool-memory to isolate unit tests
vi.mock('node:fs');
vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => ({
    recordLearning: vi.fn(),
  }),
}));

const mockFs = vi.mocked(fs);

beforeEach(() => {
  resetAutoCatalog();
  mockFs.existsSync.mockReturnValue(false);
  mockFs.readFileSync.mockReturnValue('');
  mockFs.mkdirSync.mockReturnValue(undefined);
  mockFs.writeFileSync.mockReturnValue(undefined);
  mockFs.renameSync.mockReturnValue(undefined);
  mockFs.unlinkSync.mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ResearchAutoCatalog', () => {
  describe('scanAndRecord', () => {
    it('should detect arXiv IDs in text', () => {
      const catalog = new ResearchAutoCatalog();
      const count = catalog.scanAndRecord(
        'Check out paper 2401.12345 for details on multi-agent systems.',
        'test_tool'
      );
      expect(count).toBe(1);
      const pending = catalog.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.type).toBe('arxiv');
      expect(pending[0]?.identifier).toBe('2401.12345');
      expect(pending[0]?.sourceTool).toBe('test_tool');
    });

    it('should detect multiple arXiv IDs', () => {
      const catalog = new ResearchAutoCatalog();
      const count = catalog.scanAndRecord(
        'Papers 2401.12345 and 2403.67890 are relevant.',
        'test_tool'
      );
      expect(count).toBe(2);
      expect(catalog.getPending()).toHaveLength(2);
    });

    it('should detect GitHub URLs', () => {
      const catalog = new ResearchAutoCatalog();
      const count = catalog.scanAndRecord(
        'See https://github.com/owner/repo for implementation.',
        'test_tool'
      );
      expect(count).toBe(1);
      const pending = catalog.getPending();
      expect(pending[0]?.type).toBe('github');
      expect(pending[0]?.identifier).toBe('https://github.com/owner/repo');
    });

    it('should detect both arXiv and GitHub in same text', () => {
      const catalog = new ResearchAutoCatalog();
      const count = catalog.scanAndRecord(
        'Paper 2401.12345 has code at github.com/org/project.',
        'test_tool'
      );
      expect(count).toBe(2);
    });

    it('should skip duplicate arXiv IDs', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.scanAndRecord('Paper 2401.12345 is great.', 'tool1');
      const count = catalog.scanAndRecord('Again 2401.12345 mentioned.', 'tool2');
      expect(count).toBe(0);
      expect(catalog.getPending()).toHaveLength(1);
    });

    it('should skip duplicate GitHub URLs', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.scanAndRecord('See github.com/org/repo for details.', 'tool1');
      const count = catalog.scanAndRecord('Also github.com/org/repo here.', 'tool2');
      expect(count).toBe(0);
      expect(catalog.getPending()).toHaveLength(1);
    });

    it('should return 0 for text with no references', () => {
      const catalog = new ResearchAutoCatalog();
      const count = catalog.scanAndRecord('No references here at all.', 'test_tool');
      expect(count).toBe(0);
      expect(catalog.getPending()).toHaveLength(0);
    });

    it('should extract surrounding context', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.scanAndRecord(
        'The paper 2401.12345 discusses multi-agent orchestration patterns.',
        'test_tool'
      );
      const pending = catalog.getPending();
      expect(pending[0]?.context).toContain('2401.12345');
      expect(pending[0]?.context.length).toBeLessThanOrEqual(120);
    });
  });

  describe('markReviewed', () => {
    it('should mark a reference as reviewed', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.scanAndRecord('Paper 2401.12345 here.', 'test_tool');
      expect(catalog.getPending()).toHaveLength(1);

      const marked = catalog.markReviewed('2401.12345');
      expect(marked).toBe(true);
      expect(catalog.getPending()).toHaveLength(0);
      expect(catalog.getAll()).toHaveLength(1);
    });

    it('should return false for unknown identifier', () => {
      const catalog = new ResearchAutoCatalog();
      expect(catalog.markReviewed('nonexistent')).toBe(false);
    });
  });

  describe('dismiss', () => {
    it('should remove a reference', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.scanAndRecord('Paper 2401.12345 here.', 'test_tool');
      expect(catalog.getAll()).toHaveLength(1);

      const dismissed = catalog.dismiss('2401.12345');
      expect(dismissed).toBe(true);
      expect(catalog.getAll()).toHaveLength(0);
    });

    it('should return false for unknown identifier', () => {
      const catalog = new ResearchAutoCatalog();
      expect(catalog.dismiss('nonexistent')).toBe(false);
    });
  });

  describe('flush', () => {
    it('should clear all pending references', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.scanAndRecord('Paper 2401.12345 and 2403.67890.', 'test_tool');
      expect(catalog.getAll()).toHaveLength(2);

      catalog.flush();
      expect(catalog.getAll()).toHaveLength(0);
      expect(catalog.getPending()).toHaveLength(0);
    });
  });

  describe('MAX_PENDING limit', () => {
    it('should drop oldest entry when limit is reached', () => {
      const catalog = new ResearchAutoCatalog();
      // Record 100 entries to fill the limit
      for (let i = 0; i < 100; i++) {
        catalog.recordReference({
          type: 'arxiv',
          identifier: `id-${String(i).padStart(3, '0')}`,
          context: 'test',
          sourceTool: 'test',
          discoveredAt: new Date().toISOString(),
          reviewed: false,
        });
      }
      expect(catalog.getAll()).toHaveLength(100);

      // Adding one more should drop the oldest
      catalog.recordReference({
        type: 'arxiv',
        identifier: 'id-overflow',
        context: 'test',
        sourceTool: 'test',
        discoveredAt: new Date().toISOString(),
        reviewed: false,
      });
      expect(catalog.getAll()).toHaveLength(100);
      const all = catalog.getAll();
      expect(all[0]?.identifier).toBe('id-001');
      expect(all[all.length - 1]?.identifier).toBe('id-overflow');
    });
  });

  describe('persistence', () => {
    it('should load persisted references on construction', () => {
      const persistedData = JSON.stringify({
        version: 1,
        references: [
          {
            type: 'arxiv',
            identifier: '2401.99999',
            context: 'persisted',
            sourceTool: 'old_tool',
            discoveredAt: '2026-01-01T00:00:00.000Z',
            reviewed: false,
          },
        ],
        savedAt: '2026-01-01T00:00:00.000Z',
      });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(persistedData);

      const catalog = new ResearchAutoCatalog();
      expect(catalog.getAll()).toHaveLength(1);
      expect(catalog.getAll()[0]?.identifier).toBe('2401.99999');
    });

    it('should start fresh on invalid persisted data', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{"invalid": true}');

      const catalog = new ResearchAutoCatalog();
      expect(catalog.getAll()).toHaveLength(0);
    });

    it('should start fresh on corrupted file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const catalog = new ResearchAutoCatalog();
      expect(catalog.getAll()).toHaveLength(0);
    });

    it('should persist on scanAndRecord', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.scanAndRecord('Paper 2401.12345 here.', 'test_tool');
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      expect(mockFs.renameSync).toHaveBeenCalled();
    });

    it('should persist on flush', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.scanAndRecord('Paper 2401.12345 here.', 'test_tool');
      vi.clearAllMocks();

      catalog.flush();
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle write failure gracefully', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      const catalog = new ResearchAutoCatalog();
      // Should not throw
      expect(() => catalog.scanAndRecord('Paper 2401.12345 here.', 'test_tool')).not.toThrow();
      // Reference still in memory even if persistence failed
      expect(catalog.getAll()).toHaveLength(1);
    });
  });

  describe('singleton', () => {
    it('should return same instance on repeated calls', () => {
      const a = getAutoCatalog();
      const b = getAutoCatalog();
      expect(a).toBe(b);
    });

    it('should return new instance after reset', () => {
      const a = getAutoCatalog();
      resetAutoCatalog();
      const b = getAutoCatalog();
      expect(a).not.toBe(b);
    });
  });
});
