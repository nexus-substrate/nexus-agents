import { describe, expect, it } from 'vitest';
import { aggregatePrDecisions, PR_REVIEW_ROLES, type PrReviewVote } from './pr-review-tool.js';

function panel(responders: number, absentSource: 'error' | 'unverifiable'): PrReviewVote[] {
  return PR_REVIEW_ROLES.map((role, index) => ({
    role,
    decision: index < responders ? 'approve' : 'abstain',
    confidence: index < responders ? 0.9 : 0,
    reasoning: index < responders ? 'Reviewed the diff without blocking findings.' : 'Absent seat',
    findings: [],
    source: index < responders ? 'llm' : absentSource,
    cli: 'test',
    processingTimeMs: 1,
  }));
}

describe('PR-review standard quorum (#6957)', () => {
  it.each(['error', 'unverifiable'] as const)(
    'abstains when only two of five seats respond and the rest are %s',
    (source) => {
      expect(aggregatePrDecisions(panel(2, source))).toEqual({
        decision: 'abstain',
        verified: false,
        reason: 'incomplete panel: 2 of 5 voters responded; no_quorum: needs 3 reviewers',
      });
    }
  );

  it('preserves standard approval at the three-of-five quorum boundary', () => {
    expect(aggregatePrDecisions(panel(3, 'error'))).toEqual({
      decision: 'approve',
      verified: false,
      reason: 'incomplete panel: 3 of 5 voters responded',
    });
  });

  it('does not certify an empty panel', () => {
    expect(aggregatePrDecisions([])).toEqual({
      decision: 'abstain',
      verified: false,
      reason: 'incomplete panel: 0 of 0 voters responded',
    });
  });

  it('preserves corroborated blockers below approval quorum', () => {
    const reviews = panel(2, 'error').map((review, index): PrReviewVote =>
      index < 2
        ? {
            ...review,
            decision: 'request_changes',
            findings: [
              {
                summary: 'Missing authorization check',
                location: 'src/auth.ts:10',
                severity: 'high',
                claim: 'Unauthorized users can reach the protected operation.',
                verified: true,
                gate: {
                  reread_cited_line: 'passed',
                  traced_call_path: 'passed',
                  named_assertion: 'Expect unauthorized request to return 403; it returns 200.',
                  ruled_out_language_non_issue: 'passed',
                },
              },
            ],
          }
        : review
    );
    expect(aggregatePrDecisions(reviews)).toEqual({
      decision: 'request_changes',
      verified: true,
    });
  });
});
