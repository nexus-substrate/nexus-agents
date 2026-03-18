import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  loadSourcesRegistry,
  saveSourcesRegistry,
  sourceExistsInRegistry,
  addSourceToRegistry,
  type SourceEntry,
  type SourcesRegistry,
} from './research-helpers-sources-io.js';

vi.mock('node:fs/promises');
vi.mock('yaml');
vi.mock('./research-helpers-io.js', () => ({
  getProjectRoot: vi.fn(() => '/project/root'),
  REGISTRY_PATH: 'docs/research',
}));

const mockSourceEntry: SourceEntry = {
  name: 'Test Source',
  type: 'product_docs',
  url: 'https://docs.example.com/test',
  vendor: 'Example Corp',
  topics: ['orchestration'],
  tags: ['ml', 'nlp'],
  reviewed_date: '2024-01-15',
  key_info: ['Feature A', 'Feature B'],
};

const mockRegistry: SourcesRegistry = {
  schema_version: '1.0',
  sources: { 'test-source': mockSourceEntry },
};

describe('loadSourcesRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load sources registry successfully', async () => {
    const yamlContent = 'schema_version: "1.0"\nsources: {}';
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve(yamlContent));
    vi.mocked(parseYaml).mockReturnValue(mockRegistry);

    const result = await loadSourcesRegistry();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(mockRegistry);
    }
    expect(fs.readFile).toHaveBeenCalledWith('/project/root/docs/research/sources.yaml', 'utf-8');
  });

  it('should return empty registry when file does not exist', async () => {
    const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.mocked(fs.readFile).mockImplementation(() => Promise.reject(error));

    const result = await loadSourcesRegistry();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schema_version).toBe('1.0');
      expect(result.value.sources).toEqual({});
    }
  });

  it('should handle parse errors', async () => {
    const parseError = new Error('Invalid YAML');
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('invalid yaml'));
    vi.mocked(parseYaml).mockImplementation(() => {
      throw parseError;
    });

    const result = await loadSourcesRegistry();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_ERROR');
      expect(result.error.message).toContain('Invalid YAML');
    }
  });

  it('should handle non-Error parse failures', async () => {
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('invalid'));
    vi.mocked(parseYaml).mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error, no-throw-literal
      throw 'string error';
    });

    const result = await loadSourcesRegistry();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_ERROR');
      expect(result.error.message).toContain('string error');
    }
  });

  it('should use custom root directory if provided', async () => {
    const customRoot = '/custom/root';
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('{}'));
    vi.mocked(parseYaml).mockReturnValue({ schema_version: '1.0', sources: {} });

    await loadSourcesRegistry(customRoot);

    expect(fs.readFile).toHaveBeenCalledWith('/custom/root/docs/research/sources.yaml', 'utf-8');
  });

  it('should validate file path is within allowed root', async () => {
    const customRoot = '/some/valid/path';
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('{}'));
    vi.mocked(parseYaml).mockReturnValue({ schema_version: '1.0', sources: {} });

    const result = await loadSourcesRegistry(customRoot);

    expect(result.ok).toBe(true);
  });
});

describe('saveSourcesRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should save sources registry successfully', async () => {
    const yamlOutput = 'schema_version: "1.0"\nsources: {}';
    vi.mocked(stringifyYaml).mockReturnValue(yamlOutput);
    vi.mocked(fs.writeFile).mockImplementation(() => Promise.resolve());

    const result = await saveSourcesRegistry(mockRegistry);

    expect(result.ok).toBe(true);
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/project/root/docs/research/sources.yaml',
      yamlOutput,
      'utf-8'
    );
    expect(stringifyYaml).toHaveBeenCalledWith(mockRegistry, { indent: 2 });
  });

  it('should handle write errors', async () => {
    const writeError = new Error('Permission denied');
    vi.mocked(stringifyYaml).mockReturnValue('yaml content');
    vi.mocked(fs.writeFile).mockImplementation(() => Promise.reject(writeError));

    const result = await saveSourcesRegistry(mockRegistry);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_ERROR');
      expect(result.error.message).toContain('Permission denied');
    }
  });

  it('should handle non-Error write failures', async () => {
    vi.mocked(stringifyYaml).mockReturnValue('yaml');
    vi.mocked(fs.writeFile).mockImplementation(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject('disk full')
    );

    const result = await saveSourcesRegistry(mockRegistry);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_ERROR');
      expect(result.error.message).toContain('disk full');
    }
  });

  it('should use custom root directory if provided', async () => {
    const customRoot = '/custom/root';
    vi.mocked(stringifyYaml).mockReturnValue('yaml');
    vi.mocked(fs.writeFile).mockImplementation(() => Promise.resolve());

    await saveSourcesRegistry(mockRegistry, customRoot);

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/custom/root/docs/research/sources.yaml',
      'yaml',
      'utf-8'
    );
  });

  it('should validate file path is within allowed root', async () => {
    const customRoot = '/some/valid/path';
    vi.mocked(stringifyYaml).mockReturnValue('yaml');
    vi.mocked(fs.writeFile).mockImplementation(() => Promise.resolve());

    const result = await saveSourcesRegistry(mockRegistry, customRoot);

    expect(result.ok).toBe(true);
  });
});

