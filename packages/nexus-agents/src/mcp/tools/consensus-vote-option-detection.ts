/**
 * Detects a multi-option proposal submitted WITHOUT declared `options` (#5360).
 *
 * #4452 established the failure: a proposal naming alternatives only in prose
 * records a split as uniform approval, because every voter returns `approve` —
 * approving the ACT of deciding, not a side. #4472 built the fix (`options`, a
 * `selectedOption` prompt, a threshold over the option tally). Nothing detected
 * when a caller should have used it, so the failure stayed reachable by
 * forgetting — and it recurred on a real architecture vote, where a 3–3 tie was
 * recorded as `APPROVED 83.3%`.
 *
 * A WARNING, not a refusal. The false-positive cost is unmeasured: a proposal
 * that merely mentions options would trip the patterns, and refusing a
 * governance vote on an unmeasured heuristic trades one failure for a worse one.
 * The promotion criteria and the measurement live on the follow-up issue.
 *
 * @module mcp/tools/consensus-vote-option-detection
 */

/**
 * Prose shapes that name alternatives. Deliberately narrow — each must be a
 * phrase a caller uses when asking voters to CHOOSE, not merely to approve.
 *
 * Anchored and bounded: no nested quantifiers, so none can backtrack
 * catastrophically on a long proposal.
 */
const MULTI_OPTION_PATTERNS: readonly RegExp[] = Object.freeze([
  // `Option A` and `OPTION A`, but NOT `option a` — the lowercase form appears
  // in ordinary prose ("there is no option a caller can set"), the capitalised
  // form is a heading. The motivating proposal used `Option A`; an
  // uppercase-only pattern would have missed the instance this exists for.
  /\b(?:Option|OPTION) [A-Z0-9]\b/,
  /\bchoose between\b/i,
  /\bwhich of (?:the )?(?:these|those|the following)\b/i,
  /\bpick exactly one\b/i,
  /\bvote for exactly one\b/i,
]);

/** Outcome of the check. A discriminated union so "not checked" cannot read as "clean". */
export type UndeclaredOptionsCheck =
  { readonly flagged: false } | { readonly flagged: true; readonly warning: string };

/**
 * Does the proposal name alternatives while `options` is absent?
 *
 * `allEngagedApproved` is the second signal, and it is the sharper one (#5360,
 * from the review panel): when every non-errored voter returns `approve` on a
 * proposal that enumerates a fork, that is the observed signature of this exact
 * defect rather than a proposal that merely mentions the word "option". It is
 * available without the persisted reasoning that a full disagreement detector
 * would need (#5339).
 *
 * Pass `undefined` for `allEngagedApproved` when the votes are not yet known —
 * the check then rests on the prose alone and says so in the warning.
 */
export function checkUndeclaredOptions(
  proposal: string,
  declaredOptions: readonly string[] | undefined,
  allEngagedApproved?: boolean
): UndeclaredOptionsCheck {
  // Declared options mean the option-aware tally is live; nothing to warn about.
  if (declaredOptions !== undefined && declaredOptions.length > 0) return { flagged: false };
  if (proposal === '') return { flagged: false };
  if (!MULTI_OPTION_PATTERNS.some((p) => p.test(proposal))) return { flagged: false };

  const base =
    'This proposal appears to name alternatives, but `options` was not declared, ' +
    'so the tally records approve/reject only and cannot say WHICH alternative won ' +
    '(#4452, #5360). Re-run with `options` to record the option tally.';

  // Stated separately because it is evidence, not restatement: every voter
  // approving a proposal that enumerates a fork is the signature of voters
  // approving the act of deciding rather than a side.
  return {
    flagged: true,
    warning:
      allEngagedApproved === true
        ? `${base} Every non-errored voter returned \`approve\`, which is the signature of this defect.`
        : base,
  };
}
