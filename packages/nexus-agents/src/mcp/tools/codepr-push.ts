/**
 * Code-PR scoped-token PUSH + PR-open (#3670, Stage 3 — OFF, SECURITY-CRITICAL).
 *
 * This is the ONLY module in the code-PR capability loop that can take an
 * EXTERNAL action (a `git push` to a NEW feature branch + a PR open). It ships
 * OFF-by-default and DOUBLE-GATED: a push is IMPOSSIBLE unless ALL of the
 * enable-readiness criteria pass ({@link evaluateCodePrEnableReadiness} — flag +
 * enable-vote ref + guards-green soak ≥ min + named owner-ack) AND an explicit
 * scoped credential is present in the environment ({@link CODEPR_TOKEN_ENV}).
 * Either block alone refuses the push.
 *
 * STRICT FAIL-CLOSED SEQUENCE ({@link executeCodePrPush}) — every step returns a
 * discriminated denial value; the module NEVER throws (a throw is wrapped into a
 * denied result):
 *  1. **Readiness gate FIRST.** Assemble the enable-readiness evidence (explicit
 *     flag, enable-vote ref, `guardsGreenSoak` from {@link readCodePrGuardsGreenSoak},
 *     owner-ack) and call {@link evaluateCodePrEnableReadiness}. NOT ready →
 *     `not_enabled` and DO NOTHING ELSE (no worktree, no push). Audit the refusal.
 *  2. **Credentials required.** The push seam requires a non-empty token from
 *     {@link CODEPR_TOKEN_ENV}. Absent/empty → `no_credentials`, no push. (So even
 *     when enabled, no token = no action.)
 *  3. **Produce + re-validate the plan.** Call {@link planCodePrRun} (dry-run) to
 *     build the plan in an isolated worktree it discards. Then re-realize the diff
 *     in a FRESH push worktree and RE-RUN {@link evaluateWriteGuards} on it
 *     immediately before push (defense-in-depth — never trust the earlier
 *     verdict). Any denial → fail-closed, audit, NO push.
 *  4. **Push via INJECTABLE seams** ({@link CodePrPushDeps.gitPush} +
 *     {@link CodePrPushDeps.openPullRequest}). The production seams push ONLY to a
 *     NEW feature branch `nexus-codepr/<runId>`, NEVER to main, NEVER merge, NEVER
 *     alter protections, and use the scoped token. The PR is a normal
 *     feature-branch PR subject to CI + CODEOWNERS. There is NO merge call here.
 *  5. **Audit (hash-chained) BOTH** before the push (intent: branch, diff hash,
 *     token identity) and after (result: PR url/number) via {@link auditAutonomousEvent}.
 *  6. **Atomic cleanup**: the push worktree is discarded in a `finally`.
 *
 * NOT WIRED to any live runtime trigger / auto-remediation enforce path — it is a
 * gated capability only. Activation still requires the enable-vote + a real soak +
 * owner-ack via the readiness gate (none triggered here).
 *
 * @module mcp/tools/codepr-push
 */

// @export-no-consumer-yet — see #3670 (Stage 3; activation requires enable-vote + soak + owner-ack)

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { nexusMkdtempSync } from '../../config/nexus-tmp-dir.js';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  confinePath,
  evaluateWriteGuards,
  auditAutonomousEvent,
  type ChangedFile,
  type BlastRadiusLimits,
  type ResourceBudgetLimits,
  type ResourceUsage,
} from './codepr-guards.js';
import {
  planCodePrRun,
  type CodePrRunInput,
  type CodePrRunOptions,
} from './codepr-orchestrator.js';
import {
  evaluateCodePrEnableReadiness,
  type CodePrEnableReadinessConfig,
} from './codepr-enable-readiness.js';
import { readCodePrGuardsGreenSoak } from './codepr-soak-store.js';
import type { IAuditLogger } from '../../audit/audit-types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * The ONLY environment variable the push seam reads a credential from. An
 * absent/empty value is a hard `no_credentials` refusal (step 2) — so even a
 * fully-enabled gate cannot push without an explicit, operator-provisioned token.
 */
export const CODEPR_TOKEN_ENV = 'NEXUS_CODEPR_TOKEN' as const;

/** The MANDATORY feature-branch prefix. A push is confined to `nexus-codepr/<runId>`. */
export const CODEPR_PUSH_BRANCH_PREFIX = 'nexus-codepr/' as const;

