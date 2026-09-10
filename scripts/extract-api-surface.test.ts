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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  // `strict` mirrors the real tsconfig. Without it `strictNullChecks` is OFF, so
  // `string | undefined` renders as plain `string` and any test about nullability
  // silently exercises a different type system than production — a harness that
  // cannot observe the change it is asserting (#6061).
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true },
  });
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

// ============================================================================
// Comments inside a type are not surface (#5972)
// ============================================================================

describe('inline comments are not part of the surface (#5972)', () => {
  // Third instance of the "gate that cries wolf" problem this file already
  // documents twice — absolute paths (#4757) and member order (#4784). A
  // comment-only edit inside a published type failed the gate on PR #5970,
  // whose entire diff was prose. The correct response to a spurious diff is
  // the same action as for a real break (regenerate), which is exactly how a
  // gate teaches people to regenerate without reading.

  it('a changed line comment BETWEEN union members does not change the surface', () => {
    // Interior trivia — the shape that actually failed on #5970. A comment
    // before the first member is already stripped as leading trivia; one
    // between members is not.
    const before = surfaceOf({
      '/index.ts': `export type V =
        | { readonly kind: 'a' }
        // the old note
        | { readonly kind: 'b' };`,
    });
    const after = surfaceOf({
      '/index.ts': `export type V =
        | { readonly kind: 'a' }
        // a COMPLETELY different note, several words longer
        | { readonly kind: 'b' };`,
    });
    expect(after).toBe(before);
  });

  it('a block comment between members does not change the surface', () => {
    const withComment = surfaceOf({
      '/index.ts': `export type V = | { readonly kind: 'a' } /* why */ | { readonly kind: 'b' };`,
    });
    const without = surfaceOf({
      '/index.ts': `export type V = | { readonly kind: 'a' } | { readonly kind: 'b' };`,
    });
    expect(withComment).toBe(without);
  });

  it('but a real membership change still shows', () => {
    // The guard against over-stripping: if comment removal ate real text,
    // every case above would pass for the wrong reason.
    const two = surfaceOf({
      '/index.ts': `export type V = | { readonly kind: 'a' } | { readonly kind: 'b' };`,
    });
    const three = surfaceOf({
      '/index.ts': `export type V = | { readonly kind: 'a' } | { readonly kind: 'b' } | { readonly kind: 'c' };`,
    });
    expect(three).not.toBe(two);
  });

  it('does not swallow a union member that follows a line comment', () => {
    // `//` runs to end of line, and normalizeTypeText collapses newlines to
    // spaces. Stripping AFTER that collapse would eat the rest of the type —
    // the whole reason order matters in normalizeTypeText.
    const commented = surfaceOf({
      '/index.ts': `export type V =
        | { readonly kind: 'a' }
        // note
        | { readonly kind: 'b' };`,
    });
    expect(commented).toContain("'b'");
  });
});

