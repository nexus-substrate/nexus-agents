/**
 * Option-tally threshold evaluation for multi-option proposals (#4472).
 *
 * When a `consensus_vote` proposal declares named `options`, thresholds must be
 * measured over WHICH option voters chose, not over raw approve/reject counts.
 * Without this, `unanimous` is the *easiest* bar to clear on a multi-option
 * proposal: every voter approves while each picks something different, so a 6-1
 * split records as 7-0, 100% (#4452).
 *
 * ## Semantics: "count in denominator, credit no option"
 *
 * Decided by a 7-voter `higher_order` panel on #4472 (6-1 for this rule). An
 * approving voter whose selection is absent or matches no declared option stays
 * in the denominator and credits no option.
 *
 * The decisive property is that this is **monotone-downward**: an absent or
 * unmatched selection can only *lower* the leading option's share, never raise
 * it. Degradation is therefore a denial, never an escalation — the invariant an
 * enforcing governance gate requires (#4464). The rejected alternative
 * (excluding non-selectors from the denominator) reads 1 selector among 6
 * unparseable as 1/1 = 100% "unanimous", rebuilding the #4452 masking bug.
 *
 * No per-threshold special-casing is needed: any non-selecting approver caps the
 * leading share below 100%, so `unanimous` fails by arithmetic when the panel
 * cannot articulate one choice. Absence is disqualifying for unanimity by
 * construction.
 *
 * The accepted cost is false negatives — a genuinely unanimous panel with one
 * degraded response records 6/7 and misses the unanimous gate. On the governor
 * path that bias direction is correct: a retry, never a split laundered as
 * consensus.
 *
 * @module consensus/option-tally
 * (Source: Issue #4472)
 */

/** Fraction of the leading option required to clear each threshold. */
const SUPERMAJORITY_SHARE = 2 / 3;
const MAJORITY_SHARE = 0.5;

/** The thresholds this module can evaluate over an option tally. */
export type OptionThreshold = 'majority' | 'supermajority' | 'unanimous';

/** One declared option and how many approving voters chose it. */
export interface OptionTallyEntry {
  readonly option: string;
  readonly count: number;
}

/** Minimal vote shape this module reads. */
export interface TallyableVote {
  readonly decision: 'approve' | 'reject' | 'abstain';
  readonly selectedOption?: string;
}

export interface OptionTallyResult {
  /** Chosen options, descending by count, ties broken by label for determinism. */
  readonly tally: readonly OptionTallyEntry[];
  /** The most-chosen option, or undefined when nobody selected one. */
  readonly leadingOption?: string;
  readonly leadingCount: number;
  /** Denominator: every approving voter, selecting or not. */
  readonly approverCount: number;
  /** Approvers whose selection matched a declared option. */
  readonly selectedCount: number;
  /**
   * Approvers with no usable selection.
   *
   * Recorded explicitly because the share alone cannot distinguish dissent from
   * absence: `4 pick X + 3 unparseable` and a real 4/3 split both read 57%. The
   * panel made this field a condition of adopting these semantics — partial
   * coverage must be represented, not merely priced in.
   */
  readonly unattributedApprovals: number;
  /** `leadingCount / approverCount`, or 0 when nobody approved. */
  readonly leadingShare: number;
}

export interface OptionThresholdVerdict extends OptionTallyResult {
  readonly threshold: OptionThreshold;
  readonly approved: boolean;
}

/**
 * Resolve a voter's raw selection to a declared option.
 *
 * Matching is trimmed and case-insensitive, and returns the *declared* spelling
 * so the tally never splits one option across spelling variants. Anything that
 * does not match exactly one declared option resolves to `undefined` — an
 * unmatched selection is treated as absent, never coerced onto a default,
 * because a defaulted option is a measurement that was never taken.
 */
export function matchDeclaredOption(
  raw: string | undefined,
  declaredOptions: readonly string[]
): string | undefined {
  if (raw === undefined) return undefined;

  const normalized = raw.trim().toLowerCase();
  if (normalized === '') return undefined;

  return declaredOptions.find((option) => option.trim().toLowerCase() === normalized);
}

/** Build the option tally for a set of votes against the declared options. */
export function tallyOptions(
  votes: readonly TallyableVote[],
  declaredOptions: readonly string[]
): OptionTallyResult {
  const approvers = votes.filter((v) => v.decision === 'approve');

  const counts = new Map<string, number>();
  let selectedCount = 0;

  for (const vote of approvers) {
    const matched = matchDeclaredOption(vote.selectedOption, declaredOptions);
    if (matched === undefined) continue;
    selectedCount += 1;
    counts.set(matched, (counts.get(matched) ?? 0) + 1);
  }

  const tally = [...counts.entries()]
    .map(([option, count]) => ({ option, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.option.localeCompare(b.option)));

  const leader = tally[0];
  const approverCount = approvers.length;
  const leadingCount = leader?.count ?? 0;

  return {
    tally,
    ...(leader !== undefined ? { leadingOption: leader.option } : {}),
    leadingCount,
    approverCount,
    selectedCount,
    unattributedApprovals: approverCount - selectedCount,
    leadingShare: approverCount > 0 ? leadingCount / approverCount : 0,
  };
}

/**
 * Decide whether the leading option clears `threshold`.
 *
 * `unanimous` asks whether every approver chose the *same* option, which is
 * strictly stronger than "everyone approved" — the inversion #4472 exists to
 * correct. The share thresholds measure the leading option, so total approvals
 * no longer stand in for agreement.
 */
export function evaluateOptionThreshold(
  tally: OptionTallyResult,
  threshold: OptionThreshold
): OptionThresholdVerdict {
  const approved = clears(tally, threshold);
  return { ...tally, threshold, approved };
}

function clears(tally: OptionTallyResult, threshold: OptionThreshold): boolean {
  // A panel in which nobody named an option has not agreed on one, whatever
  // its approval count says.
  if (tally.approverCount === 0 || tally.leadingCount === 0) return false;

  switch (threshold) {
    case 'unanimous':
      return tally.leadingCount === tally.approverCount;
    case 'supermajority':
      return tally.leadingShare >= SUPERMAJORITY_SHARE;
    case 'majority':
      return tally.leadingShare > MAJORITY_SHARE;
  }
}