/** Zero usage snapshot used for the pre-push guard re-check when none supplied. */
const PUSH_USAGE_ZERO: ResourceUsage = { wallClockMs: 0, tokens: 0, toolCalls: 0 };

// ============================================================================
// Input / output / deps shapes
// ============================================================================

/**
 * The enable-readiness evidence the caller supplies EXPLICITLY (the flag is NOT
 * read from env here — the gate stays a pure, testable decision). The
 * `guardsGreenSoak` value is read from {@link readCodePrGuardsGreenSoak} inside
 * {@link executeCodePrPush}, NOT taken from this input — the caller cannot forge
 * the soak streak.
 */
export interface CodePrPushReadiness {
  /** The explicit OFF→on flag (flag half of the double-gate; true alone is never enough). */
  readonly flagEnabled: boolean;
  /** A recorded enable-vote ref (vote half). Empty/whitespace = absent. */
  readonly enableVoteRef: string;
  /** A named owner accepting activation (owner half). Empty/whitespace = absent. */
  readonly owner: string;
}

/** Input to {@link executeCodePrPush}. */
export interface CodePrPushInput {
  /** The proposed change set + run identity (forwarded to {@link planCodePrRun}). */
  readonly run: CodePrRunInput;
  /** The explicitly-supplied enable-readiness evidence (flag/vote/owner). */
  readonly readiness: CodePrPushReadiness;
  /** PR title for the opened pull request. */
  readonly prTitle: string;
  /** PR body for the opened pull request. */
  readonly prBody: string;
  /** Absolute repo root to spawn worktrees from. Defaults to cwd. */
  readonly repoRoot?: string | undefined;
  /** Optional enable-readiness config override (e.g. a lower soak bar in tests). */
  readonly readinessConfig?: CodePrEnableReadinessConfig | undefined;
  /** Optional blast-radius limits forwarded to the plan + the pre-push re-check. */
  readonly blastRadiusLimits?: BlastRadiusLimits | undefined;
  /** Optional resource-budget limits forwarded to the plan + the pre-push re-check. */
  readonly resourceLimits?: ResourceBudgetLimits | undefined;
  /** Realized usage snapshot for the pre-push budget re-check; defaults to zero. */
  readonly usage?: ResourceUsage | undefined;
}

/** The realized PR reference returned by a successful push. */
export interface OpenedPrRef {
  /** The PR number assigned by the forge. */
  readonly number: number;
  /** The PR URL. */
  readonly url: string;
}

/** Arguments to the {@link CodePrPushDeps.openPullRequest} seam. */
export interface OpenPullRequestArgs {
  /** The feature branch the PR is opened FROM (always `nexus-codepr/<runId>`). */
  readonly branch: string;
  readonly title: string;
  readonly body: string;
  /** The scoped token (never logged; only the non-secret identity is audited). */
  readonly token: string;
}

/**
 * The injectable external-action seams. Tests pass mocks (NO real push in CI). The
 * production defaults ({@link defaultGitPush}, {@link defaultOpenPullRequest}) push
 * ONLY to a new `nexus-codepr/<runId>` feature branch and NEVER merge.
 */
export interface CodePrPushDeps {
  /** Push the worktree's committed branch to the remote. NEW branch only; never main. */
  readonly gitPush: (branch: string, worktreeRoot: string, token: string) => void;
  /** Open a normal feature-branch PR (subject to CI + CODEOWNERS). NEVER merges. */
  readonly openPullRequest: (args: OpenPullRequestArgs) => OpenedPrRef;
  /** Hash-chained audit logger (intent + result records). */
  readonly logger: IAuditLogger;
  /**
   * Test seam: override the soak read. Defaults to {@link readCodePrGuardsGreenSoak}.
   * Production leaves this undefined (reads the durable soak store).
   */
  readonly readSoak?: (() => number) | undefined;
  /** Test seam: override the dry-run plan invocation. Defaults to {@link planCodePrRun}. */
  readonly planRun?: typeof planCodePrRun | undefined;
}

/** Why a push was refused (fail-closed). NEVER thrown — a refusal is a value. */
export type CodePrPushReason =
  | 'not_enabled'
  | 'no_credentials'
  | 'plan_denied'
  | 'pre_push_guard_denied'
  | 'push_failed'
  | 'audit_failed';

