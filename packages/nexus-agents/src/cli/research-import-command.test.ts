/**
 * Tests for research-import-command.ts
 *
 * @see Issue #1599
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseCsvLine,
  parseCsvContent,
  generateIdFromTitle,
  executeImport,
  handleImportCommand,
} from './research-import-command.js';

// =============================================================================
// MOCKS
// =============================================================================

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('./research-helpers-io.js', () => ({
  loadPapersRegistry: vi.fn(),
  savePapersRegistry: vi.fn(),
  REGISTRY_PATH: 'docs/research/registry',
  getProjectRoot: vi.fn(() => '/fake/root'),
}));

vi.mock('./research-helpers-sources-io.js', () => ({
  loadSourcesRegistry: vi.fn(),
  saveSourcesRegistry: vi.fn(),
}));

async function getMocks(): Promise<{
  readFile: ReturnType<typeof vi.fn>;
  loadPapersRegistry: ReturnType<typeof vi.fn>;
  savePapersRegistry: ReturnType<typeof vi.fn>;
  loadSourcesRegistry: ReturnType<typeof vi.fn>;
  saveSourcesRegistry: ReturnType<typeof vi.fn>;
}> {
  const fsMod = await import('node:fs/promises');
  const ioMod = await import('./research-helpers-io.js');
  const srcMod = await import('./research-helpers-sources-io.js');
  return {
    readFile: fsMod.readFile as ReturnType<typeof vi.fn>,
    loadPapersRegistry: ioMod.loadPapersRegistry as ReturnType<typeof vi.fn>,
    savePapersRegistry: ioMod.savePapersRegistry as ReturnType<typeof vi.fn>,
    loadSourcesRegistry: srcMod.loadSourcesRegistry as ReturnType<typeof vi.fn>,
    saveSourcesRegistry: srcMod.saveSourcesRegistry as ReturnType<typeof vi.fn>,
  };
}

// =============================================================================
// CSV PARSING TESTS
// =============================================================================

describe('parseCsvLine', () => {
  it('splits simple comma-separated values', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields with commas', () => {
    expect(parseCsvLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    expect(parseCsvLine('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });

  it('trims whitespace from fields', () => {
    expect(parseCsvLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });

  it('handles empty fields', () => {
    expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });
});

describe('parseCsvContent', () => {
  it('parses valid CSV content', () => {
    const csv = [
      'title,url,type,topic,description',
      'My Paper,https://arxiv.org/abs/2501.00001,paper,routing,A paper about routing',
    ].join('\n');

    const result = parseCsvContent(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toEqual({
        title: 'My Paper',
        url: 'https://arxiv.org/abs/2501.00001',
        type: 'paper',
        topic: 'routing',
        description: 'A paper about routing',
      });
    }
  });

  it('rejects CSV with missing header columns', () => {
    const csv = 'title,url\nfoo,https://x.com';
    const result = parseCsvContent(csv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Missing CSV columns');
    }
  });

  it('rejects CSV with only a header', () => {
    const csv = 'title,url,type,topic,description';
    const result = parseCsvContent(csv);
    expect(result.ok).toBe(false);
  });

  it('skips rows with invalid URLs', () => {
    const csv = [
      'title,url,type,topic,description',
      'Good,https://example.com,repo,routing,desc',
      'Bad,not-a-url,repo,routing,desc',
    ].join('\n');

    const result = parseCsvContent(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.title).toBe('Good');
    }
  });

  it('skips rows with invalid type', () => {
    const csv = [
      'title,url,type,topic,description',
      'X,https://example.com,invalid,routing,desc',
    ].join('\n');

    const result = parseCsvContent(csv);
    expect(result.ok).toBe(false);
  });

  it('handles columns in any order', () => {
    const csv = [
      'type,description,title,topic,url',
      'repo,A repo,My Repo,memory,https://github.com/x/y',
    ].join('\n');

    const result = parseCsvContent(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.title).toBe('My Repo');
      expect(result.value[0]?.type).toBe('repo');
    }
  });

  it('handles multiple valid entry types', () => {
    const csv = [
      'title,url,type,topic,description',
      'P1,https://a.com/1,paper,routing,desc1',
      'R1,https://a.com/2,repo,memory,desc2',
      'T1,https://a.com/3,tool,security,desc3',
      'B1,https://a.com/4,blog,consensus,desc4',
    ].join('\n');

    const result = parseCsvContent(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(4);
    }
  });
});

// =============================================================================
// ID GENERATION TESTS
// =============================================================================

describe('generateIdFromTitle', () => {
  it('generates kebab-case id from title', () => {
    expect(generateIdFromTitle('My Great Paper')).toBe('my-great-paper');
  });

  it('strips special characters', () => {
    expect(generateIdFromTitle('Paper: A (New) Approach!')).toBe('paper-a-new-approach');
  });

  it('truncates to 60 chars', () => {
    const long = 'a'.repeat(100);
    expect(generateIdFromTitle(long).length).toBeLessThanOrEqual(60);
  });
});

// =============================================================================
// IMPORT EXECUTION TESTS
// =============================================================================

describe('executeImport', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns error when CSV file cannot be read', async () => {
    const mocks = await getMocks();
    mocks.readFile.mockRejectedValue(new Error('ENOENT'));

    const result = await executeImport({ csvPath: '/nonexistent.csv' });
    expect(result.errors).toBe(1);
    expect(result.added).toBe(0);
    expect(result.outcomes[0]?.status).toBe('error');
  });

  it('adds papers to papers registry', async () => {
    const mocks = await getMocks();
    const csv = [
      'title,url,type,topic,description',
      'Test Paper,https://arxiv.org/abs/2501.00001,paper,routing,A test paper',
    ].join('\n');

    mocks.readFile.mockResolvedValue(csv);
    mocks.loadPapersRegistry.mockResolvedValue({
      ok: true,
      value: { schema_version: '1.1', papers: {} },
    });
    mocks.savePapersRegistry.mockResolvedValue({ ok: true, value: undefined });

    const result = await executeImport({ csvPath: '/test.csv' });
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(mocks.savePapersRegistry).toHaveBeenCalledTimes(1);
  });

  it('adds sources to sources registry', async () => {
    const mocks = await getMocks();
    const csv = [
      'title,url,type,topic,description',
      'My Repo,https://github.com/x/y,repo,memory,A cool repo',
    ].join('\n');

    mocks.readFile.mockResolvedValue(csv);
    mocks.loadSourcesRegistry.mockResolvedValue({
      ok: true,
      value: { schema_version: '1.0', sources: {} },
    });
    mocks.saveSourcesRegistry.mockResolvedValue({ ok: true, value: undefined });

    const result = await executeImport({ csvPath: '/test.csv' });
    expect(result.added).toBe(1);
    expect(mocks.saveSourcesRegistry).toHaveBeenCalledTimes(1);
  });

  it('skips duplicate entries by URL', async () => {
    const mocks = await getMocks();
    const csv = [
      'title,url,type,topic,description',
      'Existing,https://existing.com,paper,routing,Already here',
    ].join('\n');

    mocks.readFile.mockResolvedValue(csv);
    mocks.loadPapersRegistry.mockResolvedValue({
      ok: true,
      value: {
        schema_version: '1.1',
        papers: {
          existing: {
            title: 'Existing Paper',
            url: 'https://existing.com',
            topics: ['routing'],
          },
        },
      },
    });

    const result = await executeImport({ csvPath: '/test.csv' });
    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
  });

  it('skips duplicate entries by title', async () => {
    const mocks = await getMocks();
    const csv = [
      'title,url,type,topic,description',
      'Existing Paper,https://new-url.com,paper,routing,Same title',
    ].join('\n');

    mocks.readFile.mockResolvedValue(csv);
    mocks.loadPapersRegistry.mockResolvedValue({
      ok: true,
      value: {
        schema_version: '1.1',
        papers: {
          existing: {
            title: 'Existing Paper',
            url: 'https://old-url.com',
            topics: ['routing'],
          },
        },
      },
    });

    const result = await executeImport({ csvPath: '/test.csv' });
    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
  });

  it('dry run does not persist changes', async () => {
    const mocks = await getMocks();
    const csv = [
      'title,url,type,topic,description',
      'New Paper,https://new.com,paper,routing,Fresh paper',
    ].join('\n');

    mocks.readFile.mockResolvedValue(csv);
    mocks.loadPapersRegistry.mockResolvedValue({
      ok: true,
      value: { schema_version: '1.1', papers: {} },
    });

    const result = await executeImport({ csvPath: '/test.csv', dryRun: true });
    expect(result.added).toBe(1);
    expect(mocks.savePapersRegistry).not.toHaveBeenCalled();
  });

  it('handles mixed paper and source rows', async () => {
    const mocks = await getMocks();
    const csv = [
      'title,url,type,topic,description',
      'Paper 1,https://arxiv.org/abs/2501.00001,paper,routing,A paper',
      'Repo 1,https://github.com/x/y,repo,memory,A repo',
    ].join('\n');

    mocks.readFile.mockResolvedValue(csv);
    mocks.loadPapersRegistry.mockResolvedValue({
      ok: true,
      value: { schema_version: '1.1', papers: {} },
    });
    mocks.savePapersRegistry.mockResolvedValue({ ok: true, value: undefined });
    mocks.loadSourcesRegistry.mockResolvedValue({
      ok: true,
      value: { schema_version: '1.0', sources: {} },
    });
    mocks.saveSourcesRegistry.mockResolvedValue({ ok: true, value: undefined });

    const result = await executeImport({ csvPath: '/test.csv' });
    expect(result.added).toBe(2);
    expect(mocks.savePapersRegistry).toHaveBeenCalledTimes(1);
    expect(mocks.saveSourcesRegistry).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// CLI HANDLER TESTS
// =============================================================================

describe('handleImportCommand', () => {
  it('returns error when no file path given', async () => {
    const result = await handleImportCommand([], {});
    expect(result).toContain('Error');
    expect(result).toContain('CSV file path is required');
  });

  it('prefixes output with DRY RUN when dryRun is set', async () => {
    const mocks = await getMocks();
    const csv = [
      'title,url,type,topic,description',
      'Test,https://test.com,paper,routing,desc',
    ].join('\n');

    mocks.readFile.mockResolvedValue(csv);
    mocks.loadPapersRegistry.mockResolvedValue({
      ok: true,
      value: { schema_version: '1.1', papers: {} },
    });

    const result = await handleImportCommand(['/test.csv'], { dryRun: true });
    expect(result).toContain('[DRY RUN]');
  });
});
