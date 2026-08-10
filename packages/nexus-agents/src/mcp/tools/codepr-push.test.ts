/**
 * Tests for the gated code-PR scoped-token PUSH + PR-open (#3670, Stage 3 — OFF).
 *
 * SECURITY-CRITICAL invariants proven here (NO real push — every external seam is
 * mocked):
 *  - NOT ready (flag off / missing vote-ref / soak below min / no owner-ack) →
 *    `not_enabled`, and gitPush/openPullRequest are NEVER called and NO push
 *    worktree is created;
 *  - ready but `NEXUS_CODEPR_TOKEN` absent → `no_credentials`, no push;
 *  - ready + token + clean plan → gitPush to a `nexus-codepr/*` branch (NOT main)
 *    then openPullRequest; audits BEFORE + AFTER; returns ok with the PR ref;
 *  - ready + token but the pre-push `evaluateWriteGuards` re-check DENIES → fail
 *    closed, gitPush NEVER called;
 *  - an induced throw in the push seam → denied (not thrown), worktree cleaned;
 *  - a source/structure assertion that the module has NO merge/auto-merge surface.
 *
 * Each test spawns its worktree from a REAL throwaway git repo (init'd in tmp).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  realpathSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { getNexusTmpDir } from '../../config/nexus-tmp-dir.js';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  executeCodePrPush,
  pushBranchName,
  CODEPR_TOKEN_ENV,
  CODEPR_PUSH_BRANCH_PREFIX,
  defaultGitPush,
  type CodePrPushInput,
  type CodePrPushDeps,
  type OpenedPrRef,
  type OpenPullRequestArgs,
} from './codepr-push.js';
import type { CodePrEnableReadinessConfig } from './codepr-enable-readiness.js';
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
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'codepr-push-repo-')));
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

/** Count temp dirs the push module may have left behind. */
function residualPushTempDirs(): string[] {
  return readdirSync(getNexusTmpDir()).filter(
    (n) => n.startsWith('codepr-push-') && !n.includes('repo')
  );
}

/** A mock deps bundle that records every external-seam call. */
interface MockDeps {
  deps: CodePrPushDeps;
  gitPush: ReturnType<typeof vi.fn>;
  openPullRequest: ReturnType<typeof vi.fn>;
  events: AuditEventInput[];
}

function makeMockDeps(opts: {
  soak: number;
  pr?: OpenedPrRef;
  gitPushImpl?: (branch: string, worktreeRoot: string, token: string) => void;
}): MockDeps {
  const { logger, events } = makeCapturingLogger();
  const pr = opts.pr ?? { number: 42, url: 'https://example.com/org/repo/pull/42' };
  const gitPush = vi.fn(
    opts.gitPushImpl ??
      ((_b: string, _w: string, _t: string) => {
        /* mock: no real push */
      })
  );
  const openPullRequest = vi.fn((_a: OpenPullRequestArgs): OpenedPrRef => pr);
  const deps: CodePrPushDeps = {
    gitPush,
    openPullRequest,
    logger,
    readSoak: () => opts.soak,
  };
  return { deps, gitPush, openPullRequest, events };
}

// Own scratch root so the leak detector above counts only this process's
// dirs. `codepr-armed-not-active.test.ts` also drives the push path, and
// concurrent workers sharing one root make the before/after delta a race —
// see the longer note in codepr-orchestrator.test.ts.
let scratchRoot: string;
let savedTmpEnv: string | undefined;

let repo: { repoRoot: string; cleanup: () => void };
beforeEach(() => {
  savedTmpEnv = process.env['NEXUS_TMPDIR'];
  scratchRoot = mkdtempSync(join(getNexusTmpDir(), 'codepr-push-scope-'));
  process.env['NEXUS_TMPDIR'] = scratchRoot;
  repo = makeRepo();
});
afterEach(() => {
  repo.cleanup();
  vi.unstubAllEnvs();
  if (savedTmpEnv === undefined) delete process.env['NEXUS_TMPDIR'];
  else process.env['NEXUS_TMPDIR'] = savedTmpEnv;
  rmSync(scratchRoot, { recursive: true, force: true });
});

// A low soak bar so a small soak value satisfies the gate in tests.
const readinessConfig: CodePrEnableReadinessConfig = {
  minGuardsGreenSoak: 3,
  requireEnableVoteRef: true,
  requireOwnerAck: true,
};

