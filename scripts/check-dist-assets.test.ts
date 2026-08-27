import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { missingDistAssets, REQUIRED_DIST_ASSETS } from './check-dist-assets.js';

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
