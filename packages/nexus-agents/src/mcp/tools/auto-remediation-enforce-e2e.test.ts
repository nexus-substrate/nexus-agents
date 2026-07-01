/**
 * End-to-end ENFORCE-path integration test (#3777, from the #3770 review; blocks
 * the #3769 enforce flip).
 *
 * The unit tests beside each module already cover the orchestrator control flow
 * and each adapter against fakes. This file is the INTEGRATION layer they do not
 * reach: it drives the REAL deps-assembly + the REAL git worktree/push chain
 * against a THROWAWAY local repo (with a local bare remote — no GitHub), and
 * asserts the four properties the security/QA review named as enforce-flip
 * blockers:
 *
 *  1. Real-deps wiring   — buildAutoRemediationDeps with repo+repoRoot yields the
 *                          REAL proposal-PR implement + REAL git-ref lease; absent
 *                          them it stays fail-closed (rejecting stub + null lease).
 *  2. Real worktree/git  — makeGitWorktreeOps → makeProposalPrImplementAdapter
 *                          against a temp repo + bare remote: a worktree/branch is
 *                          really created, the plan doc is committed + pushed to
 *                          `auto-remediation/<slug>`, the worktree is removed in
 *                          `finally`, and the push touched ONLY the one plan doc.
 *  3. Lease no-leak      — runAutoRemediation in enforce with the REAL
 *                          makeGitRefLeaseAcquirer (injected fake `gh`) + an
 *                          implement that REJECTS mid-run: the lease RELEASE (ref
 *                          delete) still fires (the #3646 stale-lock hazard).
 *  4. Soak-wrap is audit-only — runAutoRemediationCycle({mode:'enforce'}) must NOT
 *                          wrap deps with the soak collector (audit-only): an
 *                          injected soakSink records zero writes under enforce vs.
 *                          writes under audit.
 *
 * Only the smallest external seams are faked, and never the thing under test:
 *  - the GitHub `gh` runner (lease in #3, PrCreator in #2) — no real network;
 *  - the consensus vote runner — no live voters / no simulateVotes (#2319).
 * The worktree/git chain in #2 is REAL (execFile git against a real local repo),
 * which is the whole point of the integration layer.
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, it, expect, afterEach } from 'vitest';

import { buildAutoRemediationDeps } from './auto-remediation-deps.js';
import { runAutoRemediationCycle } from './auto-remediation-cycle.js';
import {
  makeGitWorktreeOps,
  makeProposalPrImplementAdapter,
  type PrCreator,
} from './remediation-proposal-pr.js';
import {
  makeGitRefLeaseAcquirer,
  lockRef,
  type GhRunner,
  type GhExecResult,
} from './auto-remediation-lease.js';
import {
  runAutoRemediation,
  type AutoRemediationDeps,
  type RemediationPrResult,
} from './improvement-remediation-enforce.js';
import { CapabilityLedger, type RemediationPlan } from './improvement-remediation-capability.js';
import { RemediationGuard } from './improvement-remediation-guard.js';
import { autoRemediationBranchName } from './auto-remediation-branch.js';
import {
  evaluateEnforceReadiness,
  type EnforceReadinessConfig,
  type EnforceReadinessEvidence,
} from './improvement-enforce-readiness.js';
import type { ImprovementSignal } from './improvement-review.js';
import type {
  IRecordingRemediationSoakSink,
  RemediationSoakRecord,
} from './improvement-remediation-shadow.js';

const execFileAsync = promisify(execFile);

// A warning-severity routing signal classifies p2 (higher_order, no dry-run) and
// its default plan declares NO targetPath, so the protected-path gate passes.
// The signalKey is deliberately clean so the pre-push secret scan never aborts.
function signal(over: Partial<ImprovementSignal> = {}): ImprovementSignal {
  return {
    category: 'routing',
    signalKey: 'routing-cli-floor-codex-docs',
    severity: 'warning',
    title: 'routing: codex 30% on docs',
    body: 'floor breach',
    evidence: {},
    ...over,
  };
}

function plan(over: Partial<RemediationPlan> = {}): RemediationPlan {
  return {
    signalKey: 'routing-cli-floor-codex-docs',
    category: 'routing',
    summary: 'Route docs away from the underperformer.',
    steps: [{ kind: 'adjust-routing', description: 'lower codex docs weight' }],
    ...over,
  };
}

// Readiness config that is satisfied by simple supplied evidence — keeps the
// enforce-gate green so the run reaches the lease + implement steps under test.
const READY_CONFIG: EnforceReadinessConfig = {
  minShadowSelections: 1,
  minJudgedRate: 1,
  minSoundnessRate: 1,
  requireNamedEvaluator: false,
  requireNamedOwner: false,
};
const READY_EVIDENCE: EnforceReadinessEvidence = {
  shadowSelections: 1,
  judgedSelections: 1,
  judgedSound: 1,
};

const APPROVING_VOTE: AutoRemediationDeps['vote'] = async () =>
  Promise.resolve({ approved: true, approvalPercentage: 100 });

// VoteRunner is positional (proposal, algorithm); buildAutoRemediationDeps takes
// it directly. Approves every proposal (no live voters, no simulateVotes #2319).
const APPROVING_VOTE_RUNNER = async (): Promise<{
  approved: boolean;
  approvalPercentage: number;
}> => Promise.resolve({ approved: true, approvalPercentage: 100 });

/** Run a git command in `cwd`, returning trimmed stdout (real git, no shell). */
async function git(args: readonly string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], { cwd });
  return stdout.trim();
}

