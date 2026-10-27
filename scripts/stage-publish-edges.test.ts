import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  IN_MAJOR_BACKPORTS,
  assertBundleEdges,
  backportCovers,
  backportPins,
  backportRange,
  edgeViolations,
} from './stage-publish-edges.js';

let dir: string | undefined;
afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** Write `<root>/node_modules/<path...>/package.json` for a tree of packages. */
function put(root: string, at: string[], manifest: Record<string, unknown>): void {
  const target = join(root, ...at.flatMap((name) => ['node_modules', name]));
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'package.json'), JSON.stringify(manifest));
}

function stage(): string {
  dir = mkdtempSync(join(tmpdir(), 'edges-test-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'root', version: '1.0.0', dependencies: { ajv: '^8.0.0' } })
  );
  return dir;
}

describe('edgeViolations', () => {
  it('passes a tree whose every edge holds', () => {
    const root = stage();
    put(root, ['ajv'], { name: 'ajv', version: '8.20.0', dependencies: { 'fast-uri': '^3.0.1' } });
    put(root, ['fast-uri'], { name: 'fast-uri', version: '3.1.9' });
    expect(edgeViolations(root)).toEqual([]);
  });

  it('flags the #7614 shape: a dependency shipped across the declared major', () => {
    const root = stage();
    put(root, ['ajv'], { name: 'ajv', version: '8.20.0', dependencies: { 'fast-uri': '^3.0.1' } });
    put(root, ['fast-uri'], { name: 'fast-uri', version: '4.2.3' });
    expect(edgeViolations(root)).toEqual([
      {
        dependent: 'node_modules/ajv',
        kind: 'dependencies',
        name: 'fast-uri',
        range: '^3.0.1',
        resolved: '4.2.3',
      },
    ]);
  });

  it('resolves the nearest copy, so a nested satisfying copy is accepted', () => {
    const root = stage();
    put(root, ['ajv'], { name: 'ajv', version: '8.20.0', dependencies: { 'fast-uri': '^3.0.1' } });
    put(root, ['fast-uri'], { name: 'fast-uri', version: '4.2.3' });
    put(root, ['ajv', 'fast-uri'], { name: 'fast-uri', version: '3.1.9' });
    expect(edgeViolations(root)).toEqual([]);
  });

  it('checks the staged package itself and scoped packages', () => {
    const root = stage();
    put(root, ['ajv'], { name: 'ajv', version: '7.0.0' });
    put(root, ['@scope/pkg'], {
      name: '@scope/pkg',
      version: '1.0.0',
      dependencies: { gone: '1' },
    });
    const found = edgeViolations(root).map((v) => `${v.dependent} ${v.name} ${v.resolved ?? '-'}`);
    expect(found).toEqual(['. ajv 7.0.0', 'node_modules/@scope/pkg gone -']);
  });

  it('tolerates an absent optional dependency or peer, but not a present one that does not fit', () => {
    const root = stage();
    put(root, ['ajv'], {
      name: 'ajv',
      version: '8.0.0',
      optionalDependencies: { fsevents: '^2' },
      peerDependencies: { zod: '^3' },
    });
    expect(edgeViolations(root)).toEqual([]);
    put(root, ['zod'], { name: 'zod', version: '4.0.0' });
    expect(edgeViolations(root).map((v) => v.kind)).toEqual(['peerDependencies']);
  });

  it('skips specs semver cannot judge', () => {
    const root = stage();
    put(root, ['ajv'], {
      name: 'ajv',
      version: '8.0.0',
      dependencies: { a: 'npm:b@1', b: 'git+https://x/y.git', c: 'latest' },
    });
    expect(edgeViolations(root)).toEqual([]);
  });

  it('allows an absent optional dependency that overrides a required entry on the root', () => {
    const root = stage();
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'root',
        version: '1.0.0',
        dependencies: { extra: '^1' },
        optionalDependencies: { extra: '^2' },
      })
    );
    expect(edgeViolations(root)).toEqual([]);
  });

  it('checks the installed optional range instead of the shadowed required range', () => {
    const root = stage();
    put(root, ['ajv'], {
      name: 'ajv',
      version: '8.0.0',
      dependencies: { extra: '^1' },
      optionalDependencies: { extra: '^2' },
    });
    put(root, ['extra'], { name: 'extra', version: '2.0.0' });
    expect(edgeViolations(root)).toEqual([]);
  });

  it('still rejects an installed copy that violates the overriding optional range', () => {
    const root = stage();
    put(root, ['ajv'], {
      name: 'ajv',
      version: '8.0.0',
      dependencies: { extra: '^1' },
      optionalDependencies: { extra: '^2' },
    });
    put(root, ['extra'], { name: 'extra', version: '3.0.0' });
    expect(edgeViolations(root)).toEqual([
      {
        dependent: 'node_modules/ajv',
        kind: 'optionalDependencies',
        name: 'extra',
        range: '^2',
        resolved: '3.0.0',
      },
    ]);
  });
});

describe('assertBundleEdges', () => {
  it('names every unsatisfied edge and says the consumer install would refuse', () => {
    const root = stage();
    put(root, ['ajv'], { name: 'ajv', version: '8.20.0', dependencies: { 'fast-uri': '^3.0.1' } });
    put(root, ['fast-uri'], { name: 'fast-uri', version: '4.2.3' });
    expect(() => {
      assertBundleEdges(root, () => {});
    }).toThrow(/node_modules\/ajv declares dependencies fast-uri@\^3\.0\.1, ships 4\.2\.3/);
  });

  it('logs a zero count for a clean tree', () => {
    const root = stage();
    put(root, ['ajv'], { name: 'ajv', version: '8.20.0' });
    const lines: string[] = [];
    assertBundleEdges(root, (l) => {
      lines.push(l);
    });
    expect(lines).toEqual(['bundled dependency edges checked: 0 violation(s)']);
  });
});

describe('in-major backports', () => {
  it('pins each dependency to the major its parent declares', () => {
    expect(IN_MAJOR_BACKPORTS.map(backportRange)).toEqual([
      '>=3.1.9 <4',
      '>=7.6.5 <8',
      '>=8.4.0 <9',
    ]);
  });

  it('repeats the ajv pin under the sdk-scoped override', () => {
    const scopes = backportPins()
      .filter((p) => p.name === 'fast-uri')
      .map((p) => p.scope.join('>'));
    expect(scopes).toEqual(['ajv', '@modelcontextprotocol/sdk>ajv']);
  });

  it('covers only patched releases of the older major', () => {
    expect(backportCovers('fast-uri', '3.1.9', '>=4.1.3')).toBe(true);
    expect(backportCovers('fast-uri', '3.1.8', '>=4.1.3')).toBe(false);
    expect(backportCovers('fast-uri', '4.2.3', '>=4.1.3')).toBe(false);
    expect(backportCovers('protobufjs', '7.6.6', '>=7.6.3')).toBe(true);
    expect(backportCovers('protobufjs', '7.6.4', '>=7.6.3')).toBe(false);
    expect(backportCovers('unrelated', '1.0.0', '>=1.0.0')).toBe(false);
  });

  it('covers nothing once the floor it was verified against changes', () => {
    expect(backportCovers('fast-uri', '3.1.9', '>=4.3.0')).toBe(false);
  });
});