const baseInput = (over: Partial<CodePrPushInput> = {}): CodePrPushInput => ({
  run: {
    runId: 'run-xyz',
    sourceSignalHash: 'sig-hash-1',
    changes: [{ relPath: 'src/feature.ts', newContent: 'export const x = 1;\n' }],
  },
  readiness: { flagEnabled: true, enableVoteRef: 'vote-123', owner: 'alice' },
  prTitle: 'auto code-PR',
  prBody: 'body',
  repoRoot: repo.repoRoot,
  readinessConfig,
  ...over,
});

// ----------------------------------------------------------------------------
// Step 1 — readiness gate (not_enabled): no push, no worktree
// ----------------------------------------------------------------------------

describe('executeCodePrPush — readiness gate (step 1)', () => {
  it('flag OFF → not_enabled, NO push, NO worktree created', () => {
    const m = makeMockDeps({ soak: 100 });
    const before = residualPushTempDirs().length;
    const result = executeCodePrPush(
      baseInput({ readiness: { flagEnabled: false, enableVoteRef: 'v', owner: 'alice' } }),
      m.deps
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('not_enabled');
    expect(result.detail).toContain('flag-enabled');
    expect(m.gitPush).not.toHaveBeenCalled();
    expect(m.openPullRequest).not.toHaveBeenCalled();
    expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
    expect(residualPushTempDirs().length).toBe(before);
    // The refusal was audited (decision: abort).
    expect(m.events.some((e) => e.action === 'autonomous_code_pr.abort')).toBe(true);
  });

  it('missing enable-vote-ref → not_enabled, NO push', () => {
    const m = makeMockDeps({ soak: 100 });
    const result = executeCodePrPush(
      baseInput({ readiness: { flagEnabled: true, enableVoteRef: '  ', owner: 'alice' } }),
      m.deps
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('not_enabled');
    expect(result.detail).toContain('enable-vote-ref');
    expect(m.gitPush).not.toHaveBeenCalled();
    expect(m.openPullRequest).not.toHaveBeenCalled();
  });

  it('soak below min → not_enabled, NO push', () => {
    const m = makeMockDeps({ soak: 1 }); // min is 3
    const result = executeCodePrPush(baseInput(), m.deps);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('not_enabled');
    expect(result.detail).toContain('guards-green-soak');
    expect(m.gitPush).not.toHaveBeenCalled();
  });

  it('no owner-ack → not_enabled, NO push', () => {
    const m = makeMockDeps({ soak: 100 });
    const result = executeCodePrPush(
      baseInput({ readiness: { flagEnabled: true, enableVoteRef: 'v', owner: '' } }),
      m.deps
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('not_enabled');
    expect(result.detail).toContain('owner-ack');
    expect(m.gitPush).not.toHaveBeenCalled();
  });

  it('readiness gate runs BEFORE credentials — not_enabled even with a token set', () => {
    vi.stubEnv(CODEPR_TOKEN_ENV, 'tok-present');
    const m = makeMockDeps({ soak: 100 });
    const result = executeCodePrPush(
      baseInput({ readiness: { flagEnabled: false, enableVoteRef: 'v', owner: 'a' } }),
      m.deps
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('not_enabled');
    expect(m.gitPush).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Step 2 — credentials required
// ----------------------------------------------------------------------------

describe('executeCodePrPush — credentials gate (step 2)', () => {
  it('ready but NEXUS_CODEPR_TOKEN absent → no_credentials, NO push', () => {
    vi.stubEnv(CODEPR_TOKEN_ENV, '');
    const m = makeMockDeps({ soak: 100 });
    const result = executeCodePrPush(baseInput(), m.deps);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('no_credentials');
    expect(m.gitPush).not.toHaveBeenCalled();
    expect(m.openPullRequest).not.toHaveBeenCalled();
    expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
  });

  it('ready but token is whitespace-only → no_credentials', () => {
    vi.stubEnv(CODEPR_TOKEN_ENV, '   ');
    const m = makeMockDeps({ soak: 100 });
    const result = executeCodePrPush(baseInput(), m.deps);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('no_credentials');
    expect(m.gitPush).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Happy path — ready + token + clean plan
// ----------------------------------------------------------------------------

describe('executeCodePrPush — happy path (ready + token + clean plan)', () => {
  it('pushes a nexus-codepr/* feature branch (NOT main) then opens a PR; audits before+after', () => {
    vi.stubEnv(CODEPR_TOKEN_ENV, 'scoped-token-abc');
    const m = makeMockDeps({ soak: 100 });
    const before = residualPushTempDirs().length;

    const result = executeCodePrPush(baseInput(), m.deps);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.pr).toEqual({ number: 42, url: 'https://example.com/org/repo/pull/42' });
    expect(result.branch).toBe('nexus-codepr/run-xyz');
    expect(result.diffHash).toMatch(/^[0-9a-f]{64}$/);

    // gitPush was called with a feature branch (NOT main) and the scoped token.
    expect(m.gitPush).toHaveBeenCalledTimes(1);
    const [branchArg, worktreeArg, tokenArg] = m.gitPush.mock.calls[0] as [string, string, string];
    expect(branchArg).toBe('nexus-codepr/run-xyz');
    expect(branchArg.startsWith(CODEPR_PUSH_BRANCH_PREFIX)).toBe(true);
    expect(branchArg).not.toBe('main');
    expect(branchArg).not.toBe('master');
    expect(tokenArg).toBe('scoped-token-abc');
    expect(typeof worktreeArg).toBe('string');

    // openPullRequest was called AFTER gitPush with the same feature branch.
    expect(m.openPullRequest).toHaveBeenCalledTimes(1);
    const prArgs = m.openPullRequest.mock.calls[0]?.[0] as OpenPullRequestArgs;
    expect(prArgs.branch).toBe('nexus-codepr/run-xyz');
    expect(prArgs.token).toBe('scoped-token-abc');
    expect(m.gitPush.mock.invocationCallOrder[0]).toBeLessThan(
      m.openPullRequest.mock.invocationCallOrder[0] ?? Infinity
    );

    // Audited BOTH before (intent) and after (result) by the PUSH actor (distinct
    // from the dry-run orchestrator's own would_open_pr audit).
    const pushAudits = m.events.filter(
      (e) =>
        e.action === 'autonomous_code_pr.would_open_pr' && e.actor?.id === 'autonomous-code-pr-push'
    );
    expect(pushAudits.length).toBe(2);
    // Both push audits pin a non-secret token identity (NOT the raw token).
    for (const a of pushAudits) {
      expect(a.metadata?.['tokenIdentity']).toMatch(/^codepr-token:[0-9a-f]{12}$/);
    }
    // The "intent" audit (branch in actor name) was recorded before the push.
    expect(pushAudits[0]?.actor?.name).toContain('intent');
    // The "result" audit names the opened PR number.
    expect(pushAudits[1]?.actor?.name).toContain('#42');
    expect(JSON.stringify(m.events)).not.toContain('scoped-token-abc');

    // Worktree discarded; live repo untouched.
    expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
    expect(residualPushTempDirs().length).toBe(before);
    expect(existsSync(join(repo.repoRoot, 'src/feature.ts'))).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Pre-push guard re-check DENIES → fail-closed, gitPush NEVER called
// ----------------------------------------------------------------------------

describe('executeCodePrPush — pre-push guard re-check (step 3, defense-in-depth)', () => {
  it('a sensitive path that slips into the change set → pre_push_guard_denied, gitPush NEVER called', () => {
    vi.stubEnv(CODEPR_TOKEN_ENV, 'scoped-token-abc');
    const m = makeMockDeps({ soak: 100 });
    // A dry-run plan stub that REPORTS ok (simulating the earlier verdict being
    // trusted) while the realized change set actually touches a sensitive path.
    // The pre-push evaluateWriteGuards re-check must catch it regardless.
    const result = executeCodePrPush(
      baseInput({
        run: {
          runId: 'run-xyz',
          sourceSignalHash: 'sig-hash-1',
          changes: [{ relPath: 'package.json', newContent: '{"name":"x"}\n' }],
        },
      }),
      {
        ...m.deps,
        // Force the dry-run plan to pass so ONLY the pre-push re-check can stop it.
        planRun: (_input, _logger, _options) => ({
          ok: true as const,
          plan: {
            branchName: 'auto/codepr/run-xyz',
            title: 't',
            files: [],
            filesTouched: 0,
            linesTouched: 0,
            diffHash: 'x',
          },
          auditRecorded: true,
        }),
      }
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('pre_push_guard_denied');
    expect(result.detail).toContain('sensitive_path');
    expect(m.gitPush).not.toHaveBeenCalled();
    expect(m.openPullRequest).not.toHaveBeenCalled();
    expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
  });

  it('dry-run plan itself denies (real planCodePrRun on a sensitive path) → plan_denied, NO push', () => {
    vi.stubEnv(CODEPR_TOKEN_ENV, 'scoped-token-abc');
    const m = makeMockDeps({ soak: 100 }); // uses the real planCodePrRun default
    const result = executeCodePrPush(
      baseInput({
        run: {
          runId: 'run-xyz',
          sourceSignalHash: 'sig-hash-1',
          changes: [{ relPath: 'governance/policy.yaml', newContent: 'x: 1\n' }],
        },
      }),
      m.deps
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('plan_denied');
    expect(m.gitPush).not.toHaveBeenCalled();
    expect(m.openPullRequest).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Induced throw in the push seam → denied (not thrown), worktree cleaned
// ----------------------------------------------------------------------------

describe('executeCodePrPush — push seam throws (atomic cleanup)', () => {
  it('gitPush throws → push_failed (not thrown) AND worktree discarded', () => {
    vi.stubEnv(CODEPR_TOKEN_ENV, 'scoped-token-abc');
    const before = residualPushTempDirs().length;
    const m = makeMockDeps({
      soak: 100,
      gitPushImpl: () => {
        throw new Error('simulated push network failure');
      },
    });
    const result = executeCodePrPush(baseInput(), m.deps);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('push_failed');
    expect(result.detail).toContain('simulated push network failure');
    // openPullRequest never reached after the push seam threw.
    expect(m.openPullRequest).not.toHaveBeenCalled();
    // Atomic discard held despite the throw.
    expect(linkedWorktrees(repo.repoRoot)).toEqual([]);
    expect(residualPushTempDirs().length).toBe(before);
  });
});

// ----------------------------------------------------------------------------
// Structure / source — NO merge or auto-merge surface
// ----------------------------------------------------------------------------

describe('executeCodePrPush — never-merge / branch-name invariants', () => {
  it('the module source CODE has NO merge / auto-merge / force-push / protection surface', () => {
    const raw = readFileSync(new URL('./codepr-push.ts', import.meta.url).pathname, 'utf8');
    // Strip block + line comments so the assertion tests EXECUTABLE code only
    // (the doc comments legitimately use the words "merge"/"auto-merge"/"protections"
    // to DOCUMENT their absence; the invariant is about the code, not the prose).
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // No merge verbs of any kind in code.
    expect(code).not.toMatch(/\bmerge\b/i);
    expect(code).not.toMatch(/--merge\b|auto-?merge|enableAutoMerge|mergePullRequest/i);
    // No force-PUSH (a `push` arg list containing a force flag), no protection mutation.
    // (`worktree remove --force` / `rmSync({force})` are legitimate cleanup, not a force-push.)
    expect(code).not.toMatch(/--force-with-lease/i);
    expect(code).not.toMatch(/['"]push['"][^\n]*--force/i);
    expect(code).not.toMatch(/branch.?protection|protected.?branch/i);
    // The push refspec only ever targets a nexus-codepr feature branch.
    expect(code).toContain('nexus-codepr/');
  });

  it('pushBranchName always yields a nexus-codepr/<runId> branch (never main)', () => {
    expect(pushBranchName('run-1')).toBe('nexus-codepr/run-1');
    expect(pushBranchName('main')).toBe('nexus-codepr/main'); // even "main" runId is namespaced
    expect(pushBranchName('run-1').startsWith(CODEPR_PUSH_BRANCH_PREFIX)).toBe(true);
  });

  it('defaultGitPush REFUSES to push a non-codepr branch (e.g. main) — fail-closed', () => {
    expect(() => {
      defaultGitPush('main', repo.repoRoot, 'tok');
    }).toThrow(/non-codepr|default branch/i);
    expect(() => {
      defaultGitPush('feature/x', repo.repoRoot, 'tok');
    }).toThrow(/non-codepr/i);
  });
});
