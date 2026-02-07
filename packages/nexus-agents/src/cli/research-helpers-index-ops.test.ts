/**
 * Tests for Research Index Operations
 *
 * @module cli/research-helpers-index-ops.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  handleStatsCommand,
  handleRefreshCommand,
  handleCheckCommand,
} from './research-helpers-index-ops.js';
import * as indexer from '../indexer/research-index/index.js';
import type { ResearchIndex } from '../indexer/research-index/index.js';

vi.mock('node:fs/promises');
vi.mock('node:path');
vi.mock('../indexer/research-index/index.js');

const mockFs = vi.mocked(fs);
const mockPath = vi.mocked(path);
const mockIndexer = vi.mocked(indexer);

describe('research-helpers-index-ops', () => {
  const mockCwd = '/test/project';
  const mockRegistryPath = '/test/project/docs/research/registry';
  const mockIndexPath = '/test/project/docs/research/RESEARCH_INDEX.md';

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);

    // Mock path.resolve
    mockPath.resolve.mockImplementation((...args: string[]) => {
      return args.join('/').replace(/\/+/g, '/');
    });

    // Mock path.dirname
    mockPath.dirname.mockImplementation((p: string) => {
      const parts = p.split('/');
      parts.pop();
      return parts.join('/');
    });
  });

  describe('handleStatsCommand', () => {
    const mockIndex = {
      papers: [],
      techniques: [],
      stats: {
        totalPapers: 10,
        totalTechniques: 25,
        techniquesByStatus: {
          implemented: 5,
          planned: 10,
          notStarted: 8,
          inProgress: 0,
          rejected: 2,
        },
        techniquesByPriority: { P1: 5, P2: 10, P3: 8, P4: 2, none: 0 },
        topicDistribution: { 'multi-agent': 15, reasoning: 10 },
      },
      metadata: {
        generatedAt: '2026-02-06T10:00:00Z',
        registryPath: mockRegistryPath,
      },
    } as unknown as ResearchIndex;

    it('should return summary report by default', async () => {
      mockIndexer.parseRegistry.mockReturnValue({
        ok: true,
        value: mockIndex,
      });
      mockIndexer.generateSummaryReport.mockReturnValue('Summary report');

      const result = await handleStatsCommand({});

      expect(result).toBe('Summary report');
      expect(mockIndexer.parseRegistry).toHaveBeenCalledWith({
        registryPath: mockRegistryPath,
      });
      expect(mockIndexer.generateSummaryReport).toHaveBeenCalledWith(mockIndex);
    });

    it('should return JSON stats when format is json', async () => {
      mockIndexer.parseRegistry.mockReturnValue({
        ok: true,
        value: mockIndex,
      });
      mockIndexer.generateStatsJson.mockReturnValue('{"totalPapers": 10}');

      const result = await handleStatsCommand({ format: 'json' });

      expect(result).toBe('{"totalPapers": 10}');
      expect(mockIndexer.generateStatsJson).toHaveBeenCalledWith(mockIndex);
    });

    it('should return error message when registry parsing fails', async () => {
      mockIndexer.parseRegistry.mockReturnValue({
        ok: false,
        error: Object.assign(new Error('Registry not found'), { file: '' }),
      });

      const result = await handleStatsCommand({});

      expect(result).toBe('Error: Failed to parse registry: Registry not found');
      expect(mockIndexer.generateSummaryReport).not.toHaveBeenCalled();
    });
  });

  describe('handleRefreshCommand', () => {
    const mockIndex = {
      papers: [],
      techniques: [],
      stats: {
        totalPapers: 15,
        totalTechniques: 30,
        techniquesByStatus: {
          implemented: 8,
          planned: 12,
          notStarted: 8,
          inProgress: 0,
          rejected: 2,
        },
        techniquesByPriority: { P1: 8, P2: 12, P3: 8, P4: 2 },
        topicDistribution: { 'multi-agent': 20, reasoning: 10 },
      },
      metadata: {
        generatedAt: '2026-02-06T10:00:00Z',
        registryPath: mockRegistryPath,
      },
    } as unknown as ResearchIndex;

    beforeEach(() => {
      mockFs.mkdir.mockImplementation(() => Promise.resolve(undefined));
      mockFs.writeFile.mockImplementation(() => Promise.resolve());
    });

    it('should regenerate index successfully', async () => {
      mockIndexer.parseRegistry.mockReturnValue({
        ok: true,
        value: mockIndex,
      });
      mockIndexer.generateIndexMarkdown.mockReturnValue({
        ok: true,
        value: '# Research Index\n\nContent here',
      });

      const result = await handleRefreshCommand({});

      expect(result).toContain('Research index regenerated successfully');
      expect(result).toContain('Papers: 15');
      expect(result).toContain('Techniques: 30');
      expect(result).toContain('Implemented: 8');
      expect(mockFs.mkdir).toHaveBeenCalledWith(expect.stringContaining('docs/research'), {
        recursive: true,
      });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        mockIndexPath,
        '# Research Index\n\nContent here',
        'utf-8'
      );
    });

    it('should use custom output path when provided', async () => {
      const customPath = '/custom/path/INDEX.md';
      mockIndexer.parseRegistry.mockReturnValue({
        ok: true,
        value: mockIndex,
      });
      mockIndexer.generateIndexMarkdown.mockReturnValue({
        ok: true,
        value: '# Research Index',
      });

      const result = await handleRefreshCommand({ output: customPath });

      expect(result).toContain('Output: /custom/path/INDEX.md');
      expect(mockFs.writeFile).toHaveBeenCalledWith(customPath, '# Research Index', 'utf-8');
    });

    it('should return error when registry parsing fails', async () => {
      mockIndexer.parseRegistry.mockReturnValue({
        ok: false,
        error: Object.assign(new Error('Invalid registry format'), { file: '' }),
      });

      const result = await handleRefreshCommand({});

      expect(result).toBe('Error: Failed to parse registry: Invalid registry format');
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should return error when markdown generation fails', async () => {
      mockIndexer.parseRegistry.mockReturnValue({
        ok: true,
        value: mockIndex,
      });
      mockIndexer.generateIndexMarkdown.mockReturnValue({
        ok: false,
        error: new Error('Template error'),
      });

      const result = await handleRefreshCommand({});

      expect(result).toBe('Error: Failed to generate markdown: Template error');
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('handleCheckCommand', () => {
    const mockIndex = {
      papers: [],
      techniques: [],
      stats: {
        totalPapers: 5,
        totalTechniques: 12,
        techniquesByStatus: {
          implemented: 3,
          planned: 5,
          'not-started': 3,
          rejected: 1,
        },
        techniquesByPriority: { P1: 3, P2: 5, P3: 3, P4: 1 },
        topicDistribution: { 'multi-agent': 8, reasoning: 4 },
      },
      metadata: {
        generatedAt: '2026-02-06T10:00:00Z',
        registryPath: mockRegistryPath,
      },
    } as unknown as ResearchIndex;

    it('should return error when index file does not exist', async () => {
      mockFs.access.mockImplementation(() => Promise.reject(new Error('ENOENT')));

      const result = await handleCheckCommand();

      expect(result).toContain('Error: Research index not found');
      expect(result).toContain('nexus-agents research refresh');
    });

    it('should return up-to-date message when content matches', async () => {
      const content = '# Research Index\n\nSome content here\n';
      mockFs.access.mockImplementation(() => Promise.resolve());
      mockFs.readFile.mockImplementation(() => Promise.resolve(content));
      mockIndexer.parseRegistry.mockReturnValue({
        ok: true,
        value: mockIndex,
      });
      mockIndexer.generateIndexMarkdown.mockReturnValue({
        ok: true,
        value: content,
      });

      const result = await handleCheckCommand();

      expect(result).toBe('Research index is up to date (12 techniques)');
    });

    it('should normalize whitespace when comparing content', async () => {
      const existingContent = '# Research Index\n\n  Some content   here  \n';
      const freshContent = '# Research Index\n\nSome content here\n';
      mockFs.access.mockImplementation(() => Promise.resolve());
      mockFs.readFile.mockImplementation(() => Promise.resolve(existingContent));
      mockIndexer.parseRegistry.mockReturnValue({
        ok: true,
        value: mockIndex,
      });
      mockIndexer.generateIndexMarkdown.mockReturnValue({
        ok: true,
        value: freshContent,
      });

      const result = await handleCheckCommand();

      expect(result).toBe('Research index is up to date (12 techniques)');
    });

    it('should return out-of-date message when content differs', async () => {
      const existingContent = '# Old Research Index\n\nOld content\n';
      const freshContent = '# Research Index\n\nNew content\n';
      mockFs.access.mockImplementation(() => Promise.resolve());
      mockFs.readFile.mockImplementation(() => Promise.resolve(existingContent));
      mockIndexer.parseRegistry.mockReturnValue({
        ok: true,
        value: mockIndex,
      });
      mockIndexer.generateIndexMarkdown.mockReturnValue({
        ok: true,
        value: freshContent,
      });

      const result = await handleCheckCommand();

      expect(result).toContain('Research index is out of date');
      expect(result).toContain('nexus-agents research refresh');
    });

    it('should return error when registry parsing fails', async () => {
      mockFs.access.mockImplementation(() => Promise.resolve());
      mockIndexer.parseRegistry.mockReturnValue({
        ok: false,
        error: Object.assign(new Error('Registry corrupted'), { file: '' }),
      });

      const result = await handleCheckCommand();

      expect(result).toBe('Error: Failed to parse registry: Registry corrupted');
    });

    it('should return error when markdown generation fails', async () => {
      mockFs.access.mockImplementation(() => Promise.resolve());
      mockIndexer.parseRegistry.mockReturnValue({
        ok: true,
        value: mockIndex,
      });
      mockIndexer.generateIndexMarkdown.mockReturnValue({
        ok: false,
        error: new Error('Generation failed'),
      });

      const result = await handleCheckCommand();

      expect(result).toBe('Error: Failed to generate markdown: Generation failed');
    });
  });
});
