/** Real collector, guard, canonical writer and receipt parser; only the gh process is faked. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGhTokenCache } from '../scm/github-api-transport.js';
import { createGitHubReviewWriter } from '../scm/github-review-writer.js';
import { executeNativeApprovalCanary } from './native-approval-canary-execute.js';
import { readCanaryJson } from './native-approval-canary-read.js';
import { FIXTURE as F } from './native-approval-canary.test-fixtures.js';
import { NATIVE_CANARY_POLICY as P } from './native-approval-canary.js';

const state = vi.hoisted(() => ({ calls: [] as string[][], posts: 0, mode: '' }));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile = vi.fn();
  Object.defineProperty(execFile, promisify.custom, {
    value: (command: string, args: string[]): Promise<{ stdout: string; stderr: string }> => {
      if (command !== 'gh') return Promise.reject(new Error('unexpected-fixture-command'));
      state.calls.push([...args]);
      return Promise.resolve().then(() => ({ stdout: JSON.stringify(respond(args)), stderr: '' }));
    },
  });
  return { execFile };
});

const HEAD = F.expected.headSha;
const BASE = F.expected.baseSha;
const TREE = F.commit.treeSha;
const DOCS = 'c'.repeat(40);
const DIR = 'd'.repeat(40);
const BLOB = F.files.items[0]!.blobSha;
const tree = (sha: string, path: string, child: string, blob = false): unknown => ({
  sha,
  truncated: false,
  tree: [{ path, sha: child, type: blob ? 'blob' : 'tree', mode: blob ? '100644' : '040000' }],
});
const REVIEW = {
  id: 7,
  commit_id: HEAD,
  state: 'APPROVED',
  user: { id: 41898282, login: 'github-actions[bot]', type: 'Bot' },
};
function protection(): unknown {
  if (state.mode === 'protection-denied') throw new Error('fixture-403');
  return {
    data: {
      repository: {
        defaultBranchRef: {
          name: 'main',
          target: { oid: BASE },
          branchProtectionRule: {
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
            requiredStatusChecks: F.protection.requiredChecks.map((c) => ({
              context: c.name,
              app: { databaseId: c.appId },
            })),
          },
        },
      },
    },
  };
}
function restFixtures(): Record<string, unknown> {
  return {
    '': {
      id: F.repository.id,
      full_name: P.repository,
      owner: { id: P.repositoryOwnerId },
      default_branch: 'main',
    },
    'rules/branches/main': [],
    [`pulls/${String(F.expected.pr)}`]: {
      number: F.expected.pr,
      user: { id: P.actorId },
      state: 'open',
      draft: false,
      auto_merge: null,
      changed_files: 1,
      head: {
        sha: state.mode === 'head-race' && state.posts > 0 ? BASE : HEAD,
        ref: P.branch,
        repo: { id: P.repositoryId },
      },
      base: { sha: BASE, ref: 'main', repo: { id: P.repositoryId } },
    },
    [`git/commits/${HEAD}`]: { sha: HEAD, tree: { sha: TREE }, parents: [{ sha: BASE }] },
    [`compare/${BASE}...${HEAD}`]: {
      status: 'ahead',
      ahead_by: 1,
      behind_by: 0,
      total_commits: 1,
      base_commit: { sha: BASE },
      merge_base_commit: { sha: BASE },
      commits: [{ sha: HEAD }],
      files: [{ filename: P.path, status: 'added', sha: BLOB }],
    },
    [`git/trees/${TREE}`]:
      state.mode === 'truncated-tree'
        ? { sha: TREE, truncated: true, tree: [] }
        : tree(TREE, 'docs', DOCS),
    [`git/trees/${DOCS}`]: tree(DOCS, 'fixtures', DIR),
    [`git/trees/${DIR}`]: tree(DIR, 'native-approval-canary.txt', BLOB, true),
    [`git/blobs/${BLOB}`]: {
      sha: BLOB,
      size: Buffer.byteLength(P.content),
      encoding: 'base64',
      content: Buffer.from(state.mode === 'wrong-bytes' ? 'wrong' : P.content).toString('base64'),
    },
    [`commits/${HEAD}/check-runs`]: {
      total_count: 2,
      check_runs: F.checks.items.map((c, i) => ({
        id: i + 1,
        name: c.name,
        app: { id: c.appId },
        head_sha: HEAD,
        status: c.status,
        conclusion: c.conclusion,
      })),
    },
    [`commits/${HEAD}/status`]: { sha: HEAD, total_count: 0, statuses: [] },
    'actions/workflows/native-approval-canary.yml/runs': {
      total_count: 1,
      workflow_runs: [{ id: 900, event: 'workflow_dispatch', head_branch: 'main', run_attempt: 1 }],
    },
    pulls: [{ number: F.expected.pr, head: { ref: P.branch, repo: { id: P.repositoryId } } }],
  };
}

function reviewFixture(raw: string | undefined): unknown {
  if (state.mode === 'reviews-second-page-denied') {
    if (raw?.includes('page=2') === true) throw new Error('fixture-later-page-denied');
    return Array.from({ length: 100 }, (_, i) => ({ ...REVIEW, id: i + 1, state: 'COMMENTED' }));
  }
  return state.posts === 0 ? [] : [REVIEW];
}

function endpointFor(args: string[]): { raw: string | undefined; endpoint: string } {
  const raw = args[1] === '--method' ? args[3] : args[1];
  const endpoint =
    raw?.replace('repos/nexus-substrate/nexus-agents', '').replace(/^\//, '').split('?')[0] ?? '';
  return { raw, endpoint };
}

function respond(args: string[]): unknown {
  if (args[1] === 'graphql') {
    if (args.some((arg) => arg.includes('defaultBranchRef'))) return protection();
    return {
      data: {
        repository: {
          pullRequest: {
            headRefOid: HEAD,
            baseRefOid: BASE,
            state: 'OPEN',
            isDraft: false,
            merged: false,
            autoMergeRequest: null,
            reviewDecision: state.posts === 0 ? 'REVIEW_REQUIRED' : 'APPROVED',
            mergeStateStatus: state.posts === 0 ? 'BLOCKED' : 'CLEAN',
          },
        },
      },
    };
  }
  const { raw, endpoint } = endpointFor(args);
  if (args.includes('POST')) {
    state.posts++;
    if (endpoint !== `pulls/${String(F.expected.pr)}/reviews`)
      throw new Error('unexpected-fixture-write');
    return state.mode === 'wrong-receipt' ? { ...REVIEW, commit_id: BASE } : REVIEW;
  }
  if (endpoint === `pulls/${String(F.expected.pr)}/reviews`) return reviewFixture(raw);
  const routes = restFixtures();
  if (!(endpoint in routes)) throw new Error('unexpected-fixture-read');
  return routes[endpoint];
}
const run = (): ReturnType<typeof executeNativeApprovalCanary> =>
  executeNativeApprovalCanary({
    read: readCanaryJson,
    reviewer: createGitHubReviewWriter(P.repository),
    invocation: F.invocation,
    expected: F.expected,
    governor: F.governor,
  });
beforeEach(() => {
  state.calls = [];
  state.posts = 0;
  state.mode = '';
  vi.stubEnv('GITHUB_TOKEN', 'fixture-not-a-real-token');
  resetGhTokenCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetGhTokenCache();
});

describe('native canary transport integration', () => {
  it('binds the real canonical POST and independently reads its receipt and eligibility', async () => {
    expect(await run()).toMatchObject({ status: 'eligible', writeAttempted: true, reviewId: 7 });
    expect(state.posts).toBe(1);
    const post = state.calls.find((args) => args.includes('POST'));
    expect(post).toContain(`commit_id=${HEAD}`);
    expect(post).toContain('event=APPROVE');
    expect(state.calls.length).toBeGreaterThan(30);
    expect(
      state.calls.some(
        (args) => args.includes('merge') || args.includes('PATCH') || args.includes('DELETE')
      )
    ).toBe(false);
  });
  it.each(['truncated-tree', 'wrong-bytes', 'protection-denied', 'reviews-second-page-denied'])(
    'does not POST when %s prevents complete evidence',
    async (mode) => {
      state.mode = mode;
      expect(await run()).toMatchObject({ status: 'unmeasured', writeAttempted: false });
      expect(state.posts).toBe(0);
    }
  );
  it.each(['wrong-receipt', 'head-race'])(
    'reports %s after one POST without retrying',
    async (mode) => {
      state.mode = mode;
      expect(await run()).toMatchObject({ status: 'unmeasured', writeAttempted: true });
      expect(state.posts).toBe(1);
    }
  );
});

it('retains distinct bounded causes for missing protection and truncated git evidence', async () => {
  state.mode = 'protection-denied';
  const denied = await run();
  expect(denied).toMatchObject({
    diagnostic: { code: 'canary-api-read-failed', operation: 'protection' },
  });
  state.mode = 'truncated-tree';
  const truncated = await run();
  expect(truncated).toMatchObject({
    diagnostic: { code: 'invalid-evidence-shape', fields: ['truncated'] },
  });
});
