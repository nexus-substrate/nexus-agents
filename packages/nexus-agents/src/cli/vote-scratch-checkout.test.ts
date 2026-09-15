/** Regression coverage for ratification panel checkout isolation (#6358). */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NexusError } from '../core/errors.js';

describe('createScratchCheckout', () => {
  let root: string;
  let repoRoot: string;
  let tmpRoot: string;
  let sha: string;
  let subject: typeof import('./vote-scratch-checkout.js');

  const git = (cwd: string, ...args: string[]): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'vote-scratch-test-'));
    repoRoot = join(root, 'repo');
    tmpRoot = join(root, 'scratch');
    mkdirSync(repoRoot);
    mkdirSync(tmpRoot);
    git(repoRoot, 'init', '--initial-branch=main');
    git(repoRoot, 'config', 'user.name', 'Scratch Test');
    git(repoRoot, 'config', 'user.email', 'scratch@example.test');
    git(repoRoot, 'config', 'commit.gpgsign', 'false');
    writeFileSync(join(repoRoot, 'README.md'), 'first commit\n');
    git(repoRoot, 'add', 'README.md');
    git(repoRoot, 'commit', '-m', 'initial');
    sha = git(repoRoot, 'rev-parse', 'HEAD');
    subject = await import('./vote-scratch-checkout.js');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('creates a detached worktree at the requested commit and disposes its registration', () => {
    const scratch = subject.createScratchCheckout({ repoRoot, sha, tmpRoot });
    expect(scratch.path).toMatch(join(tmpRoot, `vote-${sha.slice(0, 12)}-`));
    expect(git(scratch.path, 'rev-parse', 'HEAD')).toBe(sha);
    expect(git(scratch.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
    expect(git(repoRoot, 'worktree', 'list', '--porcelain')).toContain(scratch.path);
    // Dirty seat output must not stop forced cleanup.
    writeFileSync(join(scratch.path, 'seat-output.txt'), 'temporary\n');
    scratch.dispose();
    expect(existsSync(scratch.path)).toBe(false);
    expect(git(repoRoot, 'worktree', 'list', '--porcelain')).not.toContain(scratch.path);
  });

  it('keeps the original HEAD and branch unchanged when a seat checks out another commit', () => {
    writeFileSync(join(repoRoot, 'README.md'), 'second commit\n');
    git(repoRoot, 'commit', '-am', 'second');
    const originalHead = git(repoRoot, 'rev-parse', 'HEAD');
    const originalBranch = git(repoRoot, 'symbolic-ref', 'HEAD');
    const scratch = subject.createScratchCheckout({ repoRoot, sha: originalHead, tmpRoot });
    try {
      // A real subprocess models a seat disobeying the read-only prompt.
      execFileSync('git', ['checkout', sha], { cwd: scratch.path, stdio: 'pipe' });
      expect(git(scratch.path, 'rev-parse', 'HEAD')).toBe(sha);
      expect(git(repoRoot, 'rev-parse', 'HEAD')).toBe(originalHead);
      expect(git(repoRoot, 'symbolic-ref', 'HEAD')).toBe(originalBranch);
    } finally {
      scratch.dispose();
    }
    expect(git(repoRoot, 'rev-parse', 'HEAD')).toBe(originalHead);
  });

  it('throws a typed error with fetch guidance when the commit is missing locally', () => {
    const create = (): unknown =>
      subject.createScratchCheckout({ repoRoot, sha: 'a'.repeat(40), tmpRoot });
    expect(create).toThrow(subject.ScratchCheckoutError);
    expect(create).toThrow(NexusError);
    expect(create).toThrow('fetch it first');
    expect(git(repoRoot, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
  });

  it.each(['', '   '])('rejects the empty SHA case (%j) explicitly', (emptySha) => {
    expect(() => subject.createScratchCheckout({ repoRoot, sha: emptySha, tmpRoot })).toThrow(
      subject.ScratchCheckoutError
    );
  });

  it.each(['--detach', '../../outside', 'HEAD'])(
    'rejects a non-SHA revision (%j)',
    (invalidSha) => {
      expect(() => subject.createScratchCheckout({ repoRoot, sha: invalidSha, tmpRoot })).toThrow(
        subject.ScratchCheckoutError
      );
    }
  );

  it('uses the existing NEXUS_TMPDIR resolver when tmpRoot is omitted', () => {
    vi.stubEnv('NEXUS_TMPDIR', tmpRoot);
    const scratch = subject.createScratchCheckout({ repoRoot, sha });
    expect(scratch.path).toMatch(join(tmpRoot, `vote-${sha.slice(0, 12)}-`));
    scratch.dispose();
  });
});
