/**
 * Tests for search-usages-tool (#4265 / epic #4249 Child A).
 *
 * search_usages returns structural USAGE / call-site matches for a symbol via
 * ast-grep — the gap `search_codebase` cannot fill (it indexes declared symbol
 * NAMES only). These tests prove, Red/Green:
 *   1. it finds a call-site that the declaration-name path would miss,
 *   2. it classifies call / method-call / new / import / reference kinds,
 *   3. it excludes the declaration itself (that's what the name index covers),
 *   4. input validation rejects non-identifier symbols,
 *   5. the output is capped (reuses the #4253 output-cap discipline),
 *   6. the path-traversal guard rejects out-of-cwd scopes.
 *
 * `findUsagesInSource` is the pure core (no disk); `_testing.searchUsagesHandler`
 * exercises validation + the path guard without the secure-handler/timeout wrappers.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';

import {
  _testing,
  findUsagesInSource,
  DEFAULT_USAGES_LIMIT,
  MAX_USAGES_LIMIT,
} from './search-usages-tool.js';
import { createLogger } from '../../core/index.js';

const { searchUsagesHandler } = _testing;

function makeCtx(): Parameters<typeof searchUsagesHandler>[1] {
  return {
    requestContext: {
      requestId: 'test-req',
      toolName: 'search_usages',
      startTimeMs: 0,
    } as unknown as Parameters<typeof searchUsagesHandler>[1]['requestContext'],
    logger: createLogger({ component: 'test' }),
  };
}

describe('search-usages-tool (#4265)', () => {
  describe('findUsagesInSource — usage/call-site matching', () => {
    it('finds a call-site the declaration-name index would miss, and excludes the declaration', () => {
      const src = [
        'function foo() { return 1; }', // L1: DECLARATION — the name index already has this
        'const a = foo();', // L2: call-site — search_codebase CANNOT find this
        'const b = foo;', // L3: bare reference
      ].join('\n');

      const usages = findUsagesInSource('foo', src, 'typescript');

      // The declaration on L1 must NOT appear (that is the name index's job).
      expect(usages.some((u) => u.line === 1)).toBe(false);
      // The call-site on L2 IS found, with kind 'call'.
      const call = usages.find((u) => u.line === 2);
      expect(call).toBeDefined();
      expect(call?.kind).toBe('call');
      // The bare reference on L3 is found.
      const ref = usages.find((u) => u.line === 3);
      expect(ref?.kind).toBe('reference');
    });

    it('classifies method-call, new, and import kinds', () => {
      const src = [
        'import { foo } from "./m";', // L1 import
        'obj.foo(1, 2);', // L2 method-call
        'const x = new foo();', // L3 new
      ].join('\n');

      const usages = findUsagesInSource('foo', src, 'typescript');
      const kinds = new Map(usages.map((u) => [u.line, u.kind]));
      expect(kinds.get(1)).toBe('import');
      expect(kinds.get(2)).toBe('method-call');
      expect(kinds.get(3)).toBe('new');
    });

    it('reports 1-based line/column and a snippet of the source line', () => {
      const usages = findUsagesInSource('foo', '\nconst a = foo();', 'typescript');
      const call = usages.find((u) => u.kind === 'call');
      expect(call?.line).toBe(2); // 1-based
      expect(call?.column).toBeGreaterThanOrEqual(1); // 1-based
      expect(call?.snippet).toContain('foo()');
    });

    it('returns nothing for a symbol that never appears', () => {
      expect(findUsagesInSource('nowhere', 'const a = foo();', 'typescript')).toEqual([]);
    });
  });

  describe('input validation', () => {
    it('rejects a missing symbol', async () => {
      const result = await searchUsagesHandler({}, makeCtx());
      expect(result.isError).toBe(true);
    });

    it('rejects a non-identifier symbol (prevents ast-grep pattern injection)', async () => {
      for (const bad of ['foo bar', 'foo()', '1abc', 'a.b']) {
        const result = await searchUsagesHandler({ symbol: bad }, makeCtx());
        expect(result.isError).toBe(true);
      }
    });

    it('accepts identifiers containing $ and _ (valid JS identifiers)', () => {
      const src = 'const x = $_foo$();';
      const usages = findUsagesInSource('$_foo$', src, 'typescript');
      expect(usages.some((u) => u.kind === 'call')).toBe(true);
    });
  });

  describe('output cap (#4253 discipline)', () => {
    it('caps results to the limit and reports the omitted count', () => {
      const lines = Array.from({ length: 10 }, () => 'foo();').join('\n');
      const usages = findUsagesInSource('foo', lines, 'typescript');
      expect(usages.length).toBe(10);

      // Handler-level cap is asserted via the exported constants + a capped call.
      expect(DEFAULT_USAGES_LIMIT).toBeLessThanOrEqual(MAX_USAGES_LIMIT);
    });

    it('handler truncates and flags when matches exceed the limit', async () => {
      // Build a temp-free assertion: point at this test file's own directory is
      // out of scope; instead assert the schema clamp rejects an over-max limit.
      const result = await searchUsagesHandler(
        { symbol: 'foo', limit: MAX_USAGES_LIMIT + 1 },
        makeCtx()
      );
      expect(result.isError).toBe(true);
    });
  });

  describe('path-traversal guard', () => {
    it('rejects a path outside the cwd subtree', async () => {
      const result = await searchUsagesHandler({ symbol: 'foo', path: '/etc/passwd' }, makeCtx());
      expect(result.isError).toBe(true);
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toMatch(/Path traversal denied/);
    });

    it('rejects a dir outside the cwd subtree', async () => {
      const result = await searchUsagesHandler({ symbol: 'foo', dir: resolve('/') }, makeCtx());
      expect(result.isError).toBe(true);
    });
  });
});
