import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBaseTaskContract } from './task-contract-builders.js';
import { prepareEvidenceVerification, verifyPreparedEvidence } from './evidence-verification.js';
import type {
  EvidenceBinding,
  EvidenceObservation,
  EvidenceVerificationConfig,
} from './evidence-verification-types.js';
import type { TaskContract } from './task-contract.js';
import { MAX_EVIDENCE_BYTES, MAX_EVIDENCE_OBSERVATIONS } from './evidence-verification-types.js';

const DIGEST = 'a'.repeat(64);
const OTHER_DIGEST = 'b'.repeat(64);
const BYTE_COUNT = 12;
const binding: EvidenceBinding = {
  taskId: 'task-evidence',
  attemptId: 'attempt-one',
  subjectRevision: DIGEST,
};
function task(): TaskContract {
  return {
    ...buildBaseTaskContract({ idPrefix: 'evidence', task: 'Validate content', metadata: {} }),
    id: binding.taskId,
    evidenceObligations: [
      {
        id: 'content',
        artifactRef: 'artifact:source',
        required: true,
        mode: 'enforcing',
        claim: 'artifact-content-digest',
        receiptIssuer: 'runtime-reader',
      },
    ],
  };
}
function observation(): EvidenceObservation {
  return {
    ...binding,
    obligationId: 'content',
    artifactRef: 'artifact:source',
    issuer: 'runtime-reader',
    operation: 'artifact-content-digest',
    digest: DIGEST,
    bytes: BYTE_COUNT,
    coverage: { start: 0, end: BYTE_COUNT },
  };
}
function config(): EvidenceVerificationConfig {
  return {
    authorizations: [
      {
        obligationId: 'content',
        artifactRef: 'artifact:source',
        issuer: 'runtime-reader',
        operation: 'artifact-content-digest',
        expectedDigest: DIGEST,
        expectedBytes: BYTE_COUNT,
      },
    ],
    verify: () => [observation()],
  };
}
function verify(
  currentTask = task(),
  currentConfig: EvidenceVerificationConfig | undefined = config()
): ReturnType<typeof verifyPreparedEvidence> {
  return verifyPreparedEvidence(
    prepareEvidenceVerification(currentTask, currentConfig),
    binding,
    Date.now() + 1_000,
    undefined,
    true
  );
}

