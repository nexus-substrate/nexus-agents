import * as childProcess from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

import {
  assertSamePacklist,
  pnpmPackedFileList,
  pnpmPackReportFiles,
} from './stage-publish-packlist.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

describe('pnpmPackedFileList', () => {
  it('uses the pnpm-only hoisted flag without leaking inherited npm config', () => {
    vi.stubEnv('npm_config_node_linker', 'isolated');
    vi.stubEnv('npm_config_verify_deps_before_run', 'false');
    const exec = vi
      .mocked(childProcess.execFileSync)
      .mockReturnValue(JSON.stringify({ files: [{ path: 'package.json' }] }));
    try {
      expect(pnpmPackedFileList('/source-package')).toEqual(['package.json']);
      expect(exec).toHaveBeenCalledWith(
        'pnpm',
        [
          '--config.node-linker=hoisted',
          'pack',
          '--json',
          '--pack-destination',
          expect.any(String),
        ],
        expect.objectContaining({
          cwd: '/source-package',
          env: expect.not.objectContaining({ npm_config_node_linker: expect.anything() }),
        })
      );
      const env = exec.mock.calls[0]?.[2]?.env;
      expect(env).toBeDefined();
      expect(env).not.toHaveProperty('npm_config_verify_deps_before_run');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('assertSamePacklist', () => {
  it('accepts identical lists in any order', () => {
    expect(() => {
      assertSamePacklist(
        ['a', 'node_modules/x/package.json'],
        ['node_modules/x/package.json', 'a']
      );
    }).not.toThrow();
  });

  it('names a file only pnpm would publish and one only npm would, with counts', () => {
    expect(() => {
      assertSamePacklist(['a', 'npm-only'], ['a', 'pnpm-only']);
    }).toThrow(
      /1 file\(s\) only in npm's packlist: npm-only[\s\S]*1 file\(s\) only in pnpm's packlist: pnpm-only/
    );
  });

  it('reports only the direction that differs', () => {
    let message = '';
    try {
      assertSamePacklist(['a', 'b'], ['a']);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/1 file\(s\) only in npm's packlist: b/);
    expect(message).not.toMatch(/only in pnpm's packlist/);
  });

  it('lists at most the first ten differences each way, sorted', () => {
    const npm = Array.from({ length: 12 }, (_, i) => `f${String(i).padStart(2, '0')}`);
    let message = '';
    try {
      assertSamePacklist(npm, ['unrelated']);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/12 file\(s\) only in npm's packlist: f00, f01, .*f09(?!, f10)/);
    expect(message).not.toContain('f10');
  });

  it('refuses an empty pnpm list rather than calling it a match', () => {
    expect(() => {
      assertSamePacklist(['a'], []);
    }).toThrow(/pnpm pack listed no files/);
  });

  it('refuses an empty npm list, even when pnpm is empty too', () => {
    expect(() => {
      assertSamePacklist([], []);
    }).toThrow(/npm pack listed no files/);
  });
});

describe('pnpmPackReportFiles', () => {
  it("reads pnpm 9's --json report", () => {
    const stdout = JSON.stringify({
      name: 'nexus-agents',
      version: '1.0.0',
      filename: '/tmp/x/nexus-agents-1.0.0.tgz',
      files: [{ path: 'package.json' }, { path: 'dist/index.js' }],
    });
    expect(pnpmPackReportFiles(stdout)).toEqual(['package.json', 'dist/index.js']);
  });

  it('refuses a report with no files field or an empty one', () => {
    expect(() => pnpmPackReportFiles('{"name":"x"}')).toThrow(/pnpm pack listed no files/);
    expect(() => pnpmPackReportFiles('{"files":[]}')).toThrow(/pnpm pack listed no files/);
  });

  it('refuses output that is not JSON, quoting its start', () => {
    expect(() => pnpmPackReportFiles('> nexus-agents@1.0.0 prepack\n{')).toThrow(
      /not JSON.*prepack/
    );
  });
});
