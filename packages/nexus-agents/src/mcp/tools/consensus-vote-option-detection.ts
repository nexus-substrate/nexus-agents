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
 * The promotion criteria live on the follow-up issue (#5422).
 *
 * The measurement (#5422): precision cannot be measured over the vote ledger,
 * which stores a 503-char proposal preview, so {@link detectUndeclaredOptions}
 * returns a structured verdict — fired / not-fired, the pattern, and a bounded
 * excerpt from the FULL proposal — that `consensus_vote` records on every vote
 * alongside the decision-cost rollup. `scripts/undeclared-options-precision.ts`
 * reads those rows back for hand-labelling.
 *
 * @module mcp/tools/consensus-vote-option-detection
 */

import { UNDECLARED_OPTIONS_EXCERPT_CHARS } from '../../observability/decision-cost.js';

/**
 * Prose shapes that name alternatives. Deliberately narrow — each must be a
 * phrase a caller uses when asking voters to CHOOSE, not merely to approve.
 *
 * Anchored and bounded: no nested quantifiers, so none can backtrack
 * catastrophically on a long proposal — pinned by a test, since the detector
 * runs on the FULL proposal (#5422). Exported so the precision reader can
 * print a per-pattern count, zero-hit patterns included.
 */
export const UNDECLARED_OPTION_PATTERNS: readonly RegExp[] = Object.freeze([
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
 * The detector's verdict as recorded for the precision measurement (#5422).
 *
 * `pattern` is the matching regex as written (`String(regex)`, flags included)
 * and `excerpt` is a window of at most {@link UNDECLARED_OPTIONS_EXCERPT_CHARS}
 * characters around the match, taken from the FULL proposal — the text the
 * ledger's preview drops. Both are absent on a not-fired verdict; the
 * not-fired row is still recorded, because it is the denominator.
 */
interface UndeclaredOptionsVerdict {
  readonly fired: boolean;
  readonly pattern?: string;
  readonly excerpt?: string;
}

/**
 * A window of {@link UNDECLARED_OPTIONS_EXCERPT_CHARS} around `[start, end)`,
 * centred on the match and clamped to the text so a short proposal comes back
 * whole rather than padded.
 */
function excerptAround(text: string, start: number, end: number): string {
  const width = UNDECLARED_OPTIONS_EXCERPT_CHARS;
  if (text.length <= width) return text;
  const slack = Math.max(0, width - (end - start));
  let from = Math.max(0, start - Math.floor(slack / 2));
  const to = Math.min(text.length, from + width);
  from = Math.max(0, to - width);
  return text.slice(from, to);
}

/**
 * The pure verdict: does the proposal name alternatives while `options` is
 * absent, and where? Declared options (a non-empty array) mean the option-aware
 * tally is live, so the verdict is not-fired without consulting the patterns —
 * an empty array switches the tally off exactly as absence does.
 *
 * First matching pattern wins, in {@link UNDECLARED_OPTION_PATTERNS} order.
 */
export function detectUndeclaredOptions(
  proposal: string,
  declaredOptions: readonly string[] | undefined
): UndeclaredOptionsVerdict {
  if (declaredOptions !== undefined && declaredOptions.length > 0) return { fired: false };
  if (proposal === '') return { fired: false };
  for (const pattern of UNDECLARED_OPTION_PATTERNS) {
    const match = pattern.exec(proposal);
    if (match === null) continue;
    const start = match.index;
    return {
      fired: true,
      pattern: String(pattern),
      excerpt: excerptAround(proposal, start, start + match[0].length),
    };
  }
  return { fired: false };
}

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
  // One pattern set: the warning and the recorded verdict must agree, or the
  // precision measured on the record says nothing about the warning (#5422).
  if (!detectUndeclaredOptions(proposal, declaredOptions).fired) return { flagged: false };

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
