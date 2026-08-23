/**
 * Tests for extract-symbols-tool (#2159).
 *
 * Focus: the path-traversal guard at line 59 is the security-critical surface
 * this tool exposes, and it was previously untested. Also exercises input-
 * schema validation and mode dispatch.
 *
 * Calls `_testing.extractSymbolsHandler` directly — bypassing the
 * secure-handler / timeout wrappers — so we test the core logic in
 * isolation. The wrappers are covered elsewhere.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';

// Mock the symbol extractor so we don't need real source files for every test.
vi.mock('../../indexer/symbol-extractor.js', () => ({
  extractSymbols: vi.fn(),
  extractSymbolIndexResult: vi.fn(),
  SUPPORTED_EXTENSIONS: ['.ts', '.tsx', '.js', '.jsx'],
}));

import {
  _testing,
  DEFAULT_EXTRACT_MAX_CHARS,
  DEFAULT_EXTRACT_MAX_SYMBOLS,
} from './extract-symbols-tool.js';
import { createLogger } from '../../core/index.js';
import {
  createCapabilityGapLedger,
  resetGapLedger,
  setGapLedger,
} from '../../core/task-analysis/capability-gap-ledger.js';
import * as symbolExtractor from '../../indexer/symbol-extractor.js';
import type { CodeSymbol } from '../../indexer/symbol-extractor.js';

const { extractSymbolsHandler } = _testing;

const mockedExtractSymbols = vi.mocked(symbolExtractor.extractSymbols);
const mockedExtractIndexResult = vi.mocked(symbolExtractor.extractSymbolIndexResult);

function makeCtx(): Parameters<typeof extractSymbolsHandler>[1] {
  // Minimal RequestContext — the handler only reads ctx.logger, so the
  // requestContext shape doesn't need to be complete for these tests.
  return {
    requestContext: {
      requestId: 'test-req',
      toolName: 'extract_symbols',
      startTimeMs: 0,
    } as unknown as Parameters<typeof extractSymbolsHandler>[1]['requestContext'],
    logger: createLogger({ component: 'test' }),
  };
}

describe('extract-symbols-tool (#2159)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('path-traversal guard', () => {
    it('rejects paths outside the cwd subtree', async () => {
      const result = await extractSymbolsHandler({ filePath: '/etc/passwd' }, makeCtx());
      expect(result.isError).toBe(true);
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toMatch(/Path traversal denied/);
    });

    it('rejects relative paths that escape via ..', async () => {
      // resolve('../../etc/passwd') from cwd may or may not escape depending
      // on nesting — but a clearly-outside absolute path always fails.
      const outside = resolve('/');
      const result = await extractSymbolsHandler({ filePath: outside }, makeCtx());
      expect(result.isError).toBe(true);
    });

    it('accepts paths inside the cwd subtree', async () => {
      mockedExtractIndexResult.mockResolvedValueOnce({
        kind: 'index',
        index: 'fn foo:10\nfn bar:20',
      });
      const inside = resolve('./package.json'); // real file, resolves under cwd
      const result = await extractSymbolsHandler({ filePath: inside }, makeCtx());
      // Should not be flagged as traversal even if the file isn't a TS file.
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).not.toMatch(/Path traversal/);
    });
  });

  describe('input validation', () => {
    it('rejects missing filePath', async () => {
      const result = await extractSymbolsHandler({}, makeCtx());
      expect(result.isError).toBe(true);
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toMatch(/Validation error/);
    });

    it('rejects empty filePath (min length 1)', async () => {
      const result = await extractSymbolsHandler({ filePath: '' }, makeCtx());
      expect(result.isError).toBe(true);
    });

    it('rejects filePath longer than 500 chars', async () => {
      const result = await extractSymbolsHandler({ filePath: 'x'.repeat(501) }, makeCtx());
      expect(result.isError).toBe(true);
    });

    it('rejects invalid mode enum value', async () => {
      const result = await extractSymbolsHandler(
        { filePath: resolve('./x.ts'), mode: 'raw' },
        makeCtx()
      );
      expect(result.isError).toBe(true);
    });
  });

  describe('mode dispatch', () => {
    it('defaults to index mode (calls extractSymbolIndex, not extractSymbols)', async () => {
      mockedExtractIndexResult.mockResolvedValueOnce({ kind: 'index', index: 'fn foo:10' });
      await extractSymbolsHandler({ filePath: resolve('./x.ts') }, makeCtx());
      expect(mockedExtractIndexResult).toHaveBeenCalledTimes(1);
      expect(mockedExtractSymbols).not.toHaveBeenCalled();
    });

    it('uses full mode when explicitly requested', async () => {
      mockedExtractSymbols.mockResolvedValueOnce({
        filePath: '/x.ts',
        totalLines: 10,
        totalChars: 100,
        symbolChars: 50,
        savingsPercent: 50,
        parsed: true,
        symbols: [
          {
            name: 'foo',
            kind: 'function',
            startLine: 1,
            endLine: 5,
            exported: true,
            text: 'function foo() {}',
          },
        ],
      } as never);
      const result = await extractSymbolsHandler(
        { filePath: resolve('./x.ts'), mode: 'full' },
        makeCtx()
      );
      expect(mockedExtractSymbols).toHaveBeenCalledTimes(1);
      expect(mockedExtractIndexResult).not.toHaveBeenCalled();
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toContain('savingsPercent');
    });

    it('names the supported extensions when the file could not be parsed', async () => {
      // #4517: the old message guessed "file may not be TypeScript/JavaScript"
      // for BOTH empty cases without saying what would count.
      mockedExtractIndexResult.mockResolvedValueOnce({ kind: 'empty', reason: 'unsupported' });
      const result = await extractSymbolsHandler({ filePath: resolve('./x.md') }, makeCtx());

      expect(result.isError).toBeFalsy();
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toContain('.md');
      expect(text).toContain('.ts');
      // It must not imply anything about contents it never read.
      expect(text).toContain('says nothing about whether the file contains symbols');
    });

    it('says a parsed file genuinely declares nothing, and why that happens', async () => {
      // The case that misled a reader on a valid .ts barrel of 20 re-exports.
      mockedExtractIndexResult.mockResolvedValueOnce({
        kind: 'empty',
        reason: 'no-declarations',
      });
      const result = await extractSymbolsHandler({ filePath: resolve('./barrel.ts') }, makeCtx());

      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toContain('Parsed successfully');
      expect(text).toContain('re-export');
      // Must not send the reader hunting a file-type problem that isn't there.
      expect(text).not.toContain('may not be TypeScript');
    });
  });

  describe('full-mode output cap (#4253)', () => {
    /** Build a symbol whose `text` is exactly `chars` long. */
    function makeSymbol(name: string, chars: number): CodeSymbol {
      return {
        name,
        kind: 'function',
        startLine: 1,
        endLine: 2,
        exported: true,
        text: 'x'.repeat(chars),
      };
    }

    it('caps total emitted chars to the default budget and reports the omission', async () => {
      // 5 symbols well past DEFAULT_EXTRACT_MAX_CHARS in aggregate.
      const perSymbolChars = Math.ceil(DEFAULT_EXTRACT_MAX_CHARS / 2);
      const symbols = Array.from({ length: 5 }, (_, i) =>
        makeSymbol(`s${String(i)}`, perSymbolChars)
      );
      mockedExtractSymbols.mockResolvedValueOnce({
        filePath: '/big.ts',
        totalLines: 1000,
        totalChars: perSymbolChars * 5,
        symbolChars: perSymbolChars * 5,
        savingsPercent: 0,
        parsed: true,
        symbols,
      });

      const result = await extractSymbolsHandler(
        { filePath: resolve('./big.ts'), mode: 'full' },
        makeCtx()
      );
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      const parsed = JSON.parse(text) as {
        truncated?: boolean;
        omittedSymbols?: number;
        omittedChars?: number;
        symbols: { text: string }[];
      };

      expect(parsed.truncated).toBe(true);
      expect(parsed.omittedSymbols).toBeGreaterThan(0);
      expect(parsed.omittedChars).toBeGreaterThan(0);
      const emittedChars = parsed.symbols.reduce((sum, s) => sum + s.text.length, 0);
      // Emitted text should be bounded near the cap, not the full ~2.5x-cap input.
      expect(emittedChars).toBeLessThan(perSymbolChars * 5);
    });

    it('caps symbol count to the default budget and reports the omission', async () => {
      const count = DEFAULT_EXTRACT_MAX_SYMBOLS + 50;
      const symbols = Array.from({ length: count }, (_, i) => makeSymbol(`s${String(i)}`, 5));
      mockedExtractSymbols.mockResolvedValueOnce({
        filePath: '/many.ts',
        totalLines: count,
        totalChars: count * 5,
        symbolChars: count * 5,
        savingsPercent: 0,
        parsed: true,
        symbols,
      });

      const result = await extractSymbolsHandler(
        { filePath: resolve('./many.ts'), mode: 'full' },
        makeCtx()
      );
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      const parsed = JSON.parse(text) as {
        truncated?: boolean;
        omittedSymbols?: number;
        symbols: unknown[];
      };

      expect(parsed.truncated).toBe(true);
      expect(parsed.symbols.length).toBe(DEFAULT_EXTRACT_MAX_SYMBOLS);
      expect(parsed.omittedSymbols).toBe(50);
    });

    it('respects an explicit maxChars/maxSymbols override', async () => {
      const symbols = [makeSymbol('a', 100), makeSymbol('b', 100), makeSymbol('c', 100)];
      mockedExtractSymbols.mockResolvedValueOnce({
        filePath: '/small.ts',
        totalLines: 10,
        totalChars: 300,
        symbolChars: 300,
        savingsPercent: 0,
        parsed: true,
        symbols,
      });

      const result = await extractSymbolsHandler(
        { filePath: resolve('./small.ts'), mode: 'full', maxSymbols: 1 },
        makeCtx()
      );
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      const parsed = JSON.parse(text) as { truncated?: boolean; symbols: unknown[] };

      expect(parsed.truncated).toBe(true);
      expect(parsed.symbols.length).toBe(1);
    });

    it('preserves existing output (no truncation fields) when results are under both caps', async () => {
      mockedExtractSymbols.mockResolvedValueOnce({
        filePath: '/x.ts',
        totalLines: 10,
        totalChars: 100,
        symbolChars: 50,
        savingsPercent: 50,
        parsed: true,
        symbols: [makeSymbol('foo', 20)],
      });

      const result = await extractSymbolsHandler(
        { filePath: resolve('./x.ts'), mode: 'full' },
        makeCtx()
      );
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      const parsed = JSON.parse(text) as { truncated?: boolean };

      expect(parsed.truncated).toBeUndefined();
    });
  });

  describe('error propagation', () => {
    it('wraps extractor failures in a toolError (not a thrown exception)', async () => {
      mockedExtractIndexResult.mockRejectedValueOnce(new Error('parse crashed'));
      const result = await extractSymbolsHandler({ filePath: resolve('./x.ts') }, makeCtx());
      expect(result.isError).toBe(true);
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      expect(text).toMatch(/Symbol extraction failed/);
      expect(text).toMatch(/parse crashed/);
    });

    it('coerces non-Error throws into a string message', async () => {
      mockedExtractIndexResult.mockRejectedValueOnce('string error');
      const result = await extractSymbolsHandler({ filePath: resolve('./x.ts') }, makeCtx());
      expect(result.isError).toBe(true);
    });
  });
});

