/** Deterministic authorization controls for the single fixed-content canary (#7628). */
import { describe, expect, it } from 'vitest';
import { assessNativeApprovalCanary } from './native-approval-canary.js';

import { FIXTURE } from '../testing/native-approval-canary-fixtures.js';
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const PATH = 'docs/fixtures/native-approval-canary.txt';
const ACTOR_ID = 14303249;

type Evidence = typeof FIXTURE;
type Rejection = { name: string; alter: (input: Evidence) => void };

const REFUSALS: readonly Rejection[] = [
  {
    name: 'preflight run from another actor',
    alter: (x): void => {
      x.preflight.actorId++;
    },
  },
  {
    name: 'preflight for another head',
    alter: (x): void => {
      x.preflight.headSha = 'f'.repeat(40);
    },
  },
  {
    name: 'another repository',
    alter: (x): void => {
      x.repository.id++;
    },
  },
  {
    name: 'another repository owner',
    alter: (x): void => {
      x.repository.ownerId++;
    },
  },
  {
    name: 'another repository name',
    alter: (x): void => {
      x.repository.name = 'other/repo';
    },
  },
  {
    name: 'another dispatch actor',
    alter: (x): void => {
      x.invocation.actorId++;
    },
  },
  {
    name: 'another event',
    alter: (x): void => {
      x.invocation.event = 'pull_request';
    },
  },
  {
    name: 'unratified branch execution',
    alter: (x): void => {
      x.invocation.ref = 'refs/heads/feature';
    },
  },
  {
    name: 'another workflow',
    alter: (x): void => {
      x.invocation.workflowPath = '.github/workflows/other.yml';
    },
  },
  {
    name: 'stale workflow source',
    alter: (x): void => {
      x.invocation.workflowSha = HEAD;
    },
  },
  {
    name: 'different checkout source',
    alter: (x): void => {
      x.invocation.checkoutSha = HEAD;
    },
  },
  {
    name: 'rerun',
    alter: (x): void => {
      x.invocation.runAttempt = 2;
    },
  },
  {
    name: 'main moved',
    alter: (x): void => {
      x.latestMainSha = HEAD;
    },
  },
  {
    name: 'wrong PR',
    alter: (x): void => {
      x.pr.number++;
    },
  },
  {
    name: 'another author',
    alter: (x): void => {
      x.pr.authorId++;
    },
  },
  {
    name: 'closed PR',
    alter: (x): void => {
      x.pr.state = 'closed';
    },
  },
  {
    name: 'draft PR',
    alter: (x): void => {
      x.pr.draft = true;
    },
  },
  {
    name: 'fork head',
    alter: (x): void => {
      x.pr.headRepoId++;
    },
  },
  {
    name: 'different base repository',
    alter: (x): void => {
      x.pr.baseRepoId++;
    },
  },
  {
    name: 'different head branch',
    alter: (x): void => {
      x.pr.headRef = 'feature';
    },
  },
  {
    name: 'different base branch',
    alter: (x): void => {
      x.pr.baseRef = 'other';
    },
  },
  {
    name: 'wrong head',
    alter: (x): void => {
      x.pr.headSha = BASE;
    },
  },
  {
    name: 'stale base',
    alter: (x): void => {
      x.pr.baseSha = HEAD;
    },
  },
  {
    name: 'head race',
    alter: (x): void => {
      x.latestPR.headSha = BASE;
    },
  },
  {
    name: 'base race',
    alter: (x): void => {
      x.latestPR.baseSha = HEAD;
    },
  },
  {
    name: 'closed before write',
    alter: (x): void => {
      x.latestPR.state = 'closed';
    },
  },
  {
    name: 'draft before write',
    alter: (x): void => {
      x.latestPR.draft = true;
    },
  },
  {
    name: 'zero reported files',
    alter: (x): void => {
      x.pr.changedFiles = 0;
    },
  },
  {
    name: 'multiple reported files',
    alter: (x): void => {
      x.pr.changedFiles = 2;
    },
  },
  {
    name: 'zero observed files',
    alter: (x): void => {
      x.files.items = [];
    },
  },
  {
    name: 'extra observed file',
    alter: (x): void => {
      x.files.items.push({ ...x.files.items[0]!, path: 'other.txt' });
    },
  },
  {
    name: 'different path',
    alter: (x): void => {
      x.files.items[0]!.path = 'README.md';
    },
  },
  {
    name: 'renamed file',
    alter: (x): void => {
      x.files.items[0]!.status = 'renamed';
    },
  },
  {
    name: 'symlink',
    alter: (x): void => {
      x.files.items[0]!.mode = '120000';
    },
  },
  {
    name: 'executable file',
    alter: (x): void => {
      x.files.items[0]!.mode = '100755';
    },
  },
  {
    name: 'different bytes',
    alter: (x): void => {
      x.files.items[0]!.content += 'extra';
    },
  },
  {
    name: 'different blob identity',
    alter: (x): void => {
      x.files.items[0]!.blobSha = HEAD;
    },
  },
  {
    name: 'unmeasured governor patterns',
    alter: (x): void => {
      x.governor.patternCount = 0;
    },
  },
  {
    name: 'wrong governor coverage',
    alter: (x): void => {
      x.governor.files = [];
    },
  },
  {
    name: 'governor path',
    alter: (x): void => {
      x.governor.matches = [PATH];
    },
  },
  {
    name: 'no checks',
    alter: (x): void => {
      x.checks.items = [];
    },
  },
  {
    name: 'missing required check',
    alter: (x): void => {
      x.checks.items.pop();
    },
  },
  {
    name: 'duplicate required check',
    alter: (x): void => {
      x.checks.items.push({ ...x.checks.items[0]! });
    },
  },
  {
    name: 'wrong check app',
    alter: (x): void => {
      x.checks.items[0]!.appId++;
    },
  },
  {
    name: 'wrong check head',
    alter: (x): void => {
      x.checks.items[0]!.headSha = BASE;
    },
  },
  {
    name: 'pending check',
    alter: (x): void => {
      x.checks.items[0]!.status = 'in_progress';
    },
  },
  {
    name: 'failed check',
    alter: (x): void => {
      x.checks.items[0]!.conclusion = 'failure';
    },
  },
  {
    name: 'skipped required check',
    alter: (x): void => {
      x.checks.items[0]!.conclusion = 'skipped';
    },
  },
  {
    name: 'non-strict protection',
    alter: (x): void => {
      x.protection.strict = false;
    },
  },
  {
    name: 'different review requirement',
    alter: (x): void => {
      x.protection.reviews = 0;
    },
  },
  {
    name: 'stale approvals retained',
    alter: (x): void => {
      x.protection.dismissStale = false;
    },
  },
  {
    name: 'owner approval requirement',
    alter: (x): void => {
      x.protection.codeOwner = true;
    },
  },
  {
    name: 'last-push approval requirement',
    alter: (x): void => {
      x.protection.lastPush = true;
    },
  },
  {
    name: 'force pushes enabled',
    alter: (x): void => {
      x.protection.forcePushes = true;
    },
  },
  {
    name: 'deletions enabled',
    alter: (x): void => {
      x.protection.deletions = true;
    },
  },
  {
    name: 'no protected checks',
    alter: (x): void => {
      x.protection.requiredChecks = [];
    },
  },
  {
    name: 'protection app drift',
    alter: (x): void => {
      x.protection.requiredChecks[0]!.appId++;
    },
  },
  {
    name: 'protection changed',
    alter: (x): void => {
      x.protection.latestSnapshotSha256 = 'd'.repeat(64);
    },
  },
  {
    name: 'missing current run',
    alter: (x): void => {
      x.history.runs = [];
    },
  },
  {
    name: 'earlier attempt',
    alter: (x): void => {
      x.history.runs.push({ ...x.history.runs[0]!, id: 899 });
    },
  },
  {
    name: 'wrong current run',
    alter: (x): void => {
      x.history.runs[0]!.id++;
    },
  },
  {
    name: 'no branch PR history',
    alter: (x): void => {
      x.history.branchPRs = [];
    },
  },
  {
    name: 'earlier branch PR',
    alter: (x): void => {
      x.history.branchPRs.push(7620);
    },
  },
  {
    name: 'another approval confounds eligibility',
    alter: (x): void => {
      x.reviews.items.push({
        id: 1,
        authorId: ACTOR_ID,
        authorLogin: 'fixture-owner',
        authorType: 'User',
        state: 'APPROVED',
        commitSha: HEAD,
      });
    },
  },
  {
    name: 'prior Actions review',
    alter: (x): void => {
      x.reviews.items.push({
        id: 1,
        authorId: 41898282,
        authorLogin: 'github-actions[bot]',
        authorType: 'Bot',
        state: 'COMMENTED',
        commitSha: HEAD,
      });
    },
  },
];

