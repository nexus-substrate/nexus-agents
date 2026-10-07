/**
 * findSourceFiles walk-shape tests (#7178), against a mocked `readdir`.
 *
 * Kept apart from codebase-search.test.ts because the mock replaces
 * `node:fs/promises` for the whole file, and those tests walk a real tmpdir.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

interface FakeDirent {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}

const tree = new Map<string, FakeDirent[]>();

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn((dir: string) => Promise.resolve(tree.get(dir) ?? [])),
}));

const { findSourceFiles } = await import('./codebase-search.js');

function dirent(name: string, kind: 'dir' | 'file'): FakeDirent {
  return { name, isDirectory: () => kind === 'dir', isFile: () => kind === 'file' };
}

const ROOT = resolve('/fake-root');

beforeEach(() => {
  tree.clear();
});

describe('findSourceFiles on large and dot-directory trees (#7178)', () => {
  it('collects a subdirectory holding more files than a spread call can take', async () => {
    // `files.push(...sub.files)` throws "Maximum call stack size exceeded"
    // once sub.files passes roughly 120k entries; 200k leaves margin.
    const fileCount = 200_000;
    const big = resolve(ROOT, 'big');
    tree.set(ROOT, [dirent('big', 'dir')]);
    tree.set(
      big,
      Array.from({ length: fileCount }, (_, i) => dirent(`f${String(i)}.ts`, 'file'))
    );

    const { files, skippedDirs } = await findSourceFiles(ROOT, 4);

    expect(files).toHaveLength(fileCount);
    expect(files[0]).toBe(resolve(big, 'f0.ts'));
    expect(skippedDirs).toBe(0);
  });

  it('does not descend into .git, .nexus-agents or other dot-directories', async () => {
    tree.set(ROOT, [
      dirent('.git', 'dir'),
      dirent('.nexus-agents', 'dir'),
      dirent('.cache', 'dir'),
      dirent('node_modules', 'dir'),
      dirent('dist', 'dir'),
      dirent('src', 'dir'),
    ]);
    for (const hidden of ['.git', '.nexus-agents', '.cache', 'node_modules', 'dist']) {
      tree.set(resolve(ROOT, hidden), [dirent('hidden.ts', 'file')]);
    }
    tree.set(resolve(ROOT, 'src'), [dirent('kept.ts', 'file')]);

    const { files } = await findSourceFiles(ROOT, 4);

    expect(files).toEqual([resolve(ROOT, 'src', 'kept.ts')]);
  });

  it('still walks the root when the root itself is a dot-directory', async () => {
    // The skip applies to entries, not to the directory the caller chose.
    const dotRoot = resolve('/fake-root/.config-pkg');
    tree.set(dotRoot, [dirent('a.ts', 'file')]);

    const { files } = await findSourceFiles(dotRoot, 4);

    expect(files).toEqual([resolve(dotRoot, 'a.ts')]);
  });

  it('returns an empty walk for an empty directory', async () => {
    tree.set(ROOT, []);
    expect(await findSourceFiles(ROOT, 4)).toEqual({ files: [], skippedDirs: 0 });
  });
});