describe('exported function SIGNATURES are recorded (#6061)', () => {
  // A FunctionDeclaration's own type resolves to `typeof <its own name>` — the
  // shortest valid rendering when the name is in scope — so recording
  // `node.getType().getText(node)` produced a string CONSTANT with respect to the
  // signature. Parameters, arity and return type were invisible for all 461
  // exported functions, and the gate could report no signature change on any of
  // them. Found by accident: a positional-number to object parameter change on a
  // published function produced zero snapshot diff (#5385).

  it('records parameters and the return type, not a self-referential placeholder', () => {
    const out = surfaceOf({
      '/index.ts': 'export function f(a: string, b: number): boolean { return true; }',
    });
    expect(out).not.toContain('typeof f');
    expect(out).toContain('(a: string, b: number) => boolean');
  });

  it('a widened RETURN TYPE changes the snapshot', () => {
    // The exact mutation proven invisible before this fix.
    const before = surfaceOf({ '/index.ts': 'export function f(a: string): string { return a; }' });
    const after = surfaceOf({
      '/index.ts': 'export function f(a: string): string | undefined { return a; }',
    });
    expect(after).not.toBe(before);
  });

  it('a REMOVED parameter changes the snapshot', () => {
    const before = surfaceOf({ '/index.ts': 'export function f(a: string, b: number): void {}' });
    const after = surfaceOf({ '/index.ts': 'export function f(a: string): void {}' });
    expect(after).not.toBe(before);
  });

  it('a RENAMED parameter changes the snapshot — callers using named args break', () => {
    const before = surfaceOf({ '/index.ts': 'export function f(from: string): void {}' });
    const after = surfaceOf({ '/index.ts': 'export function f(to: string): void {}' });
    expect(after).not.toBe(before);
  });

  it('marks an optional parameter, and a DEFAULTED one as optional too', () => {
    // A default makes the parameter optional to a CALLER even with no question
    // token, so both forms record the same way: removing the default is not a
    // break, removing the parameter is.
    const q = surfaceOf({ '/index.ts': 'export function f(a?: string): void {}' });
    const d = surfaceOf({ '/index.ts': "export function f(a: string = 'x'): void {}" });
    expect(q).toContain('a?:');
    expect(d).toContain('a?:');
  });

  it('marks a rest parameter', () => {
    const out = surfaceOf({ '/index.ts': 'export function f(...xs: string[]): void {}' });
    expect(out).toContain('...xs');
  });

  it('records EVERY overload, not just the first', () => {
    // Recording one would trade a total blind spot for a narrower one.
    const out = surfaceOf({
      '/index.ts': [
        'export function f(a: string): string;',
        'export function f(a: number): number;',
        'export function f(a: unknown): unknown { return a; }',
      ].join('\n'),
    });
    expect(out).toContain('(a: string) => string');
    expect(out).toContain('(a: number) => number');
  });

  it('an exported non-callable const still records its type', () => {
    // The `getCallSignatures().length === 0` branch — a const's type text was
    // already meaningful and must not regress to nothing.
    const out = surfaceOf({ '/index.ts': 'export const LIMIT = 50 as const;' });
    expect(out).toContain('50');
  });

  it('an exported arrow const records its signature too', () => {
    const out = surfaceOf({ '/index.ts': 'export const f = (a: string): boolean => a === "x";' });
    expect(out).toContain('(a: string) => boolean');
  });

  it('output stays byte-stable across two runs of the same input', () => {
    // The pre-existing stability property, re-asserted over the new renderer.
    const src = { '/index.ts': 'export function f(a: string, b?: number): void {}' };
    expect(surfaceOf(src)).toBe(surfaceOf(src));
  });
});

