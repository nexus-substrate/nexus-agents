/**
 * Tests for safe-path helpers (#1813, #1814).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveInsideRoot } from './safe-path.js';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('resolveInsideRoot', () => {
  const root = resolve(process.cwd());

  it('accepts simple relative paths inside root', () => {
    expect(resolveInsideRoot('src/app.ts')).toBe(resolve(root, 'src/app.ts'));
  });

  it('accepts the root itself', () => {
    expect(resolveInsideRoot('.')).toBe(root);
  });

  it('rejects relative traversal (../../etc/passwd)', () => {
    expect(resolveInsideRoot('../../../../etc/passwd')).toBeNull();
  });

  it('rejects absolute paths outside root', () => {
    expect(resolveInsideRoot('/etc/passwd')).toBeNull();
  });

  it('rejects paths that look inside but escape', () => {
    expect(resolveInsideRoot('src/../../../etc/passwd')).toBeNull();
  });

  it('accepts nested paths', () => {
    expect(resolveInsideRoot('src/foo/bar/baz.ts')).toBe(resolve(root, 'src/foo/bar/baz.ts'));
  });

  it('rejects sibling-root prefix attack (/rootsibling)', () => {
    // If root is /foo, /foobar should not be accepted just because it starts with /foo.
    const tmpRoot = '/tmp/a';
    expect(resolveInsideRoot('/tmp/abc/x', tmpRoot)).toBeNull();
  });

  it('accepts absolute path inside explicit root', () => {
    const tmpRoot = '/tmp/a';
    expect(resolveInsideRoot('/tmp/a/x', tmpRoot)).toBe('/tmp/a/x');
  });

  describe('symlink confinement', () => {
    let baseDir: string;
    let workspaceDir: string;
    let secretFile: string;

    beforeEach(() => {
      baseDir = mkdtempSync(join(tmpdir(), 'safe-path-test-'));
      workspaceDir = join(baseDir, 'workspace');
      mkdirSync(workspaceDir);
      secretFile = join(baseDir, 'secret.txt');
      writeFileSync(secretFile, 'super-secret-data');
    });

    afterEach(() => {
      rmSync(baseDir, { recursive: true, force: true });
    });

    it('rejects a symlink pointing outside root', () => {
      const symlinkFile = join(workspaceDir, 'leak-link');
      symlinkSync(secretFile, symlinkFile);

      expect(resolveInsideRoot('leak-link', workspaceDir)).toBeNull();
      expect(resolveInsideRoot(symlinkFile, workspaceDir)).toBeNull();
    });

    it('rejects a directory symlink pointing outside root', () => {
      const symlinkDir = join(workspaceDir, 'external-dir');
      symlinkSync(baseDir, symlinkDir);

      expect(resolveInsideRoot('external-dir/secret.txt', workspaceDir)).toBeNull();
      expect(resolveInsideRoot('external-dir/nonexistent.txt', workspaceDir)).toBeNull();
    });

    it('accepts a symlink pointing inside root', () => {
      const insideTarget = join(workspaceDir, 'inside.txt');
      writeFileSync(insideTarget, 'safe-content');
      const insideLink = join(workspaceDir, 'inside-link');
      symlinkSync(insideTarget, insideLink);

      const result = resolveInsideRoot('inside-link', workspaceDir);
      expect(result).not.toBeNull();
      expect(result).toBe(realpathSync(insideTarget));
    });

    it('accepts a not-yet-existing path by resolving its nearest existing ancestor', () => {
      const result = resolveInsideRoot('new-dir/deeper/file.txt', workspaceDir);
      expect(result).toBe(join(realpathSync(workspaceDir), 'new-dir', 'deeper', 'file.txt'));
    });

    it('rejects a not-yet-existing path under a symlinked ancestor that points outside', () => {
      symlinkSync(baseDir, join(workspaceDir, 'external-dir'));
      expect(resolveInsideRoot('external-dir/new/file.txt', workspaceDir)).toBeNull();
    });

    it('realpaths the root: a symlinked root still contains its own children', () => {
      const rootLink = join(baseDir, 'root-link');
      symlinkSync(workspaceDir, rootLink);
      writeFileSync(join(workspaceDir, 'child.txt'), 'x');
      expect(resolveInsideRoot('child.txt', rootLink)).toBe(
        join(realpathSync(workspaceDir), 'child.txt')
      );
      expect(resolveInsideRoot(join(rootLink, 'child.txt'), rootLink)).not.toBeNull();
    });
  });
});
