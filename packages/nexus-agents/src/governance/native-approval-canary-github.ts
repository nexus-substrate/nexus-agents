/** GitHub evidence collector. Every completeness flag follows a bounded successful read. */
import { z } from 'zod';
import type { NativeCanaryEvidence as Evidence } from './native-approval-canary.js';
import { NATIVE_CANARY_POLICY as P } from './native-approval-canary.js';
import { readCanaryFiles } from './native-approval-canary-files.js';
import {
  CanaryId as Id,
  CanarySha as Sha,
  readCanaryGet,
  readCanaryPages,
  readCanaryCountedPages,
  readCanaryProtection,
} from './native-approval-canary-read.js';
import type { CanaryRead } from './native-approval-canary-read.js';

const Text = z.string().min(1).max(1024);
const Ref = z.object({ sha: Sha, ref: Text, repo: z.object({ id: Id }) });
const Pull = z.object({
  number: Id,
  user: z.object({ id: Id }),
  state: Text,
  draft: z.boolean(),
  head: Ref,
  base: Ref,
  changed_files: z.number().int().nonnegative(),
  auto_merge: z.object({}).nullable(),
});
const Repo = z.object({
  id: Id,
  full_name: Text,
  owner: z.object({ id: Id }),
  default_branch: Text,
});
const Check = z.object({
  id: Id,
  name: Text,
  app: z.object({ id: Id }),
  head_sha: Sha,
  status: Text,
  conclusion: Text.nullable(),
});
const LegacyStatus = z.object({ id: Id, context: Text, state: Text });
const Run = z.object({ id: Id, event: Text, head_branch: Text, run_attempt: Id });
const PriorPull = z.object({
  number: Id,
  head: z.object({ ref: z.literal(P.branch), repo: z.object({ id: z.literal(P.repositoryId) }) }),
});
const Review = z.object({
  id: Id,
  user: z.object({ id: Id, login: Text, type: Text }),
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']),
  commit_id: Sha,
});

function unique<T extends { id: number }>(items: T[]): T[] {
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error('duplicate-api-identity');
  return items;
}

export async function readCanaryPull(read: CanaryRead, pr: number): Promise<Evidence['pr']> {
  const raw = await readCanaryGet(read, `pulls/${String(Id.parse(pr))}`, Pull);
  return {
    number: raw.number,
    authorId: raw.user.id,
    state: raw.state,
    draft: raw.draft,
    headRepoId: raw.head.repo.id,
    baseRepoId: raw.base.repo.id,
    headRef: raw.head.ref,
    baseRef: raw.base.ref,
    headSha: raw.head.sha,
    baseSha: raw.base.sha,
    changedFiles: raw.changed_files,
    autoMerge: raw.auto_merge !== null,
  };
}

export async function readCanaryReviews(
  read: CanaryRead,
  pr: number
): Promise<Evidence['reviews']> {
  const raw = unique(await readCanaryPages(read, `pulls/${String(Id.parse(pr))}/reviews`, Review));
  return {
    complete: true,
    items: raw.map((review) => ({
      id: review.id,
      authorId: review.user.id,
      authorLogin: review.user.login,
      authorType: review.user.type,
      state: review.state,
      commitSha: review.commit_id,
    })),
  };
}

async function readCanaryChecks(read: CanaryRead, head: string): Promise<Evidence['checks']> {
  const checks = unique(
    await readCanaryCountedPages(
      read,
      `commits/${head}/check-runs?filter=latest`,
      'check_runs',
      Check
    )
  );
  const statuses = unique(
    await readCanaryCountedPages(
      async (args) => {
        return z
          .object({ sha: z.literal(head) })
          .loose()
          .parse(await read(args));
      },
      `commits/${head}/status`,
      'statuses',
      LegacyStatus
    )
  );
  return {
    complete: true,
    statuses: statuses.map((status) => ({
      context: status.context,
      state: status.state,
      headSha: head,
    })),
    items: checks.map((check) => ({
      name: check.name,
      appId: check.app.id,
      headSha: check.head_sha,
      status: check.status,
      conclusion: check.conclusion,
    })),
  };
}

async function readCanaryHistory(read: CanaryRead): Promise<Evidence['history']> {
  const runs = unique(
    await readCanaryCountedPages(
      read,
      'actions/workflows/native-approval-canary.yml/runs',
      'workflow_runs',
      Run
    )
  );
  const pulls = await readCanaryPages(
    read,
    `pulls?state=all&head=nexus-substrate:${P.branch}`,
    PriorPull
  );
  if (new Set(pulls.map((pull) => pull.number)).size !== pulls.length)
    throw new Error('duplicate-pr-history');
  return {
    complete: true,
    runs: runs.map((run) => ({
      id: run.id,
      event: run.event,
      ref: run.head_branch,
      attempt: run.run_attempt,
    })),
    branchPRs: pulls.map((pull) => pull.number),
  };
}

/** Caller supplies invocation/source coverage measured from the trusted main checkout. */
export async function collectCanaryEvidence(
  read: CanaryRead,
  invocation: Evidence['invocation'],
  expected: Evidence['expected'],
  governor: Evidence['governor']
): Promise<Evidence> {
  Id.parse(expected.pr);
  Sha.parse(expected.headSha);
  Sha.parse(expected.baseSha);
  const repo = await readCanaryGet(read, '', Repo);
  const first = await readCanaryProtection(read);
  const pr = await readCanaryPull(read, expected.pr);
  const files = await readCanaryFiles(read, expected);
  const checks = await readCanaryChecks(read, expected.headSha);
  const history = await readCanaryHistory(read);
  const reviews = await readCanaryReviews(read, expected.pr);
  const latest = await readCanaryProtection(read);
  const latestPR = await readCanaryPull(read, expected.pr);
  return {
    repository: {
      id: repo.id,
      ownerId: repo.owner.id,
      name: repo.full_name,
      defaultBranch: repo.default_branch,
    },
    invocation,
    expected,
    mainSha: first.mainSha,
    latestMainSha: latest.mainSha,
    pr,
    latestPR: {
      number: latestPR.number,
      state: latestPR.state,
      draft: latestPR.draft,
      headSha: latestPR.headSha,
      baseSha: latestPR.baseSha,
      autoMerge: latestPR.autoMerge,
    },
    ...files,
    checks,
    history,
    governor,
    reviews,
    protection: { ...first.protection, latestSnapshotSha256: latest.protection.snapshotSha256 },
  };
}
