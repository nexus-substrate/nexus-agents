/**
 * Tests for ResearchAutoCatalog persistence behavior.
 * Verifies that cataloged references persist to and load from disk.
 * (Source: Research System Enhancement - Phase 5)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Use vi.hoisted for ESM-compatible mocking of node:os
const mocks = vi.hoisted(() => {
  let testHomedir = '/tmp/nexus-catalog-default';
  return {
    homedir: vi.fn(() => testHomedir),
    setTestHomedir: (dir: string) => {
      testHomedir = dir;
    },
  };
});

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: mocks.homedir,
    default: {
      ...original,
      homedir: mocks.homedir,
    },
  };
});

// Mock tool-memory to avoid real session memory interactions
vi.mock('./tool-memory.js', () => ({
  getToolMemory: vi.fn().mockReturnValue({
    recordLearning: vi.fn(),
  }),
}));

import {
  ResearchAutoCatalog,
  resetAutoCatalog,
  type CatalogedReference,
} from './research-auto-catalog.js';

// ============================================================================
// Test Helpers
// ============================================================================

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join('/tmp', 'nexus-catalog-test-'));
  mocks.setTestHomedir(testDir);
  resetAutoCatalog();
});

afterEach(() => {
  resetAutoCatalog();
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
});

/** Returns the expected catalog file path under the test directory. */
function getCatalogFilePath(): string {
  return path.join(testDir, '.nexus-agents', 'research', 'pending-catalog.json');
}

/** Creates a minimal CatalogedReference. */
function makeRef(
  identifier: string,
  type: 'arxiv' | 'github' | 'url' = 'arxiv'
): CatalogedReference {
  return {
    type,
    identifier,
    context: 'test context',
    sourceTool: 'test-tool',
    discoveredAt: new Date().toISOString(),
    reviewed: false,
  };
}

// ============================================================================
// Constructor Persistence Tests
// ============================================================================

