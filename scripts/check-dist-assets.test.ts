import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  missingDistAssets,
  REQUIRED_DIST_ASSETS,
  assetListCompleteness,
  findModuleRelativeResolvers,
} from './check-dist-assets.js';
import { ROOT as REPO_ROOT } from './script-paths.js';

const SRC_FOR_TEST = join(REPO_ROOT, 'packages/nexus-agents/src');

function box(): string {
  return mkdtempSync(join(tmpdir(), 'dist-assets-'));
}

describe('missingDistAssets (#5083)', () => {
  it('reports an asset absent from dist', () => {
    // The real defect: `models-dev-snapshot.json` was never copied, so every
    // installed copy enumerated zero models for claude/codex/gemini while the
    // loader caught the failure and returned `[]`.
    const dir = box();
    try {
      expect(missingDistAssets(dir)).not.toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a present-but-truncated asset', () => {
    // `existsSync` accepts a half-written file, and an empty JSON array parses
    // fine and enumerates to nothing — the same silent-empty outcome one step
    // further along.
    const dir = box();
    try {
      for (const { file } of REQUIRED_DIST_ASSETS) {
        const path = join(dir, file);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, '[]');
      }
      const missing = missingDistAssets(dir);

      expect(missing.some((m) => m.includes('below the'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when every asset is present and full-size', () => {
    // The pair. Without it, "always report missing" satisfies both tests above.
    const dir = box();
    try {
      for (const { file, minBytes } of REQUIRED_DIST_ASSETS) {
        const path = join(dir, file);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, 'x'.repeat(minBytes + 1));
      }

      expect(missingDistAssets(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a directory asset regardless of size', () => {
    // `workflows/templates` and `security/ast-rules` are directories; a size
    // floor is meaningless for them and must not fail them.
    const dir = box();
    try {
      for (const { file, minBytes } of REQUIRED_DIST_ASSETS) {
        const path = join(dir, file);
        if (minBytes > 1) {
          mkdirSync(join(path, '..'), { recursive: true });
          writeFileSync(path, 'x'.repeat(minBytes + 1));
        } else {
          mkdirSync(path, { recursive: true });
        }
      }

      expect(missingDistAssets(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('asset-list completeness (#5143)', () => {
  const declared = {
    'config/loader.ts': 'thing.json',
    'cli/unrelated.ts': null,
  };
  const guarded = ['thing.json'];

  it('passes when every resolver is declared and its asset is guarded', () => {
    expect(
      assetListCompleteness(['cli/unrelated.ts', 'config/loader.ts'], declared, guarded)
    ).toEqual([]);
  });

  it('flags a NEW undeclared resolver — the #5084 shape', () => {
    // A loader lands, resolves an asset inside the installed package, and
    // nobody adds it to the list. The old gate stays green because it only
    // checks what it was told about.
    const problems = assetListCompleteness(
      ['config/loader.ts', 'config/new-loader.ts', 'cli/unrelated.ts'],
      declared,
      guarded
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe('config/new-loader.ts');
    expect(problems[0]?.problem).toMatch(/not declared/);
  });

  it('flags a declared asset that REQUIRED_DIST_ASSETS does not guard', () => {
    // Declaring the dependency is not enough — the asset also has to be
    // checked for presence and size, or it ships unguarded.
    // Both resolvers passed, so the stale-declaration check stays quiet and
    // this isolates the unguarded-asset failure.
    const problems = assetListCompleteness(['cli/unrelated.ts', 'config/loader.ts'], declared, []);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.problem).toMatch(/ships unguarded/);
  });

  it('flags a declaration whose file no longer resolves module-relatively', () => {
    // Without this the map only grows, and a stale entry reads as coverage.
    const problems = assetListCompleteness(['config/loader.ts'], declared, guarded);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe('cli/unrelated.ts');
    expect(problems[0]?.problem).toMatch(/no longer resolves/);
  });

  it('accepts a null declaration without demanding an asset', () => {
    // Not every module-relative path is an asset read; the three real cases
    // resolve dist/cli.js, a scratch dir, and a non-asset path.
    expect(assetListCompleteness(['cli/unrelated.ts'], { 'cli/unrelated.ts': null }, [])).toEqual(
      []
    );
  });

  it('names the empty case: no resolvers and no declarations is clean', () => {
    expect(assetListCompleteness([], {}, [])).toEqual([]);
  });
});

describe('findModuleRelativeResolvers against the real tree (#5143)', () => {
  it('finds the four known asset loaders', () => {
    // Guards the scanner itself: if it silently stopped matching, the
    // completeness check would pass by finding nothing.
    const found = findModuleRelativeResolvers(SRC_FOR_TEST);
    expect(found).toContain('config/models-dev-snapshot-loader.ts');
    expect(found).toContain('config/models-generated-loader.ts');
    expect(found).toContain('workflows/template-loader.ts');
    expect(found).toContain('security/ast-rule-runner.ts');
  });

  it('excludes test files, which resolve module-relative paths freely', () => {
    const found = findModuleRelativeResolvers(SRC_FOR_TEST);
    expect(found.every((f) => !f.includes('.test.'))).toBe(true);
  });
});
