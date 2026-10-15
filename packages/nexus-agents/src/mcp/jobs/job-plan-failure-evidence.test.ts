/** Encoding, provenance and disclosure boundaries for failed-plan diagnostics (#7424). */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { toolStructuredError } from '../tools/tool-result.js';
import { FAKE_ANTHROPIC_KEY } from '../../testing/test-secrets.js';
import { sanitizeErrorDetails } from '../../security/output-sanitizer.js';
import {
  extractPlanFailureEvidence,
  PlanFailureEvidenceSchema,
  type PlanFailureEvidence,
  PLAN_EVIDENCE_TEXT_MAX_BYTES,
  planFailureEvidenceFromTaskState,
} from './job-plan-failure-evidence.js';

const ORIGIN = {
  jobId: 'custom-plan-session',
  dispatchId: '00000000-0000-4000-8000-000000000742',
  producerVersion: 'dev',
};
const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
function evidence(plan: string, proposal?: string): PlanFailureEvidence | undefined {
  return extractPlanFailureEvidence(
    'run_dev_pipeline',
    toolStructuredError({
      errorCategory: 'business',
      message: 'Plan rejected',
      detail: {
        completed: false,
        planStatus: 'unapproved',
        plan,
        ...(proposal !== undefined ? { planVoteProposal: proposal } : {}),
        stack: 'Excluded stack',
        responseBody: 'Excluded body',
      },
    }),
    ORIGIN
  );
}

