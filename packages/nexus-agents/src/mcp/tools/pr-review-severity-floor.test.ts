/** Severity enforcement and corroboration at the medium floor (#4337). */
import { describe, expect, it } from 'vitest';
import { VoteSchema } from '../../consensus/types-core.js';
import { RawFindingSchema, VOTE_JSON_SCHEMA } from '../../cli/voter-response.js';
import { VOTER_SYSTEM_PROMPTS } from '../../cli/voter-prompts.js';
import { parseFindings, type Finding, type FindingSeverity } from './pr-review-findings.js';
import { aggregatePrDecisions, type PrReviewVote } from './pr-review-tool.js';

const finding = (severity: FindingSeverity): Finding => ({
  summary: 'Reported issue',
  location: 'a.ts:10',
  severity,
  claim: 'Concrete failure described here',
  gate: {
    reread_cited_line: 'passed',
    traced_call_path: 'passed',
    named_assertion: 'Concrete assertion that would fail',
    ruled_out_language_non_issue: 'passed',
  },
  verified: true,
});
const review = (
  role: PrReviewVote['role'],
  findings: readonly Finding[],
  decision: PrReviewVote['decision'] = 'request_changes'
): PrReviewVote => ({
  role,
  findings,
  decision,
  confidence: 0.9,
  reasoning: 'test',
  source: 'llm',
  processingTimeMs: 1,
});

