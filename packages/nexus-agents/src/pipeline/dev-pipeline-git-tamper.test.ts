/** Metadata redirection cannot turn patch capture or cleanup into host execution. */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileTree, type CommandWrapper } from '../cli-adapters/exec-file-tree.js';
import { createBwrapPreflight } from '../cli-adapters/codex-sandbox-preflight.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { createScratchCheckout } from '../cli/vote-scratch-checkout.js';
import type { DevPipelineResult, DevPipelineStages } from './dev-pipeline.js';
import * as sandboxModule from './dev-pipeline-sandbox.js';
import { withDevPipelineWorkspace } from './dev-pipeline-workspace.js';

const availability = await createBwrapPreflight()();
if (availability.mode !== 'os-sandbox')
  console.warn(`Skipping real bwrap metadata tests: ${availability.reason ?? 'unavailable'}`);
const result: DevPipelineResult = {
  completed: true,
  plan: '',
  tasks: [],
  voteIterations: 0,
  qaIterations: 0,
  securityPassed: true,
};
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim();

describe('scratch git trust boundary', () => {
  let root: string;
  let source: string;
  let sibling: string;
  let evil: string;
  let marker: string;
  let wrapper: CommandWrapper | undefined;
  const stages = (directory: string): DevPipelineStages => ({
    implementWorkspace: { directory, accessMode: 'workspace-edit' },
    withWorkspace: (binding) => {
      wrapper = binding.wrapper;
      return stages(binding.directory);
    },
    research: vi.fn(),
    plan: vi.fn(),
    vote: vi.fn(),
    decompose: vi.fn(),
    implement: vi.fn(),
    qaReview: vi.fn(),
    securityScan: vi.fn(),
  });
  beforeEach(() => {
    root = mkdtempOutsideRepo('scratch-git-trust-');
    source = join(root, 'source');
    sibling = join(root, 'scratch');
    evil = join(root, 'evil');
    marker = join(source, 'escaped-marker');
    for (const directory of [source, sibling, evil]) mkdirSync(directory);
    vi.stubEnv('NEXUS_TMPDIR', sibling);
    for (const directory of [source, evil]) {
      git(directory, 'init', '--quiet');
      git(directory, 'config', 'user.name', 'Fixture');
      git(directory, 'config', 'user.email', 'fixture@example.test');
      writeFileSync(join(directory, 'tracked.txt'), 'original\n');
      git(directory, 'add', '--all');
      git(directory, '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
    }
    const script = join(root, 'evil-fsmonitor');
    writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\n`);
    chmodSync(script, 0o755);
    git(evil, 'config', 'core.fsmonitor', script);
    wrapper = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it.each(['gitfile', 'commondir', 'gitdir', 'symlink'])(
    'always refuses a changed %s and disposes only recorded paths',
    async (target) => {
      let originalGitDir = '';
      const sourceIndex = readFileSync(join(source, '.git/index'));
      const output = await withDevPipelineWorkspace(
        stages(source),
        (bound) => {
          const scratch = bound.implementWorkspace?.directory ?? '';
          originalGitDir = git(scratch, 'rev-parse', '--absolute-git-dir');
          const metadata =
            target === 'gitfile' || target === 'symlink'
              ? join(scratch, '.git')
              : join(originalGitDir, target);
          if (target === 'symlink') {
            rmSync(metadata);
            symlinkSync(join(evil, '.git/config'), metadata);
          } else
            writeFileSync(
              metadata,
              target === 'gitfile' ? `gitdir: ${join(evil, '.git')}\n` : `${join(evil, '.git')}\n`
            );
          return Promise.resolve(result);
        },
        vi.fn(),
        () => Promise.resolve({ mode: 'best-effort', reason: 'unit fixture' })
      );
      expect(output.changes?.status).toBe('tampered');
      expect(output.changes?.diff).toBe('');
      expect(output.completed).toBe(false);
      expect(output.warnings).toContainEqual(expect.stringMatching(/metadata.*tampered/i));
      expect(existsSync(marker)).toBe(false);
      expect(readFileSync(join(source, 'tracked.txt'), 'utf8')).toBe('original\n');
      expect(readFileSync(join(source, '.git/index'))).toEqual(sourceIndex);
      expect(existsSync(originalGitDir)).toBe(false);
      expect(readFileSync(join(evil, 'tracked.txt'), 'utf8')).toBe('original\n');
      expect(readFileSync(join(evil, '.git/config'), 'utf8')).toContain('fsmonitor');
      expect(output.changes?.worktreeRemoved).toBe(true);
    }
  );

  it('captures git inside the supplied wrapper with monitor, hooks and diff drivers disabled', async () => {
    const mutableCalls: string[][] = [];
    vi.spyOn(sandboxModule, 'createScratchSandbox').mockResolvedValue({
      wrapper: (command, args, options) => {
        if (command === 'git') mutableCalls.push([...args]);
        return { command, args, options };
      },
      gitEnv: {},
      dispose: () => {},
    });
    const output = await withDevPipelineWorkspace(
      stages(source),
      (bound) => {
        writeFileSync(join(bound.implementWorkspace?.directory ?? '', 'new.txt'), 'new\n');
        return Promise.resolve(result);
      },
      vi.fn(),
      () => Promise.resolve({ mode: 'os-sandbox' })
    );
    expect(output.changes?.diff).toContain('+new');
    expect(mutableCalls).toHaveLength(2);
    for (const args of mutableCalls) {
      expect(args).toContain('core.fsmonitor=false');
      expect(args).toContain('core.hooksPath=/dev/null');
    }
    expect(mutableCalls[1]).toEqual(expect.arrayContaining(['--no-ext-diff', '--no-textconv']));
  });

  it('checks metadata again after intent-to-add before starting diff', async () => {
    const commands: string[] = [];
    vi.spyOn(sandboxModule, 'createScratchSandbox').mockImplementation((scratch) => {
      const gitDir = git(scratch, 'rev-parse', '--absolute-git-dir');
      return Promise.resolve({
        wrapper: (command, args, options) => {
          if (command === 'git') {
            commands.push(args.includes('add') ? 'add' : 'diff');
            if (args.includes('add'))
              writeFileSync(join(gitDir, 'commondir'), `${join(evil, '.git')}\n`);
          }
          return { command, args, options };
        },
        gitEnv: {},
        dispose: () => {},
      });
    });
    const output = await withDevPipelineWorkspace(
      stages(source),
      () => Promise.resolve(result),
      vi.fn(),
      () => Promise.resolve({ mode: 'os-sandbox' })
    );
    expect(output.changes?.status).toBe('tampered');
    expect(output.changes?.diff).toBe('');
    expect(commands).toEqual(['add']);
    expect(existsSync(marker)).toBe(false);
  });

  it.skipIf(availability.mode !== 'os-sandbox').each(['gitfile', 'commondir'])(
    'real bwrap: rejects a sandbox-written %s redirect without host execution',
    async (target) => {
      let originalGitDir = '';
      const output = await withDevPipelineWorkspace(
        stages(source),
        async (bound) => {
          const scratch = bound.implementWorkspace?.directory ?? '';
          originalGitDir = git(scratch, 'rev-parse', '--absolute-git-dir');
          const metadata =
            target === 'gitfile' ? join(scratch, '.git') : join(originalGitDir, target);
          const bytes =
            target === 'gitfile' ? `gitdir: ${join(evil, '.git')}\n` : `${join(evil, '.git')}\n`;
          await execFileTree(
            process.execPath,
            [
              '-e',
              'require("node:fs").writeFileSync(process.argv[1], process.argv[2])',
              metadata,
              bytes,
            ],
            { cwd: scratch, env: process.env, timeoutMs: 10_000, wrapper }
          );
          return result;
        },
        vi.fn(),
        () => Promise.resolve(availability)
      );
      expect(output.changes?.status).toBe('tampered');
      expect(output.changes?.diff).toBe('');
      expect(existsSync(marker)).toBe(false);
      expect(readFileSync(join(source, 'tracked.txt'), 'utf8')).toBe('original\n');
      expect(existsSync(originalGitDir)).toBe(false);
      expect(existsSync(join(evil, '.git'))).toBe(true);
    }
  );

  it('disposal never follows rewritten gitfile, commondir or gitdir files', () => {
    const scratch = createScratchCheckout({
      repoRoot: source,
      sha: git(source, 'rev-parse', 'HEAD'),
      tmpRoot: sibling,
      hermetic: true,
    });
    const originalGitDir = git(scratch.path, 'rev-parse', '--absolute-git-dir');
    writeFileSync(join(scratch.path, '.git'), `gitdir: ${join(evil, '.git')}\n`);
    writeFileSync(join(originalGitDir, 'commondir'), `${join(evil, '.git')}\n`);
    writeFileSync(join(originalGitDir, 'gitdir'), `${join(evil, '.git')}\n`);
    scratch.dispose();
    expect(existsSync(scratch.path)).toBe(false);
    expect(existsSync(originalGitDir)).toBe(false);
    expect(readFileSync(join(evil, 'tracked.txt'), 'utf8')).toBe('original\n');
    expect(existsSync(join(evil, '.git'))).toBe(true);
  });
});
