/**
 * Dry-run code-PR worktree orchestrator (#3670, Stage 2 — OFF, NO push).
 *
 * COMPOSES the hardened Stage-1 guards ({@link confinePath}, {@link classifyPath},
 * {@link evaluateWriteGuards}, {@link auditAutonomousEvent}) over a PROPOSED change
 * set inside an ISOLATED, throwaway git worktree, then returns a "planned PR
 * descriptor" — what it WOULD push — and ATOMICALLY DISCARDS the worktree. It
 * does NOT reimplement any guard.
 *
 * ABSOLUTE SCOPE LOCK (this stage):
 *  - NO `git push`, NO PR-open, NO write to the live working tree, NO network.
 *    This module imports NO push/PR-open/network surface — it is STRUCTURALLY
 *    incapable of an autonomous external action. The only git it touches is the
 *    local `git worktree add/remove` of a private temp checkout, and a local
 *    `git diff` to realize line counts.
 *  - OFF-by-default with no runtime consumer (see the export marker below). The
 *    actual scoped-token push is Stage 3, gated behind the enable-vote double-gate
 *    in {@link evaluateCodePrEnableReadiness}.
 *
 * Flow (all fail-closed):
 *  1. Create an isolated throwaway worktree under `os.tmpdir()` via
 *     `git worktree add --detach` from the repo (never the live tree).
 *  2. For each change, run {@link confinePath} + {@link classifyPath}. Any
 *     escape or sensitive path → ABORT the WHOLE plan (no partial application),
 *     audit the abort, return a denied plan.
 *  3. Apply the confined, non-sensitive changes inside the worktree only.
 *  4. Realize the diff (files + added/removed line counts) via `git diff`.
 *  5. Run {@link evaluateWriteGuards} (blast-radius, secret-scan, budget). Any
 *     denial → abort fail-closed + audit + denied plan.
 *  6. On success, build the planned PR descriptor, audit `would_open_pr`, return
 *     `{ ok: true, plan, auditRecorded: true }`. DO NOT push or open a PR.
 *  7. ATOMIC DISCARD: a `finally` ALWAYS removes the throwaway worktree (even on
 *     throw). The whole body is wrapped so a throw becomes a denied result.
 *
 * @module mcp/tools/codepr-orchestrator
 */

// @export-no-consumer-yet — see #3670 (Stage 2; consumer/push lands in Stage 3 behind enable-vote)

import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import {
  confinePath,
  classifyPath,
  evaluateWriteGuards,
  auditAutonomousEvent,
  type GuardDenialReason,
  type ChangedFile,
  type BlastRadiusLimits,
  type ResourceBudgetLimits,
  type ResourceUsage,
} from './codepr-guards.js';
import type { IAuditLogger } from '../../audit/audit-types.js';

// ============================================================================
// Input / output shapes
// ============================================================================

/** Zod schema for a single proposed change (a relative path + its new content). */
export const ProposedChangeSchema = z
  .object({
    /** Repo-relative path the change would write. */
    relPath: z.string().min(1),
    /** The full new file content. */
    newContent: z.string(),
  })
  .strict();
export type ProposedChange = z.infer<typeof ProposedChangeSchema>;

/** Zod schema for {@link planCodePrRun}'s input. */
export const CodePrRunInputSchema = z
  .object({
    /** Correlates all audit events for this run. */
    runId: z.string().min(1),
    /** Hash of the source signal (fitness/improvement) that triggered the run. */
    sourceSignalHash: z.string().min(1),
    /** The proposed change set. */
    changes: z.array(ProposedChangeSchema).min(1),
  })
  .strict();
export type CodePrRunInput = z.infer<typeof CodePrRunInputSchema>;

/** Optional knobs for {@link planCodePrRun} (limits + dependency seams for tests). */
export interface CodePrRunOptions {
  /** Absolute path to the repo to spawn the throwaway worktree from. Defaults to cwd. */
  readonly repoRoot?: string | undefined;
  /** Optional blast-radius limits override (passed straight to the guards). */
  readonly blastRadiusLimits?: BlastRadiusLimits | undefined;
  /** Optional resource-budget limits override (passed straight to the guards). */
  readonly resourceLimits?: ResourceBudgetLimits | undefined;
  /** Realized resource usage for the run; defaults to a zero snapshot. */
  readonly usage?: ResourceUsage | undefined;
  /**
   * Test seam: inject a fault at a named phase so the fail-closed + atomic-discard
   * paths are exercisable without a real failure. Undefined in production.
   */
  readonly faultInjector?: ((phase: OrchestratorPhase) => void) | undefined;
}