describe('host-authorized evidence facts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it.each([
    ['taskId', 'other-task'],
    ['attemptId', 'other-attempt'],
    ['subjectRevision', OTHER_DIGEST],
    ['obligationId', 'other-obligation'],
    ['artifactRef', 'artifact:other'],
    ['issuer', 'untrusted-issuer'],
    ['digest', OTHER_DIGEST],
  ] as const)('rejects changed %s', async (field, value) => {
    const outcome = await verify(task(), {
      ...config(),
      verify: () => [{ ...observation(), [field]: value }],
    });
    expect(outcome.error).toContain('MissingEnforcingObligationError');
    expect(outcome.report.acceptedReceipts).toBe(0);
    expect(outcome.report.rejectedReceipts).toBe(1);
    expect(outcome.receipts[0]?.verified).toBe(false);
    expect(outcome.receipts[0]?.metadata?.['hostAuthorizations']).toEqual(config().authorizations);
  });
  it.each([
    { bytes: BYTE_COUNT - 1 },
    { coverage: { start: 1, end: BYTE_COUNT } },
    { coverage: { start: 0, end: BYTE_COUNT - 1 } },
  ])('rejects incomplete byte measurements %j', async (changed) => {
    const outcome = await verify(task(), {
      ...config(),
      verify: () => [{ ...observation(), ...changed }],
    });
    expect(outcome.error).toContain('MissingEnforcingObligationError');
    expect(outcome.report.acceptedReceipts).toBe(0);
  });
  it.each(['worker-inspected-artifact', undefined])(
    'cannot certify unsupported claim %s',
    async (claim) => {
      const current = task();
      current.evidenceObligations = [
        {
          id: 'content',
          artifactRef: 'artifact:source',
          required: true,
          mode: 'enforcing',
          ...(claim === undefined ? {} : { claim }),
        },
      ];
      const outcome = await verify(current);
      expect(outcome.error).toContain('MissingEnforcingObligationError');
      expect(outcome.report.acceptedReceipts).toBe(0);
    }
  );
  it('counts unique fulfilled obligations separately from duplicate receipt submissions', async () => {
    const outcome = await verify(task(), {
      ...config(),
      verify: () => [observation(), observation()],
    });
    expect(outcome.report).toMatchObject({
      criteria: 1,
      acceptedReceipts: 1,
      rejectedReceipts: 1,
      fulfilledObligations: ['content'],
    });
  });
  it('keeps authorization roots private from callback mutation', async () => {
    const current = config();
    const prepared = prepareEvidenceVerification(task(), current);
    current.authorizations[0]!.expectedDigest = OTHER_DIGEST;
    const outcome = await verifyPreparedEvidence(
      prepared,
      binding,
      Date.now() + 1_000,
      undefined,
      true
    );
    expect(outcome.error).toBeUndefined();
    expect(outcome.receipts[0]?.metadata?.['hostAuthorizations']).toEqual(config().authorizations);
    const mutated = await verify(task(), {
      ...config(),
      verify: (request) => {
        request.authorizations[0]!.expectedDigest = OTHER_DIGEST;
        return [{ ...observation(), digest: OTHER_DIGEST }];
      },
    });
    expect(mutated.error).toContain('MissingEnforcingObligationError');
  });

  it.each([
    undefined,
    null,
    {},
    [{ ...observation(), verified: true }],
    Array.from({ length: MAX_EVIDENCE_OBSERVATIONS + 1 }, observation),
  ])('rejects malformed or excessive callback output %#', async (raw) => {
    const malformed = (() => raw) as unknown as EvidenceVerificationConfig['verify'];
    const outcome = await verify(task(), { ...config(), verify: malformed });
    expect(outcome.error).toContain('MissingEnforcingObligationError');
    expect(outcome.report.acceptedReceipts).toBe(0);
    expect(outcome.report.rejectedReceipts).toBeGreaterThan(0);
  });

  it('rejects oversized serialized callback observations', async () => {
    const oversized = (() => [
      { ...observation(), extra: 'x'.repeat(MAX_EVIDENCE_BYTES) },
    ]) as EvidenceVerificationConfig['verify'];
    const outcome = await verify(task(), { ...config(), verify: oversized });
    expect(outcome.report.acceptedReceipts).toBe(0);
    expect(outcome.report.diagnostics[0]).toContain('EvidencePayloadTooLargeError');
  });

  it.each([
    { expectedDigest: DIGEST.toUpperCase() },
    { expectedBytes: 0 },
    { expectedBytes: 100_001 },
    { operation: 'worker-inspection' },
  ])('rejects invalid host content authorization %j', async (changed) => {
    const current = config();
    const invalid = {
      ...current,
      authorizations: [{ ...current.authorizations[0], ...changed }],
    } as unknown as EvidenceVerificationConfig;
    const outcome = await verify(task(), invalid);
    expect(outcome.report.acceptedReceipts).toBe(0);
    expect(outcome.report.rejectedReceipts).toBe(1);
    expect(outcome.error).toContain('MissingEnforcingObligationError');
  });

  it('honors the existing deadline while an asynchronous callback remains pending', async () => {
    const pending: EvidenceVerificationConfig = {
      ...config(),
      verify: () => new Promise(() => {}),
    };
    const outcome = await verifyPreparedEvidence(
      prepareEvidenceVerification(task(), pending),
      binding,
      Date.now() + 20,
      undefined,
      true
    );
    expect(outcome.error).toBeDefined();
    expect(outcome.report.acceptedReceipts).toBe(0);
  });

  it.each(['callback', 'validation'] as const)(
    'rechecks deadline after synchronous %s work',
    async (phase) => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const current: EvidenceVerificationConfig = {
        ...config(),
        verify: () => {
          if (phase === 'callback') {
            clock.mockReturnValue(2_000);
            return [observation()];
          }
          return [
            {
              ...observation(),
              toJSON: () => {
                clock.mockReturnValue(2_000);
                return observation();
              },
            },
          ];
        },
      };
      const outcome = await verifyPreparedEvidence(
        prepareEvidenceVerification(task(), current),
        binding,
        1_500,
        undefined,
        true
      );
      expect(outcome.error).toContain('EvidenceVerificationTimeoutError');
      expect(outcome.report.acceptedReceipts).toBe(0);
    }
  );

  it('discards a callback result after cancellation without accepting a late receipt', async () => {
    const controller = new AbortController();
    const current: EvidenceVerificationConfig = {
      ...config(),
      verify: () => {
        controller.abort();
        return [observation()];
      },
    };
    const outcome = await verifyPreparedEvidence(
      prepareEvidenceVerification(task(), current),
      binding,
      Date.now() + 1_000,
      controller.signal,
      true
    );
    expect(outcome.error).toContain('aborted');
    expect(outcome.report.acceptedReceipts).toBe(0);
  });

  it('reports unmet advisory criteria as unmeasured without inventing fulfilled evidence', async () => {
    const current = task();
    current.evidenceObligations = [
      { id: 'advisory', artifactRef: 'artifact:source', required: true, mode: 'advisory' },
    ];
    const outcome = await verifyPreparedEvidence(
      prepareEvidenceVerification(current, undefined),
      binding,
      Date.now() + 1_000,
      undefined,
      true
    );
    expect(outcome.error).toBeUndefined();
    expect(outcome.report).toMatchObject({
      status: 'unmeasured',
      acceptedReceipts: 0,
      fulfilledObligations: [],
      unmetAdvisory: ['advisory'],
    });
  });

  it('names zero criteria not applicable and never invokes an irrelevant verifier', async () => {
    const current = { ...task(), evidenceObligations: [] };
    const verifier = vi.fn(() => [observation()]);
    const outcome = await verify(current, { ...config(), verify: verifier });
    expect(outcome.report).toMatchObject({
      status: 'not_applicable',
      criteria: 0,
      acceptedReceipts: 0,
      rejectedReceipts: 0,
      fulfilledObligations: [],
    });
    expect(verifier).not.toHaveBeenCalled();
  });
});
