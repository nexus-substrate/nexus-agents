/**
 * Merge Readiness Evidence Composer Tests (#7445, parent epic #4463)
 *
 * Verifies canonical merge-readiness evidence composition, binding:
 * 1. candidate identity (baseRef, headSha, treeSha)
 * 2. built artifact hash / reviewed byte prefix disclosure
 * 3. review evidence (verdict, selectedOption, headSha binding, reviewers/conditions)
 * 4. local gate receipts (non-empty validator list; empty = unmeasured)
 * 5. remote CI check inventory (non-empty green checks matching headSha)
 *
 * @module cli/merge-readiness-evidence.test
 */

import { describe, it, expect } from 'vitest';
import { composeMergeReadinessEvidence } from './merge-readiness-evidence.js';
import type {
  MergeReadinessInput,
  CandidateIdentity,
  ArtifactEvidence,
  ReviewEvidence,
  LocalGatesEvidence,
  RemoteCiEvidence,
  MergeReadinessEvidenceEnvelope,
} from './merge-readiness-types.js';

const VALID_HEAD = '1111111111111111111111111111111111111111';
const VALID_TREE = '2222222222222222222222222222222222222222';
const VALID_ARTIFACT_HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function createPositiveControlInput(): MergeReadinessInput {
  const candidate: CandidateIdentity = {
    baseRef: 'main',
    headSha: VALID_HEAD,
    treeSha: VALID_TREE,
  };

  const artifact: ArtifactEvidence = {
    artifactHash: VALID_ARTIFACT_HASH,
    reviewedBytes: 10_000,
    totalBytes: 10_000,
    isTruncated: false,
    reviewedDiffHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  };

  const review: ReviewEvidence = {
    verdict: 'approved',
    selectedOption: 'MERGE',
    headSha: VALID_HEAD,
    reviewers: [
      {
        reviewer: 'security',
        decision: 'approve',
        reasoning: 'No security vulnerabilities identified in candidate changes',
      },
      {
        reviewer: 'architect',
        decision: 'approve',
        reasoning: 'Architectural invariants preserved and modules bounded',
      },
    ],
    conditions: ['Must pass remote CI'],
  };

  const localGates: LocalGatesEvidence = {
    receipts: [
      {
        name: 'security',
        passed: true,
        exitCode: 0,
        logHash: '1234abcd',
        durationMs: 42,
      },
      {
        name: 'architecture',
        passed: true,
        exitCode: 0,
        logHash: '5678efab',
        durationMs: 120,
      },
    ],
  };

  const remoteCi: RemoteCiEvidence = {
    checks: [
      {
        name: 'build-and-test',
        headSha: VALID_HEAD,
        status: 'completed',
        conclusion: 'success',
      },
      {
        name: 'lint',
        headSha: VALID_HEAD,
        status: 'completed',
        conclusion: 'success',
      },
    ],
    requiredChecks: ['build-and-test', 'lint'],
  };

  return { candidate, artifact, review, localGates, remoteCi };
}

function composeWith(overrides: Partial<MergeReadinessInput>): MergeReadinessEvidenceEnvelope {
  return composeMergeReadinessEvidence({
    ...createPositiveControlInput(),
    ...overrides,
  });
}

