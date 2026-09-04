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
import {
  COLLISION_HEADER,
  collidingNames,
  extractSurface,
  renderSurface,
} from './extract-api-surface.js';

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

describe('cross-module name collisions (#5224)', () => {
  it('keeps two same-named declarations from different modules apart', () => {
    // The exact shape found in the real surface: one side exported directly,
    // the other reachable ONLY through another type's signature. Before this,
    // the two fused into a single `InterfaceDeclaration Thing` carrying both
    // `fromA` and `fromB` — a declaration no source file contains, and the one
    // the semver gate was diffing against.
    const out = surfaceOf({
      '/index.ts': "export * from './a.js';\nexport * from './holder.js';",
      '/a.ts': 'export interface Thing { fromA: string; }',
      '/holder.ts':
        "import type { Thing } from './b.js';\nexport interface Holder { readonly thing: Thing; }",
      '/b.ts': 'export interface Thing { fromB: number; }',
    });

    expect(out).toContain('InterfaceDeclaration Thing @a');
    expect(out).toContain('InterfaceDeclaration Thing @b');
    expect(out).toContain(`${COLLISION_HEADER}1`);

    // Neither block may carry the other's member.
    const lines = out.split('\n');
    const blockAfter = (header: string): string[] => {
      const at = lines.findIndex((l) => l.startsWith(header));
      expect(at).toBeGreaterThan(-1);
      const rest = lines.slice(at + 1);
      const end = rest.findIndex((l) => l !== '' && !l.startsWith(' '));
      return (end === -1 ? rest : rest.slice(0, end)).filter((l) => l !== '');
    };
    expect(blockAfter('InterfaceDeclaration Thing @a')).toEqual(['  fromA: string']);
    expect(blockAfter('InterfaceDeclaration Thing @b')).toEqual(['  fromB: number']);
  });

  it('does not record a generic type parameter as a surface symbol', () => {
    // `T` is not exported, cannot be imported or implemented, and can never be
    // a breaking change. It only reached the snapshot because the reference
    // walk passes through it — invisible while every `T` in the tree fused
    // into one bodiless line, and one line per module once entries are keyed
    // by origin.
    const out = surfaceOf({
      '/index.ts': "export * from './box.js';\nexport * from './bag.js';",
      '/box.ts': 'export interface Box<T> { value: T; }',
      '/bag.ts': 'export interface Bag<T> { items: T[]; }',
    });

    expect(out).not.toContain('TypeParameter');
    expect(out).toContain(`${COLLISION_HEADER}0`);
  });

  it('still reaches a type that is public only through a generic constraint', () => {
    // Type parameters are skipped as ENTRIES, not as traversal: dropping the
    // walk through them would hide a constraint type from the surface.
    const out = surfaceOf({
      '/index.ts': "export * from './holder.js';",
      '/holder.ts':
        "import type { Bound } from './bound.js';\nexport interface Holder<T extends Bound> { readonly value: T; }",
      '/bound.ts': 'export interface Bound { marker: string; }',
    });

    expect(out).toContain('InterfaceDeclaration Bound');
    expect(out).toContain('  marker: string');
  });

  it('still merges the const-plus-type idiom declared in ONE module', () => {
    // The legitimate case the old key shape was right about. Splitting these
    // would be the mirror-image defect: one symbol reported as two.
    const out = surfaceOf({
      '/index.ts': "export * from './pair.js';",
      '/pair.ts':
        "export const Levels = ['a', 'b'] as const;\nexport type Levels = (typeof Levels)[number];",
    });

    expect(out).toContain(`${COLLISION_HEADER}0`);
    // ONE entry, carrying both kinds and both bodies — which is correct here:
    // `const Levels` and `type Levels` really are the same symbol.
    expect(out.split('\n').filter((l) => l.endsWith(' Levels'))).toEqual([
      'TypeAliasDeclaration|VariableDeclaration Levels',
    ]);
    expect(out).toContain('  : readonly ["a", "b"]');
    expect(out).toContain('  = (typeof Levels)[number]');
    expect(out).not.toContain('@pair');
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
      { name: 'T', origin: 'core/t', kind: 'InterfaceDeclaration', lines: ['  z: 1;', '  a: 2;'] },
    ]);

    // Indexed off the body rather than a fixed line offset: the previous
    // `slice(4, 7)` broke the moment the header grew a line, which is a
    // spurious failure of the kind this file exists to prevent.
    expect(out.split('\n').filter((l) => l !== '' && !l.startsWith('#'))).toEqual([
      'InterfaceDeclaration T',
      '  a: 2;',
      '  z: 1;',
    ]);
  });

  it('leaves a name declared in only one module unsuffixed', () => {
    // Bounding the suffix to collisions is what keeps the one-time churn to a
    // handful of entries instead of all ~2400.
    const out = renderSurface([
      { name: 'Solo', origin: 'core/solo', kind: 'InterfaceDeclaration', lines: [] },
    ]);

    expect(out).toContain('InterfaceDeclaration Solo\n');
    expect(out).toContain(`${COLLISION_HEADER}0`);
    expect(out).not.toContain('@core/solo');
    expect(out).not.toContain('# Colliding names:');
  });

  it('suffixes both sides of a collision with their origin module', () => {
    const out = renderSurface([
      {
        name: 'Thing',
        origin: 'a/thing',
        kind: 'InterfaceDeclaration',
        lines: ['  fromA: string;'],
      },
      {
        name: 'Thing',
        origin: 'b/thing',
        kind: 'InterfaceDeclaration',
        lines: ['  fromB: number;'],
      },
    ]);

    expect(out).toContain('InterfaceDeclaration Thing @a/thing');
    expect(out).toContain('InterfaceDeclaration Thing @b/thing');
    expect(out).toContain(`${COLLISION_HEADER}1`);
    expect(out).toContain('# Colliding names: Thing');
    // The whole point: the two member sets stay apart.
    const blocks = out.split('\n').filter((l) => l !== '' && !l.startsWith('#'));
    expect(blocks).toEqual([
      'InterfaceDeclaration Thing @a/thing',
      '  fromA: string;',
      'InterfaceDeclaration Thing @b/thing',
      '  fromB: number;',
    ]);
  });
});

describe('collidingNames', () => {
  it('names nothing when every symbol has one origin', () => {
    expect(
      collidingNames([
        { name: 'A', origin: 'x', kind: 'InterfaceDeclaration', lines: [] },
        { name: 'B', origin: 'y', kind: 'InterfaceDeclaration', lines: [] },
      ])
    ).toEqual([]);
  });

  it('reports a name carried by two modules', () => {
    expect(
      collidingNames([
        { name: 'Dup', origin: 'x', kind: 'InterfaceDeclaration', lines: [] },
        { name: 'Dup', origin: 'y', kind: 'TypeAliasDeclaration', lines: [] },
      ])
    ).toEqual(['Dup']);
  });

  it('reports nothing for an empty surface — and that is a real answer, not a default', () => {
    expect(collidingNames([])).toEqual([]);
  });
});