describe('bounded plan failure evidence', () => {
  it('names the empty plan and missing proposal without inventing a vote', () => {
    const item = evidence('');
    expect(item?.plan).toMatchObject({
      text: '',
      coverage: 'complete',
      rawBytes: 0,
      rawSha256: hash(''),
    });
    expect(item?.proposal).toBeUndefined();
    expect(item?.voteRecordId).toBeUndefined();
  });
  it.each([PLAN_EVIDENCE_TEXT_MAX_BYTES - 1, PLAN_EVIDENCE_TEXT_MAX_BYTES])(
    'keeps all %i boundary bytes',
    (size) => {
      const text = 'x'.repeat(size);
      expect(evidence(text)?.plan).toMatchObject({
        text,
        rawSha256: hash(text),
        sanitizedSha256: hash(text),
        retainedSha256: hash(text),
        coverage: 'complete',
      });
    }
  );
  it('keeps a byte-bound UTF-8 prefix and binds full sanitized and retained text separately', () => {
    const raw = 'x'.repeat(PLAN_EVIDENCE_TEXT_MAX_BYTES - 1) + '🌍tail';
    const retained = 'x'.repeat(PLAN_EVIDENCE_TEXT_MAX_BYTES - 1);
    expect(evidence(raw)?.plan).toMatchObject({
      text: retained,
      coverage: 'truncated',
      redacted: false,
      truncated: true,
      rawSha256: hash(raw),
      sanitizedSha256: hash(raw),
      retainedSha256: hash(retained),
      retainedBytes: Buffer.byteLength(retained),
    });
  });
  it('redacts the whole source before truncating and reports both transformations', () => {
    const raw = `${FAKE_ANTHROPIC_KEY} ${'x'.repeat(PLAN_EVIDENCE_TEXT_MAX_BYTES)}`;
    const item = evidence(raw);
    expect(item?.plan).toMatchObject({
      coverage: 'truncated',
      redacted: true,
      truncated: true,
      rawSha256: hash(raw),
      sanitizedSha256: hash(sanitizeErrorDetails(raw)),
    });
    expect(JSON.stringify(item)).not.toContain(FAKE_ANTHROPIC_KEY);
  });
  it.each([
    { raw: String.fromCharCode(0xd800), reason: 'invalid_utf8' },
    { raw: 'plan' + String.fromCharCode(0) + 'tail', reason: 'nul' },
    { raw: 'x'.repeat(512 * 1024 + 1), reason: 'source_too_large' },
  ])('reports $reason without claiming a recoverable exact artifact', ({ raw, reason }) => {
    expect(evidence(raw)?.plan).toEqual({ coverage: 'invalid', reason });
  });
  it('bounds aggregate serialized JSON even for maximally escaped retained text', () => {
    const item = evidence(
      String.fromCharCode(1).repeat(PLAN_EVIDENCE_TEXT_MAX_BYTES),
      String.fromCharCode(2).repeat(PLAN_EVIDENCE_TEXT_MAX_BYTES)
    );
    expect(item).toBeDefined();
    expect(PlanFailureEvidenceSchema.safeParse(item).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(item))).toBeLessThan(512 * 1024);
  });
  it('strips unknown fields and refuses other tools, categories and non-planning failures', () => {
    expect(JSON.stringify(evidence('plan'))).not.toContain('Excluded');
    const failure = toolStructuredError({
      errorCategory: 'business',
      message: 'fail',
      detail: { completed: false, planStatus: 'unapproved', plan: 'plan' },
    });
    expect(extractPlanFailureEvidence('run_pipeline', failure, ORIGIN)).toBeUndefined();
    expect(
      extractPlanFailureEvidence(
        'run_dev_pipeline',
        toolStructuredError({
          errorCategory: 'internal',
          message: 'fail',
          detail: { completed: false, planStatus: 'unapproved', plan: 'plan' },
        }),
        ORIGIN
      )
    ).toBeUndefined();
    expect(
      extractPlanFailureEvidence('run_dev_pipeline', { isError: true }, ORIGIN)
    ).toBeUndefined();
    expect(
      extractPlanFailureEvidence(
        'run_dev_pipeline',
        toolStructuredError({
          errorCategory: 'business',
          message: 'fail',
          detail: { completed: true, planStatus: 'unapproved', plan: 'plan' },
        }),
        ORIGIN
      )
    ).toBeUndefined();
  });
  it('requires the wrapper and same job and dispatch, without treating a missing nonce as a match', () => {
    const item = evidence('plan');
    const wrapped = { v: 1, kind: 'job_failure_evidence', failureEvidence: item };
    expect(planFailureEvidenceFromTaskState(wrapped, ORIGIN.jobId, ORIGIN.dispatchId)).toEqual(
      item
    );
    expect(
      planFailureEvidenceFromTaskState(wrapped, 'other-job', ORIGIN.dispatchId)
    ).toBeUndefined();
    expect(
      planFailureEvidenceFromTaskState(
        wrapped,
        ORIGIN.jobId,
        '00000000-0000-4000-8000-000000000743'
      )
    ).toBeUndefined();
    expect(planFailureEvidenceFromTaskState(wrapped, ORIGIN.jobId, undefined)).toBeUndefined();
    expect(planFailureEvidenceFromTaskState(item, ORIGIN.jobId, ORIGIN.dispatchId)).toBeUndefined();
  });
  it('refuses tampered retained bytes and recognizable credentials at the persisted boundary', () => {
    const item = evidence('plan');
    expect(item).toBeDefined();
    expect(
      PlanFailureEvidenceSchema.safeParse({ ...item, plan: { ...item?.plan, text: 'tampered' } })
        .success
    ).toBe(false);
    expect(
      PlanFailureEvidenceSchema.safeParse({
        ...item,
        plan: {
          ...item?.plan,
          text: FAKE_ANTHROPIC_KEY,
          retainedSha256: hash(FAKE_ANTHROPIC_KEY),
          retainedBytes: Buffer.byteLength(FAKE_ANTHROPIC_KEY),
        },
      }).success
    ).toBe(false);
  });
  it('rejects a complete-coverage claim with inconsistent raw provenance', () => {
    const item = evidence('plan');
    expect(
      PlanFailureEvidenceSchema.safeParse({
        ...item,
        plan: {
          ...item?.plan,
          rawSha256: hash('other plan'),
        },
      }).success
    ).toBe(false);
  });
  it.each(Array.from({ length: 17 }, (_, offset) => offset))(
    'retains sanitizer-stable evidence when a marker is cut at offset %i',
    (offset) => {
      const raw =
        'x'.repeat(PLAN_EVIDENCE_TEXT_MAX_BYTES - offset - 10) +
        ' password=' +
        FAKE_ANTHROPIC_KEY +
        ' trailing body';
      const item = evidence(raw);
      expect(item?.plan).toMatchObject({ coverage: 'truncated', redacted: true, truncated: true });
      expect(PlanFailureEvidenceSchema.safeParse(item).success).toBe(true);
      expect(JSON.stringify(item)).not.toContain(FAKE_ANTHROPIC_KEY);
    }
  );
});
