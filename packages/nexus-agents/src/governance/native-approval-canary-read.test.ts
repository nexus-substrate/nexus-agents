/** Boundary tests: missing pages and protection data never become permission. */
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { CanaryRead } from './native-approval-canary-read.js';
import {
  readCanaryPages,
  readCanaryCountedPages,
  readCanaryProtection,
} from './native-approval-canary-read.js';
import { z } from 'zod';

const RULE = {
  pattern: 'main',
  requiresApprovingReviews: true,
  requiredApprovingReviewCount: 1,
  dismissesStaleReviews: true,
  requiresCodeOwnerReviews: false,
  requireLastPushApproval: false,
  requiresStrictStatusChecks: true,
  requiresStatusChecks: true,
  allowsForcePushes: false,
  allowsDeletions: false,
  requiredStatusChecks: [
    { context: 'CI Success', app: { databaseId: 15368 } },
    { context: 'Governor-path ratification gate', app: { databaseId: 15368 } },
  ],
};
const PROTECTION = {
  data: {
    repository: {
      defaultBranchRef: {
        name: 'main',
        target: { oid: 'b'.repeat(40) },
        branchProtectionRule: RULE,
      },
    },
  },
};
const reader = (value: unknown): Mock<CanaryRead> => vi.fn<CanaryRead>().mockResolvedValue(value);

describe('bounded complete canary list reads', () => {
  it('names the complete empty list', async () => {
    const read = reader([]);
    expect(await readCanaryPages(read, 'pulls/1/reviews', z.number())).toEqual([]);
    expect(read.mock.calls[0]?.[0]).toEqual([
      'api',
      '--method',
      'GET',
      'repos/nexus-substrate/nexus-agents/pulls/1/reviews?per_page=100&page=1',
    ]);
  });
  it('fetches the next page instead of treating a full page as complete', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => i))
      .mockResolvedValueOnce([100]);
    expect(await readCanaryPages(read, 'pulls/1/reviews', z.number())).toHaveLength(101);
    expect(read.mock.calls.length).toBe(2);
  });
  it('refuses exhausted bounds', async () => {
    const read = reader(Array.from({ length: 100 }, (_, i) => i));
    await expect(readCanaryPages(read, 'pulls/1/reviews', z.number())).rejects.toThrow(
      'pagination-limit'
    );
  });
  it('rejects malformed list data', async () => {
    await expect(readCanaryPages(reader({}), 'pulls/1/reviews', z.number())).rejects.toThrow();
  });
  it('does not hide a later-page failure', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => i))
      .mockRejectedValueOnce(new Error('fixture API denied'));
    await expect(readCanaryPages(read, 'pulls/1/reviews', z.number())).rejects.toThrow(
      'fixture API denied'
    );
  });
});

describe('readable classic protection plus active rulesets', () => {
  const setup = (value: unknown = PROTECTION, rules: unknown = []): Mock<CanaryRead> =>
    vi.fn<CanaryRead>().mockResolvedValueOnce(value).mockResolvedValueOnce(rules);
  it('measures and hashes the protection snapshot', async () => {
    const result = await readCanaryProtection(setup());
    expect(result.mainSha).toBe('b'.repeat(40));
    expect(result.protection).toMatchObject({
      strict: true,
      reviews: 1,
      dismissStale: true,
      requiredChecks: [
        { name: 'CI Success', appId: 15368 },
        { name: 'Governor-path ratification gate', appId: 15368 },
      ],
    });
    expect(result.protection.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('hashes the whole measured rule, including extra restrictions', async () => {
    const changed = structuredClone(PROTECTION);
    Object.assign(changed.data.repository.defaultBranchRef.branchProtectionRule, {
      requiresCommitSignatures: true,
    });
    const first = await readCanaryProtection(setup());
    const second = await readCanaryProtection(setup(changed));
    expect(first.protection.snapshotSha256).not.toBe(second.protection.snapshotSha256);
  });
  it.each([{}, { data: { repository: null } }, { ...PROTECTION, errors: [{ message: 'denied' }] }])(
    'rejects absent or errored GraphQL coverage',
    async (value) => {
      await expect(readCanaryProtection(setup(value))).rejects.toThrow();
    }
  );
  it('refuses unsupported inherited rules instead of ignoring them', async () => {
    await expect(
      readCanaryProtection(setup(PROTECTION, [{ type: 'required_signatures' }]))
    ).rejects.toThrow('active-rulesets');
  });
  it('does not call the Administration REST endpoint', async () => {
    const read = setup();
    await readCanaryProtection(read);
    expect(read.mock.calls.map((call) => call[0][1])).toEqual(['graphql', '--method']);
  });
});

describe('counted GitHub collection coverage', () => {
  it('checks total_count against measured rows', async () => {
    const read = reader({ total_count: 1, check_runs: [7] });
    expect(
      await readCanaryCountedPages(read, 'commits/head/check-runs', 'check_runs', z.number())
    ).toEqual([7]);
  });
  it.each([
    { total_count: 2, check_runs: [7] },
    { total_count: 0, check_runs: [7] },
    { total_count: 1001, check_runs: [] },
    { check_runs: [] },
    { total_count: 1, workflow_runs: [7] },
  ])('refuses incomplete or malformed counts', async (value) => {
    await expect(
      readCanaryCountedPages(reader(value), 'commits/head/check-runs', 'check_runs', z.number())
    ).rejects.toThrow();
  });
});
