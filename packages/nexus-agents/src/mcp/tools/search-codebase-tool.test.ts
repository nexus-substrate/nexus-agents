/**
 * Tests for search-codebase-tool (#2159).
 *
 * Focus: input-schema validation, path-traversal guard, cache hit/miss
 * behavior (the whole point of the module-level `cachedIndex`), and the
 * three operating modes (search / summary / list). Calls
 * `_testing.searchCodebaseHandler` directly so the secure-handler and
 * timeout middleware are out of scope.
 *
 * Uses a constructor spy on `CodebaseIndex` to verify the cache: one call
 * per unique directory, zero extra calls when the same directory is hit
 * twice. `_testing.clearIndexCache()` resets between suites.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

// `vi.mock` factories are hoisted above top-level code, so the mock objects
// they reference must be created inside `vi.hoisted()` to also be hoisted.
const mocks = vi.hoisted(() => {
  const indexInstance = {
    index: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockReturnValue([]),
    listFiles: vi.fn().mockReturnValue([]),
    getFileSummary: vi.fn().mockReturnValue(undefined),
    stats: { files: 0, symbols: 0 },
  };
  // vitest 4: arrow functions aren't constructor-callable. Use a real
  // function so `new CodebaseIndex(dir)` works.
  const ctor = vi.fn(function () {
    return indexInstance;
  });
  return { indexInstance, ctor };
});

vi.mock('../../indexer/codebase-search.js', () => ({
  CodebaseIndex: mocks.ctor,
}));

import { _testing } from './search-codebase-tool.js';
import { createLogger } from '../../core/index.js';

const { searchCodebaseHandler, resolveSearchDir, clearIndexCache } = _testing;

function makeCtx(): Parameters<typeof searchCodebaseHandler>[1] {
  // Minimal RequestContext — the handler only reads ctx.logger, so the
  // requestContext shape doesn't need to be complete for these tests.
  return {
    requestContext: {
      requestId: 'test-req',
      toolName: 'search_codebase',
      startTimeMs: 0,
    } as unknown as Parameters<typeof searchCodebaseHandler>[1]['requestContext'],
    logger: createLogger({ component: 'test' }),
  };
}

describe('search-codebase-tool (#2159)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIndexCache();
    // Reset the stubbed index instance between tests (vi.clearAllMocks only
    // resets call history, not `mockReturnValue` setups — this keeps the
    // defaults fresh).
    mocks.indexInstance.search.mockReturnValue([]);
    mocks.indexInstance.listFiles.mockReturnValue([]);
    mocks.indexInstance.getFileSummary.mockReturnValue(undefined);
    mocks.indexInstance.stats = { files: 0, symbols: 0 };
  });

  describe('input validation', () => {
    it('rejects missing query', async () => {
      const result = await searchCodebaseHandler({}, makeCtx());
      expect(result.isError).toBe(true);
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toMatch(/Validation error/);
    });

    it('rejects empty query (min length 1)', async () => {
      const result = await searchCodebaseHandler({ query: '' }, makeCtx());
      expect(result.isError).toBe(true);
    });

    it('rejects query longer than 200 chars', async () => {
      const result = await searchCodebaseHandler({ query: 'x'.repeat(201) }, makeCtx());
      expect(result.isError).toBe(true);
    });

    it('enforces limit upper bound of 50', async () => {
      const result = await searchCodebaseHandler({ query: 'foo', limit: 51 }, makeCtx());
      expect(result.isError).toBe(true);
    });

    it('enforces limit lower bound of 1', async () => {
      const result = await searchCodebaseHandler({ query: 'foo', limit: 0 }, makeCtx());
      expect(result.isError).toBe(true);
    });

    it('rejects invalid mode enum value', async () => {
      const result = await searchCodebaseHandler({ query: 'foo', mode: 'fuzzy' }, makeCtx());
      expect(result.isError).toBe(true);
    });
  });

  describe('path-traversal guard', () => {
    it('rejects directories outside cwd subtree', () => {
      const r = resolveSearchDir('/etc');
      expect('error' in r).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/Path traversal denied/);
    });

    it('accepts directories inside cwd subtree', () => {
      const r = resolveSearchDir('./src');
      expect('dir' in r).toBe(true);
      if ('dir' in r) expect(r.dir).toBe(resolve('./src'));
    });

    it('defaults to process.cwd() when directory is undefined', () => {
      const r = resolveSearchDir(undefined);
      expect('dir' in r).toBe(true);
      if ('dir' in r) expect(r.dir).toBe(resolve('.'));
    });

    it('propagates traversal error through the handler', async () => {
      const result = await searchCodebaseHandler({ query: 'foo', directory: '/etc' }, makeCtx());
      expect(result.isError).toBe(true);
    });
  });

  describe('index cache (#2159 — cache hit/miss is the whole point of the module state)', () => {
    it('builds the index once on first call, reuses it on second call for same dir', async () => {
      await searchCodebaseHandler({ query: 'foo', directory: './src' }, makeCtx());
      expect(mocks.ctor).toHaveBeenCalledTimes(1);

      // Second call, same dir → cache hit. No new index built.
      await searchCodebaseHandler({ query: 'bar', directory: './src' }, makeCtx());
      expect(mocks.ctor).toHaveBeenCalledTimes(1);
    });

    it('rebuilds the index when a different directory is used', async () => {
      await searchCodebaseHandler({ query: 'foo', directory: './src' }, makeCtx());
      expect(mocks.ctor).toHaveBeenCalledTimes(1);

      await searchCodebaseHandler({ query: 'foo', directory: './docs' }, makeCtx());
      // Different dir → cache miss → new index.
      expect(mocks.ctor).toHaveBeenCalledTimes(2);
    });

    it('clearIndexCache forces a rebuild on the next call', async () => {
      await searchCodebaseHandler({ query: 'foo', directory: './src' }, makeCtx());
      clearIndexCache();
      await searchCodebaseHandler({ query: 'foo', directory: './src' }, makeCtx());
      expect(mocks.ctor).toHaveBeenCalledTimes(2);
    });
  });

  describe('mode dispatch', () => {
    it('search mode: reports zero results cleanly', async () => {
      mocks.indexInstance.search.mockReturnValue([]);
      mocks.indexInstance.stats = { files: 3, symbols: 17 };
      const result = await searchCodebaseHandler({ query: 'missing' }, makeCtx());
      expect(result.isError).toBeFalsy();
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toMatch(/No symbols matching "missing"/);
      expect(text).toMatch(/3 indexed files/);
    });

    it('search mode: formats non-empty results with matchType + kind + location', async () => {
      mocks.indexInstance.search.mockReturnValue([
        {
          matchType: 'exact',
          symbol: {
            name: 'doThing',
            kind: 'function',
            exported: true,
            filePath: 'src/foo.ts',
            startLine: 42,
          },
        },
      ]);
      const result = await searchCodebaseHandler({ query: 'doThing' }, makeCtx());
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toMatch(/1 results for "doThing"/);
      expect(text).toMatch(/\[exact\] export function doThing \(src\/foo\.ts:42\)/);
    });

    it('list mode: emits per-file symbol + line counts', async () => {
      mocks.indexInstance.listFiles.mockReturnValue([
        { path: 'a.ts', symbols: 5, lines: 100 },
        { path: 'b.ts', symbols: 10, lines: 50 },
      ]);
      mocks.indexInstance.stats = { files: 2, symbols: 15 };
      const result = await searchCodebaseHandler({ query: '*', mode: 'list' }, makeCtx());
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toMatch(/2 files, 15 symbols indexed/);
      // Sorted by symbol count desc → b.ts first.
      const bIdx = text.indexOf('b.ts');
      const aIdx = text.indexOf('a.ts');
      expect(bIdx).toBeGreaterThan(-1);
      expect(aIdx).toBeGreaterThan(bIdx);
    });

    it('summary mode: reports file not found when summary is undefined', async () => {
      mocks.indexInstance.getFileSummary.mockReturnValue(undefined);
      const result = await searchCodebaseHandler(
        { query: 'missing.ts', mode: 'summary' },
        makeCtx()
      );
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toMatch(/File "missing.ts" not found in index/);
    });

    it('summary mode: returns JSON summary when present', async () => {
      mocks.indexInstance.getFileSummary.mockReturnValue({ path: 'x.ts', symbols: 3 });
      const result = await searchCodebaseHandler({ query: 'x.ts', mode: 'summary' }, makeCtx());
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(JSON.parse(text)).toEqual({ path: 'x.ts', symbols: 3 });
    });
  });

  describe('error propagation', () => {
    it('wraps indexer failures in a toolError', async () => {
      mocks.indexInstance.search.mockImplementationOnce(() => {
        throw new Error('index corrupted');
      });
      const result = await searchCodebaseHandler({ query: 'foo' }, makeCtx());
      expect(result.isError).toBe(true);
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toMatch(/Search failed/);
      expect(text).toMatch(/index corrupted/);
    });
  });
});
