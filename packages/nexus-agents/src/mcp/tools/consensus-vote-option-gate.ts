/**
 * Option gate for multi-option consensus votes (#4472, increment 2).
 *
 * When a proposal declares named `options`, clearing the ordinary
 * approve/reject bar is no longer sufficient: the leading option must clear the
 * threshold too. Without this, `unanimous` is the *easiest* bar on a
 * multi-option proposal, because every voter approves while choosing something
 * different and a 6-1 split records as 7-0, 100% (#4452).
 *
 * ## Composition, not replacement
 *
 * The gate is applied ON TOP of the existing strategy verdict — both bars must
 * be cleared. Three reasons:
 *
 *  - **Rejections keep their meaning.** The option tally counts only approvers,
 *    so on its own it would read "4 approve for X, 3 reject" as 4/4 unanimous.
 *    The existing approve/reject gate already fails that case; composing keeps
 *    it failing.
 *  - **Monotone.** Adding a constraint can only make approval harder, so
 *    declaring `options` can never turn a rejected vote into an approved one.
 *  - **No-options behaviour is byte-identical**, because the gate is a no-op
 *    when no options are declared — and `strategies.ts` stays untouched, which
 *    matters on the governor path.
 *
 * The two measurements stay separate on the response: `approvalPercentage`
 * remains the approve/reject figure and the option share is reported alongside
 * it. Collapsing them into one number would hide which bar actually failed.
 *
 * @module mcp/tools/consensus-vote-option-gate
 * (Source: Issue #4472)
 */

import {
  evaluateOptionThreshold,
  tallyOptions,
  type OptionThreshold,
  type OptionThresholdVerdict,
} from '../../consensus/option-tally.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';

/** Strategies whose bar the option gate mirrors. */
const STRATEGY_TO_OPTION_THRESHOLD: Record<string, OptionThreshold> = {
  unanimous: 'unanimous',
  supermajority: 'supermajority',
  simple_majority: 'majority',
  // higher_order and proof_of_learning aggregate differently; they are gated at
  // the majority bar so a declared-option split still cannot pass unnoticed.
  higher_order: 'majority',
  proof_of_learning: 'majority',
  opinion_wise: 'majority',
};

/**
 * Map a voting strategy (or legacy threshold) onto the option bar to apply.
 *
 * An unrecognised strategy falls back to `majority` rather than to "no gate",
 * so a strategy added later cannot silently opt out of option checking.
 */
export function optionThresholdFor(strategy: string, legacyThreshold?: string): OptionThreshold {
  if (legacyThreshold === 'unanimous') return 'unanimous';
  if (legacyThreshold === 'supermajority') return 'supermajority';
  return STRATEGY_TO_OPTION_THRESHOLD[strategy] ?? 'majority';
}

export interface OptionGateOutcome {
  /** The tally + verdict, for reporting on the response and the record. */
  readonly verdict: OptionThresholdVerdict;
  /**
   * True when the gate vetoed an otherwise-approved vote. Drives the
   * human-readable reason; a vote already rejected on approvals is untouched.
   */
  readonly vetoed: boolean;
  /** Populated only when `vetoed`, explaining which bar failed and why. */
  readonly reason?: string;
}

/**
 * Evaluate the option gate for a completed vote.
 *
 * `approvedByStrategy` is the ordinary verdict. The returned `vetoed` flag is
 * true only when that verdict was `true` and the leading option failed its bar,
 * which is the sole case where this gate changes an outcome.
 */
export function evaluateOptionGate(
  votes: readonly AgentVoteResult[],
  declaredOptions: readonly string[],
  threshold: OptionThreshold,
  approvedByStrategy: boolean
): OptionGateOutcome {
  const tally = tallyOptions(
    votes.map((v) => ({
      decision: v.vote.decision,
      ...(v.selectedOption !== undefined ? { selectedOption: v.selectedOption } : {}),
    })),
    declaredOptions
  );
  const verdict = evaluateOptionThreshold(tally, threshold);

  if (!approvedByStrategy || verdict.approved) {
    return { verdict, vetoed: false };
  }

  return { verdict, vetoed: true, reason: describeVeto(verdict) };
}

/**
 * Explain a veto in terms a caller can act on.
 *
 * Names the coverage explicitly, because a share alone cannot distinguish a
 * real split from unreadable responses — `4 pick X + 3 unparseable` and a
 * genuine 4/3 split both read 57%.
 */
function describeVeto(verdict: OptionThresholdVerdict): string {
  const pct = (verdict.leadingShare * 100).toFixed(1);
  const leader =
    verdict.leadingOption !== undefined
      ? `leading option "${verdict.leadingOption}" held ${String(verdict.leadingCount)}/${String(verdict.approverCount)} approvers (${pct}%)`
      : 'no voter selected a declared option';

  const coverage =
    verdict.unattributedApprovals > 0
      ? ` ${String(verdict.unattributedApprovals)} of ${String(verdict.approverCount)} approvers recorded no usable selection, which lowers the leading share; their choice is unmeasured, not counted as dissent.`
      : '';

  return `Approvals cleared the ${verdict.threshold} bar, but the option split did not: ${leader}.${coverage}`;
}
