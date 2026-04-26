/**
 * Tests for the pr_review MCP tool (#2233 Child 1).
 *
 * Focuses on pure logic — proposal construction, decision mapping,
 * aggregation, summarization — since the handler integration test
 * lives in the consensus-vote integration suite.
 *
 * @module mcp/tools/pr-review-tool.test
 */

import { describe, it, expect } from 'vitest';
import {
  PR_REVIEW_ROLES,
  PrReviewInputSchema,
  aggregatePrDecisions,
  buildPrReviewProposal,
  mapVoteDecisionToPrDecision,
  type PrReviewVote,
} from './pr-review-tool.js';

describe('pr_review tool', () => {
  describe('PR_REVIEW_ROLES', () => {
    it('should be exactly 5 roles per #2233 design', () => {
      expect(PR_REVIEW_ROLES).toHaveLength(5);
    });

    it('should include code-level voters (not pm/ai_ml)', () => {
      const set = new Set(PR_REVIEW_ROLES);
      expect(set.has('architect')).toBe(true);
      expect(set.has('security')).toBe(true);
      expect(set.has('devex')).toBe(true);
      expect(set.has('catfish')).toBe(true);
      expect(set.has('scope_steward')).toBe(true);
    });

    it('should NOT include pm or ai_ml (proposal-level roles)', () => {
      const set = new Set(PR_REVIEW_ROLES);
      expect(set.has('pm')).toBe(false);
      expect(set.has('ai_ml')).toBe(false);
    });
  });

  describe('mapVoteDecisionToPrDecision', () => {
    it('should map approve to approve', () => {
      expect(mapVoteDecisionToPrDecision('approve')).toBe('approve');
    });

    it('should map reject to request_changes', () => {
      expect(mapVoteDecisionToPrDecision('reject')).toBe('request_changes');
    });

    it('should map abstain to abstain', () => {
      expect(mapVoteDecisionToPrDecision('abstain')).toBe('abstain');
    });
  });

  describe('aggregatePrDecisions (#2233 Child 3 — verification gate)', () => {
    const VERIFIED_FINDING = {
      summary: 'Real bug',
      location: 'src/a.ts:10',
      severity: 'high' as const,
      claim: 'Concrete failure described here',
      gate: {
        reread_cited_line: 'passed' as const,
        traced_call_path: 'passed' as const,
        named_assertion: 'A specific assertion that would fail',
        ruled_out_language_non_issue: 'passed' as const,
      },
      verified: true,
    };
    const UNVERIFIED_FINDING = {
      summary: 'Suspicious pattern',
      location: 'src/b.ts:42',
      severity: 'medium' as const,
      claim: 'Could be safer',
      gate: {
        reread_cited_line: 'skipped' as const,
        traced_call_path: 'passed' as const,
        named_assertion: 'short',
        ruled_out_language_non_issue: 'passed' as const,
      },
      verified: false,
    };

    const makeReview = (
      role: PrReviewVote['role'],
      decision: PrReviewVote['decision'],
      opts: {
        source?: PrReviewVote['source'];
        findings?: PrReviewVote['findings'];
      } = {}
    ): PrReviewVote => ({
      role,
      decision,
      confidence: 0.8,
      reasoning: 'test',
      findings: opts.findings ?? [],
      source: opts.source ?? 'llm',
      processingTimeMs: 100,
    });

    it('approves when all voters approve', () => {
      const reviews = [
        makeReview('architect', 'approve'),
        makeReview('security', 'approve'),
        makeReview('devex', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'approve', verified: true });
    });

    it('triggers VERIFIED request_changes when a voter has a verified finding (#2225)', () => {
      const reviews = [
        makeReview('architect', 'approve'),
        makeReview('security', 'request_changes', { findings: [VERIFIED_FINDING] }),
        makeReview('devex', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({
        decision: 'request_changes',
        verified: true,
      });
    });

    it('does NOT trigger request_changes when ONE voter dissents without verified finding', () => {
      // Only 1 of 3 voters dissents — below the soft-block threshold of 3.
      const reviews = [
        makeReview('architect', 'approve'),
        makeReview('security', 'request_changes', { findings: [UNVERIFIED_FINDING] }),
        makeReview('devex', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'abstain', verified: true });
    });

    it('triggers SOFT request_changes when ≥3/5 voters dissent without verified findings (#2250)', () => {
      // Empirically observed in the #2241 retest: voters reliably flag
      // diff-readable bugs by majority but don't emit YAML findings. The
      // soft-block path catches that signal; tagged unverified.
      const reviews = [
        makeReview('architect', 'request_changes', { findings: [] }),
        makeReview('security', 'request_changes', { findings: [UNVERIFIED_FINDING] }),
        makeReview('devex', 'request_changes', { findings: [] }),
        makeReview('catfish', 'approve'),
        makeReview('scope_steward', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({
        decision: 'request_changes',
        verified: false,
      });
    });

    it('soft-block requires the threshold of 3 — 2/5 dissent stays abstain', () => {
      const reviews = [
        makeReview('architect', 'request_changes'),
        makeReview('security', 'request_changes'),
        makeReview('devex', 'approve'),
        makeReview('catfish', 'approve'),
        makeReview('scope_steward', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'abstain', verified: true });
    });

    it('verified blocker beats soft block — even 1 verified finding wins', () => {
      const reviews = [
        makeReview('architect', 'request_changes', { findings: [VERIFIED_FINDING] }),
        makeReview('security', 'approve'),
        makeReview('devex', 'approve'),
        makeReview('catfish', 'approve'),
        makeReview('scope_steward', 'approve'),
      ];
      // Even with 4 approves, a single verified finding triggers
      // verified=true request_changes — the gate's intent is preserved.
      expect(aggregatePrDecisions(reviews)).toEqual({
        decision: 'request_changes',
        verified: true,
      });
    });

    it('triggers request_changes if at least one finding is verified (mixed findings)', () => {
      const reviews = [
        makeReview('security', 'request_changes', {
          findings: [UNVERIFIED_FINDING, VERIFIED_FINDING],
        }),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({
        decision: 'request_changes',
        verified: true,
      });
    });

    it('ignores findings on error votes', () => {
      const reviews = [
        makeReview('security', 'request_changes', {
          source: 'error',
          findings: [VERIFIED_FINDING],
        }),
        makeReview('architect', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'approve', verified: true });
    });

    it('soft-block ignores error votes too', () => {
      // 3 request_changes but 1 is error → only 2 valid dissenters.
      const reviews = [
        makeReview('architect', 'request_changes'),
        makeReview('security', 'request_changes'),
        makeReview('devex', 'request_changes', { source: 'error' }),
        makeReview('catfish', 'approve'),
        makeReview('scope_steward', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'abstain', verified: true });
    });

    it('returns abstain when all voters errored', () => {
      const reviews = [
        makeReview('architect', 'approve', { source: 'error' }),
        makeReview('security', 'approve', { source: 'error' }),
      ];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'abstain', verified: true });
    });

    it('returns abstain on mixed approve/abstain (no clear approval)', () => {
      const reviews = [makeReview('architect', 'approve'), makeReview('security', 'abstain')];
      expect(aggregatePrDecisions(reviews)).toEqual({ decision: 'abstain', verified: true });
    });

    it('returns abstain on empty input', () => {
      expect(aggregatePrDecisions([])).toEqual({ decision: 'abstain', verified: true });
    });
  });

  describe('buildPrReviewProposal', () => {
    const baseInput = {
      prTitle: 'Add foo widget',
      prDiff: '--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new',
      simulate: false,
    };

    it('should include the PR title', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('Add foo widget');
    });

    it('should include the diff in a fenced block', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('```diff');
      expect(out).toContain('--- a/foo.ts');
    });

    it('should include the verification gate reference (#2225)', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('#2225');
      expect(out).toContain('verification gate');
    });

    it('should embed the FINDINGS YAML format (#2233 Child 3)', () => {
      // The proposal text instructs voters to emit a structured findings
      // block parseable by pr-review-findings.ts.
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('reread_cited_line');
      expect(out).toContain('traced_call_path');
      expect(out).toContain('named_assertion');
      expect(out).toContain('ruled_out_language_non_issue');
      expect(out).toContain('```yaml findings');
    });

    it('should explicitly demand citations in path/file.ext:line form', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('path/file.ext:LINE');
    });

    it('should include base/head refs only when both are provided', () => {
      const withRefs = buildPrReviewProposal({
        ...baseInput,
        baseRef: 'main',
        headRef: 'feat/x',
      });
      expect(withRefs).toContain('feat/x → main');

      const withoutRefs = buildPrReviewProposal(baseInput);
      expect(withoutRefs).not.toContain('→');
    });

    it('should omit description block when not provided', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).not.toContain('**Description:**');
    });

    it('should include description block when provided', () => {
      const out = buildPrReviewProposal({
        ...baseInput,
        prDescription: 'This adds the foo widget for #1234.',
      });
      expect(out).toContain('**Description:**');
      expect(out).toContain('foo widget for #1234');
    });

    it('should include repo context when provided', () => {
      const out = buildPrReviewProposal({
        ...baseInput,
        repoContext: 'TypeScript monorepo, Result<T,E> pattern, vitest tests.',
      });
      expect(out).toContain('Repo context');
      expect(out).toContain('Result<T,E>');
    });

    it('should label the three decision options approve/reject/abstain', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('APPROVE');
      expect(out).toContain('REJECT');
      expect(out).toContain('ABSTAIN');
    });
  });

  describe('PrReviewInputSchema', () => {
    it('should reject empty title', () => {
      const r = PrReviewInputSchema.safeParse({ prTitle: '', prDiff: 'x' });
      expect(r.success).toBe(false);
    });

    it('should reject empty diff', () => {
      const r = PrReviewInputSchema.safeParse({ prTitle: 'x', prDiff: '' });
      expect(r.success).toBe(false);
    });

    it('should reject overlong diff (>50k chars)', () => {
      const r = PrReviewInputSchema.safeParse({
        prTitle: 'x',
        prDiff: 'a'.repeat(50_001),
      });
      expect(r.success).toBe(false);
    });

    it('should default simulate to false', () => {
      const r = PrReviewInputSchema.safeParse({ prTitle: 'x', prDiff: 'y' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.simulate).toBe(false);
    });

    it('should accept minimal valid input', () => {
      const r = PrReviewInputSchema.safeParse({ prTitle: 'x', prDiff: 'y' });
      expect(r.success).toBe(true);
    });
  });
});
