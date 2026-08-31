/**
 * Bound an artifact to a prompt budget, and disclose the bound.
 *
 * CLAUDE.md: "A review must consume the artifact, not a description of it. …
 * Bounded reads are legitimate — the Context budget is real and a large diff
 * cannot always be read whole — but the record must then state which portion
 * was reviewed. A partial review honestly labeled is fine; a partial review
 * recorded as complete is the failure."
 *
 * The shape follows `mcp/tools/pr-review-diff-budget.ts` (#4140), which
 * established it for `pr_review`: within budget the output is BYTE-IDENTICAL
 * and carries no note, so the ordinary case is unchanged; over budget a visible
 * note rides on the prompt and a machine-readable bound rides on the result.
 *
 * This is the character-oriented sibling of that file-oriented packer. Where a
 * diff can be packed by whole files (so a reviewed file is reviewed
 * completely), a free-text proposal has no such seam and is cut at a character
 * count — which makes disclosure more important, not less, since the cut can
 * land mid-sentence.
 *
 * @module utils/bounded-artifact
 */

/** How much of an artifact a reviewer actually saw. */
export interface ArtifactBound {
  /** Characters the reviewer was shown. */
  readonly reviewedChars: number;
  /** Characters in the whole artifact. */
  readonly totalChars: number;
  /** True when the reviewer saw less than the whole artifact. */
  readonly partial: boolean;
}

/** An artifact bounded for a prompt, with the disclosure that must accompany it. */
export interface BoundedArtifact {
  /** The text to embed — the whole artifact when it fit. */
  readonly text: string;
  /** Visible note to place before the artifact; `''` when nothing was cut. */
  readonly note: string;
  /** Machine-readable bound for the record; `undefined` when nothing was cut. */
  readonly bound: ArtifactBound | undefined;
}

/**
 * Cut `text` to `budget` characters when it exceeds it, and produce the
 * disclosure.
 *
 * `label` names the artifact in the note — a reviewer told "you are seeing part
 * of it" needs to know part of what.
 *
 * Pure: no I/O, no model call, no logging.
 */
export function boundArtifactForReview(
  text: string,
  budget: number,
  label: string
): BoundedArtifact {
  if (text.length <= budget) {
    return { text, note: '', bound: undefined };
  }
  return {
    text: text.slice(0, budget),
    note:
      `> NOTE: partial view — you are seeing the first ${String(budget)} of ` +
      `${String(text.length)} characters of the ${label}. Judge only what is shown, ` +
      `and treat insufficient visibility as itself a reason to raise a concern.`,
    bound: { reviewedChars: budget, totalChars: text.length, partial: true },
  };
}