/** Lifecycle phases a {@link CodePrRunOptions.faultInjector} can target. */
export type OrchestratorPhase = 'after-worktree' | 'after-apply' | 'after-diff';

/** A file in the planned PR descriptor. */
export interface PlannedFile {
  readonly path: string;
  readonly addedLines: number;
  readonly removedLines: number;
}

/** The "planned PR descriptor" — what the run WOULD push (it does NOT push). */
export interface PlannedPrDescriptor {
  /** The branch name the push WOULD use (never created on a remote). */
  readonly branchName: string;
  /** The PR title the open WOULD use. */
  readonly title: string;
  /** Files the change touched, with realized line counts. */
  readonly files: readonly PlannedFile[];
  /** Total files touched. */
  readonly filesTouched: number;
  /** Total changed lines (added + removed). */
  readonly linesTouched: number;
  /** SHA-256 of the realized unified diff (content pinned without storing it). */
  readonly diffHash: string;
}

/** Discriminated plan result. NEVER thrown — a failure is a denied value. */
export type CodePrPlan =
  | { readonly ok: true; readonly plan: PlannedPrDescriptor; readonly auditRecorded: boolean }
  | {
      readonly ok: false;
      readonly reason: GuardDenialReason;
      readonly detail: string;
      readonly auditRecorded: boolean;
    };

// ============================================================================
// Internals
// ============================================================================

const ORCHESTRATOR_USAGE_ZERO: ResourceUsage = { wallClockMs: 0, tokens: 0, toolCalls: 0 };

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** Run git in a given cwd, capturing stdout. Throws on non-zero (caller wraps). */
function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * Parse `git diff --numstat` output into per-file added/removed line counts.
 * A binary file is reported as `-\t-\t<path>`; we count those as 0/0 (the secret
 * scan + blast radius already operate on the realized diff text and paths).
 */
function parseNumstat(numstat: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of numstat.split('\n')) {
    if (line.trim() === '') continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const added = parts[0] === '-' ? 0 : Number.parseInt(parts[0] ?? '0', 10);
    const removed = parts[1] === '-' ? 0 : Number.parseInt(parts[1] ?? '0', 10);
    const path = parts.slice(2).join('\t');
    files.push({
      path,
      addedLines: Number.isFinite(added) ? added : 0,
      removedLines: Number.isFinite(removed) ? removed : 0,
    });
  }
  return files;
}

function denied(
  reason: GuardDenialReason,
  detail: string,
  auditRecorded: boolean
): CodePrPlan {
  return { ok: false, reason, detail, auditRecorded };
}

/** Arguments for {@link auditAbort} (bundled to keep the param count low). */
interface AbortAudit {
  readonly input: CodePrRunInput;
  readonly reason: GuardDenialReason;
  readonly diffHash: string;
  readonly filesTouched: number;
  readonly linesTouched: number;
}

/**
 * Audit a fail-closed abort, returning whether the audit append itself succeeded.
 * Never throws (delegates to {@link auditAutonomousEvent}, which converts a logger
 * throw to a denial result).
 */
function auditAbort(logger: IAuditLogger, a: AbortAudit): boolean {
  const res = auditAutonomousEvent(logger, {
    runId: a.input.runId,
    sourceSignalHash: a.input.sourceSignalHash,
    diffHash: a.diffHash,
    scanVerdict: a.reason === 'secret_detected' ? 'secret_detected' : 'clean',
    filesTouched: a.filesTouched,
    linesTouched: a.linesTouched,
    tokenIdentity: 'none',
    decision: 'abort',
    abortReason: a.reason,
  });
  return res.ok;
}

/**
 * Confine + classify EVERY change BEFORE applying any (no partial application).
 * Returns a denied plan on the first escape/sensitive path, else `undefined`.
 */
function precheckChanges(
  worktreeRoot: string,
  run: CodePrRunInput,
  logger: IAuditLogger
): CodePrPlan | undefined {
  for (const change of run.changes) {
    const confined = confinePath(worktreeRoot, change.relPath);
    if (!confined.ok) {
      const recorded = auditAbort(logger, {
        input: run,
        reason: confined.reason,
        diffHash: sha256(''),
        filesTouched: 0,
        linesTouched: 0,
      });
      return denied(confined.reason, confined.detail, recorded);
    }
    const cls = classifyPath(change.relPath);
    if (cls.sensitive) {
      const recorded = auditAbort(logger, {
        input: run,
        reason: 'sensitive_path',
        diffHash: sha256(''),
        filesTouched: 0,
        linesTouched: 0,
      });
      return denied('sensitive_path', `sensitive path (${cls.category}): ${change.relPath}`, recorded);
    }
  }
  return undefined;
}

