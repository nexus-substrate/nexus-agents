/**
 * Tests for the public API surface extractor (#4784).
 *
 * #4757 shipped this untested. Three properties are load-bearing and each one
 * has already failed once in some form: the walk must follow type references
 * transitively (a type public only through another type's signature — the
 * #4744 shape), the output must be byte-stable across runs (member order and
 * symbol order), and printed types must not carry machine-specific absolute
 * paths (the gate failed on its own first CI run because /home/runner is not
 * the author's home directory — a gate that always fails gets switched off).
 *
 * @module scripts/extract-api-surface.test
 */
import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { extractSurface, renderSurface } from './extract-api-surface.js';

/**
 * `referencedDeclarations` only follows into this package's own source, so the
 * in-memory files must live at the path the extractor recognises.
 */
const SRC = '/packages/nexus-agents/src';

/** Builds an in-memory entry point so the test never touches the real package. */
function surfaceOf(files: Record<string, string>): string {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) project.createSourceFile(SRC + path, text);
  const entry = project.getSourceFileOrThrow(`${SRC}/index.ts`);
  return renderSurface(extractSurface(entry));
}

describe('extractSurface', () => {
  it('captures a directly exported interface and its members', () => {
    const out = surfaceOf({
      '/index.ts': 'export interface Direct { id: string; count?: number; }',
    });

    expect(out).toContain('InterfaceDeclaration Direct');
    expect(out).toContain('id: string');
    expect(out).toContain('count?: number');
  });

  it('follows a type that is public ONLY through another type’s signature', () => {
    // The #4744 shape, and the whole reason the extractor walks references
    // instead of reading the export list: `Hidden` is never exported by name,
    // but a consumer reaches it through `Exposed.payload`, so changing it is a
    // public break. An export-list-only gate calls it internal.
    const out = surfaceOf({
      '/types.ts': 'export interface Hidden { secret: string; }',
      '/index.ts':
        "import type { Hidden } from './types.js';\nexport interface Exposed { payload: Hidden; }",
    });

    expect(out).toContain('InterfaceDeclaration Exposed');
    expect(out).toContain('InterfaceDeclaration Hidden');
    expect(out).toContain('secret: string');
  });

  it('is byte-identical across two extractions of the same source', () => {
    // Nondeterminism in a snapshot gate is indistinguishable from a real
    // surface change, and would make every PR red for no reason.
    const files = {
      '/index.ts':
        'export interface A { z: string; a: number; m: boolean; }\nexport interface B { q: A; }',
    };

    expect(surfaceOf(files)).toBe(surfaceOf(files));
  });

  it('does not depend on the order members are declared in', () => {
    // Members are sorted so a pure reordering in source is not a spurious diff.
    const declared = surfaceOf({ '/index.ts': 'export interface S { a: string; b: string; }' });
    const reordered = surfaceOf({ '/index.ts': 'export interface S { b: string; a: string; }' });

    expect(reordered).toBe(declared);
  });

  it('orders symbols alphabetically, not by traversal order', () => {
    // The walk pops its queue LIFO, so discovery order is the reverse of
    // declaration order. Only the sort makes the snapshot depend on the source
    // rather than on how the extractor happened to walk it — and a snapshot
    // whose order drifts is indistinguishable from a real surface change.
    const out = surfaceOf({
      '/index.ts': 'export interface Alpha { a: string; }\nexport interface Beta { b: string; }',
    });
    const symbols = out.split('\n').filter((l) => l.startsWith('InterfaceDeclaration '));

    expect(symbols).toEqual(['InterfaceDeclaration Alpha', 'InterfaceDeclaration Beta']);
  });

  it('reports the symbol count in the header', () => {
    const out = surfaceOf({ '/index.ts': 'export interface One { a: string; }' });

    expect(out).toContain('# Exported symbols: 1');
  });

  // Name the empty case: an entry point that exports nothing is a legitimate
  // input, and it must render as an explicit zero rather than throwing or
  // producing something a diff would read as unchanged.
  it('renders an entry point with no exports as zero symbols', () => {
    const out = surfaceOf({ '/index.ts': 'const internal = 1;\nvoid internal;' });

    expect(out).toContain('# Exported symbols: 0');
  });
});

describe('renderSurface', () => {
  it('renders nothing but the header for an empty entry list', () => {
    const out = renderSurface([]);

    expect(out).toContain('# Exported symbols: 0');
    expect(out.split('\n').filter((l) => l !== '' && !l.startsWith('#'))).toEqual([]);
  });

  it('sorts members so source order cannot produce a spurious diff', () => {
    const out = renderSurface([
      { name: 'T', kind: 'InterfaceDeclaration', lines: ['  z: 1;', '  a: 2;'] },
    ]);

    expect(out.split('\n').slice(4, 7)).toEqual(['InterfaceDeclaration T', '  a: 2;', '  z: 1;']);
  });
});
