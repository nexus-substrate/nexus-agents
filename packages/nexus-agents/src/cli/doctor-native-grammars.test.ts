/**
 * Tests for the native tree-sitter grammar probe (#5427).
 *
 * The probe exists because #5388's failure shape — install exits 0, the CLI
 * dies at first use — is invisible to anything that only checks that a module
 * imports. So the tests drive the seam: `probeGrammars` takes `register` and
 * `parse` as parameters, which makes registration failure, parse failure and
 * "parsed but produced nothing" all reachable without a broken `.so` on disk.
 */
import { describe, expect, it } from 'vitest';

import {
  GRAMMAR_PROBES,
  SUPPORTED_GRAMMAR_LANGUAGES,
  checkNativeGrammars,
  probeGrammars,
} from './doctor-native-grammars.js';
import type { GrammarParse } from './doctor-native-grammars.js';

/** A `parse` that matches whatever kind is asked for — the healthy grammar. */
const workingParse: GrammarParse = () => ({
  root: () => ({ findAll: () => [{}] }),
});

/** A `parse` that succeeds but yields no matching node — the wrong grammar. */
const emptyParse: GrammarParse = () => ({
  root: () => ({ findAll: () => [] }),
});

const noopRegister = (): void => undefined;

describe('probeGrammars', () => {
  it('reports available and names every language when each grammar parses', () => {
    const result = probeGrammars(noopRegister, workingParse);

    expect(result.available).toBe(true);
    expect(result.error).toBeNull();
    expect(result.languages).toEqual(GRAMMAR_PROBES.map((p) => p.lang));
  });

  it('reports unavailable — not vacuously available — when there are no probes', () => {
    // `languages.length === probes.length` would render 0 === 0 as health, which
    // is the shape this repo treats as a defect. The empty case is named.
    const result = probeGrammars(noopRegister, workingParse, []);

    expect(result.available).toBe(false);
    expect(result.error).toContain('no grammar probes');
    expect(result.languages).toEqual([]);
  });

  it('reports unavailable when registration throws, and says why', () => {
    const result = probeGrammars(() => {
      throw new Error('registerDynamicLanguage called twice');
    }, workingParse);

    expect(result.available).toBe(false);
    expect(result.languages).toEqual([]);
    expect(result.error).toContain('registration failed');
    expect(result.error).toContain('called twice');
  });

  it('reports unavailable when a grammar parses but produces no language-specific node', () => {
    // The failure tree-sitter's error tolerance produces: the Go grammar will
    // happily parse Python source and simply find no Go nodes. Nothing throws,
    // so only asserting on the node KIND can catch it.
    const result = probeGrammars(noopRegister, emptyParse);

    expect(result.available).toBe(false);
    expect(result.languages).toEqual([]);
    for (const probe of GRAMMAR_PROBES) {
      expect(result.error).toContain(`no ${probe.kind} node`);
    }
  });

  it('reports the working subset when only one grammar is broken', () => {
    const [first] = GRAMMAR_PROBES;
    expect(first).toBeDefined();
    const halfBroken: GrammarParse = (lang) =>
      lang === first?.lang
        ? { root: () => ({ findAll: () => [{}] }) }
        : {
            root: () => {
              throw new Error('Cannot open shared object file');
            },
          };

    const result = probeGrammars(noopRegister, halfBroken);

    expect(result.available).toBe(false);
    // The working half is still named — a partial failure must not collapse
    // into a bare boolean that loses which half broke.
    expect(result.languages).toEqual([first?.lang]);
    expect(result.error).toContain('Cannot open shared object file');
  });

  it('reports unavailable when a probe throws, quoting the loader error', () => {
    const throwingParse: GrammarParse = () => {
      throw new Error('Cannot open shared object file: No such file or directory');
    };

    const result = probeGrammars(noopRegister, throwingParse);

    expect(result.available).toBe(false);
    expect(result.error).toContain('No such file or directory');
  });
});

describe('probe coverage', () => {
  it('probes every language the polyglot scanner claims to support', () => {
    // A language added to the scanner without a probe here would ship an
    // unverified grammar, which is the gap this module exists to close.
    expect([...GRAMMAR_PROBES].map((p) => p.lang).sort()).toEqual(
      [...SUPPORTED_GRAMMAR_LANGUAGES].sort()
    );
  });

  it('defines at least one probe, so the available verdict is never vacuous', () => {
    expect(GRAMMAR_PROBES.length).toBeGreaterThan(0);
  });

  it('gives each probe a distinct, language-specific node kind', () => {
    const kinds = GRAMMAR_PROBES.map((p) => p.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe('checkNativeGrammars when the modules will not load', () => {
  it('reports unavailable and quotes the loader error', async () => {
    const result = await checkNativeGrammars(() => {
      throw new Error("Cannot find package '@ast-grep/napi'");
    });

    expect(result.available).toBe(false);
    expect(result.languages).toEqual([]);
    expect(result.error).toContain('failed to load');
    expect(result.error).toContain('@ast-grep/napi');
  });

  it('reports unavailable when the loader rejects', async () => {
    const result = await checkNativeGrammars(() => Promise.reject(new Error('ENOENT: parser.so')));

    expect(result.available).toBe(false);
    expect(result.error).toContain('parser.so');
  });
});

describe('checkNativeGrammars against the real grammars', () => {
  it('loads and parses both prebuilt tree-sitter grammars', async () => {
    const result = await checkNativeGrammars();

    expect(result.error).toBeNull();
    expect(result.available).toBe(true);
    expect([...result.languages].sort()).toEqual([...SUPPORTED_GRAMMAR_LANGUAGES].sort());
  });
});