/** Apply the (already prechecked) changes inside the worktree, writing to the canonical path. */
function applyChanges(worktreeRoot: string, run: CodePrRunInput): void {
  for (const change of run.changes) {
    // Re-resolve to the canonical path confinePath returned and write THERE
    // (closing the symlink TOCTOU). Precheck guarantees this resolves.
    const confined = confinePath(worktreeRoot, change.relPath);
    if (!confined.ok) throw new Error(`apply: ${confined.detail}`);
    mkdirSync(dirname(confined.resolvedPath), { recursive: true });
    writeFileSync(confined.resolvedPath, change.newContent);
  }
}

/** The realized diff facts for the staged worktree change set. */
interface RealizedDiff {
  readonly diffText: string;
  readonly diffHash: string;
  readonly changedFiles: ChangedFile[];
  readonly linesTouched: number;
}

/** Stage all changes and realize the diff (files + line counts) from the worktree. */
function realizeDiff(worktreeRoot: string): RealizedDiff {
  git(worktreeRoot, ['add', '-A']);
  const diffText = git(worktreeRoot, ['diff', '--cached']);
  const changedFiles = parseNumstat(git(worktreeRoot, ['diff', '--cached', '--numstat']));
  let linesTouched = 0;
  for (const f of changedFiles) linesTouched += f.addedLines + f.removedLines;
  return { diffText, diffHash: sha256(diffText), changedFiles, linesTouched };
}

/** Bundle for {@link runGuardsAndPlan} (kept low to satisfy the param-count rule). */
interface GuardsStageArgs {
  readonly worktreeRoot: string;
  readonly run: CodePrRunInput;
  readonly realized: RealizedDiff;
  readonly usage: ResourceUsage;
  readonly blastRadiusLimits?: BlastRadiusLimits | undefined;
  readonly resourceLimits?: ResourceBudgetLimits | undefined;
}

/**
 * Steps 5–6: compose the hardened write guards over the realized change set, and
 * on success build + audit the planned PR descriptor. Returns a denied plan on any
 * guard denial or a failed audit, else the green plan. NO push.
 */
function runGuardsAndPlan(args: GuardsStageArgs, logger: IAuditLogger): CodePrPlan {
  const { worktreeRoot, run, realized } = args;
  const verdict = evaluateWriteGuards({
    worktreeRoot,
    changedFiles: realized.changedFiles,
    diff: realized.diffText,
    usage: args.usage,
    blastRadiusLimits: args.blastRadiusLimits,
    resourceLimits: args.resourceLimits,
  });
  if (!verdict.ok) {
    const recorded = auditAbort(logger, {
      input: run,
      reason: verdict.reason,
      diffHash: realized.diffHash,
      filesTouched: realized.changedFiles.length,
      linesTouched: realized.linesTouched,
    });
    return denied(verdict.reason, verdict.detail, recorded);
  }

  const plan: PlannedPrDescriptor = {
    branchName: `auto/codepr/${run.runId}`,
    title: `auto code-PR (dry-run, NO push) for run ${run.runId}`,
    files: realized.changedFiles.map((f) => ({
      path: f.path,
      addedLines: f.addedLines,
      removedLines: f.removedLines,
    })),
    filesTouched: realized.changedFiles.length,
    linesTouched: realized.linesTouched,
    diffHash: realized.diffHash,
  };
  const audit = auditAutonomousEvent(logger, {
    runId: run.runId,
    sourceSignalHash: run.sourceSignalHash,
    diffHash: realized.diffHash,
    scanVerdict: 'clean',
    filesTouched: plan.filesTouched,
    linesTouched: plan.linesTouched,
    tokenIdentity: 'none',
    decision: 'would_open_pr',
  });
  if (!audit.ok) {
    // A failed audit is itself fail-closed: do NOT report a green plan.
    return denied(audit.reason, audit.detail, false);
  }
  return { ok: true, plan, auditRecorded: true };
}

// ============================================================================
// Orchestrator
// ============================================================================

/** Mutable holder for the throwaway worktree paths, so the finally can discard them. */
interface WorktreeHandle {
  worktreeRoot?: string;
  tempParent?: string;
}