describe('fixed-content native approval canary', () => {
  it('permits only the complete pinned fixed-content evidence', () => {
    expect(assessNativeApprovalCanary(structuredClone(FIXTURE))).toMatchObject({
      status: 'allowed',
      pr: 7630,
      headSha: HEAD,
      baseSha: BASE,
      runId: 900,
    });
  });

  it.each(REFUSALS)('refuses $name', ({ alter }) => {
    const input = structuredClone(FIXTURE);
    alter(input);
    expect(assessNativeApprovalCanary(input).status).not.toBe('allowed');
  });

  it.each([
    {
      name: 'different commit',
      alter: (x: Evidence): void => {
        x.commit.sha = BASE;
      },
    },
    {
      name: 'no parent',
      alter: (x: Evidence): void => {
        x.commit.parents = [];
      },
    },
    {
      name: 'stale parent',
      alter: (x: Evidence): void => {
        x.commit.parents = [HEAD];
      },
    },
    {
      name: 'merge commit',
      alter: (x: Evidence): void => {
        x.commit.parents.push(HEAD);
      },
    },
    {
      name: 'different file tree',
      alter: (x: Evidence): void => {
        x.files.treeSha = HEAD;
      },
    },
  ])('refuses ancestry mismatch: $name', ({ alter }) => {
    const input = structuredClone(FIXTURE);
    alter(input);
    expect(assessNativeApprovalCanary(input)).toMatchObject({
      status: 'refused',
      reason: 'commit-ancestry',
    });
  });

  it.each(['commit', 'files', 'governor', 'checks', 'history', 'reviews'] as const)(
    'names incomplete %s evidence as unmeasured',
    (key) => {
      const input = structuredClone(FIXTURE);
      input[key].complete = false;
      expect(assessNativeApprovalCanary(input)).toMatchObject({ status: 'unmeasured' });
    }
  );

  it.each([null, undefined, {}, [], 'evidence'])(
    'does not treat malformed input as permission',
    (input) => {
      expect(assessNativeApprovalCanary(input)).toMatchObject({
        status: 'unmeasured',
        reason: 'invalid-evidence',
      });
    }
  );

  it('allows a nonrequired skipped check without weakening mandatory checks', () => {
    const input = structuredClone(FIXTURE);
    input.checks.items.push({
      name: 'Optional fixture',
      appId: 15368,
      headSha: HEAD,
      status: 'completed',
      conclusion: 'skipped',
    });
    expect(assessNativeApprovalCanary(input).status).toBe('allowed');
  });
});