describe('sourceExistsInRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when source exists', async () => {
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('yaml'));
    vi.mocked(parseYaml).mockReturnValue(mockRegistry);

    const exists = await sourceExistsInRegistry(mockSourceEntry.url);

    expect(exists).toBe(true);
  });

  it('should return false when source does not exist', async () => {
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('yaml'));
    vi.mocked(parseYaml).mockReturnValue(mockRegistry);

    const exists = await sourceExistsInRegistry('https://example.com/nonexistent');

    expect(exists).toBe(false);
  });

  it('should return false when registry load fails', async () => {
    vi.mocked(fs.readFile).mockImplementation(() => Promise.reject(new Error('IO error')));

    const exists = await sourceExistsInRegistry(mockSourceEntry.url);

    expect(exists).toBe(false);
  });

  it('should check with custom root directory', async () => {
    const customRoot = '/custom/root';
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('yaml'));
    vi.mocked(parseYaml).mockReturnValue(mockRegistry);

    await sourceExistsInRegistry(mockSourceEntry.url, customRoot);

    expect(fs.readFile).toHaveBeenCalledWith('/custom/root/docs/research/sources.yaml', 'utf-8');
  });

  it('should handle empty registry', async () => {
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('yaml'));
    vi.mocked(parseYaml).mockReturnValue({ schema_version: '1.0', sources: {} });

    const exists = await sourceExistsInRegistry('https://example.com/any');

    expect(exists).toBe(false);
  });
});

describe('addSourceToRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add source to existing registry', async () => {
    const newEntry: SourceEntry = {
      name: 'New Repo',
      type: 'open_source_repo',
      url: 'https://github.com/example/repo',
      vendor: 'Example',
      tags: ['ai'],
      quality_signals: { stars_at_review: 500, has_tests: true },
    };

    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('yaml'));
    vi.mocked(parseYaml).mockReturnValue(mockRegistry);
    vi.mocked(stringifyYaml).mockReturnValue('updated yaml');
    vi.mocked(fs.writeFile).mockImplementation(() => Promise.resolve());

    const result = await addSourceToRegistry('new-paper', newEntry);

    expect(result.ok).toBe(true);
    expect(stringifyYaml).toHaveBeenCalledWith(
      expect.objectContaining({
        schema_version: '1.0',
        sources: expect.objectContaining({
          'test-source': mockSourceEntry,
          'new-paper': newEntry,
        }),
      }),
      { indent: 2 }
    );
  });

  it('should add source to empty registry', async () => {
    const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.mocked(fs.readFile).mockImplementation(() => Promise.reject(error));
    vi.mocked(stringifyYaml).mockReturnValue('yaml');
    vi.mocked(fs.writeFile).mockImplementation(() => Promise.resolve());

    const result = await addSourceToRegistry('first-source', mockSourceEntry);

    expect(result.ok).toBe(true);
    expect(stringifyYaml).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.objectContaining({ 'first-source': mockSourceEntry }),
      }),
      { indent: 2 }
    );
  });

  it('should propagate load errors', async () => {
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('invalid'));
    vi.mocked(parseYaml).mockImplementation(() => {
      throw new Error('Parse failed');
    });

    const result = await addSourceToRegistry('id', mockSourceEntry);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_ERROR');
    }
  });

  it('should propagate save errors', async () => {
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('yaml'));
    vi.mocked(parseYaml).mockReturnValue(mockRegistry);
    vi.mocked(stringifyYaml).mockReturnValue('yaml');
    vi.mocked(fs.writeFile).mockImplementation(() => Promise.reject(new Error('Write failed')));

    const result = await addSourceToRegistry('id', mockSourceEntry);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_ERROR');
    }
  });

  it('should use custom root directory', async () => {
    const customRoot = '/custom/root';
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('yaml'));
    vi.mocked(parseYaml).mockReturnValue(mockRegistry);
    vi.mocked(stringifyYaml).mockReturnValue('yaml');
    vi.mocked(fs.writeFile).mockImplementation(() => Promise.resolve());

    await addSourceToRegistry('id', mockSourceEntry, customRoot);

    expect(fs.readFile).toHaveBeenCalledWith('/custom/root/docs/research/sources.yaml', 'utf-8');
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/custom/root/docs/research/sources.yaml',
      'yaml',
      'utf-8'
    );
  });

  it('should overwrite existing source with same id', async () => {
    const updatedEntry: SourceEntry = {
      ...mockSourceEntry,
      vendor: 'Updated Corp',
    };

    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve('yaml'));
    vi.mocked(parseYaml).mockReturnValue(mockRegistry);
    vi.mocked(stringifyYaml).mockReturnValue('yaml');
    vi.mocked(fs.writeFile).mockImplementation(() => Promise.resolve());

    const result = await addSourceToRegistry('test-source', updatedEntry);

    expect(result.ok).toBe(true);
    expect(stringifyYaml).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.objectContaining({
          'test-source': updatedEntry,
        }),
      }),
      { indent: 2 }
    );
  });
});
