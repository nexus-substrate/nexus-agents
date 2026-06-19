/**
 * Tests for the dry-run code-PR worktree orchestrator (#3670, Stage 2 — OFF).
 *
 * The point: prove the orchestrator (a) produces a planned PR descriptor on a
 * small in-bounds change, (b) NEVER pushes/opens a PR (it imports no such
 * surface — asserted structurally over the source), (c) ATOMICALLY DISCARDS the
 * throwaway worktree even on failure/throw, and (d) FAILS CLOSED on a sensitive
 * path, a secret, an over-budget change set, and an induced throw — with NO
 * partial application.
 *
 * Each test spawns its worktree from a REAL throwaway git repo (init'd in tmp),
 * never the live checkout.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, realpathSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { planCodePrRun, type CodePrRunInput, type OrchestratorPhase } from './codepr-orchestrator.js';
import type { IAuditLogger, AuditEventInput } from '../../audit/audit-types.js';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function makeCapturingLogger(): { logger: IAuditLogger; events: AuditEventInput[] } {
  const events: AuditEventInput[] = [];
  const logger: IAuditLogger = {
    log: (input) => {
      events.push(input);
    },
    logToolInvocation: () => {},
    logPolicyDecision: () => {},
    logSecurityEvent: () => {},
    logRateLimitViolation: () => {},
    logTierTransition: () => {},
    flush: async () => {},
    close: async () => {},
  };
  return { logger, events };
}

/** Init a real, committed throwaway git repo to spawn worktrees from. */
function makeRepo(): { repoRoot: string; cleanup: () => void } {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'codepr-orch-repo-')));
  const run = (args: string[]): void => {
    execFileSync('git', args, { cwd: repoRoot, stdio: 'ignore' });
  };
  run(['init', '-b', 'main']);
  run(['config', 'user.email', 'test@example.com']);
  run(['config', 'user.name', 'Test']);
  writeFileSync(join(repoRoot, 'README.md'), '# fixture repo\n');
  run(['add', '-A']);
  run(['commit', '-m', 'init']);
  return {
    repoRoot,
    cleanup: () => {
      rmSync(repoRoot, { recursive: true, force: true });
    },
  };
}

/** List worktrees the repo currently knows about (besides the main one). */
function linkedWorktrees(repoRoot: string): string[] {
  const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length))
    .filter((p) => realpathSync(p) !== repoRoot);
}

/** Count temp dirs the orchestrator may have left behind. */
function residualTempDirs(): string[] {
  return readdirSync(tmpdir()).filter((n) => n.startsWith('codepr-orchestrator-'));
}

let repo: { repoRoot: string; cleanup: () => void };
beforeEach(() => {
  repo = makeRepo();
});
afterEach(() => {
  repo.cleanup();
});

const baseInput = (changes: CodePrRunInput['changes']): CodePrRunInput => ({
  runId: 'run-abc',
  sourceSignalHash: 'sig-hash-123',
  changes,
});

// ----------------------------------------------------------------------------
// Happy path
// ----------------------------------------------------------------------------

