/**
 * A truncated review must not be recorded as a complete one.
 *
 * CLAUDE.md: "A review must consume the artifact, not a description of it. …
 * Bounded reads are legitimate — but the record must then state which portion
 * was reviewed. A partial review honestly labeled is fine; a partial review
 * recorded as complete is the failure."
 *
 * Two sites in this file violated that:
 *
 * 1. `qaReview` sent `implementation.slice(0, 3000)` with no marker in the
 *    prompt and no coverage on the result. `QaReviewResult` was
 *    `{ verdict, feedback, issues }` — byte-identical for a 500-char and a
 *    500,000-char implementation. `dev-pipeline` then set `status: 'done'` and
 *    persisted the FULL text on a pass the expert reached from the first 3000
 *    characters, so a defect introduced at char 3001 shipped with a recorded
 *    QA pass.
 * 2. `buildVoteProposal` capped the plan at ~2900 chars. The research block it
 *    appends is explicitly labelled "may be incomplete"; the plan was not, so
 *    voters were shown a silently-truncated plan as though whole.
 *
 * The disclosure shape mirrors `packDiffForReview` (#4140), which already
 * solved this for `pr_review`: within budget the output is byte-identical, and
 * over budget a visible NOTE rides on the prompt with a machine-readable
 * coverage object on the result.
 *
 * @module pipeline/agent-executor-review-coverage.test
 */

import { describe, it, expect } from 'vitest';

import { buildVoteProposal } from './agent-executor.js';
import { buildQaPrompt, QA_IMPLEMENTATION_BUDGET } from './qa-review-budget.js';

describe('buildQaPrompt discloses a bounded read (#4140 shape)', () => {
  it('is byte-identical to a whole-artifact review when within budget', () => {
    // The #4140 contract: an in-budget input must produce no note and no
    // coverage, so nothing changes for the overwhelming majority of reviews.
    const impl = 'const x = 1;\n';
    const { prompt, coverage } = buildQaPrompt('Add x', impl);

    expect(coverage).toBeUndefined();
    expect(prompt).toContain(impl);
    expect(prompt).not.toMatch(/partial review/i);
  });

  it('marks the prompt when the implementation is truncated', () => {
    // Without this the expert is handed a prefix and told nothing, so it
    // reports on the whole artifact in good faith.
    const impl = 'x'.repeat(QA_IMPLEMENTATION_BUDGET + 500);
    const { prompt } = buildQaPrompt('Big change', impl);

    expect(prompt).toMatch(/partial review/i);
    expect(prompt).toContain(String(QA_IMPLEMENTATION_BUDGET));
    expect(prompt).toContain(String(impl.length));
  });

  it('returns machine-readable coverage when truncated', () => {
    // The prompt note tells the model; this tells the record. Both are needed
    // — a note alone leaves `QaReviewResult` still claiming completeness.
    const impl = 'x'.repeat(QA_IMPLEMENTATION_BUDGET + 500);
    const { coverage } = buildQaPrompt('Big change', impl);

    expect(coverage).toBeDefined();
    expect(coverage).toMatchObject({
      reviewedChars: QA_IMPLEMENTATION_BUDGET,
      totalChars: impl.length,
      partial: true,
    });
  });

  it('never sends more than the budget', () => {
    const impl = 'x'.repeat(QA_IMPLEMENTATION_BUDGET * 3);
    const { prompt } = buildQaPrompt('Big change', impl);
    // The prompt carries scaffolding, so bound the artifact portion itself.
    expect(prompt.match(/x+/)?.[0].length).toBe(QA_IMPLEMENTATION_BUDGET);
  });

  it('does not claim partial coverage at exactly the budget', () => {
    // Off-by-one guard: a review that fit exactly is complete, and labelling
    // it partial would be its own misreport.
    const impl = 'x'.repeat(QA_IMPLEMENTATION_BUDGET);
    const { coverage, prompt } = buildQaPrompt('Exact fit', impl);

    expect(coverage).toBeUndefined();
    expect(prompt).not.toMatch(/partial review/i);
  });
});

describe('buildVoteProposal discloses a truncated plan', () => {
  it('leaves a short plan untouched', () => {
    expect(buildVoteProposal('short plan', '')).toBe('short plan');
  });

  it('marks the proposal when the plan itself was cut', () => {
    // The research block already carries "may be incomplete"; the plan carried
    // nothing, so voters could not tell a whole plan from a prefix.
    const plan = 'p'.repeat(6000);
    const out = buildVoteProposal(plan, '');

    expect(out).toMatch(/truncated/i);
    expect(out.length).toBeLessThanOrEqual(4000);
  });

  it('marks a cut plan even when research is present', () => {
    const out = buildVoteProposal('p'.repeat(6000), 'some research');

    expect(out).toMatch(/truncated/i);
    expect(out).toContain('may be incomplete');
    expect(out.length).toBeLessThanOrEqual(4000);
  });

  it('does not claim truncation for a plan that fits alongside research', () => {
    // The control. A proposal that always says "truncated" tells voters
    // nothing, which is the same failure in the other direction.
    const out = buildVoteProposal('a short plan', 'some research');

    expect(out).not.toMatch(/truncated/i);
    expect(out).toContain('a short plan');
  });
});
