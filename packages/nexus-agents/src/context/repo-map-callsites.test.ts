/**
 * Tests for the repo-map call-site signal (#4268).
 *
 * Covers (a) the pure single-parse call-site tally, (b) the bounded per-module
 * count over a real temp source tree (incl. the file / probe bounds), and
 * (c) the ranking flip: a module heavily CALLED but lightly IMPORTED outranks
 * a more-imported one that pure import PageRank ranked higher.
 *
 * @module context/repo-map-callsites.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  CodebaseIndex,
  ExportEntry,
  FileEntry,
  ModuleEntry,
  ModuleStats,
} from '../indexer/types.js';
import { SCHEMA_VERSION } from '../indexer/types.js';
import { countCallSitesInSource } from '../indexer/usage-ast.js';
import { MAX_PROBE_SYMBOLS, computeCallSiteCounts } from './repo-map-callsites.js';
import {
  getRepoMapForTask,
  rankRepoMapEntries,
  REPO_MAP_CAVEAT,
  REPO_MAP_FLAG,
} from './repo-map.js';

// ---------------------------------------------------------------------------
// countCallSitesInSource — single-parse structural call-site tally
// ---------------------------------------------------------------------------

describe('countCallSitesInSource', () => {
  const src = [
    "import { foo } from './x.js';",
    'export function bar() {}',
    'foo();',
    'foo();',
    'obj.baz();',
    'const q = new Qux();',
    'const y = foo;', // bare reference, NOT a call
    'bar;', // reference to a declared name, NOT a call
  ].join('\n');

  it('counts calls, member-calls and new — but not declarations, imports or references', () => {
    const counts = countCallSitesInSource(new Set(['foo', 'baz', 'Qux', 'bar']), src, 'typescript');
    expect(counts.get('foo')).toBe(2); // two call-sites; the import + reference are excluded
    expect(counts.get('baz')).toBe(1); // obj.baz() member-call
    expect(counts.get('Qux')).toBe(1); // new Qux()
    expect(counts.get('bar')).toBeUndefined(); // only declared + referenced, never called
  });

  it('returns an empty map for an empty probe set (no work)', () => {
    expect(countCallSitesInSource(new Set(), src, 'typescript').size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeCallSiteCounts — bounded per-module count over a real temp tree
// ---------------------------------------------------------------------------

function stats(fileCount: number): ModuleStats {
  return { fileCount, totalLines: 10, exportCount: fileCount, internalDeps: 0, externalDeps: 0 };
}

function exp(name: string): ExportEntry {
  return { name, kind: 'function', isReExport: false };
}

function file(path: string, exports: ExportEntry[]): FileEntry {
  return { path, lines: 5, category: 'implementation', exports, dependencies: [] };
}

function mod(name: string, files: FileEntry[], dependsOn: string[]): ModuleEntry {
  return { name, path: name, purpose: name, files, stats: stats(files.length), dependsOn };
}

function indexOf(modules: Record<string, ModuleEntry>): CodebaseIndex {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-07-06T00:00:00-04:00',
    stats: {
      totalFiles: 0,
      totalLines: 0,
      totalExports: 0,
      moduleCount: Object.keys(modules).length,
      externalPackages: [],
    },
    modules,
  };
}

describe('computeCallSiteCounts (bounded, over a temp source tree)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'repo-map-callsites-'));
    mkdirSync(join(root, 'core'));
    mkdirSync(join(root, 'app'));
    writeFileSync(join(root, 'core', 'helper.ts'), 'export function helper() {\n  return 1;\n}\n');
    writeFileSync(
      join(root, 'app', 'main.ts'),
      "import { helper } from '../core/helper.js';\nhelper();\nhelper();\n"
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const index = (): CodebaseIndex =>
    indexOf({
      core: mod('core', [file('core/helper.ts', [exp('helper')])], []),
      app: mod('app', [file('app/main.ts', [])], ['core']),
    });

  it('attributes call-sites of a module’s exports to that module', () => {
    const counts = computeCallSiteCounts(index(), ['core'], { sourceRoot: root });
    // helper() is called twice from app/main.ts; the declaration + import do not count.
    expect(counts.get('core')).toBe(2);
    expect(counts.get('app')).toBeUndefined();
  });

  it('respects the maxFiles bound (fewer files scanned ⇒ fewer call-sites seen)', () => {
    // Only the first file (core/helper.ts, which merely declares helper) is scanned,
    // so the caller in app/main.ts is never parsed and no call-sites are counted.
    const counts = computeCallSiteCounts(index(), ['core'], { sourceRoot: root, maxFiles: 1 });
    expect(counts.get('core') ?? 0).toBe(0);
  });

  it('probes only the given top-N modules (empty ⇒ no counting)', () => {
    expect(computeCallSiteCounts(index(), [], { sourceRoot: root }).size).toBe(0);
  });

  it('is best-effort: a missing source root yields an empty map, never a throw', () => {
    const counts = computeCallSiteCounts(index(), ['core'], {
      sourceRoot: join(root, 'does-not-exist'),
    });
    expect(counts.size).toBe(0);
  });

  it('caps the probe set at MAX_PROBE_SYMBOLS', () => {
    const many = Array.from({ length: MAX_PROBE_SYMBOLS + 40 }, (_, i) => exp(`sym${String(i)}`));
    writeFileSync(
      join(root, 'core', 'big.ts'),
      many.map((e) => `export const ${e.name} = 1;`).join('\n')
    );
    const wide = indexOf({ core: mod('core', [file('core/big.ts', many)], []) });
    // Should not throw and should complete; the cap keeps the probe set bounded.
    expect(() => computeCallSiteCounts(wide, ['core'], { sourceRoot: root })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Ranking flip — call-site signal reorders toward actually-used modules
// ---------------------------------------------------------------------------

describe('rankRepoMapEntries — call-site signal changes ordering (#4268)', () => {
  // alpha is imported (by `user`); beta is imported by nobody, so pure import
  // PageRank ranks alpha above beta. beta is the more heavily CALLED module.
  function flipIndex(): CodebaseIndex {
    return indexOf({
      core: mod('core', [], []),
      alpha: mod('alpha', [], ['core']),
      beta: mod('beta', [], ['core']),
      user: mod('user', [], ['alpha']),
    });
  }

  it('pure import ranking puts the more-imported alpha above beta', () => {
    const order = rankRepoMapEntries(flipIndex()).map((e) => e.module);
    expect(order.indexOf('alpha')).toBeLessThan(order.indexOf('beta'));
  });

  it('blending heavy call-sites lifts beta above alpha', () => {
    const counts = new Map<string, number>([['beta', 25]]);
    const order = rankRepoMapEntries(flipIndex(), counts).map((e) => e.module);
    expect(order.indexOf('beta')).toBeLessThan(order.indexOf('alpha'));
  });

  it('all-zero counts reduce to pure import order (byte-identical ranking)', () => {
    const pure = rankRepoMapEntries(flipIndex()).map((e) => e.module);
    const zeroed = rankRepoMapEntries(flipIndex(), new Map([['alpha', 0]])).map((e) => e.module);
    expect(zeroed).toEqual(pure);
  });
});

// ---------------------------------------------------------------------------
// Provider — flag-on end-to-end with an injected call-site signal
// ---------------------------------------------------------------------------

describe('getRepoMapForTask — flag-on call-site blend (#4268)', () => {
  let prev: string | undefined;
  const flipIndex = (): CodebaseIndex =>
    indexOf({
      core: mod('core', [], []),
      alpha: mod('alpha', [], ['core']),
      beta: mod('beta', [], ['core']),
      user: mod('user', [], ['alpha']),
    });

  beforeEach(() => {
    prev = process.env[REPO_MAP_FLAG];
    process.env[REPO_MAP_FLAG] = '1';
  });
  afterEach(() => {
    if (prev === undefined) delete process.env['NEXUS_REPO_MAP'];
    else process.env[REPO_MAP_FLAG] = prev;
  });

  it('renders beta above alpha and shows the call-site count when counts are injected', () => {
    const out =
      getRepoMapForTask({
        task: 'refactor the module architecture',
        category: 'architecture',
        indexProvider: flipIndex,
        callSiteCounts: new Map([['beta', 25]]),
      }) ?? '';
    expect(out).toContain('call-sites');
    expect(out.indexOf('beta')).toBeLessThan(out.indexOf('alpha'));
    expect(out).toContain(REPO_MAP_CAVEAT);
  });
});

// ---------------------------------------------------------------------------
// Caveat honesty — no stale "no call-site data" claim
// ---------------------------------------------------------------------------

describe('REPO_MAP_CAVEAT (updated for #4268)', () => {
  it('no longer claims the map lacks call-site data', () => {
    expect(REPO_MAP_CAVEAT).not.toMatch(/no call-site|NOT call-site|import-graph only/i);
  });

  it('is honest about the remaining structural/syntactic limitation', () => {
    expect(REPO_MAP_CAVEAT).toMatch(/call-site/i);
    expect(REPO_MAP_CAVEAT).toMatch(/syntactic|not type-aware/i);
  });
});
