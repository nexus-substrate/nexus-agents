/**
 * Tests for the install-script ratchet (#5427).
 *
 * Built against fabricated `node_modules` trees rather than the real one, so
 * every branch is reachable: a new script, a changed body, a stale allowlist
 * entry, nested and scoped layouts, and the empty scan that would otherwise
 * let a broken gate report success.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  INSTALL_HOOKS,
  diffAgainstAllowlist,
  parseAllowlist,
  scanInstalledTree,
} from './check-install-scripts.ts';
import type { Allowlist, ScanResult } from './check-install-scripts.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Build a throwaway `node_modules` from `{ 'pkg': { scripts } }` descriptors. */
function makeTree(packages: Record<string, Record<string, unknown>>): string {
  const root = mkdtempSync(join(tmpdir(), 'nexus-install-scripts-'));
  roots.push(root);
  const nodeModules = join(root, 'node_modules');
  for (const [name, manifest] of Object.entries(packages)) {
    const dir = join(nodeModules, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', ...manifest })
    );
  }
  return nodeModules;
}

const allowNothing: Allowlist = { minimumPackagesScanned: 1, allowed: [] };

function scanOf(entries: ScanResult['entries'], scanned = 100): ScanResult {
  return { scanned, entries };
}

describe('scanInstalledTree', () => {
  it('finds install hooks and ignores packages that declare none', () => {
    const tree = makeTree({
      quiet: { scripts: { test: 'vitest' } },
      noisy: { scripts: { postinstall: 'node build.js' } },
    });

    const scan = scanInstalledTree(tree);

    expect(scan.scanned).toBe(2);
    expect(scan.entries.map((e) => e.name)).toEqual(['noisy']);
    expect(scan.entries[0]?.hooks).toEqual({ postinstall: 'node build.js' });
  });

  it('ignores `prepare`, which npm never runs for a registry install', () => {
    const tree = makeTree({ prepped: { scripts: { prepare: 'npm run build' } } });

    expect(scanInstalledTree(tree).entries).toEqual([]);
  });

  it('finds scoped packages inside their scope directory', () => {
    const tree = makeTree({ '@scope/thing': { scripts: { preinstall: 'echo hi' } } });

    const scan = scanInstalledTree(tree);

    expect(scan.entries.map((e) => e.name)).toEqual(['@scope/thing']);
  });

  it('finds a nested copy that defeated hoisting — it runs its script too', () => {
    const tree = makeTree({ outer: { scripts: {} } });
    const nested = join(tree, 'outer', 'node_modules', 'inner');
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(nested, 'package.json'),
      JSON.stringify({ name: 'inner', version: '2.0.0', scripts: { install: 'node-gyp rebuild' } })
    );

    const scan = scanInstalledTree(tree);

    expect(scan.entries.map((e) => e.name)).toEqual(['inner']);
    expect(scan.entries[0]?.version).toBe('2.0.0');
  });

  it('returns an empty scan for a path that does not exist, rather than throwing', () => {
    const scan = scanInstalledTree(join(tmpdir(), 'nexus-does-not-exist-5427'));

    expect(scan.scanned).toBe(0);
    expect(scan.entries).toEqual([]);
  });

  it('covers every hook npm executes', () => {
    const tree = makeTree({
      all: { scripts: { preinstall: 'a', install: 'b', postinstall: 'c', prepare: 'd' } },
    });

    expect(Object.keys(scanInstalledTree(tree).entries[0]?.hooks ?? {}).sort()).toEqual(
      [...INSTALL_HOOKS].sort()
    );
  });
});

