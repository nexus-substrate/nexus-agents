import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROOT } from './script-paths.js';
import {
  assertBundleFloors,
  bundledPackages,
  floorViolations,
  npmOverrides,
  parseOverrideFloors,
  parseOverrideKey,
} from './stage-publish-floors.js';

describe('parseOverrideKey', () => {
  it('reads a bare name, scoped or not', () => {
    expect(parseOverrideKey('fast-uri')).toEqual({ name: 'fast-uri' });
    expect(parseOverrideKey('@hono/node-server')).toEqual({ name: '@hono/node-server' });
  });

  it('reads a version selector whose range itself contains ">"', () => {
    expect(parseOverrideKey('js-yaml@>=4.0.0 <4.3.1')).toEqual({
      name: 'js-yaml',
      selector: '>=4.0.0 <4.3.1',
    });
    expect(parseOverrideKey('@scope/pkg@<2')).toEqual({ name: '@scope/pkg', selector: '<2' });
  });

  it('reads parent>name, keeping the parent and its own selector', () => {
    expect(parseOverrideKey('@modelcontextprotocol/sdk>ajv')).toEqual({
      name: 'ajv',
      parent: '@modelcontextprotocol/sdk',
    });
    expect(parseOverrideKey('foo@^1>bar@<3')).toEqual({
      name: 'bar',
      selector: '<3',
      parent: 'foo@^1',
    });
  });

  it('returns undefined for a key it cannot read, rather than guessing', () => {
    expect(parseOverrideKey('a>b>c')).toBeUndefined();
    expect(parseOverrideKey('')).toBeUndefined();
    expect(parseOverrideKey('pkg@not a range')).toBeUndefined();
  });
});

describe('parseOverrideFloors', () => {
  it('keeps semver-range values and lists every other value as skipped', () => {
    const { floors, skipped } = parseOverrideFloors({
      'fast-uri': '>=4.1.3',
      'js-yaml@>=5.0.0': '4.3.2',
      removed: '-',
      aliased: 'npm:other@1.0.0',
      ref: '$ref',
      'a>b>c': '>=1.0.0',
    });
    expect(floors.map((f) => f.key)).toEqual(['fast-uri', 'js-yaml@>=5.0.0']);
    expect(skipped.map((s) => s.key)).toEqual(['removed', 'aliased', 'ref', 'a>b>c']);
    for (const s of skipped) expect(s.reason).not.toBe('');
  });

  it('names the empty case: no overrides is zero floors and zero skipped', () => {
    expect(parseOverrideFloors({})).toEqual({ floors: [], skipped: [] });
  });
});

describe('bundledPackages', () => {
  it('lists only inBundle entries, naming each by its innermost node_modules segment', () => {
    const lock = {
      packages: {
        '': { version: '1.0.0' },
        'node_modules/@google/genai': { version: '1.2.3', inBundle: true },
        'node_modules/@google/genai/node_modules/ws': { version: '8.0.0', inBundle: true },
        'node_modules/semver': { version: '7.0.0' },
      },
    };
    expect(bundledPackages(lock)).toEqual([
      { path: 'node_modules/@google/genai', name: '@google/genai', version: '1.2.3' },
      { path: 'node_modules/@google/genai/node_modules/ws', name: 'ws', version: '8.0.0' },
    ]);
  });

  it('refuses an empty bundle — the stage is broken, not clean', () => {
    expect(() => bundledPackages({ packages: { 'node_modules/x': { version: '1.0.0' } } })).toThrow(
      /no inBundle/
    );
    expect(() => bundledPackages({})).toThrow(/no inBundle/);
  });

  it('refuses a bundled entry with no version instead of skipping it', () => {
    expect(() => bundledPackages({ packages: { 'node_modules/x': { inBundle: true } } })).toThrow(
      /node_modules\/x/
    );
  });
});