/** Discriminated push result. NEVER thrown — a failure is a denied value. */
export type CodePrPushResult =
  | {
      readonly ok: true;
      readonly pr: OpenedPrRef;
      readonly branch: string;
      readonly diffHash: string;
    }
  | { readonly ok: false; readonly reason: CodePrPushReason; readonly detail: string };

// ============================================================================
// Internals
// ============================================================================

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function pushDenied(reason: CodePrPushReason, detail: string): CodePrPushResult {
  return { ok: false, reason, detail };
}

/** The feature branch a run pushes to. ALWAYS `nexus-codepr/<runId>` — never main. */
export function pushBranchName(runId: string): string {
  return `${CODEPR_PUSH_BRANCH_PREFIX}${runId}`;
}

/**
 * A non-secret identity label for the scoped token, for the audit record. Derived
 * as a short SHA-256 prefix so the audit pins WHICH credential was used without
 * EVER recording the secret value itself.
 */
function tokenIdentity(token: string): string {
  return `codepr-token:${sha256(token).slice(0, 12)}`;
}

/** Parse `git diff --numstat` into per-file counts (binary files count as 0/0). */
function parseNumstat(numstat: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of numstat.split('\n')) {
    if (line.trim() === '') continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const added = parts[0] === '-' ? 0 : Number.parseInt(parts[0] ?? '0', 10);
    const removed = parts[1] === '-' ? 0 : Number.parseInt(parts[1] ?? '0', 10);
    files.push({
      path: parts.slice(2).join('\t'),
      addedLines: Number.isFinite(added) ? added : 0,
      removedLines: Number.isFinite(removed) ? removed : 0,
    });
  }
  return files;
}

/** Audit a fail-closed refusal/denial (decision `abort`). Best-effort; never throws. */
function auditRefusal(
  logger: IAuditLogger,
  run: CodePrRunInput,
  reason: string,
  diffHash: string
): void {
  try {
    auditAutonomousEvent(logger, {
      runId: run.runId,
      sourceSignalHash: run.sourceSignalHash,
      diffHash,
      scanVerdict: 'clean',
      filesTouched: 0,
      linesTouched: 0,
      tokenIdentity: 'none',
      decision: 'abort',
      abortReason: 'guard_error',
      actor: {
        type: 'system',
        id: 'autonomous-code-pr-push',
        name: `code-PR push refused (${reason})`,
      },
    });
  } catch {
    // Auditing the refusal is best-effort; the refusal itself already stands.
  }
}

// ============================================================================
// Step 1 — readiness gate
// ============================================================================

/**
 * Step 1: evaluate the enable-readiness DOUBLE-GATE. The `guardsGreenSoak` is read
 * from the durable soak store (NOT from caller input — the streak cannot be
 * forged). Returns a `not_enabled` denial (audited) when NOT ready, else undefined.
 */
function checkReadiness(
  input: CodePrPushInput,
  deps: CodePrPushDeps
): CodePrPushResult | undefined {
  const readSoak = deps.readSoak ?? readCodePrGuardsGreenSoak;
  const consecutiveGreenDryRuns = readSoak();
  const verdict = evaluateCodePrEnableReadiness(
    {
      flagEnabled: input.readiness.flagEnabled,
      enableVoteRef: input.readiness.enableVoteRef,
      consecutiveGreenDryRuns,
      owner: input.readiness.owner,
    },
    input.readinessConfig
  );
  if (verdict.ready) return undefined;
  auditRefusal(deps.logger, input.run, 'not_enabled', sha256(''));
  return pushDenied(
    'not_enabled',
    `enable-readiness not satisfied: blockers=[${verdict.blockers.join(', ')}]`
  );
}

// ============================================================================
// Steps 3–4 — realize in a fresh worktree, re-guard, push
// ============================================================================

/** Mutable holder for the push worktree paths so a `finally` can discard them. */
interface PushWorktree {
  worktreeRoot?: string;
  tempParent?: string;
}

/** The realized diff for the committed push branch. */
interface RealizedPush {
  readonly diffText: string;
  readonly diffHash: string;
  readonly changedFiles: ChangedFile[];
  readonly linesTouched: number;
}

/**
 * Create a fresh isolated worktree on a NEW `nexus-codepr/<runId>` branch, apply
 * the confined changes, and commit them. Records the worktree paths into `handle`
 * for the caller's `finally`. The branch is checked out via `worktree add -b` so
 * the push seam pushes a NEW branch — never main.
 */
