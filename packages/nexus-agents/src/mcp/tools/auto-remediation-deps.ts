/**
 * Dependency assembly for the auto-remediation entry point (#3540 phase 3 / #3671).
 *
 * Wires the built adapters into a single {@link AutoRemediationDeps} for
 * {@link runAutoRemediation}. AUDIT-READY NOW: in `audit` mode the orchestrator
 * runs research → consensus vote and stops before IMPLEMENT, so this assembly
 * produces the vote/plan SOAK data the readiness gate needs using only merged
 * pieces. ENFORCE is intentionally NOT yet runnable — `implement` is a
 * fail-closed stub until the Option B proposal-PR adapter lands (#3669), and
 * readiness defaults to not-ready until real evidence is supplied.
 *
 * @module mcp/tools/auto-remediation-deps
 */

// @export-no-consumer-yet — see #3671
// The CLI/MCP entry point (#3671) calls buildAutoRemediationDeps + runAutoRemediation.

import { createLogger, type ILogger } from '../../core/index.js';
import type { AutoRemediationDeps } from './improvement-remediation-enforce.js';
import { buildRemediationPlanFromSignal } from './remediation-research.js';
import { makeVoteAdapter, type VoteRunner } from './remediation-vote-adapter.js';
import { makeGitRefLeaseAcquirer } from './auto-remediation-lease.js';
import type { EnforceReadinessEvidence } from './improvement-enforce-readiness.js';

/** Options for assembling the deps. */
export interface AutoRemediationDepsOptions {
  /** `owner/name` repo slug — required for the lease (and, later, PRs). */
  readonly repo?: string;
  /** Commit SHA the lease ref points at. */
  readonly sha?: string;
  /** Supplies readiness evidence (enforce gate). Default: not-ready (enforce blocked). */
  readonly readiness?: () => Promise<EnforceReadinessEvidence>;
  /** Inject a vote runner (tests); default is the real live-voter path. */
  readonly voteRunner?: VoteRunner;
  readonly logger?: ILogger;
}

/** Evidence that fails the readiness gate — the safe default until real data is wired. */
const NOT_READY: EnforceReadinessEvidence = {
  shadowSelections: 0,
  judgedSelections: 0,
  judgedSound: 0,
};

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

  return {
    research: (signal) => Promise.resolve(buildRemediationPlanFromSignal(signal)),
    vote: makeVoteAdapter(opts.voteRunner, logger),
    acquireLease,
    readinessEvidence:
      opts.readiness ?? ((): Promise<EnforceReadinessEvidence> => Promise.resolve(NOT_READY)),
    implement: (): Promise<never> =>
      Promise.reject(
        new Error(
          'auto-remediation implement adapter not wired yet (Option B, #3669) — enforce unavailable'
        )
      ),
    audit: (event): void => {
      logger.info(`[auto-remediation] ${event.step}`, {
        ...(event.signalKey !== undefined ? { signalKey: event.signalKey } : {}),
        detail: event.detail,
      });
    },
    logger,
  };
}