/**
 * Steps 1–6 inside the throwaway worktree. Records its created paths into
 * `handle` so the caller's finally can discard them even if this throws. Returns
 * a plan (ok or denied); throws only on an unexpected fault (the caller wraps).
 */
function runInWorktree(
  run: CodePrRunInput,
  logger: IAuditLogger,
  options: CodePrRunOptions,
  handle: WorktreeHandle
): CodePrPlan {
  const fault = options.faultInjector;
  const repoRoot = options.repoRoot ?? process.cwd();

  // 1. Isolated throwaway worktree under os.tmpdir() — NEVER the live tree.
  handle.tempParent = realpathSync(mkdtempSync(join(tmpdir(), 'codepr-orchestrator-')));
  handle.worktreeRoot = join(handle.tempParent, 'wt');
  git(repoRoot, ['worktree', 'add', '--detach', handle.worktreeRoot]);
  fault?.('after-worktree');

  // 2. Confine + classify EVERY change before applying any (no partial apply).
  const precheck = precheckChanges(handle.worktreeRoot, run, logger);
  if (precheck !== undefined) return precheck;

  // 3. Apply the confined, non-sensitive changes inside the worktree only.
  applyChanges(handle.worktreeRoot, run);
  fault?.('after-apply');

  // 4. Realize the diff (files + line counts) from the worktree itself.
  const realized = realizeDiff(handle.worktreeRoot);
  fault?.('after-diff');

  // 5–6. Compose the hardened write guards, then build + audit the plan. NO push.
  return runGuardsAndPlan(
    {
      worktreeRoot: handle.worktreeRoot,
      run,
      realized,
      usage: options.usage ?? ORCHESTRATOR_USAGE_ZERO,
      blastRadiusLimits: options.blastRadiusLimits,
      resourceLimits: options.resourceLimits,
    },
    logger
  );
}

/** ATOMIC DISCARD — best-effort remove the throwaway worktree + temp dir. Never throws. */
function discardWorktree(repoRoot: string, handle: WorktreeHandle): void {
  if (handle.worktreeRoot !== undefined) {
    try {
      git(repoRoot, ['worktree', 'remove', '--force', handle.worktreeRoot]);
    } catch {
      // fall through to the rm below (the rmSync still clears residual state)
    }
  }
  if (handle.tempParent !== undefined) {
    try {
      rmSync(handle.tempParent, { recursive: true, force: true });
    } catch {
      // best-effort; the temp dir is under os.tmpdir() and OS-reclaimable
    }
  }
}

/**
 * Plan a dry-run code-PR over `input`'s change set inside an isolated throwaway
 * worktree, composing the Stage-1 guards. Returns a {@link CodePrPlan} — `ok` with
 * a planned PR descriptor (NO push), or a fail-closed denial. NEVER throws and
 * NEVER pushes/opens a PR/writes the live tree; ALWAYS removes the throwaway
 * worktree (atomic discard) in a `finally`.
 *
 * @param input - The proposed change set (Zod-validated; bad shape → denied).
 * @param logger - Hash-chained audit logger (precondition C audit on pass + abort).
 * @param options - Limits + test seams (repo root, fault injector).
 */
export function planCodePrRun(
  input: CodePrRunInput,
  logger: IAuditLogger,
  options: CodePrRunOptions = {}
): CodePrPlan {
  const parsed = CodePrRunInputSchema.safeParse(input);
  if (!parsed.success) {
    // Cannot even audit meaningfully without a runId; fail closed as a value.
    return denied('guard_error', 'invalid code-PR run input (fail-closed)', false);
  }
  const run = parsed.data;
  const repoRoot = options.repoRoot ?? process.cwd();
  const handle: WorktreeHandle = {};

  try {
    return runInWorktree(run, logger, options, handle);
  } catch (err) {
    // Any throw (worktree spawn, git, fs, injected fault) becomes a denial.
    const message = err instanceof Error ? err.message : String(err);
    let recorded = false;
    try {
      recorded = auditAbort(logger, {
        input: run,
        reason: 'guard_error',
        diffHash: sha256(''),
        filesTouched: 0,
        linesTouched: 0,
      });
    } catch {
      recorded = false;
    }
    return denied('guard_error', `orchestrator failed (fail-closed): ${message}`, recorded);
  } finally {
    // 7. ATOMIC DISCARD — always remove the throwaway worktree, even on throw.
    discardWorktree(repoRoot, handle);
  }
}