function realizeInPushWorktree(
  input: CodePrPushInput,
  branch: string,
  handle: PushWorktree
): RealizedPush {
  const repoRoot = input.repoRoot ?? process.cwd();
  handle.tempParent = realpathSync(nexusMkdtempSync('codepr-push-'));
  handle.worktreeRoot = join(handle.tempParent, 'wt');
  // `-b <branch>` creates the NEW feature branch in the throwaway worktree.
  git(repoRoot, ['worktree', 'add', '-b', branch, handle.worktreeRoot, 'HEAD']);

  for (const change of input.run.changes) {
    const confined = confinePath(handle.worktreeRoot, change.relPath);
    if (!confined.ok) throw new Error(`confine failed: ${confined.detail}`);
    mkdirSync(dirname(confined.resolvedPath), { recursive: true });
    writeFileSync(confined.resolvedPath, change.newContent);
  }
  git(handle.worktreeRoot, ['add', '-A']);
  const diffText = git(handle.worktreeRoot, ['diff', '--cached']);
  const changedFiles = parseNumstat(git(handle.worktreeRoot, ['diff', '--cached', '--numstat']));
  let linesTouched = 0;
  for (const f of changedFiles) linesTouched += f.addedLines + f.removedLines;
  // Commit so there is a branch tip to push (no merge, no push here).
  git(handle.worktreeRoot, [
    '-c',
    'user.email=autonomous-code-pr@nexus.local',
    '-c',
    'user.name=Autonomous Code-PR',
    'commit',
    '-m',
    `${input.prTitle}\n\nrunId: ${input.run.runId}`,
  ]);
  return { diffText, diffHash: sha256(diffText), changedFiles, linesTouched };
}

/** Discard the push worktree + temp dir. Best-effort; never throws. */
function discardPushWorktree(repoRoot: string, handle: PushWorktree): void {
  if (handle.worktreeRoot !== undefined) {
    try {
      git(repoRoot, ['worktree', 'remove', '--force', handle.worktreeRoot]);
    } catch {
      // fall through to rm
    }
  }
  if (handle.tempParent !== undefined) {
    try {
      rmSync(handle.tempParent, { recursive: true, force: true });
    } catch {
      // best-effort; under the nexus scratch dir
    }
  }
}

/** Bundle for {@link doPush} (keeps the param count within the lint cap). */
interface PushStageArgs {
  readonly input: CodePrPushInput;
  readonly deps: CodePrPushDeps;
  readonly branch: string;
  readonly token: string;
  readonly worktreeRoot: string;
  readonly realized: RealizedPush;
}

/**
 * Append one push-milestone audit event.
 *
 * The pre-push (intent) and post-push (result) events carry an identical
 * payload and differ only in the actor name, so the shape lives here once —
 * an intent event that drifts from the result event would make the pair
 * useless for reconciling "what we said we'd do" against "what we did".
 */
function auditPushMilestone(
  args: PushStageArgs,
  actorName: string
): ReturnType<typeof auditAutonomousEvent> {
  const { input, deps, token, realized } = args;
  return auditAutonomousEvent(deps.logger, {
    runId: input.run.runId,
    sourceSignalHash: input.run.sourceSignalHash,
    diffHash: realized.diffHash,
    scanVerdict: 'clean',
    filesTouched: realized.changedFiles.length,
    linesTouched: realized.linesTouched,
    tokenIdentity: tokenIdentity(token),
    decision: 'would_open_pr',
    actor: { type: 'system', id: 'autonomous-code-pr-push', name: actorName },
  });
}

/**
 * Step 3 (re-guard) + step 4 (push) + step 5 (audit before/after). RE-RUNS
 * {@link evaluateWriteGuards} on the freshly-realized diff immediately before the
 * push (defense-in-depth). Audits intent BEFORE the push and the result AFTER.
 * Returns a denial on a guard re-deny or a failed pre-push audit — gitPush is NOT
 * called in either case.
 */
