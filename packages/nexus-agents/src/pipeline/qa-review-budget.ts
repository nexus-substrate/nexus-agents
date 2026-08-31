/**
 * Prompt budget for the QA review stage.
 *
 * A sibling of `mcp/tools/pr-review-diff-budget.ts` (#4140) and deliberately
 * the same shape: a pure, separately-testable module that decides how much of
 * an artifact a reviewer sees and returns the disclosure to ride alongside it.
 *
 * CLAUDE.md: "A review must consume the artifact, not a description of it. …
 * A partial review honestly labeled is fine; a partial review recorded as
 * complete is the failure."
 *
 * @module pipeline/qa-review-budget
 */

import type { QaReviewCoverage } from './dev-pipeline.js';

/**
 * Characters of the implementation the QA expert is shown.
 *
 * A bounded read is legitimate; recording it as a whole-artifact review is not.
 * {@link buildQaPrompt} discloses the bound in the prompt and on the result.
 */
export const QA_IMPLEMENTATION_BUDGET = 3000;

/**
 * Build the QA prompt, disclosing a bounded read.
 *
 * Mirrors `packDiffForReview` (#4140), which solved this for `pr_review`:
 * within budget the prompt is byte-identical to the un-bounded form and
 * `coverage` is `undefined`; over budget a visible NOTE rides on the prompt so
 * the reviewer knows not to claim whole-artifact coverage, and a
 * machine-readable {@link QaReviewCoverage} rides on the result so the record
 * says which portion was reviewed.
 *
 * Previously the call site passed `implementation.slice(0, 3000)` with no
 * marker anywhere, so a pass reached from the first 3000 characters was
 * recorded identically to one over the whole change — and `dev-pipeline` then
 * marked the task done and persisted the full text.
 */
export function buildQaPrompt(
  taskTitle: string,
  implementation: string
): { prompt: string; coverage: QaReviewCoverage | undefined } {
  const partial = implementation.length > QA_IMPLEMENTATION_BUDGET;
  const shown = partial ? implementation.slice(0, QA_IMPLEMENTATION_BUDGET) : implementation;
  const note = partial
    ? `> NOTE: partial review — you are seeing the first ${String(QA_IMPLEMENTATION_BUDGET)} ` +
      `of ${String(implementation.length)} characters. Judge only what is shown, and say so ` +
      `if the visible portion is insufficient to reach a verdict.\n\n`
    : '';
  const prompt = `${note}QA:\n\nTask: ${taskTitle}\n\nImpl:\n${shown}\n\nVerdict: PASS/NEEDS_WORK/REJECT`;
  return {
    prompt,
    coverage: partial
      ? {
          reviewedChars: QA_IMPLEMENTATION_BUDGET,
          totalChars: implementation.length,
          partial: true,
        }
      : undefined,
  };
}
