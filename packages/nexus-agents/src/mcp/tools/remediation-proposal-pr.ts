/**
 * Option B implement adapter — consensus-approved PROPOSAL PR (#3540 phase 3 / #3669).
 *
 * The v1 `AutoRemediationDeps.implement`, per the #3648 vote (B→soak→A). It does
 * NOT autonomously edit code; it commits the consensus-approved typed plan as a
 * reviewable `remediation-plans/<slug>.md` doc on an `auto-remediation/<slug>`
 * branch and opens a draft PR (never auto-merged). A human/coder implements.
 *
 * Safety (vote conditions): the plan doc is **secret-scanned before any push**
 * (#3669 fail-closed — the one gap merge-time guards miss); all writes happen in
 * an **isolated git worktree** (never the live checkout), removed in `finally`
 * so a failed run can't corrupt working state. Orchestration is injectable
 * ({@link WorktreeOps} / {@link PrCreator}) so it's unit-tested without real git.
 *
 * @module mcp/tools/remediation-proposal-pr
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createLogger, type ILogger } from '../../core/index.js';
import type {
  AutoRemediationDeps,
  RemediationPrResult,
} from './improvement-remediation-enforce.js';
import type { RemediationPlan } from './improvement-remediation-capability.js';
import { renderPlanAsResearch, CapabilityLedger } from './improvement-remediation-capability.js';
import { autoRemediationBranchName } from './auto-remediation-branch.js';
import {
  scanForSecrets,
  describeSecretFindings,
  type SecretScanResult,
} from './diff-secret-scan.js';

const execFileAsync = promisify(execFile);

/** Isolated-worktree git operations (injected; real impl uses execFile git). */
export interface WorktreeOps {
  /** Create an isolated worktree on a NEW branch off `baseBranch`; returns its path. */
  addWorktree(branch: string, baseBranch: string): Promise<string>;
  /** Write `relPath` (under the worktree) with `content`. */
  writeFileIn(worktreePath: string, relPath: string, content: string): Promise<void>;
  /** Stage all + commit in the worktree. */
  commitAll(worktreePath: string, message: string): Promise<void>;
  /** Push `branch` to origin from the worktree. */
  pushBranch(worktreePath: string, branch: string): Promise<void>;
  /** Remove the worktree (best-effort cleanup). */
  removeWorktree(worktreePath: string): Promise<void>;
}

/** PR creation (injected; real impl uses `gh pr create`). */
export interface PrCreator {
  createDraftPr(input: {
    branch: string;
    baseBranch: string;
    title: string;
    body: string;
  }): Promise<string>;
}

/** Render the proposal doc (markdown) from the typed plan. Inert; no untrusted text. */
export function buildProposalDoc(plan: RemediationPlan): string {
  return (
    `# Auto-remediation proposal — \`${plan.signalKey}\`\n\n` +
    `> Consensus-approved remediation **proposal** (not auto-implemented). A human ` +
    `or coder implements the steps below; this PR is the reviewable plan.\n\n` +
    `${renderPlanAsResearch(plan)}\n`
  );
}

function planSlug(signalKey: string): string {
  return autoRemediationBranchName(signalKey).replace(/^auto-remediation\//, '');
}

/** Options for the proposal-PR adapter. */
export interface ProposalPrAdapterOptions {
  readonly baseBranch?: string;
  readonly ops: WorktreeOps;
  readonly pr: PrCreator;
  /** Secret scanner (default {@link scanForSecrets}). */
  readonly scan?: (text: string) => SecretScanResult;
  readonly logger?: ILogger;
}

/**
 * Build the Option B {@link AutoRemediationDeps.implement} adapter. Secret-scans
 * the plan doc BEFORE any push (fail-closed), writes it in an isolated worktree,
 * commits, pushes, opens a draft PR, and removes the worktree in `finally`.
 */
export function makeProposalPrImplementAdapter(
  opts: ProposalPrAdapterOptions
): AutoRemediationDeps['implement'] {
  const scan = opts.scan ?? scanForSecrets;
  const baseBranch = opts.baseBranch ?? 'main';
  const logger = opts.logger ?? createLogger({ tool: 'auto-remediation-pr' });

  return async (plan: RemediationPlan, ledger: CapabilityLedger): Promise<RemediationPrResult> => {
    ledger.assertCapability('repo-write'); // IMPLEMENT phase — fail-closed if wrong phase
    const branch = autoRemediationBranchName(plan.signalKey);
    const doc = buildProposalDoc(plan);

    // Pre-push secret scan (#3669) — abort before ANY worktree/push side effect.
    const result = scan(doc);
    if (!result.clean) {
      throw new Error(
        `proposal PR aborted — secrets in plan doc: ${describeSecretFindings(result)}`
      );
    }

    const worktree = await opts.ops.addWorktree(branch, baseBranch);
    try {
      await opts.ops.writeFileIn(worktree, `remediation-plans/${planSlug(plan.signalKey)}.md`, doc);
      await opts.ops.commitAll(worktree, `chore(auto-remediation): proposal for ${plan.signalKey}`);
      await opts.ops.pushBranch(worktree, branch);
      const prUrl = await opts.pr.createDraftPr({
        branch,
        baseBranch,
        title: `auto-remediation proposal: ${plan.signalKey}`,
        body: doc,
      });
      logger.info('auto-remediation proposal PR opened', { branch, prUrl });
      return { branch, prUrl };
    } finally {
      await opts.ops.removeWorktree(worktree).catch((err: unknown) => {
        logger.warn('worktree cleanup failed (non-fatal)', {
          worktree,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  };
}

// ============================================================================
// Real git/gh implementations (execFile, no shell). Side-effecting — not
// unit-tested; the orchestration above is. Used only under enforce (owner-gated).
// ============================================================================

/** Real worktree ops via `git` (no shell). `repoRoot` is the live checkout. */
export function makeGitWorktreeOps(repoRoot: string): WorktreeOps {
  const git = async (args: readonly string[], cwd: string): Promise<void> => {
    await execFileAsync('git', [...args], { cwd });
  };
  return {
    async addWorktree(branch, baseBranch) {
      const path = join(repoRoot, '.nexus-worktrees', branch.replace(/\//g, '_'));
      await git(['worktree', 'add', '-b', branch, path, baseBranch], repoRoot);
      return path;
    },
    async writeFileIn(worktreePath, relPath, content) {
      const abs = join(worktreePath, relPath);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf8');
    },
    async commitAll(worktreePath, message) {
      await git(['add', '-A'], worktreePath);
      await git(['commit', '-m', message], worktreePath);
    },
    async pushBranch(worktreePath, branch) {
      await git(['push', '-u', 'origin', branch], worktreePath);
    },
    async removeWorktree(worktreePath) {
      await git(['worktree', 'remove', worktreePath, '--force'], repoRoot);
    },
  };
}

/** Real PR creation via `gh pr create --draft` (no shell). */
export function makeGhPrCreator(): PrCreator {
  return {
    async createDraftPr({ branch, baseBranch, title, body }) {
      const { stdout } = await execFileAsync('gh', [
        'pr',
        'create',
        '--draft',
        '--head',
        branch,
        '--base',
        baseBranch,
        '--title',
        title,
        '--body',
        body,
      ]);
      return stdout.trim();
    },
  };
}