describe('diffAgainstAllowlist', () => {
  it('passes when the tree matches the allowlist exactly', () => {
    const scan = scanOf([{ name: 'ok', version: '1.0.0', hooks: { postinstall: 'node x.js' } }]);
    const allowlist: Allowlist = {
      minimumPackagesScanned: 1,
      allowed: [{ name: 'ok', hooks: { postinstall: 'node x.js' }, why: 'ships prebuilds' }],
    };

    expect(diffAgainstAllowlist(scan, allowlist)).toEqual([]);
  });

  it('fails on a script that is not allowlisted', () => {
    const scan = scanOf([{ name: 'surprise', version: '3.1.0', hooks: { install: 'node-gyp' } }]);

    const problems = diffAgainstAllowlist(scan, allowNothing);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('NEW install script');
    expect(problems[0]).toContain('surprise@3.1.0');
    expect(problems[0]).toContain('node-gyp');
  });

  it('fails when an allowlisted package changes what its script does', () => {
    // The name alone does not pin behaviour: a lang-* release that swapped
    // "verify the shipped prebuild" for "download it" keeps the same entry.
    const scan = scanOf([
      { name: 'grammar', version: '0.0.7', hooks: { postinstall: 'node download.js' } },
    ]);
    const allowlist: Allowlist = {
      minimumPackagesScanned: 1,
      allowed: [{ name: 'grammar', hooks: { postinstall: 'node verify.js' }, why: 'prebuilt' }],
    };

    const problems = diffAgainstAllowlist(scan, allowlist);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('CHANGED install script');
    expect(problems[0]).toContain('node download.js');
    expect(problems[0]).toContain('node verify.js');
  });

  it('fails when an allowlisted package gains a second hook', () => {
    const scan = scanOf([
      {
        name: 'grammar',
        version: '1.0.0',
        hooks: { preinstall: 'echo', postinstall: 'node x.js' },
      },
    ]);
    const allowlist: Allowlist = {
      minimumPackagesScanned: 1,
      allowed: [{ name: 'grammar', hooks: { postinstall: 'node x.js' }, why: 'prebuilt' }],
    };

    expect(diffAgainstAllowlist(scan, allowlist)[0]).toContain('CHANGED install script');
  });

  it('fails on a stale allowlist entry, so the allowlist can only shrink', () => {
    const allowlist: Allowlist = {
      minimumPackagesScanned: 1,
      allowed: [{ name: 'departed', hooks: { postinstall: 'node x.js' }, why: 'was needed' }],
    };

    const problems = diffAgainstAllowlist(scanOf([]), allowlist);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('STALE allowlist entry');
    expect(problems[0]).toContain('departed');
  });

  it('fails a scan that found almost nothing, instead of passing on an empty diff', () => {
    // The gate's own failure mode: pointed at the wrong path, the walk finds
    // nothing, the diff has nothing to report, and a broken check reports OK.
    const problems = diffAgainstAllowlist(scanOf([], 3), {
      minimumPackagesScanned: 100,
      allowed: [],
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('scanned only 3 packages');
    expect(problems[0]).toContain('proves nothing');
  });

  it('reports the floor failure ALONE, so it cannot be mistaken for a clean tree', () => {
    const problems = diffAgainstAllowlist(scanOf([], 0), {
      minimumPackagesScanned: 100,
      allowed: [{ name: 'departed', hooks: { postinstall: 'x' }, why: 'y' }],
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('scanned only 0 packages');
  });
});

describe('parseAllowlist', () => {
  it('accepts the real allowlist file shipped in this repo', async () => {
    const { readFileSync } = await import('node:fs');
    const { ALLOWLIST_PATH } = await import('./check-install-scripts.ts');

    const allowlist = parseAllowlist(readFileSync(ALLOWLIST_PATH, 'utf-8'));

    expect(allowlist.allowed.length).toBeGreaterThan(0);
    expect(allowlist.minimumPackagesScanned).toBeGreaterThan(0);
    for (const entry of allowlist.allowed) {
      expect(entry.why.length).toBeGreaterThan(20);
    }
  });

  it('rejects an entry with no justification', () => {
    expect(() =>
      parseAllowlist(
        JSON.stringify({
          minimumPackagesScanned: 1,
          allowed: [{ name: 'x', hooks: { postinstall: 'y' } }],
        })
      )
    ).toThrow(/why/);
  });

  it('rejects an entry allowlisted with no hooks', () => {
    expect(() =>
      parseAllowlist(
        JSON.stringify({
          minimumPackagesScanned: 1,
          allowed: [{ name: 'x', hooks: {}, why: 'because I said so, at length' }],
        })
      )
    ).toThrow(/no hooks/);
  });

  it('rejects a missing floor rather than defaulting to zero', () => {
    // A zero floor would make the vacuity guard unreachable, which is the one
    // thing the guard exists to prevent.
    expect(() => parseAllowlist(JSON.stringify({ allowed: [] }))).toThrow(/minimumPackagesScanned/);
  });
});