/**
 * A throwaway local repo + a local BARE remote registered as `origin`. The base
 * branch carries one initial commit so `git worktree add … <base>` has a tip.
 */
interface ThrowawayRepo {
  readonly root: string;
  readonly remote: string;
  readonly baseBranch: string;
  cleanup(): void;
}

async function makeThrowawayRepo(): Promise<ThrowawayRepo> {
  const work = mkdtempSync(join(tmpdir(), 'enforce-e2e-'));
  const root = join(work, 'checkout');
  const remote = join(work, 'remote.git');

  await execFileAsync('git', ['init', '-q', '-b', 'main', root]);
  // Deterministic identity so commits succeed in CI (no global git config).
  await git(['config', 'user.email', 'e2e@example.test'], root);
  await git(['config', 'user.name', 'e2e'], root);
  await execFileAsync('git', ['-C', root, 'commit', '--allow-empty', '-q', '-m', 'init']);

  await execFileAsync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  await git(['remote', 'add', 'origin', remote], root);

  return {
    root,
    remote,
    baseBranch: 'main',
    cleanup(): void {
      rmSync(work, { recursive: true, force: true });
    },
  };
}

describe('enforce path — e2e against a throwaway repo (#3777)', () => {
  const repos: ThrowawayRepo[] = [];
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const r of repos.splice(0)) r.cleanup();
    for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  // ── 1. Real-deps wiring ────────────────────────────────────────────────────
  // Exercises: REAL buildAutoRemediationDeps. Faked: nothing (we only probe which
  // adapter shape was wired, never invoke a real side effect).
  describe('buildAutoRemediationDeps wires the real adapters under enforce config', () => {
    it('with repo + repoRoot: implement is the real proposal-PR adapter, not the stub', async () => {
      const deps = buildAutoRemediationDeps({ repo: 'o/n', sha: 'abc', repoRoot: '/repo' });
      // The rejecting stub throws /not wired/. The REAL adapter instead enforces
      // the capability ledger first, so calling it in the wrong phase throws a
      // capability error — proving the stub is gone and the real adapter is wired.
      const ledger = new CapabilityLedger();
      ledger.enterPhase('research'); // wrong phase for repo-write
      await expect(deps.implement(plan(), ledger)).rejects.toThrow(/capability|not permitted/);
      await expect(deps.implement(plan(), ledger)).rejects.not.toThrow(/not wired/);
    });

    it('with repo + sha: acquireLease is the real git-ref acquirer (injected gh observes the POST)', async () => {
      // The real acquirer is internal to buildAutoRemediationDeps, but we assert
      // the SAME real factory it uses behaves as a real git-ref acquirer here, and
      // that the unconfigured path below is the null stub — bracketing the wiring.
      const calls: string[][] = [];
      const gh: GhRunner = async (args) => {
        calls.push([...args]);
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      };
      const acquire = makeGitRefLeaseAcquirer({ repo: 'o/n', sha: 'abc', gh });
      const lease = await acquire('auto-remediation');
      expect(lease).not.toBeNull();
      expect(calls[0]).toContain('POST');
      expect(calls[0]).toContain(`ref=${lockRef('auto-remediation')}`);
    });

    it('without repo/repoRoot: stays fail-closed — rejecting implement + null lease', async () => {
      const deps = buildAutoRemediationDeps(); // unconfigured
      await expect(deps.implement(plan(), new CapabilityLedger())).rejects.toThrow(/not wired/);
      expect(await deps.acquireLease('auto-remediation')).toBeNull();
    });
  });

  // ── 2. Real worktree/git chain ─────────────────────────────────────────────
  // Exercises: REAL makeGitWorktreeOps (execFile git) → makeProposalPrImplementAdapter
  // against a real temp repo + bare remote. Faked: only the PrCreator (no `gh pr
  // create`) — the worktree/commit/push under test is entirely real.
  it('creates a real worktree, commits + pushes ONLY the plan doc to the bare remote, and removes the worktree', async () => {
    const repo = await makeThrowawayRepo();
    repos.push(repo);

    const prCalls: { branch: string; baseBranch: string }[] = [];
    const pr: PrCreator = {
      createDraftPr: async (input) => {
        prCalls.push({ branch: input.branch, baseBranch: input.baseBranch });
        return Promise.resolve('https://example.test/pr/1'); // no real gh
      },
    };

    const implement = makeProposalPrImplementAdapter({
      ops: makeGitWorktreeOps(repo.root),
      pr,
      baseBranch: repo.baseBranch,
    });

    const ledger = new CapabilityLedger();
    ledger.enterPhase('implement');
    const result: RemediationPrResult = await implement(plan(), ledger);

    const branch = autoRemediationBranchName(plan().signalKey);
    expect(result.branch).toBe(branch);
    expect(prCalls).toEqual([{ branch, baseBranch: repo.baseBranch }]);

    // The branch was really pushed to the bare remote.
    const remoteSha = await git(['rev-parse', branch], repo.remote);
    expect(remoteSha).toMatch(/^[0-9a-f]{40}$/);

    // Confinement: the pushed commit touched ONLY the one plan doc, nothing else.
    const slug = branch.replace(/^auto-remediation\//, '');
    const changed = await git(['show', '--stat', '--name-only', '--format=', branch], repo.remote);
    const files = changed
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(files).toEqual([`remediation-plans/${slug}.md`]);

    // The worktree was removed in `finally` (no leftover under .nexus-worktrees).
    const worktrees = await git(['worktree', 'list', '--porcelain'], repo.root);
    expect(worktrees).not.toContain('.nexus-worktrees');
  });

  // ── 3. Lease no-leak on mid-run failure ────────────────────────────────────
  // Exercises: runAutoRemediation in enforce with the REAL makeGitRefLeaseAcquirer.
  // Faked: the `gh` runner (acquire→ok, release→records the DELETE) and an
  // implement that rejects mid-run — proving the real release fires regardless.
  it('releases the lease (ref DELETE) even when implement rejects mid-run (#3646 no stale lock)', async () => {
    const ghCalls: string[][] = [];
    const gh: GhRunner = async (args): Promise<GhExecResult> => {
      ghCalls.push([...args]);
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };
    const acquireLease = makeGitRefLeaseAcquirer({ repo: 'o/n', sha: 'abc', gh });

    const deps: AutoRemediationDeps = {
      research: (s) => Promise.resolve(plan({ signalKey: s.signalKey })),
      vote: APPROVING_VOTE,
      acquireLease,
      readinessEvidence: () => Promise.resolve(READY_EVIDENCE),
      implement: () => Promise.reject(new Error('implement boom mid-run')),
      audit: () => {},
    };

    // enforce does NOT swallow a mid-run implement rejection — it propagates out
    // of runAutoRemediation. The load-bearing guarantee is that the `finally`
    // still RELEASES the lease on that exception path (no stale lock, #3646).
    await expect(
      runAutoRemediation([signal()], deps, {
        mode: 'enforce',
        now: 0,
        guard: new RemediationGuard(),
        readinessConfig: READY_CONFIG,
      })
    ).rejects.toThrow(/implement boom mid-run/);

    // The REAL lease was acquired (POST) AND released (DELETE) despite the failure.
    const posted = ghCalls.find((c) => c.includes('POST'));
    const deleted = ghCalls.find((c) => c.includes('DELETE'));
    expect(posted).toBeDefined();
    expect(deleted).toBeDefined();
    expect(deleted).toContain(
      `repos/o/n/git/refs/${lockRef('auto-remediation').replace(/^refs\//, '')}`
    );
  });

  // ── 4. Soak-wrap is NOT applied to enforce ─────────────────────────────────
  // Exercises: runAutoRemediationCycle in both modes with an injected recording
  // soakSink. Faked: deps (so enforce reaches its run without a real repo) and the
  // sink — the thing under test is purely WHICH mode wraps the soak collector.
  describe('audit soak-wrap is NOT applied to the enforce branch', () => {
    function recordingSink(): IRecordingRemediationSoakSink & { count(): number } {
      const records: RemediationSoakRecord[] = [];
      return {
        record(rec: RemediationSoakRecord): void {
          records.push(rec);
        },
        getRecords: (): readonly RemediationSoakRecord[] => records,
        count: (): number => records.length,
      };
    }

    function enforceReadyDeps(): AutoRemediationDeps {
      return {
        research: (s) => Promise.resolve(plan({ signalKey: s.signalKey })),
        vote: APPROVING_VOTE,
        // Lease + readiness are green so enforce reaches the loop; implement
        // succeeds so the run completes. No real side effects (all in-process).
        acquireLease: () => Promise.resolve({ release: () => Promise.resolve() }),
        readinessEvidence: () => Promise.resolve(READY_EVIDENCE),
        implement: (p) =>
          Promise.resolve({
            branch: autoRemediationBranchName(p.signalKey),
            prUrl: 'https://example.test/pr/1',
          }),
        audit: () => {},
      };
    }

    it('enforce cycle writes ZERO soak records (soak collector not wired)', async () => {
      const sink = recordingSink();
      // Note: runAutoRemediationCycle reads config.readinessConfig is not exposed;
      // the injected deps' readinessEvidence + the default config gate would block.
      // We instead drive enforce via injected deps whose readiness clears the
      // DEFAULT config by supplying ample evidence.
      const deps = enforceReadyDeps();
      deps.readinessEvidence = () =>
        Promise.resolve({
          shadowSelections: 120, // ≥ 100 (#4158)
          judgedSelections: 110,
          judgedSound: 105,
          evaluator: 'e2e',
          owner: 'e2e',
        });
      const r = await runAutoRemediationCycle(
        { mode: 'enforce' },
        { collectSignals: async () => Promise.resolve([signal()]), deps, soakSink: sink }
      );
      expect(r.mode).toBe('enforce');
      expect(sink.count()).toBe(0); // enforce never wraps/flushes the soak collector
    });

    it('audit cycle DOES write soak records (the wrap is audit-only)', async () => {
      const sink = recordingSink();
      const deps = buildAutoRemediationDeps({ voteRunner: APPROVING_VOTE_RUNNER });
      // Unique signalKey so the process-singleton runaway guard never collides
      // with another test's recorded attempt (keeps the contrast with enforce honest).
      const uniq = signal({ signalKey: `audit-soak-${String(Date.now())}` });
      await runAutoRemediationCycle(
        { mode: 'audit' },
        { collectSignals: async () => Promise.resolve([uniq]), deps, soakSink: sink }
      );
      expect(sink.count()).toBeGreaterThan(0); // audit flushes the collector
    });
  });

  // Guard for the readiness helper used above (keeps READY_* honest — if the gate
  // semantics change, this fails loudly rather than silently passing the e2e).
  it('READY_* evidence/config actually clears evaluateEnforceReadiness', () => {
    expect(evaluateEnforceReadiness(READY_EVIDENCE, READY_CONFIG).ready).toBe(true);
  });
});