// New collector inputs must be measured booleans, never absent-as-disabled.
describe('canary measurement confounders', () => {
  it.each(['pr', 'latestPR'] as const)('refuses auto-merge on %s', (key) => {
    const input = {
      ...structuredClone(FIXTURE),
      pr: { ...FIXTURE.pr, autoMerge: false },
      latestPR: { ...FIXTURE.latestPR, autoMerge: false },
    };
    input[key].autoMerge = true;
    expect(assessNativeApprovalCanary(input)).toEqual({
      status: 'refused',
      reason: key === 'pr' ? 'pull-request-mismatch' : 'pull-request-changed',
    });
  });
  it('refuses a standing change request', () => {
    const input = structuredClone(FIXTURE);
    input.reviews.items.push({
      id: 2,
      authorId: 12,
      authorLogin: 'fixture-reviewer',
      authorType: 'User',
      state: 'CHANGES_REQUESTED',
      commitSha: HEAD,
    });
    expect(assessNativeApprovalCanary(input)).toEqual({
      status: 'refused',
      reason: 'competing-change-request',
    });
  });
});

describe('legacy commit status coverage', () => {
  it('refuses a failing legacy status alongside green check runs', () => {
    const input = {
      ...structuredClone(FIXTURE),
      checks: {
        ...FIXTURE.checks,
        statuses: [{ context: 'fixture-legacy-ci', headSha: HEAD, state: 'failure' }],
      },
    };
    expect(assessNativeApprovalCanary(input)).toEqual({
      status: 'refused',
      reason: 'legacy-status-not-green',
    });
  });
});
