/** Synthetic evidence shared by policy and collector tests; never runtime authority. */
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const PATH = 'docs/fixtures/native-approval-canary.txt';
const CONTENT = 'Nexus native approval eligibility canary v1.\n';
const REPO_ID = 1127393912;
const ACTOR_ID = 14303249;
const CANARY_ACTOR_ID = 41898282;

export const FIXTURE = {
  repository: {
    id: REPO_ID,
    ownerId: 285505621,
    name: 'nexus-substrate/nexus-agents',
    defaultBranch: 'main',
  },
  invocation: {
    actorId: CANARY_ACTOR_ID,
    event: 'workflow_dispatch',
    ref: 'refs/heads/main',
    workflowPath: '.github/workflows/native-approval-canary.yml',
    workflowSha: BASE,
    checkoutSha: BASE,
    runId: 900,
    runAttempt: 1,
  },
  preflight: {
    complete: true as const,
    actorId: ACTOR_ID,
    event: 'workflow_dispatch' as const,
    ref: 'refs/heads/main' as const,
    workflowPath: '.github/workflows/native-approval-preflight.yml',
    workflowSha: BASE,
    runId: 800,
    runAttempt: 1 as const,
    observedMainSha: BASE,
    prNumber: 7630,
    headSha: HEAD,
    baseSha: BASE,
    querySha256: 'c'.repeat(64),
    responseSha256: 'd'.repeat(64),
  },
  expected: { pr: 7630, headSha: HEAD, baseSha: BASE },
  mainSha: BASE,
  latestMainSha: BASE,
  commit: { complete: true, sha: HEAD, parents: [BASE], treeSha: 'e'.repeat(40) },
  pr: {
    number: 7630,
    authorId: ACTOR_ID,
    state: 'open',
    draft: false,
    headRepoId: REPO_ID,
    baseRepoId: REPO_ID,
    headRef: 'probe/native-approval-eligibility-v1',
    baseRef: 'main',
    headSha: HEAD,
    baseSha: BASE,
    changedFiles: 1,
    autoMerge: false,
  },
  latestPR: {
    number: 7630,
    state: 'open',
    draft: false,
    headSha: HEAD,
    baseSha: BASE,
    autoMerge: false,
  },
  files: {
    complete: true,
    treeSha: 'e'.repeat(40),
    items: [
      {
        path: PATH,
        status: 'added',
        mode: '100644',
        content: CONTENT,
        // Independently measured with `git hash-object --stdin`, without writing an object.
        blobSha: '4f4dfca92a741c45b6f7628e7c8d6b5e6c578f85',
      },
    ],
  },
  governor: { complete: true, patternCount: 47, files: [PATH], matches: [] as string[] },
  checks: {
    complete: true,
    statuses: [] as { context: string; headSha: string; state: string }[],
    items: [
      {
        name: 'CI Success',
        appId: 15368,
        headSha: HEAD,
        status: 'completed',
        conclusion: 'success',
      },
      {
        name: 'Governor-path ratification gate',
        appId: 15368,
        headSha: HEAD,
        status: 'completed',
        conclusion: 'success',
      },
    ],
  },
  protection: {
    strict: true,
    reviews: 1,
    dismissStale: true,
    codeOwner: false,
    lastPush: false,
    forcePushes: false,
    deletions: false,
    requiredChecks: [
      { name: 'CI Success', appId: 15368 },
      { name: 'Governor-path ratification gate', appId: 15368 },
    ],
    snapshotSha256: 'c'.repeat(64),
    latestSnapshotSha256: 'c'.repeat(64),
  },
  history: {
    complete: true,
    runs: [{ id: 900, event: 'workflow_dispatch', ref: 'main', attempt: 1, actorId: 41898282 }],
    branchPRs: [7630],
  },
  reviews: {
    complete: true,
    items: [] as {
      id: number;
      authorId: number;
      authorLogin: string;
      authorType: string;
      state: string;
      commitSha: string;
    }[],
  },
};