describe('tool-refusal gap recording (#4651)', () => {
  let ledger: ReturnType<typeof createCapabilityGapLedger>;

  beforeEach(() => {
    ledger = createCapabilityGapLedger();
    setGapLedger(ledger);
  });

  afterEach(() => {
    resetGapLedger();
  });

  it('records a gap when the tool declines an unsupported extension', async () => {
    mockedExtractIndexResult.mockResolvedValueOnce({ kind: 'empty', reason: 'unsupported' });

    await extractSymbolsHandler({ filePath: resolve('./service.py') }, makeCtx());

    const [summary] = ledger.summarize();
    expect(summary?.type).toBe('tool_refusal');
    expect(summary?.name).toBe('extract_symbols:.py');
    expect(summary?.count).toBe(1);
  });

  it('records NOTHING when the file parsed and simply declares nothing', async () => {
    // The measured zero. A re-export barrel is not a missing capability, and
    // counting it would make the demand number meaningless — this is the
    // distinction #4534 drew in the message and it has to hold here too.
    mockedExtractIndexResult.mockResolvedValueOnce({ kind: 'empty', reason: 'no-declarations' });

    await extractSymbolsHandler({ filePath: resolve('./barrel.ts') }, makeCtx());

    expect(ledger.size()).toBe(0);
  });

  it('records nothing on a successful extraction', async () => {
    mockedExtractIndexResult.mockResolvedValueOnce({ kind: 'index', index: 'fn foo:10' });

    await extractSymbolsHandler({ filePath: resolve('./ok.ts') }, makeCtx());

    expect(ledger.size()).toBe(0);
  });

  it('buckets repeated refusals of the same language together', async () => {
    for (const f of ['./a.py', './b.py', './c.py']) {
      mockedExtractIndexResult.mockResolvedValueOnce({ kind: 'empty', reason: 'unsupported' });
      await extractSymbolsHandler({ filePath: resolve(f) }, makeCtx());
    }
    expect(ledger.summarize()).toHaveLength(1);
    expect(ledger.summarize()[0]?.count).toBe(3);
  });

  it('keeps different languages in different buckets', async () => {
    for (const f of ['./a.py', './b.go']) {
      mockedExtractIndexResult.mockResolvedValueOnce({ kind: 'empty', reason: 'unsupported' });
      await extractSymbolsHandler({ filePath: resolve(f) }, makeCtx());
    }
    expect(
      ledger
        .summarize()
        .map((g) => g.name)
        .sort()
    ).toEqual(['extract_symbols:.go', 'extract_symbols:.py']);
  });
});