describe('planCodePrRun — happy path', () => {
  it('small in-bounds change → ok plan, audit recorded, worktree discarded', () => {
    const { logger, events } = makeCapturingLogger();
    const before = residualTempDirs().length;

    const result = planCodePrRun(
      baseInput([{ relPath: 'src/new-feature.ts', newContent: 'export const x = 1;\n' }]),
      logger,
      { repoRoot: repo.repoRoot }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.auditRecorded).toBe(true);
    expect(result.plan.branchName).toBe('auto/codepr/run-abc');
    expect(result.plan.files.map((f) => f.path)).toEqual(['src/new-feature.ts']);
    expect(result.plan.filesTouched).toBe(1);
    expect(result.plan.linesTouched).toBe(1);
    expect(result.plan.diffHash).toMatch(/^[0-9a-f]{64}$/);

    // Audit recorded a would_open_pr event.
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe('autonomous_code_pr.would_open_pr');

    // The live fixture repo was NOT modified.
    expect(readFileSync(join(repo.repoRoot, 'README.md'), 'utf8')).toBe('# fixture repo\n');
    expect(existsSync(join(repo.repoRoot, 'src/new-feature.ts'))).toBe(false);

    // Worktree discarded: none linked, no residual temp dir.
    expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
    expect(residualTempDirs().length).toBe(before);
  });

  it('the orchestrator source imports NO push/PR-open/network surface', () => {
    const src = readFileSync(new URL('./codepr-orchestrator.ts', import.meta.url), 'utf8');
    // No PR-open or push verbs.
    expect(src).not.toMatch(/git\s*\(\s*[^)]*['"`]push['"`]/);
    expect(src).not.toMatch(/['"`]push['"`]\s*,/);
    expect(src).not.toMatch(/gh\s+pr\s+create|pulls|createPullRequest|octokit|@octokit/i);
    // No network clients.
    expect(src).not.toMatch(/\bfetch\b|node:https?|axios|undici/);
  });
});

// ----------------------------------------------------------------------------
// Fail-closed
// ----------------------------------------------------------------------------

describe('planCodePrRun — fail-closed', () => {
  it('sensitive path (package.json) → denied, no partial apply, worktree discarded', () => {
    const { logger, events } = makeCapturingLogger();
    const result = planCodePrRun(
      baseInput([
        { relPath: 'src/ok.ts', newContent: 'export const ok = 1;\n' },
        { relPath: 'package.json', newContent: '{"name":"x"}\n' },
      ]),
      logger,
      { repoRoot: repo.repoRoot }
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('sensitive_path');
    // Abort was audited.
    expect(events.some((e) => e.action === 'autonomous_code_pr.abort')).toBe(true);
    // No partial application reached the live repo, worktree gone.
    expect(existsSync(join(repo.repoRoot, 'src/ok.ts'))).toBe(false);
    expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
  });

  it('sensitive path (governance/x) → denied', () => {
    const { logger } = makeCapturingLogger();
    const result = planCodePrRun(
      baseInput([{ relPath: 'governance/policy.yaml', newContent: 'x: 1\n' }]),
      logger,
      { repoRoot: repo.repoRoot }
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('sensitive_path');
    expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
  });

  it('path escape (../) → denied path_escape', () => {
    const { logger } = makeCapturingLogger();
    const result = planCodePrRun(
      baseInput([{ relPath: '../escape.ts', newContent: 'export const e = 1;\n' }]),
      logger,
      { repoRoot: repo.repoRoot }
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('path_escape');
    expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
  });

  it('secret in newContent → denied secret_detected via scanDiffOrDeny', () => {
    const { logger } = makeCapturingLogger();
    const result = planCodePrRun(
      baseInput([
        { relPath: 'src/leak.ts', newContent: 'const key = "AKIAIOSFODNN7EXAMPLE";\n' },
      ]),
      logger,
      { repoRoot: repo.repoRoot }
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('secret_detected');
    expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
  });

  it('over-budget change set (too many lines) → denied blast_radius_exceeded', () => {
    const { logger } = makeCapturingLogger();
    const bigContent = `${Array.from({ length: 50 }, (_, i) => `export const v${String(i)} = ${String(i)};`).join('\n')}\n`;
    const result = planCodePrRun(
      baseInput([{ relPath: 'src/big.ts', newContent: bigContent }]),
      logger,
      { repoRoot: repo.repoRoot, blastRadiusLimits: { maxFiles: 20, maxLines: 10 } }
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('blast_radius_exceeded');
    expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
  });

  it.each<OrchestratorPhase>(['after-worktree', 'after-apply', 'after-diff'])(
    'induced throw at %s → denied (not thrown) AND worktree discarded (atomic)',
    (phase) => {
      const { logger } = makeCapturingLogger();
      const before = residualTempDirs().length;
      const result = planCodePrRun(
        baseInput([{ relPath: 'src/ok.ts', newContent: 'export const ok = 1;\n' }]),
        logger,
        {
          repoRoot: repo.repoRoot,
          faultInjector: (p) => {
            if (p === phase) throw new Error(`injected fault at ${p}`);
          },
        }
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected denial');
      expect(result.reason).toBe('guard_error');
      expect(result.detail).toContain('injected fault');
      // Atomic discard held despite the throw.
      expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
      expect(residualTempDirs().length).toBe(before);
    }
  );

  it('invalid input (empty changes) → denied without throwing', () => {
    const { logger } = makeCapturingLogger();
    const result = planCodePrRun(baseInput([]), logger, { repoRoot: repo.repoRoot });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('guard_error');
  });
});