describe('ResearchAutoCatalog persistence', () => {
  describe('constructor', () => {
    it('should start empty when no persisted data exists', () => {
      const catalog = new ResearchAutoCatalog();
      expect(catalog.getAll()).toHaveLength(0);
    });

    it('should load persisted references on construction', () => {
      // Manually write a catalog file
      const dirPath = path.join(testDir, '.nexus-agents', 'research');
      fs.mkdirSync(dirPath, { recursive: true });

      const data = {
        version: 1,
        references: [makeRef('2401.12345'), makeRef('2401.67890')],
        savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(getCatalogFilePath(), JSON.stringify(data), 'utf-8');

      const catalog = new ResearchAutoCatalog();
      expect(catalog.getAll()).toHaveLength(2);
    });

    it('should handle corrupt file gracefully on construction', () => {
      const dirPath = path.join(testDir, '.nexus-agents', 'research');
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(getCatalogFilePath(), '{ broken json !!!', 'utf-8');

      // Should not throw, starts fresh
      const catalog = new ResearchAutoCatalog();
      expect(catalog.getAll()).toHaveLength(0);
    });

    it('should handle invalid schema gracefully on construction', () => {
      const dirPath = path.join(testDir, '.nexus-agents', 'research');
      fs.mkdirSync(dirPath, { recursive: true });

      const invalidData = {
        version: 1,
        wrongField: 'not references',
        savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(getCatalogFilePath(), JSON.stringify(invalidData), 'utf-8');

      const catalog = new ResearchAutoCatalog();
      expect(catalog.getAll()).toHaveLength(0);
    });
  });

  // ============================================================================
  // recordReference Persistence
  // ============================================================================

  describe('recordReference', () => {
    it('should persist to disk after recording', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.recordReference(makeRef('2401.11111'));

      // Verify file was created
      expect(fs.existsSync(getCatalogFilePath())).toBe(true);

      // Verify content
      const content = fs.readFileSync(getCatalogFilePath(), 'utf-8');
      const parsed = JSON.parse(content) as { references: CatalogedReference[] };
      expect(parsed.references).toHaveLength(1);
      expect(parsed.references[0]?.identifier).toBe('2401.11111');
    });

    it('should persist multiple references', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.recordReference(makeRef('2401.11111'));
      catalog.recordReference(makeRef('2401.22222'));
      catalog.recordReference(makeRef('https://github.com/test/repo', 'github'));

      const content = fs.readFileSync(getCatalogFilePath(), 'utf-8');
      const parsed = JSON.parse(content) as { references: CatalogedReference[] };
      expect(parsed.references).toHaveLength(3);
    });

    it('should survive re-instantiation', () => {
      // Record in first instance
      const catalog1 = new ResearchAutoCatalog();
      catalog1.recordReference(makeRef('2401.11111'));
      catalog1.recordReference(makeRef('2401.22222'));

      // Create new instance - should load persisted data
      const catalog2 = new ResearchAutoCatalog();
      expect(catalog2.getAll()).toHaveLength(2);
    });
  });

  // ============================================================================
  // dismiss Persistence
  // ============================================================================

  describe('dismiss', () => {
    it('should persist removal to disk', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.recordReference(makeRef('2401.11111'));
      catalog.recordReference(makeRef('2401.22222'));

      catalog.dismiss('2401.11111');

      // Verify file reflects removal
      const content = fs.readFileSync(getCatalogFilePath(), 'utf-8');
      const parsed = JSON.parse(content) as { references: CatalogedReference[] };
      expect(parsed.references).toHaveLength(1);
      expect(parsed.references[0]?.identifier).toBe('2401.22222');
    });

    it('should survive re-instantiation after dismiss', () => {
      const catalog1 = new ResearchAutoCatalog();
      catalog1.recordReference(makeRef('2401.11111'));
      catalog1.recordReference(makeRef('2401.22222'));
      catalog1.dismiss('2401.11111');

      const catalog2 = new ResearchAutoCatalog();
      expect(catalog2.getAll()).toHaveLength(1);
      expect(catalog2.getAll()[0]?.identifier).toBe('2401.22222');
    });
  });

  // ============================================================================
  // flush Persistence
  // ============================================================================

  describe('flush', () => {
    it('should persist empty array to disk', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.recordReference(makeRef('2401.11111'));
      catalog.recordReference(makeRef('2401.22222'));

      catalog.flush();

      const content = fs.readFileSync(getCatalogFilePath(), 'utf-8');
      const parsed = JSON.parse(content) as { references: CatalogedReference[] };
      expect(parsed.references).toHaveLength(0);
    });

    it('should survive re-instantiation after flush', () => {
      const catalog1 = new ResearchAutoCatalog();
      catalog1.recordReference(makeRef('2401.11111'));
      catalog1.flush();

      const catalog2 = new ResearchAutoCatalog();
      expect(catalog2.getAll()).toHaveLength(0);
    });
  });

  // ============================================================================
  // scanAndRecord Persistence
  // ============================================================================

  describe('scanAndRecord', () => {
    it('should persist auto-detected arXiv references to disk', () => {
      const catalog = new ResearchAutoCatalog();
      const text = 'We reference paper 2401.12345 and also 2403.99999 in our work.';

      catalog.scanAndRecord(text, 'orchestrate');

      expect(fs.existsSync(getCatalogFilePath())).toBe(true);
      const content = fs.readFileSync(getCatalogFilePath(), 'utf-8');
      const parsed = JSON.parse(content) as { references: CatalogedReference[] };
      expect(parsed.references).toHaveLength(2);
    });

    it('should persist auto-detected GitHub references to disk', () => {
      const catalog = new ResearchAutoCatalog();
      const text = 'See https://github.com/owner/repo for details.';

      catalog.scanAndRecord(text, 'orchestrate');

      const content = fs.readFileSync(getCatalogFilePath(), 'utf-8');
      const parsed = JSON.parse(content) as { references: CatalogedReference[] };
      expect(parsed.references).toHaveLength(1);
      expect(parsed.references[0]?.type).toBe('github');
    });

    it('should not create duplicate entries on repeated scans', () => {
      const catalog = new ResearchAutoCatalog();
      const text = 'Paper 2401.12345 is important.';

      catalog.scanAndRecord(text, 'tool-a');
      catalog.scanAndRecord(text, 'tool-b');

      const content = fs.readFileSync(getCatalogFilePath(), 'utf-8');
      const parsed = JSON.parse(content) as { references: CatalogedReference[] };
      expect(parsed.references).toHaveLength(1);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should create directory structure on first write', () => {
      const catalog = new ResearchAutoCatalog();
      catalog.recordReference(makeRef('2401.11111'));

      const dirPath = path.join(testDir, '.nexus-agents', 'research');
      expect(fs.existsSync(dirPath)).toBe(true);
    });

    it('should respect MAX_PENDING limit', () => {
      const catalog = new ResearchAutoCatalog();

      // Record 101 references (MAX_PENDING is 100)
      for (let i = 0; i < 101; i++) {
        catalog.recordReference(makeRef(`ref-${String(i).padStart(4, '0')}`));
      }

      // Should have capped at 100
      expect(catalog.getAll()).toHaveLength(100);
    });
  });
});
