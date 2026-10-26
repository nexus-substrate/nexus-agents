/** Collector tests cross real API boundary shapes into the pure policy. */
import { describe, expect, it, vi } from 'vitest';
import { collectCanaryEvidence } from './native-approval-canary-github.js';
import { assessNativeApprovalCanary } from './native-approval-canary.js';
import { FIXTURE as F } from '../testing/native-approval-canary-fixtures.js';
import type { CanaryRead } from './native-approval-canary-read.js';

vi.mock('./native-approval-canary-files.js', () => ({
  readCanaryFiles: vi.fn(() => Promise.resolve({ commit: F.commit, files: F.files })),
}));
vi.mock('./native-approval-canary-read.js', async (original) => ({
  ...(await original<object>()),
  readCanaryProtection: vi.fn(() =>
    Promise.resolve({ mainSha: F.mainSha, protection: F.protection })
  ),
}));
const PR = {
  number: F.expected.pr,
  user: { id: F.pr.authorId },
  state: 'open',
  draft: false,
  auto_merge: null,
  changed_files: 1,
  head: { sha: F.expected.headSha, ref: F.pr.headRef, repo: { id: F.repository.id } },
  base: { sha: F.expected.baseSha, ref: 'main', repo: { id: F.repository.id } },
};
const REPO = {
  id: F.repository.id,
  owner: { id: F.repository.ownerId },
  full_name: F.repository.name,
  default_branch: 'main',
};
const CHECKS = {
  total_count: 2,
  check_runs: F.checks.items.map((item, i) => ({
    id: i + 1,
    name: item.name,
    app: { id: item.appId },
    head_sha: item.headSha,
    status: item.status,
    conclusion: item.conclusion,
  })),
};
const RUNS = {
  total_count: 1,
  workflow_runs: [{ id: 900, event: 'workflow_dispatch', head_branch: 'main', run_attempt: 1 }],
};
function fixtureRead(override: Record<string, unknown> = {}): CanaryRead {
  const routes: Record<string, unknown> = {
    '': REPO,
    [`pulls/${String(F.expected.pr)}`]: PR,
    [`commits/${F.expected.headSha}/check-runs`]: CHECKS,
    [`commits/${F.expected.headSha}/status`]: {
      sha: F.expected.headSha,
      total_count: 0,
      statuses: [],
    },
    'actions/workflows/native-approval-canary.yml/runs': RUNS,
    pulls: [{ number: F.expected.pr, head: { ref: F.pr.headRef, repo: { id: F.repository.id } } }],
    [`pulls/${String(F.expected.pr)}/reviews`]: [],
    ...override,
  };
  return (args) => {
    const endpoint =
      args[3]?.replace('repos/nexus-substrate/nexus-agents', '').replace(/^\//, '').split('?')[0] ??
      '';
    if (!(endpoint in routes)) throw new Error('unexpected-fixture-endpoint');
    return Promise.resolve(structuredClone(routes[endpoint]));
  };
}
const collect = (read: CanaryRead): ReturnType<typeof collectCanaryEvidence> =>
  collectCanaryEvidence(read, F.invocation, F.expected, F.governor);

describe('GitHub native canary evidence collection', () => {
  it('produces allowed evidence from complete positive-control API responses', async () => {
    expect(assessNativeApprovalCanary(await collect(fixtureRead()))).toMatchObject({
      status: 'allowed',
    });
  });
  it('rejects missing auto_merge coverage', async () => {
    const { auto_merge: omitted, ...missing } = PR;
    expect(omitted).toBeNull();
    await expect(
      collect(fixtureRead({ [`pulls/${String(F.expected.pr)}`]: missing }))
    ).rejects.toThrow();
  });
  it('preserves auto-merge enabled as a refusal', async () => {
    const e = await collect(
      fixtureRead({ [`pulls/${String(F.expected.pr)}`]: { ...PR, auto_merge: {} } })
    );
    expect(assessNativeApprovalCanary(e).status).toBe('refused');
  });
  it('does not disguise API errors as empty reviews', async () => {
    const read = fixtureRead();
    await expect(
      collect(async (args) => {
        if (args.join(' ').includes('/reviews')) throw new Error('fixture-read-denied');
        return read(args);
      })
    ).rejects.toThrow('fixture-read-denied');
  });
  it('rejects duplicate check ids instead of counting them twice', async () => {
    await expect(
      collect(
        fixtureRead({
          [`commits/${F.expected.headSha}/check-runs`]: {
            ...CHECKS,
            check_runs: [CHECKS.check_runs[0], CHECKS.check_runs[0]],
          },
        })
      )
    ).rejects.toThrow('duplicate');
  });
  it('keeps an earlier workflow run as evidence that the experiment is used', async () => {
    const e = await collect(
      fixtureRead({
        'actions/workflows/native-approval-canary.yml/runs': {
          total_count: 2,
          workflow_runs: [...RUNS.workflow_runs, { ...RUNS.workflow_runs[0], id: 899 }],
        },
      })
    );
    expect(assessNativeApprovalCanary(e)).toMatchObject({
      status: 'refused',
      reason: 'experiment-already-used',
    });
  });
  it('rejects a mismatched fixed-branch history response', async () => {
    await expect(
      collect(
        fixtureRead({
          pulls: [{ number: F.expected.pr, head: { ref: 'other', repo: { id: F.repository.id } } }],
        })
      )
    ).rejects.toThrow();
  });
  it('measures competing approvals without counting them as native eligibility', async () => {
    const e = await collect(
      fixtureRead({
        [`pulls/${String(F.expected.pr)}/reviews`]: [
          {
            id: 1,
            user: { id: 12, login: 'fixture-reviewer', type: 'User' },
            state: 'APPROVED',
            commit_id: F.expected.headSha,
          },
        ],
      })
    );
    expect(assessNativeApprovalCanary(e)).toMatchObject({
      status: 'refused',
      reason: 'competing-approval',
    });
  });
});
