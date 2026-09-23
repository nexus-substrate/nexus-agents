import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ROOT } from './script-paths.js';
import {
  BUNDLED_DEPENDENCIES,
  STAGE_DIRNAME,
  firstPackReport,
  missingFromStage,
  stageManifest,
  unpackedBundleMembers,
} from './stage-publish.js';

const SOURCE = {
  name: 'nexus-agents',
  version: '9.9.9',
  scripts: { build: 'tsup', prepublishOnly: 'pnpm run build' },
  publishConfig: { access: 'public', directory: '.publish-stage', linkDirectory: false },
  dependencies: { 'dep-a': '1.0.0', 'dep-b': '^2.0.0', zod: '^4.0.0' },
  devDependencies: { 'nexus-memory': 'workspace:*' },
};

describe('stageManifest', () => {
  it('adds exactly the bundled names and keeps runtime dependencies', () => {
    const staged = stageManifest(SOURCE, ['dep-a', 'dep-b']);
    expect(staged['bundleDependencies']).toEqual(['dep-a', 'dep-b']);
    expect(staged.dependencies).toEqual(SOURCE.dependencies);
  });

  it('drops devDependencies, whose workspace: specs npm cannot resolve', () => {
    expect(stageManifest(SOURCE, ['dep-a'])).not.toHaveProperty('devDependencies');
  });

  it('drops prepublishOnly and the source-layout publishConfig keys, keeping the rest', () => {
    const staged = stageManifest(SOURCE, ['dep-a']);
    expect(staged.scripts).toEqual({ build: 'tsup' });
    expect(staged.publishConfig).toEqual({ access: 'public' });
  });

  it('refuses a bundled name that is not a runtime dependency', () => {
    expect(() => stageManifest(SOURCE, ['dep-a', 'nexus-memory'])).toThrow(/nexus-memory/);
  });

  it('does not mutate the source manifest', () => {
    const copy = structuredClone(SOURCE);
    stageManifest(copy, ['dep-a']);
    expect(copy).toEqual(SOURCE);
  });
});

describe('missingFromStage', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  });

  it('reports a bundled package with no installed manifest, and only that one', () => {
    dir = mkdtempSync(join(tmpdir(), 'stage-test-'));
    mkdirSync(join(dir, 'node_modules', '@scope', 'present'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', '@scope', 'present', 'package.json'), '{}');
    // A directory without a package.json is a failed extraction, not a package.
    mkdirSync(join(dir, 'node_modules', 'hollow'), { recursive: true });
    expect(missingFromStage(dir, ['@scope/present', 'hollow', 'absent'])).toEqual([
      'hollow',
      'absent',
    ]);
  });

  it('reports nothing missing for an empty bundle list', () => {
    dir = mkdtempSync(join(tmpdir(), 'stage-test-'));
    expect(missingFromStage(dir, [])).toEqual([]);
  });
});

describe('the real package manifest', () => {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'packages/nexus-agents/package.json'), 'utf8')
  ) as { dependencies: Record<string, string>; publishConfig: Record<string, unknown> };

  it('points publishConfig.directory at the stage and does not relink the workspace to it', () => {
    expect(manifest.publishConfig['directory']).toBe(STAGE_DIRNAME);
    expect(manifest.publishConfig['linkDirectory']).toBe(false);
  });

  it('lists every bundled name as a runtime dependency', () => {
    expect(() => stageManifest(manifest, BUNDLED_DEPENDENCIES)).not.toThrow();
  });
});

describe('unpackedBundleMembers', () => {
  const lock = {
    packages: {
      '': {},
      'node_modules/@google/genai': { inBundle: true },
      'node_modules/zod': { inBundle: true },
      'node_modules/@google/genai/node_modules/ws': { inBundle: true },
      'node_modules/semver': {},
    },
  };

  it('names a bundle member the tarball leaves out — the empty-directory defect', () => {
    const packed = ['package.json', 'node_modules/@google/genai/package.json'];
    expect(unpackedBundleMembers(lock, packed)).toEqual([
      'node_modules/@google/genai/node_modules/ws',
      'node_modules/zod',
    ]);
  });

  it('ignores packages npm installs itself, packed or not', () => {
    const packed = [
      'node_modules/@google/genai/package.json',
      'node_modules/zod/package.json',
      'node_modules/@google/genai/node_modules/ws/package.json',
    ];
    expect(unpackedBundleMembers(lock, packed)).toEqual([]);
  });

  it('does not count a stray file under the directory as the package', () => {
    expect(unpackedBundleMembers(lock, ['node_modules/zod/index.js'])).toContain(
      'node_modules/zod'
    );
  });

  it('reports nothing for a lockfile with no packages section', () => {
    expect(unpackedBundleMembers({}, [])).toEqual([]);
  });
});

describe('firstPackReport', () => {
  const report = { files: [{ path: 'package.json' }] };

  it('reads the npm <=11 array shape', () => {
    expect(firstPackReport([report])).toBe(report);
  });

  it('reads the npm 12 object-keyed-by-name shape', () => {
    expect(firstPackReport({ 'nexus-agents': report })).toBe(report);
  });

  it('returns undefined for an empty or scalar result', () => {
    expect(firstPackReport([])).toBeUndefined();
    expect(firstPackReport({})).toBeUndefined();
    expect(firstPackReport(null)).toBeUndefined();
    expect(firstPackReport('x')).toBeUndefined();
  });
});
