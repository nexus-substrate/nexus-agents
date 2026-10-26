/** One attempt, explicit commit binding, independent readback, and no merge operation. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { IScmReviewer } from '../scm/types.js';
import type { CanaryRead } from './native-approval-canary-read.js';
import { ok, err } from '../core/index.js';
import { ScmError } from '../scm/types.js';
import { executeNativeApprovalCanary } from './native-approval-canary-execute.js';
import { collectCanaryEvidence } from './native-approval-canary-github.js';
import { FIXTURE as F } from './native-approval-canary.test-fixtures.js';
import type { NativeCanaryEvidence } from './native-approval-canary.js';

vi.mock('./native-approval-canary-github.js', () => ({ collectCanaryEvidence: vi.fn() }));
const RECEIPT = {
  id: 7,
  commitId: F.expected.headSha,
  state: 'APPROVED' as const,
  reviewerId: 41898282,
  reviewerLogin: 'github-actions[bot]',
  reviewerType: 'Bot' as const,
};
const REVIEW = {
  id: 7,
  commitSha: F.expected.headSha,
  state: 'APPROVED',
  authorId: 41898282,
  authorLogin: 'github-actions[bot]',
  authorType: 'Bot',
};
const STATUS = {
  data: {
    repository: {
      pullRequest: {
        headRefOid: F.expected.headSha,
        baseRefOid: F.expected.baseSha,
        state: 'OPEN',
        isDraft: false,
        merged: false,
        autoMergeRequest: null,
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
      },
    },
  },
};
const BASELINE = {
  data: {
    repository: {
      pullRequest: {
        ...STATUS.data.repository.pullRequest,
        reviewDecision: 'REVIEW_REQUIRED',
        mergeStateStatus: 'BLOCKED',
      },
    },
  },
};
const AFTER = (): NativeCanaryEvidence => ({
  ...structuredClone(F),
  reviews: { complete: true, items: [structuredClone(REVIEW)] },
});
const collector = vi.mocked(collectCanaryEvidence);

function setup(): {
  write: Mock<NonNullable<IScmReviewer['createReviewAtCommit']>>;
  read: Mock<CanaryRead>;
  run: () => ReturnType<typeof executeNativeApprovalCanary>;
} {
  const write = vi
    .fn<NonNullable<IScmReviewer['createReviewAtCommit']>>()
    .mockResolvedValue(ok(RECEIPT));
  const read = vi.fn<CanaryRead>().mockResolvedValueOnce(BASELINE).mockResolvedValue(STATUS);
  return {
    write,
    read,
    run: () =>
      executeNativeApprovalCanary({
        read,
        reviewer: { createReviewAtCommit: write },
        invocation: F.invocation,
        expected: F.expected,
        governor: F.governor,
      }),
  };
}

beforeEach(() => {
  collector.mockReset();
  collector.mockResolvedValueOnce(structuredClone(F)).mockResolvedValueOnce(AFTER());
});

describe('native canary execution', () => {
  it('measures eligibility only after the same bot review is independently read back', async () => {
    const { run, write } = setup();
    expect(await run()).toMatchObject({ status: 'eligible', reviewId: 7, writeAttempted: true });
    expect(write.mock.calls.length).toBe(1);
    expect(write.mock.calls[0]?.[0]).toBe(F.expected.pr);
    expect(write.mock.calls[0]?.[2]).toBe('approve');
    expect(write.mock.calls[0]?.[3]).toBe(F.expected.headSha);
    expect(collector.mock.calls.length).toBe(2);
  });
  it('refuses before any write when evidence fails policy', async () => {
    collector.mockReset();
    collector.mockResolvedValue({ ...structuredClone(F), mainSha: F.expected.headSha });
    const { run, write } = setup();
    expect(await run()).toMatchObject({ status: 'refused', writeAttempted: false });
    expect(write.mock.calls.length).toBe(0);
  });
  it('names failed reads as unmeasured and writes nothing', async () => {
    collector.mockReset();
    collector.mockRejectedValue(new Error('fixture-denied'));
    const { run, write } = setup();
    expect(await run()).toMatchObject({ status: 'unmeasured', writeAttempted: false });
    expect(write.mock.calls.length).toBe(0);
  });
  it('does not fall back to the unbound legacy method', async () => {
    const { read } = setup();
    expect(
      await executeNativeApprovalCanary({
        read,
        reviewer: {},
        invocation: F.invocation,
        expected: F.expected,
        governor: F.governor,
      })
    ).toMatchObject({ status: 'unmeasured', writeAttempted: false });
  });
  it('never retries a failed review POST', async () => {
    const { run, write } = setup();
    write.mockResolvedValue(err(new ScmError('fixture-post-denied', 'github')));
    expect(await run()).toMatchObject({ status: 'unmeasured', writeAttempted: true });
    expect(write.mock.calls.length).toBe(1);
    expect(collector.mock.calls.length).toBe(1);
  });
  it.each([
    { reviewerId: 12 },
    { reviewerLogin: 'other[bot]' },
    { reviewerType: 'User' },
    { commitId: F.expected.baseSha },
    { state: 'COMMENTED' },
  ] as const)('refuses an unexpected write receipt %#', async (change) => {
    const { run, write } = setup();
    write.mockResolvedValue(ok({ ...RECEIPT, ...change }));
    expect(await run()).toMatchObject({ status: 'unmeasured', writeAttempted: true });
  });
  it.each([
    {
      name: 'missing review',
      alter: (e: NativeCanaryEvidence): void => {
        e.reviews.items = [];
      },
    },
    {
      name: 'wrong review id',
      alter: (e: NativeCanaryEvidence): void => {
        e.reviews.items[0]!.id++;
      },
    },
    {
      name: 'another approval',
      alter: (e: NativeCanaryEvidence): void => {
        e.reviews.items.push({ ...REVIEW, id: 8, authorId: 12 });
      },
    },
    {
      name: 'head race',
      alter: (e: NativeCanaryEvidence): void => {
        e.latestPR.headSha = F.expected.baseSha;
      },
    },
    {
      name: 'auto-merge race',
      alter: (e: NativeCanaryEvidence): void => {
        e.latestPR.autoMerge = true;
      },
    },
    {
      name: 'protection changed between phases',
      alter: (e: NativeCanaryEvidence): void => {
        e.protection.snapshotSha256 = 'f'.repeat(64);
        e.protection.latestSnapshotSha256 = 'f'.repeat(64);
      },
    },
    {
      name: 'CI rerun failed',
      alter: (e: NativeCanaryEvidence): void => {
        e.checks.items[0]!.conclusion = 'failure';
      },
    },
  ])('marks $name unmeasured after the write', async ({ alter }) => {
    const e = AFTER();
    alter(e);
    collector.mockReset();
    collector.mockResolvedValueOnce(structuredClone(F)).mockResolvedValueOnce(e);
    expect(await setup().run()).toMatchObject({ status: 'unmeasured', writeAttempted: true });
  });
  it('records a negative eligibility measurement when required reviews remain unsatisfied', async () => {
    const { run, read } = setup();
    read.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            ...STATUS.data.repository.pullRequest,
            reviewDecision: 'REVIEW_REQUIRED',
            mergeStateStatus: 'BLOCKED',
          },
        },
      },
    });
    expect(await run()).toMatchObject({ status: 'ineligible', writeAttempted: true, reviewId: 7 });
  });
  it.each([
    null,
    {},
    { ...STATUS, errors: [{ message: 'denied' }] },
    {
      data: {
        repository: {
          pullRequest: { ...STATUS.data.repository.pullRequest, mergeStateStatus: 'UNKNOWN' },
        },
      },
    },
  ])('does not infer eligibility from incomplete or inconclusive readback', async (value) => {
    const { run, read } = setup();
    read.mockResolvedValue(value);
    expect(await run()).toMatchObject({ status: 'unmeasured', writeAttempted: true });
  });
});

it('retains the known review identity if a post-write read fails', async () => {
  collector.mockReset();
  collector
    .mockResolvedValueOnce(structuredClone(F))
    .mockRejectedValueOnce(new Error('fixture-after-post-denied'));
  expect(await setup().run()).toMatchObject({
    status: 'unmeasured',
    writeAttempted: true,
    reviewId: 7,
  });
});

it.each([
  { name: 'already eligible before the bot review', value: STATUS },
  { name: 'native baseline missing', value: null },
  {
    name: 'baseline is for another head',
    value: {
      data: {
        repository: {
          pullRequest: {
            ...STATUS.data.repository.pullRequest,
            headRefOid: F.expected.baseSha,
          },
        },
      },
    },
  },
])('posts nothing when $name', async ({ value }) => {
  const { run, read, write } = setup();
  read.mockReset().mockResolvedValue(value);
  expect(await run()).toMatchObject({ writeAttempted: false });
  expect(write.mock.calls.length).toBe(0);
});

it.each(['policy-refused', 'post-error', 'unexpected-receipt'] as const)(
  'serializes completed evidence on %s',
  async (mode) => {
    const before = structuredClone(F);
    const { run, write } = setup();
    if (mode === 'policy-refused') {
      before.mainSha = F.expected.headSha;
      collector.mockReset().mockResolvedValue(before);
    }
    if (mode === 'post-error')
      write.mockResolvedValue(err(new ScmError('fixture-denied', 'github')));
    if (mode === 'unexpected-receipt') write.mockResolvedValue(ok({ ...RECEIPT, reviewerId: 12 }));
    const serialized: unknown = JSON.parse(JSON.stringify(await run()));
    expect(serialized).toMatchObject({
      before,
      beforeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  }
);

it('serializes both actual native state observations', async () => {
  const serialized: unknown = JSON.parse(JSON.stringify(await setup().run()));
  expect(serialized).toMatchObject({
    baseline: {
      headSha: F.expected.headSha,
      baseSha: F.expected.baseSha,
      reviewDecision: 'REVIEW_REQUIRED',
      mergeStateStatus: 'BLOCKED',
    },
    readback: {
      headSha: F.expected.headSha,
      baseSha: F.expected.baseSha,
      reviewDecision: 'APPROVED',
      mergeStateStatus: 'CLEAN',
    },
  });
});