function reguardAndPush(args: PushStageArgs): CodePrPushResult {
  const { input, deps, branch, token, worktreeRoot, realized } = args;

  // Step 3: defense-in-depth — re-run the write guards on the REALIZED diff.
  const verdict = evaluateWriteGuards({
    worktreeRoot,
    changedFiles: realized.changedFiles,
    diff: realized.diffText,
    usage: input.usage ?? PUSH_USAGE_ZERO,
    blastRadiusLimits: input.blastRadiusLimits,
    resourceLimits: input.resourceLimits,
  });
  if (!verdict.ok) {
    auditRefusal(deps.logger, input.run, `pre_push_guard:${verdict.reason}`, realized.diffHash);
    return pushDenied(
      'pre_push_guard_denied',
      `pre-push guard re-check denied (${verdict.reason}): ${verdict.detail}`
    );
  }

  // Step 5a: audit the INTENT before any external action (branch, diff, token id).
  const intent = auditPushMilestone(args, `code-PR push intent (${branch})`);
  if (!intent.ok) {
    // A failed pre-push audit is itself fail-closed: do NOT push.
    return pushDenied(
      'audit_failed',
      `pre-push audit append failed (fail-closed): ${intent.detail}`
    );
  }

  // Step 4: external action via the injectable seams. NEW branch only; NEVER merge.
  deps.gitPush(branch, worktreeRoot, token);
  const pr = deps.openPullRequest({ branch, title: input.prTitle, body: input.prBody, token });

  // Step 5b: audit the RESULT after the push (PR url/number).
  auditPushMilestone(args, `code-PR PR opened #${String(pr.number)}`);
  return { ok: true, pr, branch, diffHash: realized.diffHash };
}

/** Forward the plan-relevant push options to {@link planCodePrRun}. */
function planOptions(input: CodePrPushInput): CodePrRunOptions {
  return {
    repoRoot: input.repoRoot,
    blastRadiusLimits: input.blastRadiusLimits,
    resourceLimits: input.resourceLimits,
    usage: input.usage,
  };
}

/**
 * Steps 3–6 once readiness + credentials passed: dry-run the plan, then realize +
 * re-guard + push in a fresh worktree, discarding it in a `finally`. May throw
 * (the caller wraps a throw into a denied result).
 */
function planRealizePush(
  input: CodePrPushInput,
  deps: CodePrPushDeps,
  token: string
): CodePrPushResult {
  // Step 3a: build + validate the plan via the dry-run orchestrator (it discards
  // its OWN worktree). A denial here is a hard stop — never reach the push.
  const planRun = deps.planRun ?? planCodePrRun;
  const plan = planRun(input.run, deps.logger, planOptions(input));
  if (!plan.ok) {
    return pushDenied('plan_denied', `dry-run plan denied (${plan.reason}): ${plan.detail}`);
  }

  // Step 3b–6: realize in a FRESH push worktree, re-guard, push, audit, cleanup.
  const branch = pushBranchName(input.run.runId);
  const repoRoot = input.repoRoot ?? process.cwd();
  const handle: PushWorktree = {};
  try {
    const realized = realizeInPushWorktree(input, branch, handle);
    if (handle.worktreeRoot === undefined) throw new Error('push worktree not created');
    return reguardAndPush({
      input,
      deps,
      branch,
      token,
      worktreeRoot: handle.worktreeRoot,
      realized,
    });
  } finally {
    discardPushWorktree(repoRoot, handle);
  }
}

// ============================================================================
// Entry point
// ============================================================================

/**
 * Execute the gated code-PR push. The STRICT fail-closed sequence (readiness gate
 * → credentials → dry-run plan → fresh-worktree realize → pre-push guard re-check
 * → push → PR-open, auditing before AND after). Returns a {@link CodePrPushResult}
 * — `ok` with the opened PR ref, or a fail-closed denial. NEVER throws (a throw is
 * wrapped into a `push_failed` denial); ALWAYS discards the push worktree.
 *
 * A push is IMPOSSIBLE unless BOTH (a) {@link evaluateCodePrEnableReadiness}
 * returns `ready` against the explicit flag/vote/owner evidence AND the durable
 * guards-green soak read from {@link readCodePrGuardsGreenSoak}, AND (b) an
 * explicit scoped token is present in {@link CODEPR_TOKEN_ENV}. There is NO merge
 * path anywhere in this module: the PR is a normal feature-branch PR subject to
 * CI + CODEOWNERS.
 */
