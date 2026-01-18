/**
 * Tests for Memory Markdown Helper
 *
 * Tests Markdown file export functionality for high-importance memories.
 *
 * @module context/memory-markdown.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MemoryMarkdownHelper } from './memory-markdown.js';
import { MemoryImportance } from './memory-backend-types.js';
import type { MemoryMetadata } from './memory-backend-types.js';
import type { ILogger } from '../core/logger.js';

// =============================================================================
// Mock File System
// =============================================================================

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    promises: {
      ...actual.promises,
      writeFile: vi.fn(),
    },
  };
});

// =============================================================================
// Mock Logger
// =============================================================================

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  };
}

// =============================================================================
// Test Helpers
// =============================================================================

function createMetadata(overrides: Partial<MemoryMetadata> = {}): MemoryMetadata {
  return {
    importance: MemoryImportance.HIGH,
    tags: ['tag1', 'tag2'],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('MemoryMarkdownHelper', () => {
  let helper: MemoryMarkdownHelper;
  let mockLogger: ILogger;
  const testDir = '/tmp/test-markdown-memories';

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
    helper = new MemoryMarkdownHelper(testDir, mockLogger);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      helper.ensureDir();

      expect(fs.mkdirSync).toHaveBeenCalledWith(testDir, { recursive: true });
      expect(mockLogger.debug).toHaveBeenCalledWith('Created Markdown directory', {
        path: testDir,
      });
    });

    it('should not create directory if it already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      helper.ensureDir();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe('write', () => {
    it('should write memory to markdown file', async () => {
      const key = 'test-memory-key';
      const value = { data: 'test value' };
      const metadata = createMetadata();
      const createdAt = new Date('2024-01-15T10:00:00Z');

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      expect(fs.promises.writeFile).toHaveBeenCalledTimes(1);
      const [filepath, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      expect(filepath).toBe(path.join(testDir, 'test-memory-key.md'));
      expect(content).toContain('# Memory: test-memory-key');
      expect(content).toContain('**Importance:** high');
      expect(content).toContain('**Created:** 2024-01-15T10:00:00.000Z');
      expect(content).toContain('**Tags:** tag1, tag2');
      expect(content).toContain('```json');
      expect(content).toContain('"data": "test value"');
    });

    it('should format string values without JSON wrapper', async () => {
      const key = 'string-memory';
      const value = 'This is a plain string value';
      const metadata = createMetadata();
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      expect(content).toContain('This is a plain string value');
      expect(content).not.toContain('```json');
    });

    it('should format null values', async () => {
      const key = 'null-memory';
      const value = null;
      const metadata = createMetadata();
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      expect(content).toContain('`null`');
    });

    it('should format number values', async () => {
      const key = 'number-memory';
      const value = 42.5;
      const metadata = createMetadata();
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      expect(content).toContain('`42.5`');
    });

    it('should format boolean values', async () => {
      const key = 'bool-memory';
      const value = true;
      const metadata = createMetadata();
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      expect(content).toContain('`true`');
    });

    it('should include TTL expiration date when present', async () => {
      const key = 'ttl-memory';
      const value = 'data';
      const metadata = createMetadata({ ttl: 60000 }); // 1 minute TTL
      const createdAt = new Date('2024-01-15T10:00:00Z');

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      expect(content).toContain('**Expires:** 2024-01-15T10:01:00.000Z');
    });

    it('should not include tags when empty', async () => {
      const key = 'no-tags';
      const value = 'data';
      const metadata = createMetadata({ tags: [] });
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      expect(content).not.toContain('**Tags:**');
    });

    it('should not include tags when empty array', async () => {
      const key = 'no-tags';
      const value = 'data';
      const metadata = createMetadata({ tags: [] });
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      expect(content).not.toContain('**Tags:**');
    });

    it('should sanitize key to create safe filename', async () => {
      const key = 'unsafe/key:with*special|chars';
      const value = 'data';
      const metadata = createMetadata();
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [filepath] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      // Check the filename part only (not the full path with directory)
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- filepath is string from writeFile mock
      const filename = path.basename(String(filepath) ?? '');
      expect(filename).not.toContain('/');
      expect(filename).not.toContain(':');
      expect(filename).not.toContain('*');
      expect(filename).not.toContain('|');
      expect(filename).toContain('.md');
    });

    it('should truncate long keys to 200 characters', async () => {
      const key = 'a'.repeat(300);
      const value = 'data';
      const metadata = createMetadata();
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [filepath] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      // Filename should be truncated to 200 chars + '.md'
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- filepath is string from writeFile mock
      const filename = path.basename(String(filepath) ?? '');
      expect(filename.length).toBeLessThanOrEqual(203); // 200 + '.md'
    });

    it('should collapse consecutive underscores', async () => {
      const key = 'key///with///slashes';
      const value = 'data';
      const metadata = createMetadata();
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [filepath] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- filepath is string from writeFile mock
      const filename = path.basename(String(filepath) ?? '');
      expect(filename).not.toMatch(/__+/);
    });

    it('should log on write error but not throw', async () => {
      const key = 'error-key';
      const value = 'data';
      const metadata = createMetadata();
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockRejectedValue(new Error('Write failed'));

      // Should not throw
      await helper.write(key, value, metadata, createdAt);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to write Markdown file',
        expect.objectContaining({
          key: 'error-key',
          error: expect.any(Error),
        })
      );
    });

    it('should log debug on successful write', async () => {
      const key = 'success-key';
      const value = 'data';
      const metadata = createMetadata();
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      expect(mockLogger.debug).toHaveBeenCalledWith('Wrote Markdown file', {
        key: 'success-key',
        filepath: path.join(testDir, 'success-key.md'),
      });
    });

    it('should handle nested objects with proper JSON formatting', async () => {
      const key = 'nested-object';
      const value = {
        level1: {
          level2: {
            level3: 'deep value',
          },
        },
        array: [1, 2, 3],
      };
      const metadata = createMetadata();
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      expect(content).toContain('"level1"');
      expect(content).toContain('"level2"');
      expect(content).toContain('"level3"');
      expect(content).toContain('"deep value"');
      // Should be pretty-printed with 2-space indentation
      expect(content).toMatch(/\n\s{2}"level1"/);
    });

    it('should handle arrays as top-level values', async () => {
      const key = 'array-value';
      const value = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const metadata = createMetadata();
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      expect(content).toContain('```json');
      expect(content).toContain('"id": 1');
    });
  });

  describe('delete', () => {
    it('should delete existing markdown file', () => {
      const key = 'existing-key';
      vi.mocked(fs.existsSync).mockReturnValue(true);

      helper.delete(key);

      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(testDir, 'existing-key.md'));
      expect(mockLogger.debug).toHaveBeenCalledWith('Deleted Markdown file', {
        key: 'existing-key',
        filepath: path.join(testDir, 'existing-key.md'),
      });
    });

    it('should not attempt deletion if file does not exist', () => {
      const key = 'nonexistent-key';
      vi.mocked(fs.existsSync).mockReturnValue(false);

      helper.delete(key);

      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should log warning on delete error but not throw', () => {
      const key = 'error-key';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('Delete failed');
      });

      // Should not throw
      helper.delete(key);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to delete Markdown file',
        expect.objectContaining({
          key: 'error-key',
          error: expect.any(Error),
        })
      );
    });

    it('should sanitize key for filename in delete operation', () => {
      const key = 'unsafe/key:chars';
      vi.mocked(fs.existsSync).mockReturnValue(true);

      helper.delete(key);

      const expectedFilename = path.join(testDir, 'unsafe_key_chars.md');
      expect(fs.existsSync).toHaveBeenCalledWith(expectedFilename);
    });
  });

  describe('keyToFilename (through public methods)', () => {
    it('should replace unsafe characters with underscores', async () => {
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      // Test various unsafe characters
      await helper.write('key<>with"bad:chars', 'value', createMetadata(), new Date());

      const [filepath] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- filepath is string from writeFile mock
      const filename = path.basename(String(filepath) ?? '');

      // Should not contain any of: / \ : * ? " < > |
      expect(filename).not.toMatch(/[/\\:*?"<>|]/);
      expect(filename).toMatch(/\.md$/);
    });

    it('should handle keys with only unsafe characters', async () => {
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write('***', 'value', createMetadata(), new Date());

      const [filepath] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      expect(filepath).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- filepath is string from writeFile mock
      expect(String(filepath)).toContain('.md');
    });

    it('should preserve alphanumeric characters and hyphens', async () => {
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write('valid-key_123', 'value', createMetadata(), new Date());

      const [filepath] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- filepath is string from writeFile mock
      const filename = path.basename(String(filepath) ?? '');
      expect(filename).toBe('valid-key_123.md');
    });
  });

  describe('format (through write)', () => {
    it('should include all metadata sections', async () => {
      const key = 'full-memory';
      const value = { key: 'value' };
      const metadata: MemoryMetadata = {
        importance: MemoryImportance.HIGH,
        tags: ['important', 'archived'],
        ttl: 3600000, // 1 hour
      };
      const createdAt = new Date('2024-01-15T12:00:00Z');

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];

      // Check structure
      expect(content).toContain('# Memory: full-memory');
      expect(content).toContain('## Metadata');
      expect(content).toContain('## Value');

      // Check metadata fields
      expect(content).toContain('- **Importance:** high');
      expect(content).toContain('- **Created:** 2024-01-15T12:00:00.000Z');
      expect(content).toContain('- **Tags:** important, archived');
      expect(content).toContain('- **Expires:** 2024-01-15T13:00:00.000Z');
    });

    it('should handle minimal metadata', async () => {
      const key = 'minimal-memory';
      const value = 'simple string';
      const metadata: MemoryMetadata = {
        importance: MemoryImportance.LOW,
      };
      const createdAt = new Date();

      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await helper.write(key, value, metadata, createdAt);

      const [, content] = vi.mocked(fs.promises.writeFile).mock.calls[0] ?? [];

      expect(content).toContain('# Memory: minimal-memory');
      expect(content).toContain('- **Importance:** low');
      expect(content).not.toContain('**Tags:**');
      expect(content).not.toContain('**Expires:**');
      expect(content).toContain('simple string');
    });
  });
});
