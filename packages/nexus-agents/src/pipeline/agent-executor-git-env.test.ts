/** Real quality-gate and scanner subprocesses cannot inherit source Git redirects. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentStages } from './agent-executor.js';
import { createScratchCheckout, type ScratchCheckout } from '../cli/vote-scratch-checkout.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';

describe('scratch gate subprocess Git environments (#7007)', () => {
  let fixture: string;
  let source: string;
  let index: string;
  let scratch: ScratchCheckout;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    fixture = mkdtempOutsideRepo('gate-git-env-');
    source = join(fixture, 'source');
    const tmpRoot = join(fixture, 'scratch');
    mkdirSync(source);
    mkdirSync(tmpRoot);
    vi.stubEnv('NEXUS_TMPDIR', tmpRoot);
    writeFileSync(join(source, 'tracked.txt'), 'source content\n');
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: source, env: hermeticGitEnv(), encoding: 'utf8' });
    git('init', '--quiet');
    git('add', 'tracked.txt');
    git(
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '--quiet',
      '-m',
      'fixture'
    );
    scratch = createScratchCheckout({
      repoRoot: source,
      sha: git('rev-parse', 'HEAD').trim(),
      hermetic: true,
    });
    index = join(source, '.git/index');
    vi.stubEnv('GIT_INDEX_FILE', index);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    scratch.dispose();
    rmSync(fixture, { recursive: true, force: true });
  });

  function snapshot(): { bytes: Buffer; mtimeMs: number } {
    return { bytes: readFileSync(index), mtimeMs: statSync(index).mtimeMs };
  }

  function boundStages(): ReturnType<typeof createAgentStages> {
    const stages = createAgentStages({ scanTarget: source });
    const bound = stages.withWorkspace?.({
      directory: scratch.path,
      dependencies: { status: 'none' },
    });
    if (bound === undefined) throw new Error('Production scratch binding missing');
    return bound;
  }

  it.each(['typecheck', 'lint', 'test'])(
    'the production %s check keeps the source index unchanged',
    async (script) => {
      const added = `gate-${script}.txt`;
      writeFileSync(
        join(scratch.path, 'package.json'),
        JSON.stringify({
          scripts: {
            [script]: `echo scratch > ${added} && git add -N ${added} && git status --porcelain && echo ran > gate-executed`,
          },
        })
      );
      const before = snapshot();

      const result = await boundStages().qualityGate?.();

      expect(result?.passed, result?.feedback).toBe(true);
      expect(readFileSync(join(scratch.path, 'gate-executed'), 'utf8')).toContain('ran');
      expect(snapshot()).toEqual(before);
      expect(
        execFileSync('git', ['diff', '--name-only'], {
          cwd: scratch.path,
          env: hermeticGitEnv(),
          encoding: 'utf8',
        })
      ).toContain(added);
    }
  );

  it('preserves inherited Git environment for callers without a scratch binding', async () => {
    writeFileSync(
      join(scratch.path, 'package.json'),
      JSON.stringify({
        scripts: {
          typecheck: 'echo scratch > default-env.txt && git add -N default-env.txt',
        },
      })
    );
    const before = snapshot();

    const result = await createAgentStages({ scanTarget: scratch.path }).qualityGate?.();

    expect(result?.passed, result?.feedback).toBe(true);
    expect(snapshot().bytes).not.toEqual(before.bytes);
  });

  it.each(['probe', 'scan'])(
    'the production security %s subprocess keeps the source index unchanged',
    async (phase) => {
      const bin = join(fixture, 'bin');
      mkdirSync(bin);
      writeFileSync(
        join(bin, 'semgrep'),
        [
          `#!${process.execPath}`,
          "const { execFileSync } = require('node:child_process');",
          "const { writeFileSync } = require('node:fs');",
          `const cwd = ${JSON.stringify(scratch.path)};`,
          "const probe = process.argv.includes('--version');",
          `if ((probe ? 'probe' : 'scan') === ${JSON.stringify(phase)}) {`,
          "  writeFileSync(cwd + '/scan-added.txt', 'scratch');",
          "  execFileSync('git', ['add', '-N', 'scan-added.txt'], { cwd });",
          "  execFileSync('git', ['status', '--porcelain'], { cwd });",
          "  writeFileSync(cwd + '/scan-executed', 'ran');",
          '}',
          "console.log(probe ? '1.0.0' : JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'fixture' } }, results: [] }] }));",
          '',
        ].join('\n'),
        { mode: 0o755 }
      );
      vi.stubEnv('PATH', `${bin}${delimiter}${process.env['PATH'] ?? ''}`);
      // The production scanner requires its target inside cwd. Run inside the fixture.
      process.chdir(scratch.path);
      const before = snapshot();

      const result = await boundStages().securityScan?.();

      expect(result?.passed, result?.feedback).toBe(true);
      expect(readFileSync(join(scratch.path, 'scan-executed'), 'utf8')).toBe('ran');
      expect(snapshot()).toEqual(before);
    }
  );
});
