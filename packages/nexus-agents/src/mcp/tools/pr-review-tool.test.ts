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

  describe('aggregatePrDecisions', () => {
    const makeReview = (
      role: PrReviewVote['role'],
      decision: PrReviewVote['decision'],
      source: PrReviewVote['source'] = 'llm'
    ): PrReviewVote => ({
      role,
      decision,
      confidence: 0.8,
      reasoning: 'test',
      source,
      processingTimeMs: 100,
    });

    it('should be approve when all valid voters approve', () => {
      const reviews = [
        makeReview('architect', 'approve'),
        makeReview('security', 'approve'),
        makeReview('devex', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toBe('approve');
    });

    it('should be request_changes if any non-error voter requests changes', () => {
      const reviews = [
        makeReview('architect', 'approve'),
        makeReview('security', 'request_changes'),
        makeReview('devex', 'approve'),
      ];
      expect(aggregatePrDecisions(reviews)).toBe('request_changes');
    });

    it('should ignore error votes when computing summary', () => {
      const reviews = [
        makeReview('architect', 'approve'),
        makeReview('security', 'approve'),
        makeReview('devex', 'request_changes', 'error'),
      ];
      // The error vote's decision is ignored; remaining are all approve.
      expect(aggregatePrDecisions(reviews)).toBe('approve');
    });

    it('should be abstain when all voters errored', () => {
      const reviews = [
        makeReview('architect', 'approve', 'error'),
        makeReview('security', 'approve', 'error'),
      ];
      expect(aggregatePrDecisions(reviews)).toBe('abstain');
    });

    it('should be abstain when mix is approve + abstain (no clear approval)', () => {
      const reviews = [makeReview('architect', 'approve'), makeReview('security', 'abstain')];
      expect(aggregatePrDecisions(reviews)).toBe('abstain');
    });

    it('should be abstain on empty input', () => {
      expect(aggregatePrDecisions([])).toBe('abstain');
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

    it('should explicitly demand citations in path/file.ext:line form', () => {
      const out = buildPrReviewProposal(baseInput);
      expect(out).toContain('path/file.ext:line');
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