describe('the committed snapshot is machine-independent (#6061)', () => {
  // This file's header already warned about the class: the gate failed on its own
  // first CI run because `/home/runner` is not the author's home directory, and a
  // gate that always fails gets switched off. The pre-existing normalisation
  // covered in-package `import()` paths only. Rendering real call signatures
  // started printing DEPENDENCY types too, which reintroduced it — CI caught a
  // committed `/home/william/...` on the first push of this branch.
  //
  // Asserted over the real committed artifact rather than an in-memory fixture,
  // because the defect is a property of what actually ships.
  const snapshot = readFileSync(join(import.meta.dirname, '..', 'api-surface.txt'), 'utf-8');

  it('contains no absolute filesystem path', () => {
    const offenders = snapshot.split('\n').filter((l) => /\/home\/|\/Users\/|\/root\//.test(l));
    expect(offenders).toEqual([]);
  });

  it('contains no node_modules segment', () => {
    // pnpm's store path embeds a version (`.pnpm/zod@4.5.4/`), so leaving it in
    // would also churn the snapshot on every dependency bump.
    expect(snapshot.split('\n').filter((l) => l.includes('node_modules'))).toEqual([]);
  });

  it('still records the dependency module it came from', () => {
    // The pair. Stripping the path must not strip the module identity, or the
    // normalisation becomes a blind spot of its own.
    expect(snapshot).toContain('import("zod/');
  });
});

describe('union members are recorded in declared-set order, not resolution order (#6065)', () => {
  // TypeScript prints a union's members in the order the checker interned
  // them, which is a function of what got resolved first — not of the source.
  // Resolving more types during extraction (#6061) shuffled four snapshot
  // lines whose declared type had not changed. Fourth instance of the
  // gate-that-cries-wolf class this file documents (paths, member order,
  // comments): a reviewer who sees four unexplained union lines learns to
  // regenerate, and the next real change hides in that habit.

  it('reordering the members in the SOURCE renders the same text', () => {
    // Property (checker-printed) AND alias (syntactic text) — the two paths a
    // union reaches the snapshot through.
    const declared = surfaceOf({
      '/index.ts': [
        "export type U = 'a' | 'b' | 'c';",
        "export interface I { readonly u: 'a' | 'b' | 'c'; }",
      ].join('\n'),
    });
    const reordered = surfaceOf({
      '/index.ts': [
        "export type U = 'c' | 'a' | 'b';",
        "export interface I { readonly u: 'c' | 'a' | 'b'; }",
      ].join('\n'),
    });
    expect(reordered).toBe(declared);
  });

  it('a leading bar in the source is not a member', () => {
    const bare = surfaceOf({ '/index.ts': "export type U = 'a' | 'b';" });
    const led = surfaceOf({ '/index.ts': "export type U =\n  | 'a'\n  | 'b';" });
    expect(led).toBe(bare);
  });

  it('ADDING a member changes the snapshot', () => {
    // The guard against the normalisation becoming a blind spot of its own.
    const two = surfaceOf({ '/index.ts': "export interface I { readonly u: 'a' | 'b'; }" });
    const three = surfaceOf({
      '/index.ts': "export interface I { readonly u: 'a' | 'b' | 'c'; }",
    });
    expect(three).not.toBe(two);
  });

  it('REMOVING a member changes the snapshot', () => {
    const three = surfaceOf({
      '/index.ts': "export interface I { readonly u: 'a' | 'b' | 'c'; }",
    });
    const two = surfaceOf({ '/index.ts': "export interface I { readonly u: 'a' | 'c'; }" });
    expect(two).not.toBe(three);
  });

  it('a string-literal member containing | survives intact', () => {
    // The reason a naive split('|') was never an option.
    const out = surfaceOf({
      '/index.ts': [
        "export type U = 'c' | 'a|b';",
        "export interface I { readonly u: 'c' | 'a|b'; }",
      ].join('\n'),
    });
    expect(out).toContain("  = 'a|b' | 'c'");
    expect(out).toContain('  readonly u: "a|b" | "c"');
  });

  it('sorts a nested union at each level: object member, function parameter, index signature', () => {
    const out = surfaceOf({
      '/index.ts': [
        'export interface I {',
        "  readonly o: { readonly k: 'b' | 'a'; readonly z: 'y' | 'x' };",
        "  readonly f: (x: 'b' | 'a', y: 'd' | 'c') => 'q' | 'p';",
        "  [key: string]: 'n' | 'm' | unknown;",
        '}',
      ].join('\n'),
    });
    expect(out).toContain('  readonly o: { readonly k: "a" | "b"; readonly z: "x" | "y"; }');
    expect(out).toContain('  readonly f: (x: "a" | "b", y: "c" | "d") => "p" | "q"');
    // The index signature is the one line whose text carries a `name: type`
    // prefix into the normaliser; a split that ignored the colon would sort
    // `[key: string]: 'n'` as a member.
    expect(out).toContain("  [key: string]: 'm' | 'n' | unknown");
  });

  it('renders boolean as boolean', () => {
    // ts-morph exposes `boolean` as the union `true | false`; a structural
    // walk that did not collapse the pair would rewrite every boolean field.
    const out = surfaceOf({
      '/index.ts': 'export interface I { readonly b: boolean; readonly m: boolean | undefined; }',
    });
    expect(out).toContain('  readonly b: boolean');
    expect(out).toContain('  readonly m: boolean | undefined');
  });

  it('leaves the depth-0 text of a conditional type alone', () => {
    // A union inside a conditional's branches is NOT sorted: `A | B : C` has a
    // depth-0 `|` that is not a union separator across the whole text, so the
    // normaliser declines rather than guessing. Recorded so the limitation is
    // a documented choice, not a surprise.
    const src = "export type C<T> = T extends string ? 'b' | 'a' : never;";
    expect(surfaceOf({ '/index.ts': src })).toContain("  = T extends string ? 'b' | 'a' : never");
  });
});
