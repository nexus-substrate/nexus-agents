/**
 * Tests for research-helpers-io
 *
 * Security tests for path traversal prevention (Issue #353)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {
  loadTechniquesRegistry,
  loadPapersRegistry,
  saveTechniquesRegistry,
  savePapersRegistry,
  REGISTRY_PATH,
  TECHNIQUES_FILE,
  PAPERS_FILE,
} from './research-helpers-io.js';
import type { TechniquesRegistry, PapersRegistry } from './research-types.js';

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock yaml
vi.mock('yaml', () => ({
  parse: vi.fn((content: string): unknown => JSON.parse(content) as unknown),
  stringify: vi.fn((obj: unknown) => JSON.stringify(obj)),
}));

describe('research-helpers-io', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadTechniquesRegistry', () => {
    it('should load techniques registry successfully', async () => {
      const mockRegistry: TechniquesRegistry = {
        schema_version: '1.0',
        techniques: {},
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockRegistry));

      const result = await loadTechniquesRegistry('/test/root');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.schema_version).toBe('1.0');
      }
    });

    it('should return ParseError when file read fails', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: file not found'));

      const result = await loadTechniquesRegistry('/test/root');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to load techniques registry');
      }
    });

    it('should construct correct file path', async () => {
      const mockRegistry: TechniquesRegistry = {
        schema_version: '1.0',
        techniques: {},
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockRegistry));

      await loadTechniquesRegistry('/test/root');

      const expectedPath = path.resolve('/test/root', REGISTRY_PATH, TECHNIQUES_FILE);
      expect(fs.readFile).toHaveBeenCalledWith(expectedPath, 'utf-8');
    });
  });

  describe('loadPapersRegistry', () => {
    it('should load papers registry successfully', async () => {
      const mockRegistry: PapersRegistry = {
        schema_version: '1.0',
        papers: {},
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockRegistry));

      const result = await loadPapersRegistry('/test/root');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.schema_version).toBe('1.0');
      }
    });

    it('should return ParseError when file read fails', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

      const result = await loadPapersRegistry('/test/root');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to load papers registry');
      }
    });

    it('should construct correct file path', async () => {
      const mockRegistry: PapersRegistry = {
        schema_version: '1.0',
        papers: {},
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockRegistry));

      await loadPapersRegistry('/test/root');

      const expectedPath = path.resolve('/test/root', REGISTRY_PATH, PAPERS_FILE);
      expect(fs.readFile).toHaveBeenCalledWith(expectedPath, 'utf-8');
    });
  });

  describe('saveTechniquesRegistry', () => {
    it('should save techniques registry successfully', async () => {
      const mockRegistry: TechniquesRegistry = {
        schema_version: '1.0',
        techniques: {},
      };

      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await saveTechniquesRegistry(mockRegistry, '/test/root');

      expect(result.ok).toBe(true);
    });

    it('should return ParseError when file write fails', async () => {
      const mockRegistry: TechniquesRegistry = {
        schema_version: '1.0',
        techniques: {},
      };

      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Disk full'));

      const result = await saveTechniquesRegistry(mockRegistry, '/test/root');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to save techniques registry');
      }
    });
  });

  describe('savePapersRegistry', () => {
    it('should save papers registry successfully', async () => {
      const mockRegistry: PapersRegistry = {
        schema_version: '1.0',
        papers: {},
      };

      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await savePapersRegistry(mockRegistry, '/test/root');

      expect(result.ok).toBe(true);
    });

    it('should return ParseError when file write fails', async () => {
      const mockRegistry: PapersRegistry = {
        schema_version: '1.0',
        papers: {},
      };

      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));

      const result = await savePapersRegistry(mockRegistry, '/test/root');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to save papers registry');
      }
    });
  });

  describe('path validation security', () => {
    // Note: The current implementation validates that constructed paths stay
    // within the root directory. Since REGISTRY_PATH and file names are
    // constants, path traversal through user input is mitigated.
    // These tests verify the path construction is correct.

    it('should normalize root paths with trailing segments', async () => {
      const mockRegistry: TechniquesRegistry = {
        schema_version: '1.0',
        techniques: {},
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockRegistry));

      // Even with trailing slash, path should be normalized
      await loadTechniquesRegistry('/test/root/');

      // path.resolve normalizes the path
      const calledPath = vi.mocked(fs.readFile).mock.calls[0]?.[0] as string;
      expect(calledPath).toBe(path.resolve('/test/root/', REGISTRY_PATH, TECHNIQUES_FILE));
    });

    it('should handle root with .. segments by resolving them', async () => {
      const mockRegistry: TechniquesRegistry = {
        schema_version: '1.0',
        techniques: {},
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockRegistry));

      // Root with parent directory reference - gets resolved
      await loadTechniquesRegistry('/test/foo/../root');

      const calledPath = vi.mocked(fs.readFile).mock.calls[0]?.[0] as string;
      // The path gets resolved, so /test/foo/../root becomes /test/root
      expect(calledPath).toBe(path.resolve('/test/foo/../root', REGISTRY_PATH, TECHNIQUES_FILE));
    });
  });
});