describe('floorViolations', () => {
  const { floors } = parseOverrideFloors({
    'fast-uri': '>=4.1.3',
    'js-yaml@>=4.0.0 <4.3.1': '>=4.3.2 <5.0.0',
    '@modelcontextprotocol/sdk>ajv': '>=8.18.0',
  });

  it('names a bundled copy below a plain floor', () => {
    const v = floorViolations(floors, [
      { path: 'node_modules/fast-uri', name: 'fast-uri', version: '3.1.8' },
    ]);
    expect(v).toEqual([
      { path: 'node_modules/fast-uri', version: '3.1.8', key: 'fast-uri', range: '>=4.1.3' },
    ]);
  });

  it('applies a selector floor only to versions inside the selector', () => {
    const pkgs = [
      { path: 'node_modules/js-yaml', name: 'js-yaml', version: '4.1.0' },
      { path: 'node_modules/a/node_modules/js-yaml', name: 'js-yaml', version: '3.14.0' },
    ];
    expect(floorViolations(floors, pkgs).map((v) => v.path)).toEqual(['node_modules/js-yaml']);
  });

  it('applies a parent>name floor to every copy of the name, conservatively', () => {
    const pkgs = [{ path: 'node_modules/ajv', name: 'ajv', version: '8.17.1' }];
    expect(floorViolations(floors, pkgs).map((v) => v.key)).toEqual([
      '@modelcontextprotocol/sdk>ajv',
    ]);
  });

  it('passes versions that satisfy every floor', () => {
    const pkgs = [
      { path: 'node_modules/fast-uri', name: 'fast-uri', version: '4.2.1' },
      { path: 'node_modules/js-yaml', name: 'js-yaml', version: '4.3.2' },
      { path: 'node_modules/ajv', name: 'ajv', version: '8.20.0' },
    ];
    expect(floorViolations(floors, pkgs)).toEqual([]);
  });
});

describe('npmOverrides', () => {
  const { floors } = parseOverrideFloors({
    'fast-uri': '>=4.1.3',
    'js-yaml@>=5.0.0': '4.3.2',
    '@modelcontextprotocol/sdk>ajv': '>=8.18.0',
    '@modelcontextprotocol/sdk>express-rate-limit': '>=8.5.1',
    hono: '>=4.13.5',
  });

  it('translates bare, selector and parent>name keys into npm override shapes', () => {
    const { overrides } = npmOverrides(floors, {});
    expect(overrides).toEqual({
      'fast-uri': '>=4.1.3',
      'js-yaml@>=5.0.0': '4.3.2',
      '@modelcontextprotocol/sdk': { ajv: '>=8.18.0', 'express-rate-limit': '>=8.5.1' },
      hono: '>=4.13.5',
    });
  });

  it('leaves a direct dependency untranslated — npm rejects it with EOVERRIDE', () => {
    const { overrides, untranslated } = npmOverrides(floors, { hono: '^4.13.0' });
    expect(overrides).not.toHaveProperty('hono');
    expect(untranslated.map((f) => f.key)).toEqual(['hono']);
  });

  it('keeps a parent that is itself a direct dependency, as an object key', () => {
    const { overrides } = npmOverrides(floors, { '@modelcontextprotocol/sdk': '^1.0.0' });
    expect(overrides['@modelcontextprotocol/sdk']).toEqual({
      ajv: '>=8.18.0',
      'express-rate-limit': '>=8.5.1',
    });
  });

  it('merges a plain floor and a parent floor on one name under "."', () => {
    const both = parseOverrideFloors({ ajv: '>=8.0.0', 'ajv>fast-uri': '>=4.1.3' }).floors;
    expect(npmOverrides(both, {}).overrides).toEqual({
      ajv: { '.': '>=8.0.0', 'fast-uri': '>=4.1.3' },
    });
  });
});

describe('assertBundleFloors', () => {
  const lock = {
    packages: { 'node_modules/fast-uri': { version: '3.1.8', inBundle: true } },
  };

  it('fails naming path@version and the override it violates', () => {
    const parsed = parseOverrideFloors({ 'fast-uri': '>=4.1.3' });
    expect(() => {
      assertBundleFloors(lock, parsed, () => undefined);
    }).toThrow(/node_modules\/fast-uri@3\.1\.8 violates "fast-uri": ">=4\.1\.3"/);
  });

  it('logs "0 floors" explicitly when there is nothing to check', () => {
    const lines: string[] = [];
    assertBundleFloors(lock, { floors: [], skipped: [] }, (l) => lines.push(l));
    expect(lines.join('\n')).toMatch(/0 floors/);
  });

  it('logs each skipped override by key', () => {
    const lines: string[] = [];
    const parsed = parseOverrideFloors({ 'fast-uri': '>=3.0.0', gone: '-' });
    assertBundleFloors(lock, parsed, (l) => lines.push(l));
    expect(lines.join('\n')).toMatch(/1 floor\(s\) checked against 1 bundled/);
    expect(lines.join('\n')).toMatch(/skipped override "gone"/);
  });
});

describe('the real workspace overrides', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    pnpm?: { overrides?: Record<string, string> };
  };

  it('parses every key the repo actually uses — none silently lost', () => {
    const overrides = manifest.pnpm?.overrides ?? {};
    const { floors, skipped } = parseOverrideFloors(overrides);
    expect(floors.length + skipped.length).toBe(Object.keys(overrides).length);
    expect(skipped).toEqual([]);
    expect(floors.map((f) => f.key)).toContain('fast-uri');
  });
});