describe('composeMergeReadinessEvidence', () => {
  it('certifies readiness on a complete positive control', () => {
    const input = createPositiveControlInput();
    const result = composeMergeReadinessEvidence(input);

    expect(result.isReady).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.candidate.isValid).toBe(true);
    expect(result.candidate.baseRef).toBe('main');
    expect(result.candidate.headSha).toBe(VALID_HEAD);
    expect(result.candidate.treeSha).toBe(VALID_TREE);

    expect(result.artifact.status).toBe('verified');
    expect(result.artifact.artifactHash).toBe(VALID_ARTIFACT_HASH);
    expect(result.artifact.reviewedBytes).toBe(10_000);
    expect(result.artifact.totalBytes).toBe(10_000);
    expect(result.artifact.isTruncated).toBe(false);

    expect(result.review.status).toBe('approved');
    expect(result.review.verdict).toBe('approved');
    expect(result.review.selectedOption).toBe('MERGE');
    expect(result.review.headSha).toBe(VALID_HEAD);
    expect(result.review.reviewers).toHaveLength(2);
    expect(result.review.conditions).toEqual(['Must pass remote CI']);

    expect(result.localGates.status).toBe('passed');
    expect(result.localGates.receipts).toHaveLength(2);

    expect(result.remoteCi.status).toBe('passed');
    expect(result.remoteCi.checks).toHaveLength(2);
  });

  describe('review evidence safeguards', () => {
    it('fails closed as hold when selectedOption is HOLD even if verdict is approved (#7445)', () => {
      const positive = createPositiveControlInput();
      const result = composeWith({
        review: {
          ...positive.review,
          verdict: 'approved',
          selectedOption: 'HOLD',
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.review.status).toBe('hold');
      expect(result.blockingReasons).toContain(
        'Review selected option is HOLD: consensus blocks merge despite mechanical approval'
      );
    });

    it('marks review as stale when headSha mismatches candidate headSha (#7445)', () => {
      const positive = createPositiveControlInput();
      const result = composeWith({
        review: {
          ...positive.review,
          verdict: 'approved',
          headSha: '9999999999999999999999999999999999999999',
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.review.status).toBe('stale');
      expect(result.blockingReasons.some((r) => r.includes('stale'))).toBe(true);
    });

    it('marks review as unmeasured when review evidence or reviewers are empty', () => {
      const result = composeWith({
        review: {
          verdict: 'unmeasured',
          headSha: VALID_HEAD,
          reviewers: [],
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.review.status).toBe('unmeasured');
      expect(result.blockingReasons.some((r) => r.includes('unmeasured'))).toBe(true);
    });

    it('marks review as dissenting when reviewers register dissenting decisions', () => {
      const result = composeWith({
        review: {
          verdict: 'approved',
          headSha: VALID_HEAD,
          reviewers: [
            { reviewer: 'security', decision: 'approve' },
            { reviewer: 'catfish', decision: 'request_changes', reasoning: 'Untracked mock leak' },
          ],
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.review.status).toBe('dissenting');
      expect(result.blockingReasons.some((r) => r.includes('dissenting'))).toBe(true);
    });

    it('preserves reviewer reasoning and condition dispositions explicitly', () => {
      const result = composeWith({
        review: {
          verdict: 'approved',
          selectedOption: 'MERGE',
          headSha: VALID_HEAD,
          reviewers: [
            {
              reviewer: 'security',
              decision: 'approve',
              reasoning: 'Audit trail intact',
              conditions: ['Rotate credentials'],
            },
          ],
          conditions: ['Must squash merge'],
        },
      });

      expect(result.review.reviewers?.[0]?.reasoning).toBe('Audit trail intact');
      expect(result.review.reviewers?.[0]?.conditions).toEqual(['Rotate credentials']);
      expect(result.review.conditions).toEqual(['Must squash merge']);
    });
  });

  describe('local gate receipts safeguards', () => {
    it('marks local gates as unmeasured when receipts list is empty (#7445 empty case)', () => {
      const result = composeWith({
        localGates: { receipts: [] },
      });

      expect(result.isReady).toBe(false);
      expect(result.localGates.status).toBe('unmeasured');
      expect(result.blockingReasons).toContain(
        'Local gate receipts are unmeasured: no validators executed'
      );
    });

    it('marks local gates as failed when any receipt did not pass', () => {
      const result = composeWith({
        localGates: {
          receipts: [
            { name: 'security', passed: true },
            { name: 'typecheck', passed: false, error: 'Type mismatch in options' },
          ],
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.localGates.status).toBe('failed');
      expect(result.blockingReasons.some((r) => r.includes('typecheck'))).toBe(true);
    });

    it('marks local gates as failed when command exit code is non-zero', () => {
      const result = composeWith({
        localGates: {
          receipts: [{ name: 'lint', passed: true, exitCode: 1, error: 'Unused import' }],
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.localGates.status).toBe('failed');
    });
  });

  describe('artifact binding and byte prefix disclosure safeguards', () => {
    it('marks artifact as unmeasured when artifactHash is missing (#7445)', () => {
      const result = composeWith({
        artifact: {
          artifactHash: '',
          reviewedBytes: 0,
          totalBytes: 0,
          isTruncated: false,
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.artifact.status).toBe('unmeasured');
      expect(result.blockingReasons.some((r) => r.includes('artifact'))).toBe(true);
    });

    it('supports disclosed prefix coverage honestly while retaining readiness if artifact is bound', () => {
      const result = composeWith({
        artifact: {
          artifactHash: VALID_ARTIFACT_HASH,
          reviewedBytes: 50_000,
          totalBytes: 98_850,
          isTruncated: true,
          reviewedDiffHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        },
      });

      expect(result.artifact.status).toBe('partial');
      expect(result.artifact.isTruncated).toBe(true);
      expect(result.artifact.reviewedBytes).toBe(50_000);
      expect(result.artifact.totalBytes).toBe(98_850);
      expect(result.isReady).toBe(true);
    });
  });

  describe('remote CI inventory safeguards', () => {
    it('marks remote CI as unmeasured when checks list is empty', () => {
      const result = composeWith({
        remoteCi: { checks: [] },
      });

      expect(result.isReady).toBe(false);
      expect(result.remoteCi.status).toBe('unmeasured');
      expect(result.blockingReasons).toContain(
        'Remote CI checks are unmeasured: check inventory is empty'
      );
    });

    it('marks remote CI as stale when any check headSha mismatches candidate headSha', () => {
      const result = composeWith({
        remoteCi: {
          checks: [
            {
              name: 'build',
              headSha: '8888888888888888888888888888888888888888',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.remoteCi.status).toBe('stale');
    });

    it('marks remote CI as pending when a check is in progress', () => {
      const result = composeWith({
        remoteCi: {
          checks: [
            {
              name: 'build',
              headSha: VALID_HEAD,
              status: 'in_progress',
            },
          ],
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.remoteCi.status).toBe('pending');
    });

    it('marks remote CI as failed when a check conclusion is failure', () => {
      const result = composeWith({
        remoteCi: {
          checks: [
            {
              name: 'build',
              headSha: VALID_HEAD,
              status: 'completed',
              conclusion: 'failure',
            },
          ],
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.remoteCi.status).toBe('failed');
    });

    it('detects missing applicable push workflows (#7445 tenth workflow defect)', () => {
      const result = composeWith({
        remoteCi: {
          checks: [
            {
              name: 'build',
              headSha: VALID_HEAD,
              status: 'completed',
              conclusion: 'success',
            },
          ],
          requiredChecks: ['build', 'docs-validate'],
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.remoteCi.status).toBe('missing');
      expect(result.blockingReasons.some((r) => r.includes('docs-validate'))).toBe(true);
    });
  });

  describe('candidate identity safeguards', () => {
    it('rejects candidate with invalid headSha format', () => {
      const result = composeWith({
        candidate: {
          baseRef: 'main',
          headSha: 'not-a-40-hex-sha',
          treeSha: VALID_TREE,
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.candidate.isValid).toBe(false);
      expect(result.blockingReasons.some((r) => r.includes('Candidate identity invalid'))).toBe(
        true
      );
    });

    it('rejects candidate with empty baseRef', () => {
      const result = composeWith({
        candidate: {
          baseRef: '',
          headSha: VALID_HEAD,
          treeSha: VALID_TREE,
        },
      });

      expect(result.isReady).toBe(false);
      expect(result.candidate.isValid).toBe(false);
    });
  });
});
