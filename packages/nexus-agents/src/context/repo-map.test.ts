/**
 * Tests for the repo-map context provider (#4254, Phase 3 of epic #4251).
 *
 * Covers the pure builder over a FIXTURE module-import graph: PageRank
 * centrality ordering, token-budget clipping, the mandatory
 * "import-graph only, no call-site data" caveat — and the pull-shaped,
 * flag-gated provider (`getRepoMapForTask`).
 *
 * @module context/repo-map.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CodebaseIndex, ModuleEntry, ModuleStats } from '../indexer/types.js';
import { SCHEMA_VERSION } from '../indexer/types.js';
import {
  buildRepoMap,
  computeModulePageRank,
  rankRepoMapEntries,
  taskNeedsRepoMap,
  getRepoMapForTask,
  REPO_MAP_CAVEAT,
  REPO_MAP_FLAG,
  DEFAULT_REPO_MAP_TOKEN_BUDGET,
} from './repo-map.js';

// ---------------------------------------------------------------------------
// Fixture graph
//
//   cli      → context, indexer
//   indexer  → core
//   context  → core
//   core     → (nothing — the depended-upon foundation)
//
// `core` is imported (directly/transitively) by everyone, so PageRank must
// rank it highest; `cli` (imports, imported by none) must rank lowest.
// ---------------------------------------------------------------------------

function stats(fileCount: number): ModuleStats {
  return {
    fileCount,
    totalLines: fileCount * 10,
    exportCount: fileCount,
    internalDeps: 0,
    externalDeps: 0,
  };
}

function mod(name: string, dependsOn: string[], purpose: string): ModuleEntry {
  return { name, path: name, purpose, files: [], stats: stats(3), dependsOn };
}

function fixtureIndex(): CodebaseIndex {
  const modules: Record<string, ModuleEntry> = {
    cli: mod('cli', ['context', 'indexer'], 'CLI interface, commands'),
    indexer: mod('indexer', ['core'], 'Codebase indexing'),
    context: mod('context', ['core'], 'Context management, memory'),
    core: mod('core', [], 'Types, Result, errors, logger'),
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-07-06T00:00:00-04:00',
    stats: {
      totalFiles: 12,
      totalLines: 120,
      totalExports: 12,
      moduleCount: 4,
      externalPackages: [],
    },
    modules,
  };
}

describe('computeModulePageRank', () => {
  it('ranks the most-depended-upon module highest', () => {
    const ranks = computeModulePageRank(fixtureIndex().modules);
    const core = ranks.get('core') ?? 0;
    const cli = ranks.get('cli') ?? 0;
    const context = ranks.get('context') ?? 0;
    expect(core).toBeGreaterThan(context);
    expect(core).toBeGreaterThan(cli);
    // A leaf that nobody imports is the least central.
    expect(cli).toBeLessThanOrEqual(context);
  });

  it('sums to ~1 over all nodes (probability distribution) and never throws on empty', () => {
    const ranks = computeModulePageRank(fixtureIndex().modules);
    const total = [...ranks.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 2);
    expect(computeModulePageRank({}).size).toBe(0);
  });
});

describe('rankRepoMapEntries', () => {
  it('orders entries by descending centrality, core first', () => {
    const entries = rankRepoMapEntries(fixtureIndex());
    expect(entries[0]?.module).toBe('core');
    const centralities = entries.map((e) => e.centrality);
    const sorted = [...centralities].sort((a, b) => b - a);
    expect(centralities).toEqual(sorted);
  });
});

describe('buildRepoMap', () => {
  it('renders a ranked block with the import-graph-only caveat, core first', () => {
    const out = buildRepoMap(fixtureIndex());
    expect(out).toContain('Repo Map');
    expect(out).toContain(REPO_MAP_CAVEAT);
    // core appears before cli (centrality ordering).
    expect(out.indexOf('core')).toBeLessThan(out.indexOf('cli'));
  });

  it('keeps the caveat and clips lower-centrality modules under a tiny budget', () => {
    const out = buildRepoMap(fixtureIndex(), { budgetTokens: 40 });
    // The safety caveat is mandatory and never clipped.
    expect(out).toContain(REPO_MAP_CAVEAT);
    expect(out).toContain('omitted');
    // The clippable module list is trimmed — fewer than all 4 modules render.
    const moduleLines = out.split('\n').filter((l) => l.startsWith('- '));
    expect(moduleLines.length).toBeGreaterThan(0);
    expect(moduleLines.length).toBeLessThan(4);
  });

  it('renders all modules and no omission notice under a generous budget', () => {
    const out = buildRepoMap(fixtureIndex(), { budgetTokens: 400 });
    const moduleLines = out.split('\n').filter((l) => l.startsWith('- '));
    expect(moduleLines.length).toBe(4);
    expect(out).not.toContain('omitted');
  });

  it('returns empty string for an index with no modules', () => {
    const empty: CodebaseIndex = { ...fixtureIndex(), modules: {} };
    expect(buildRepoMap(empty)).toBe('');
  });
});

describe('taskNeedsRepoMap (pull-shaped rank-gate)', () => {
  it('is true for structural categories', () => {
    expect(taskNeedsRepoMap('anything', 'architecture')).toBe(true);
    expect(taskNeedsRepoMap('anything', 'planning')).toBe(true);
  });

  it('is true for cross-file task text even in a non-structural category', () => {
    expect(taskNeedsRepoMap('refactor the module dependencies', 'exploration')).toBe(true);
  });

  it('is false for a narrow single-file task in a non-structural category', () => {
    expect(taskNeedsRepoMap('fix a typo in the readme', 'documentation')).toBe(false);
  });
});

describe('getRepoMapForTask (flag-gated provider)', () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env['NEXUS_REPO_MAP'];
  });
  afterEach(() => {
    if (prev === undefined) delete process.env['NEXUS_REPO_MAP'];
    else process.env['NEXUS_REPO_MAP'] = prev;
  });

  it('returns undefined when the flag is off (default)', () => {
    delete process.env['NEXUS_REPO_MAP'];
    const out = getRepoMapForTask({
      task: 'design the architecture',
      category: 'architecture',
      indexProvider: fixtureIndex,
    });
    expect(out).toBeUndefined();
  });

  it('returns undefined when the flag is on but the task does not need a map', () => {
    process.env[REPO_MAP_FLAG] = '1';
    const out = getRepoMapForTask({
      task: 'fix a typo',
      category: 'documentation',
      indexProvider: fixtureIndex,
    });
    expect(out).toBeUndefined();
  });

  it('returns a ranked, caveated map when flag on + structural task', () => {
    process.env[REPO_MAP_FLAG] = '1';
    const out = getRepoMapForTask({
      task: 'design the architecture',
      category: 'architecture',
      indexProvider: fixtureIndex,
    });
    expect(out).toBeDefined();
    expect(out).toContain(REPO_MAP_CAVEAT);
    expect((out ?? '').indexOf('core')).toBeLessThan((out ?? '').indexOf('cli'));
  });

  it('is fail-soft: a throwing index provider yields undefined', () => {
    process.env[REPO_MAP_FLAG] = '1';
    const out = getRepoMapForTask({
      task: 'design the architecture',
      category: 'architecture',
      indexProvider: () => {
        throw new Error('boom');
      },
    });
    expect(out).toBeUndefined();
  });

  it('exposes a small default token budget', () => {
    expect(DEFAULT_REPO_MAP_TOKEN_BUDGET).toBeGreaterThan(0);
    expect(DEFAULT_REPO_MAP_TOKEN_BUDGET).toBeLessThanOrEqual(1000);
  });
});
