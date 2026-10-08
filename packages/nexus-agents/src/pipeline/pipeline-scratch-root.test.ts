/** Scratch copies must not become inputs to source capture or security scanning. */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { pipelineScratchRoot } from './pipeline-scratch-root.js';

describe('pipeline scratch isolation (#7302)', () => {
  let root: string;
  let source: string;
  let preferred: string;
  let fallback: string;

  beforeEach(() => {
    root = realpathSync(mkdtempOutsideRepo('pipeline-scratch-root-'));
    source = join(root, 'repo');
    preferred = join(root, 'scratch');
    fallback = join(root, 'system');
    for (const path of [source, preferred, fallback]) mkdirSync(path);
    vi.stubEnv('NEXUS_TMPDIR', preferred);
    vi.stubEnv('TMPDIR', fallback);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('honors a non-overlapping NEXUS_TMPDIR', () => {
    expect(pipelineScratchRoot([source, process.cwd()])).toBe(preferred);
  });

  it.each(['nested', 'equal', 'ancestor', 'symlink'])(
    'keeps %s scratch outside the source and scan trees',
    (kind) => {
      let path = source;
      if (kind === 'nested') path = join(source, '.nexus-agents/tmp');
      if (kind === 'ancestor') path = root;
      if (kind === 'symlink') {
        path = join(root, 'alias');
        symlinkSync(source, path);
      }
      vi.stubEnv('NEXUS_TMPDIR', path);
      expect(pipelineScratchRoot([source])).toBe(fallback);
    }
  );

  it('treats a sibling sharing a name prefix as isolated', () => {
    vi.stubEnv('NEXUS_TMPDIR', `${source}-scratch`);
    expect(pipelineScratchRoot([source])).toBe(`${source}-scratch`);
  });

  it('refuses allocation when even the system root overlaps a protected tree', () => {
    vi.stubEnv('NEXUS_TMPDIR', join(source, '.nexus-agents/tmp'));
    vi.stubEnv('TMPDIR', source);
    expect(() => pipelineScratchRoot([source])).toThrow('No isolated pipeline scratch root');
  });

  it('allows a fresh sibling allocation when the OS root contains the source', () => {
    vi.stubEnv('NEXUS_TMPDIR', join(source, '.nexus-agents/tmp'));
    vi.stubEnv('TMPDIR', root);
    const scratch = mkdtempSync(join(pipelineScratchRoot([source]), 'security-baseline-'));
    expect(dirname(scratch)).toBe(root);
    expect(scratch).not.toBe(source);
  });
});