export function executeCodePrPush(input: CodePrPushInput, deps: CodePrPushDeps): CodePrPushResult {
  // Step 1: readiness gate FIRST — NOT ready ⇒ do nothing else (no worktree/push).
  const notReady = checkReadiness(input, deps);
  if (notReady !== undefined) return notReady;

  // Step 2: credentials required — absent/empty token ⇒ no push.
  const token = process.env[CODEPR_TOKEN_ENV] ?? '';
  if (token.trim() === '') {
    return pushDenied(
      'no_credentials',
      `no scoped credential in ${CODEPR_TOKEN_ENV} (fail-closed)`
    );
  }

  // Steps 3–6 — wrapped so ANY throw becomes a fail-closed denial.
  try {
    return planRealizePush(input, deps, token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    auditRefusal(deps.logger, input.run, 'push_failed', sha256(''));
    return pushDenied('push_failed', `code-PR push failed (fail-closed): ${message}`);
  }
}

// ============================================================================
// Production seam implementations
// ============================================================================

/** Repo `origin` URL (used to build the per-push tokenized push URL). Throws on failure. */
function originUrl(worktreeRoot: string): string {
  return git(worktreeRoot, ['remote', 'get-url', 'origin']).trim();
}

/**
 * Build the tokenized HTTPS push URL for `origin` using the scoped token as the
 * `x-access-token` basic-auth user. Only `https://` origins are supported (an
 * ssh/`git@` origin is rejected fail-closed — there is no safe place to inject a
 * token). The token is embedded ONLY in the in-memory URL passed to `git push`
 * (never written to the repo config — see {@link defaultGitPush}).
 */
function tokenizedPushUrl(origin: string, token: string): string {
  if (!origin.startsWith('https://')) {
    throw new Error('code-PR push requires an https origin (fail-closed)');
  }
  return `https://x-access-token:${token}@${origin.slice('https://'.length)}`;
}

/**
 * The PRODUCTION `gitPush` seam. Pushes the worktree's CURRENT branch to the
 * remote under the SAME (new) branch name — and ONLY a `nexus-codepr/<runId>`
 * branch (asserted fail-closed). It NEVER pushes to main, NEVER force-pushes,
 * NEVER merges, and NEVER alters branch protections. The scoped token is supplied
 * as an explicit per-invocation remote URL so it is not persisted in repo config.
 *
 * `--no-verify` is intentionally NOT passed (hooks run); `:refs/heads/<branch>`
 * names the destination ref EXPLICITLY so the push can only create/update that one
 * feature branch on the remote.
 */
export function defaultGitPush(branch: string, worktreeRoot: string, token: string): void {
  if (!branch.startsWith(CODEPR_PUSH_BRANCH_PREFIX)) {
    throw new Error(`refusing to push non-codepr branch "${branch}" (fail-closed)`);
  }
  if (branch === 'main' || branch === 'master') {
    throw new Error('refusing to push to a default branch (fail-closed)');
  }
  const url = tokenizedPushUrl(originUrl(worktreeRoot), token);
  // Explicit src:dst refspec to the SAME feature branch — never main, no merge.
  git(worktreeRoot, ['push', url, `refs/heads/${branch}:refs/heads/${branch}`]);
}

/**
 * The PRODUCTION `openPullRequest` seam: open a NORMAL feature-branch PR via
 * `gh pr create` (subject to CI + CODEOWNERS). It does NOT pass `--merge`, does NOT
 * enable auto-merge, and does NOT merge — there is no merge surface here. Returns
 * the parsed PR number + URL. `GH_TOKEN` is set for the `gh` invocation from the
 * scoped token; it is never logged.
 */
export function defaultOpenPullRequest(args: OpenPullRequestArgs): OpenedPrRef {
  const out = execFileSync(
    'gh',
    ['pr', 'create', '--head', args.branch, '--title', args.title, '--body', args.body],
    { encoding: 'utf8', env: { ...process.env, GH_TOKEN: args.token } }
  ).trim();
  const url =
    out
      .split('\n')
      .find((l) => l.startsWith('http'))
      ?.trim() ?? out;
  const num = url.match(/\/pull\/(\d+)/);
  return { number: num?.[1] !== undefined ? Number.parseInt(num[1], 10) : 0, url };
}

/**
 * Assemble the production push deps (real `gitPush`/`openPullRequest` seams over
 * the scoped token, plus the supplied audit logger). The durable soak read + the
 * dry-run plan default to {@link readCodePrGuardsGreenSoak} / {@link planCodePrRun}.
 * Note: assembling these deps does NOT push — a push still requires the full
 * readiness gate + the explicit token at {@link executeCodePrPush} time.
 */
export function defaultCodePrPushDeps(logger: IAuditLogger): CodePrPushDeps {
  return { gitPush: defaultGitPush, openPullRequest: defaultOpenPullRequest, logger };
}
