/**
 * Registry-root resolution for the research helpers (#5053).
 *
 * Before this fix `getProjectRoot()` returned `process.cwd()` and the four
 * load/save helpers defaulted to cwd, so the six `research_*` MCP tools read
 * and wrote a different `docs/research/registry` depending on where the
 * server happened to be started. These tests run against real temp trees —
 * the sibling `research-helpers-io.test.ts` mocks the filesystem and only
 * exercises the explicit-`rootDir` path.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  PAPERS_FILE,
  REGISTRY_PATH,
  TECHNIQUES_FILE,
  _resetRegistryRootForTests,
  getProjectRoot,
  loadTechniquesRegistry,
  resolveRegistryRoot,
} from './research-helpers-io.js';
import {
  _resetActiveWorkspaceRootForTests,
  setActiveWorkspaceRoot,
} from '../config/nexus-data-dir.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';

const TECHNIQUES_YAML = [
  "schema_version: '1.0'",
  'techniques:',
  '  root-only-technique:',
  '    name: Root Only',
  '    description: lives in the root registry',
  '    status: planned',
  '    source_papers: []',
  '    topic: testing',
  '    tags: []',
  '    priority: P3',
  '',
].join('\n');

function writeRegistry(root: string): void {
  mkdirSync(join(root, REGISTRY_PATH), { recursive: true });
  writeFileSync(join(root, REGISTRY_PATH, TECHNIQUES_FILE), TECHNIQUES_YAML, 'utf-8');
  writeFileSync(
    join(root, REGISTRY_PATH, PAPERS_FILE),
    "schema_version: '1.0'\npapers: {}\n",
    'utf-8'
  );
}

describe('resolveRegistryRoot (#5053)', () => {
  const originalCwd = process.cwd();
  const created: string[] = [];
  let stderrSpy: MockInstance;

  // vitest pins TMPDIR under the repo, where the resolver would find the
  // repo's own registry; the trees must sit outside any git repo.
  function makeTmp(prefix: string): string {
    const dir = mkdtempOutsideRepo(prefix);
    created.push(dir);
    return dir;
  }

  beforeEach(() => {
    _resetRegistryRootForTests();
    _resetActiveWorkspaceRootForTests();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    _resetRegistryRootForTests();
    _resetActiveWorkspaceRootForTests();
    stderrSpy.mockRestore();
    for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function fallbackWarnings(): string[] {
    return stderrSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes('research registry') && line.includes('cwd'));
  }

  it('an explicit rootDir wins over every other signal, and is not memoised', () => {
    const root = makeTmp('nexus-5053-explicit-');
    writeRegistry(root);
    process.chdir(root);
    expect(resolveRegistryRoot()).toBe(realpathSync(root));

    const explicit = resolve('/some/explicit/root');
    expect(resolveRegistryRoot('/some/explicit/root')).toBe(explicit);
    // The memo still holds the discovered root, not the explicit one.
    expect(resolveRegistryRoot()).toBe(realpathSync(root));
  });

  it('a nested package dir resolves to the nearest ancestor holding docs/research/registry', () => {
    const root = makeTmp('nexus-5053-nested-');
    writeRegistry(root);
    const nested = join(root, 'packages', 'nexus-agents');
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    expect(resolveRegistryRoot()).toBe(realpathSync(root));
    expect(getProjectRoot()).toBe(realpathSync(root));
    expect(fallbackWarnings()).toHaveLength(0);
  });

  it('with no registry anywhere above, a .git ancestor marks the root', () => {
    const root = makeTmp('nexus-5053-git-');
    mkdirSync(join(root, '.git'), { recursive: true });
    const nested = join(root, 'packages', 'nexus-agents');
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    expect(resolveRegistryRoot()).toBe(realpathSync(root));
    expect(fallbackWarnings()).toHaveLength(0);
  });

  it('with neither a registry nor a .git, falls back to cwd and warns exactly once per process', () => {
    const root = makeTmp('nexus-5053-bare-');
    const nested = join(root, 'sub');
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    expect(resolveRegistryRoot()).toBe(realpathSync(nested));
    expect(resolveRegistryRoot()).toBe(realpathSync(nested));
    expect(fallbackWarnings()).toHaveLength(1);
  });

  it('an active workspace root (MCP roots, #3991) is used instead of cwd', () => {
    const workspace = makeTmp('nexus-5053-workspace-');
    writeRegistry(workspace);
    const elsewhere = makeTmp('nexus-5053-elsewhere-');
    writeRegistry(elsewhere);
    process.chdir(elsewhere);
    expect(setActiveWorkspaceRoot(workspace)).toBe(true);

    expect(resolveRegistryRoot()).toBe(realpathSync(workspace));
  });

  it('loadTechniquesRegistry() without rootDir reads the ancestor registry, not cwd', async () => {
    const root = makeTmp('nexus-5053-load-');
    writeRegistry(root);
    const nested = join(root, 'packages', 'nexus-agents');
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    const result = await loadTechniquesRegistry();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value.techniques)).toEqual(['root-only-technique']);
    }
  });
});