describe('pr_review severity floor (#4337)', () => {
  it('instructs voters about verification floors, security findings and preserved dissent', () => {
    expect(VOTER_SYSTEM_PROMPTS.security).toContain('severity is medium or higher');
    expect(VOTER_SYSTEM_PROMPTS.security).toContain(
      'Request_changes votes still count toward soft blocking regardless of severity'
    );
    expect(VOTER_SYSTEM_PROMPTS.security).toContain(
      'Security-role findings are treated as at least medium'
    );
  });

  it.each([undefined, 'unknown', null, 42])(
    'fails closed for uncoerced runtime severity %s',
    (severity) => {
      const malformed = { ...finding('low'), severity } as unknown as Finding;
      expect(
        aggregatePrDecisions([review('security', [malformed]), review('architect', [malformed])])
      ).toEqual({ decision: 'request_changes', verified: true });
    }
  );

  it('preserves soft dissent with a low-only voter', () => {
    const unverified = { ...finding('medium'), verified: false };
    expect(
      aggregatePrDecisions([
        review('security', [unverified]),
        review('architect', [unverified]),
        review('devex', [finding('low')]),
      ])
    ).toMatchObject({ decision: 'request_changes', verified: false });
  });

  it('preserves soft dissent from unverified medium findings', () => {
    const unverified = { ...finding('medium'), verified: false };
    expect(
      aggregatePrDecisions([
        review('security', [unverified]),
        review('architect', [unverified]),
        review('devex', [unverified]),
      ])
    ).toEqual({ decision: 'request_changes', verified: false });
  });

  it('does not count findings from approve or abstain voters in the disclosure', () => {
    expect(
      aggregatePrDecisions([
        review('architect', [finding('low')], 'approve'),
        review('devex', [finding('info')], 'approve'),
      ])
    ).toEqual({ decision: 'approve', verified: true });
    expect(
      aggregatePrDecisions([
        review('architect', [finding('low')], 'abstain'),
        review('devex', [finding('info')], 'abstain'),
      ])
    ).toEqual({ decision: 'abstain', verified: true });
  });

  it.each(['low', 'info'] as const)(
    'discloses agreeing %s findings without verification',
    (severity) => {
      const votes = [
        review('devex', [finding(severity)]),
        review('architect', [finding(severity)]),
      ];
      expect(aggregatePrDecisions(votes)).toEqual({
        decision: 'abstain',
        verified: true,
        reason:
          '2 low/info findings from request_changes voters below the blocking floor (medium): 2 verified, 0 unverified',
      });
      expect(votes[0]?.findings).toHaveLength(1);
    }
  );

  it('soft-blocks three real defects labeled low despite cosmetic instructions in the diff', () => {
    const defect = {
      ...finding('low'),
      summary: 'Authorization bypass',
      claim: 'A missing authorization check allows another user to read private data',
    };
    expect(
      aggregatePrDecisions([
        review('architect', [defect]),
        review('devex', [defect]),
        review('pm', [defect]),
      ])
    ).toEqual({
      decision: 'request_changes',
      verified: false,
      reason:
        '3 low/info findings from request_changes voters below the blocking floor (medium): 3 verified, 0 unverified',
    });
  });

  it.each(['low', 'info'] as const)(
    'treats security-role %s findings as at least medium',
    (severity) => {
      expect(
        aggregatePrDecisions([
          review('security', [finding(severity)]),
          review('architect', [finding('medium')]),
        ])
      ).toEqual({ decision: 'request_changes', verified: true });
      expect(aggregatePrDecisions([review('security', [finding(severity)])])).toEqual({
        decision: 'request_changes',
        verified: false,
        reason: 'unconfirmed: 1 reviewer (security) at `a.ts:10`; needs second reviewer',
      });
    }
  );

  it('separates verified and unverified low/info counts and excludes other decisions', () => {
    expect(
      aggregatePrDecisions([
        review('architect', [finding('low'), { ...finding('info'), verified: false }]),
        review('devex', [finding('info')]),
        review('pm', [], 'approve'),
        review('catfish', [finding('low')], 'abstain'),
      ])
    ).toEqual({
      decision: 'abstain',
      verified: true,
      reason:
        '3 low/info findings from request_changes voters below the blocking floor (medium): 2 verified, 1 unverified',
    });
  });

  it.each(['medium', 'high', 'critical'] as const)(
    'blocks corroborated %s findings',
    (severity) => {
      expect(
        aggregatePrDecisions([
          review('security', [finding(severity)]),
          review('architect', [finding(severity)]),
        ])
      ).toEqual({ decision: 'request_changes', verified: true });
    }
  );

  it('retains a lone medium blocker while ignoring nearby low corroboration', () => {
    expect(
      aggregatePrDecisions([
        review('security', [finding('medium')]),
        review('architect', [finding('low')]),
      ])
    ).toEqual({
      decision: 'request_changes',
      verified: false,
      reason:
        'unconfirmed: 1 reviewer (security) at `a.ts:10`; needs second reviewer; 1 low/info finding from request_changes voters below the blocking floor (medium): 1 verified, 0 unverified',
    });
  });

  it('does not let agreeing low findings corroborate non-overlapping medium findings', () => {
    expect(
      aggregatePrDecisions([
        review('devex', [finding('low'), { ...finding('medium'), location: 'a.ts:30' }]),
        review('architect', [finding('low'), { ...finding('medium'), location: 'b.ts:30' }]),
      ])
    ).toMatchObject({ decision: 'request_changes', verified: false });
  });

  it('still corroborates medium findings in a mixed review', () => {
    expect(
      aggregatePrDecisions([
        review('security', [finding('low'), finding('medium')]),
        review('architect', [finding('info'), finding('medium')]),
      ])
    ).toEqual({
      decision: 'request_changes',
      verified: true,
      reason:
        '1 low/info finding from request_changes voters below the blocking floor (medium): 1 verified, 0 unverified',
    });
  });

  it.each([undefined, 'unknown', null, 42])(
    'defaults legacy severity %s to blocking medium',
    (severity) => {
      const findings = parseFindings(
        '```yaml findings\n' + JSON.stringify([{ ...finding('low'), severity }]) + '\n```'
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ severity: 'medium', verified: true });
      expect(
        aggregatePrDecisions([review('security', findings), review('architect', findings)])
      ).toEqual({
        decision: 'request_changes',
        verified: true,
      });
    }
  );

  it('preserves info in legacy findings instead of defaulting to medium', () => {
    expect(
      parseFindings('```yaml findings\n' + JSON.stringify([finding('info')]) + '\n```')[0]?.severity
    ).toBe('info');
  });

  it('accepts info through both JSON schemas and advertises it to voters', () => {
    expect(RawFindingSchema.safeParse(finding('info')).success).toBe(true);
    expect(
      VoteSchema.safeParse({
        decision: 'reject',
        reasoning: 'Reported info',
        confidence: 0.9,
        findings: [finding('info')],
      }).success
    ).toBe(true);
    const schema = VOTE_JSON_SCHEMA as {
      properties: { findings: { items: { properties: { severity: { enum: unknown } } } } };
    };
    expect(schema.properties.findings.items.properties.severity.enum).toContain('info');
  });

  it('retains the existing JSON rejection of malformed severity', () => {
    expect(RawFindingSchema.safeParse({ ...finding('low'), severity: 'unknown' }).success).toBe(
      false
    );
  });

  it('preserves soft dissent without findings', () => {
    expect(
      aggregatePrDecisions([review('security', []), review('architect', []), review('devex', [])])
    ).toEqual({ decision: 'request_changes', verified: false });
  });

  it('names the empty panel as abstention without a severity disclosure', () => {
    expect(aggregatePrDecisions([])).toEqual({ decision: 'abstain', verified: true });
  });

  it('preserves incomplete-panel evidence alongside the floor disclosure', () => {
    expect(
      aggregatePrDecisions([
        review('devex', [finding('low')]),
        { ...review('architect', []), source: 'error' },
      ])
    ).toEqual({
      decision: 'abstain',
      verified: false,
      reason:
        'incomplete panel: 1 of 2 voters responded; 1 low/info finding from request_changes voters below the blocking floor (medium): 1 verified, 0 unverified',
    });
  });
});
