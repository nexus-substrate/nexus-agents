/**
 * Dependency assembly for the auto-remediation entry point (#3540 phase 3 / #3671).
 *
 * Wires the built adapters into a single {@link AutoRemediationDeps} for
 * {@link runAutoRemediation}. AUDIT-READY NOW: in `audit` mode the orchestrator
 * runs research → consensus vote and stops before IMPLEMENT, so this assembly
 * produces the vote/plan SOAK data the readiness gate needs using only merged
 * pieces. ENFORCE is intentionally NOT yet runnable — `implement` is a
 * fail-closed stub until the Option B proposal-PR adapter lands (#3669).
 * Readiness now reads REAL evidence from the durable soak (#3762) + soundness-
 * review (#3765) stores (#3764), fail-closing to not-ready when no data exists.
 *
 * @module mcp/tools/auto-remediation-deps
 */

import { createLogger, type ILogger } from '../../core/index.js';
import type { AutoRemediationDeps } from './improvement-remediation-enforce.js';
import { buildRemediationPlanFromSignal } from './remediation-research.js';
import { makeVoteAdapter, type VoteRunner } from './remediation-vote-adapter.js';
import { makeGitRefLeaseAcquirer } from './auto-remediation-lease.js';
import {
  makeProposalPrImplementAdapter,
  makeGitWorktreeOps,
  makeGhPrCreator,
} from './remediation-proposal-pr.js';
import type { EnforceReadinessEvidence } from './improvement-enforce-readiness.js';
import { readRemediationSoakSummary } from './improvement-remediation-shadow.js';
import { readRemediationReviewSummary } from './remediation-review.js';
import { buildEnforceReadinessEvidence } from './remediation-readiness-collector.js';

/** Options for assembling the deps. */
export interface AutoRemediationDepsOptions {
  /** `owner/name` repo slug — required for the lease + PRs. */
  readonly repo?: string;
  /** Commit SHA the lease ref points at. */
  readonly sha?: string;
  /** Live checkout root — required to wire the Option B proposal-PR implement adapter. */
  readonly repoRoot?: string;
  /** Base branch for proposal PRs (default 'main'). */
  readonly baseBranch?: string;
  /** Supplies readiness evidence (enforce gate). Default: not-ready (enforce blocked). */
  readonly readiness?: () => Promise<EnforceReadinessEvidence>;
  /** Inject a vote runner (tests); default is the real live-voter path. */
  readonly voteRunner?: VoteRunner;
  readonly logger?: ILogger;
}

/** Evidence that fails the readiness gate — the fail-closed fallback when no data exists. */
const NOT_READY: EnforceReadinessEvidence = {
  shadowSelections: 0,
  judgedSelections: 0,
  judgedSound: 0,
};

/**
 * The real readiness provider (#3764): builds {@link EnforceReadinessEvidence}
 * from the durable soak (#3762) + soundness-review (#3765) stores on disk.
 * FAIL-CLOSED: if either read fails, or no data exists, it returns
 * {@link NOT_READY} so enforce stays blocked. Audit mode never calls this
 * (readiness is only consulted on the enforce path), so reading the stores here
 * cannot change audit behavior.
 */
function collectReadinessEvidence(logger: ILogger): Promise<EnforceReadinessEvidence> {
  try {
    const soak = readRemediationSoakSummary();
    const reviews = readRemediationReviewSummary();
    return Promise.resolve(buildEnforceReadinessEvidence(soak, reviews));
  } catch (error: unknown) {
    logger.warn('readiness evidence collection failed — fail-closed to NOT_READY', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Promise.resolve(NOT_READY);
  }
}

/**
 * Assemble {@link AutoRemediationDeps} from the merged adapters. Audit-ready;
 * enforce stays fail-closed (stub `implement`, not-ready readiness, null lease
 * when `repo`/`sha` are absent) until the Option B adapter (#3669) + real
 * readiness evidence are wired.
 */
export function buildAutoRemediationDeps(
  opts: AutoRemediationDepsOptions = {}
): AutoRemediationDeps {
  const logger = opts.logger ?? createLogger({ tool: 'auto-remediation' });
  const acquireLease =
    opts.repo !== undefined && opts.sha !== undefined
      ? makeGitRefLeaseAcquirer({ repo: opts.repo, sha: opts.sha, logger })
      : // Fail-closed: without a configured repo/sha we can't take the cross-process
        // lease, so enforce must not proceed. (Audit never calls this.)
        async (): Promise<null> => Promise.resolve(null);

  // Option B proposal-PR adapter — wired only when a live checkout (repoRoot) AND
  // repo slug are configured. Otherwise enforce stays fail-closed (rejecting stub).
  const implement: AutoRemediationDeps['implement'] =
    opts.repoRoot !== undefined && opts.repo !== undefined
      ? makeProposalPrImplementAdapter({
          ops: makeGitWorktreeOps(opts.repoRoot),
          pr: makeGhPrCreator(),
          ...(opts.baseBranch !== undefined ? { baseBranch: opts.baseBranch } : {}),
          logger,
        })
      : (): Promise<never> =>
          Promise.reject(
            new Error(
              'auto-remediation implement not wired — set repo + repoRoot to enable Option B (#3669)'
            )
          );

  return {
    research: (signal) => Promise.resolve(buildRemediationPlanFromSignal(signal)),
    vote: makeVoteAdapter(opts.voteRunner, logger),
    acquireLease,
    readinessEvidence:
      opts.readiness ?? ((): Promise<EnforceReadinessEvidence> => collectReadinessEvidence(logger)),
    implement,
    audit: (event): void => {
      logger.info(`[auto-remediation] ${event.step}`, {
        ...(event.signalKey !== undefined ? { signalKey: event.signalKey } : {}),
        detail: event.detail,
      });
    },
    logger,
  };
}
