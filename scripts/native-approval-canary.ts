/** Trusted-main launcher for the one fixed-content experiment (#7629). No fixture flags. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ROOT, REPOSITORY_ROOT } from './script-paths.js';
import { canaryFailureCause } from '../packages/nexus-agents/src/governance/native-approval-canary-diagnostics.js';
import { governorPathsFromCodeowners, isGovernorPath } from './governor-section.js';
import { NATIVE_CANARY_POLICY as P } from '../packages/nexus-agents/src/governance/native-approval-canary.js';
import type { NativeCanaryEvidence as Evidence } from '../packages/nexus-agents/src/governance/native-approval-canary.js';
import { executeNativeApprovalCanary } from '../packages/nexus-agents/src/governance/native-approval-canary-execute.js';
import type { CanaryExecutionResult } from '../packages/nexus-agents/src/governance/native-approval-canary-execute.js';
import {
  readCanaryGet,
  readCanaryJson,
} from '../packages/nexus-agents/src/governance/native-approval-canary-read.js';
import type { CanaryRead } from '../packages/nexus-agents/src/governance/native-approval-canary-read.js';
import { createGitHubReviewWriter } from '../packages/nexus-agents/src/scm/github-review-writer.js';

const Integer = z
  .string()
  .regex(/^[1-9][0-9]{0,15}$/)
  .transform(Number)
  .pipe(z.number().int().positive());
const Sha = z.string().regex(/^[0-9a-f]{40}$/);
const Environment = z.object({
  GITHUB_ACTIONS: z.literal('true'),
  GITHUB_REPOSITORY: z.literal(P.repository),
  GITHUB_REPOSITORY_ID: z.literal(String(P.repositoryId)),
  CANARY_OWNER_ID: z.literal(String(P.repositoryOwnerId)),
  GITHUB_ACTOR_ID: z.enum([String(P.actorId), String(P.dispatcherId)]),
  GITHUB_EVENT_NAME: z.literal('workflow_dispatch'),
  GITHUB_REF: z.literal('refs/heads/main'),
  GITHUB_SHA: Sha,
  CANARY_WORKFLOW_SHA: Sha,
  GITHUB_WORKFLOW_REF: z.literal(`${P.repository}/${P.workflowPath}@refs/heads/main`),
  GITHUB_RUN_ID: Integer,
  GITHUB_RUN_ATTEMPT: z.literal('1'),
  GITHUB_WORKSPACE: z.string().min(1),
  GITHUB_SERVER_URL: z.literal('https://github.com'),
  GITHUB_API_URL: z.literal('https://api.github.com'),
  GH_HOST: z.literal('github.com'),
  GH_TOKEN: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  NEXUS_SCRIPT_ROOT: z.undefined().optional(),
  CANARY_PR: Integer,
  CANARY_HEAD_SHA: Sha,
  CANARY_BASE_SHA: Sha,
  CANARY_PREFLIGHT_RUN_ID: Integer,
  CANARY_PREFLIGHT_RECEIPT_JSON: z.string().min(2).max(8192),
});
const PreflightReceipt = z
  .object({
    status: z.literal('READABLE'),
    complete: z.literal(true),
    repository: z.literal(P.repository),
    repositoryId: z.literal(P.repositoryId),
    actorId: z.literal(P.actorId),
    event: z.literal('workflow_dispatch'),
    ref: z.literal('refs/heads/main'),
    workflowPath: z.literal(P.preflightWorkflowPath),
    workflowSha: Sha,
    runId: z.number().int().positive(),
    runAttempt: z.literal(1),
    observedMainSha: Sha,
    prNumber: z.number().int().positive(),
    headSha: Sha,
    baseSha: Sha,
    querySha256: z.string().regex(/^[0-9a-f]{64}$/),
    responseSha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
type PreflightReceipt = z.infer<typeof PreflightReceipt>;
const PreflightRun = z
  .object({
    id: z.number().int().positive(),
    event: z.literal('workflow_dispatch'),
    head_branch: z.literal('main'),
    head_sha: Sha,
    run_attempt: z.literal(1),
    status: z.enum(['queued', 'in_progress', 'completed']),
    conclusion: z.string().nullable().optional(),
    actor: z.object({ id: z.number().int().positive() }),
    path: z.string().min(1),
  })
  .loose();
const PREFLIGHT_RUN_POLL_INTERVAL_MS = 2_000;
const PREFLIGHT_RUN_MAX_POLLS = 10;
const SOURCE_PATHS = [
  'scripts/native-approval-canary.ts',
  'packages/nexus-agents/src/scm/github-api-transport.ts',
  'packages/nexus-agents/src/scm/github-review-writer.ts',
  'packages/nexus-agents/src/config/subprocess-timeouts.ts',
  'packages/nexus-agents/src/core/result.ts',
  'scripts/script-paths.ts',
  'scripts/check-native-canary-source.ts',
  'scripts/check-native-canary-snapshot.py',
  'governance/native-approval-canary-source-snapshot.json',
  'governance/native-approval-canary-runtime-closure.json',
  P.preflightWorkflowPath,
  P.workflowPath,
  'packages/nexus-agents/src/governance/native-approval-canary.ts',
  'packages/nexus-agents/src/scm/types.ts',
  'packages/nexus-agents/src/scm/github-provider-traits.ts',
  'packages/nexus-agents/src/scm/github-review-receipt.ts',
];
type GitRead = (args: readonly string[]) => string;
type LaunchContext = Pick<Evidence, 'invocation' | 'expected' | 'governor'> & {
  preflight: Evidence['preflight'];
  preflightReceipt: PreflightReceipt;
};

export async function verifyCanaryPreflightRun(
  read: CanaryRead,
  receipt: PreflightReceipt,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
): Promise<void> {
  for (let attempt = 0; attempt < PREFLIGHT_RUN_MAX_POLLS; attempt++) {
    const run = await readCanaryGet(read, `actions/runs/${String(receipt.runId)}`, PreflightRun);
    assertPreflightRunProvenance(run, receipt);
    if (run.status === 'completed') {
      if (run.conclusion !== 'success') throw new Error('preflight-run-not-successful');
      return;
    }
    if (attempt === PREFLIGHT_RUN_MAX_POLLS - 1)
      throw new Error('preflight-run-completion-timeout');
    await wait(PREFLIGHT_RUN_POLL_INTERVAL_MS);
  }
  throw new Error('preflight-run-completion-timeout');
}

function assertPreflightRunProvenance(
  run: z.infer<typeof PreflightRun>,
  receipt: PreflightReceipt
): void {
  if (
    run.id !== receipt.runId ||
    run.actor.id !== P.actorId ||
    run.path !== P.preflightWorkflowPath ||
    run.head_sha !== receipt.workflowSha ||
    run.head_sha !== receipt.observedMainSha
  )
    throw new Error('preflight-run-provenance-mismatch');
}

function parsePreflightReceipt(value: string): PreflightReceipt {
  try {
    return PreflightReceipt.parse(JSON.parse(value) as unknown);
  } catch {
    throw new Error('preflight-receipt-invalid');
  }
}

function environmentMatches(e: z.infer<typeof Environment>, root: string): boolean {
  return (
    e.GH_TOKEN === e.GITHUB_TOKEN &&
    e.GITHUB_WORKSPACE === root &&
    e.GITHUB_SHA === e.CANARY_WORKFLOW_SHA &&
    e.CANARY_BASE_SHA === e.GITHUB_SHA
  );
}

function receiptMatchesEnvironment(
  e: z.infer<typeof Environment>,
  receipt: PreflightReceipt
): boolean {
  return (
    receipt.runId === e.CANARY_PREFLIGHT_RUN_ID &&
    receipt.prNumber === e.CANARY_PR &&
    receipt.headSha === e.CANARY_HEAD_SHA &&
    receipt.baseSha === e.CANARY_BASE_SHA &&
    receipt.observedMainSha === e.GITHUB_SHA &&
    receipt.workflowSha === e.GITHUB_SHA
  );
}

function preflightEvidence(receipt: PreflightReceipt): Evidence['preflight'] {
  return {
    complete: receipt.complete,
    actorId: receipt.actorId,
    event: receipt.event,
    ref: receipt.ref,
    workflowPath: receipt.workflowPath,
    workflowSha: receipt.workflowSha,
    runId: receipt.runId,
    runAttempt: receipt.runAttempt,
    observedMainSha: receipt.observedMainSha,
    prNumber: receipt.prNumber,
    headSha: receipt.headSha,
    baseSha: receipt.baseSha,
    querySha256: receipt.querySha256,
    responseSha256: receipt.responseSha256,
  };
}

function trustedSource(git: GitRead, root: string, sha: string): void {
  if (
    git(['rev-parse', '--show-toplevel']).trim() !== root ||
    git(['rev-parse', 'HEAD']).trim() !== sha
  )
    throw new Error('source-identity-mismatch');
  if (git(['status', '--porcelain', '--untracked-files=normal']).trim() !== '')
    throw new Error('dirty-checkout');
  const rows = git(['ls-tree', 'HEAD', '--', ...SOURCE_PATHS])
    .trim()
    .split('\n');
  for (const path of SOURCE_PATHS) {
    const hits = rows.filter((row) => row.endsWith(`\t${path}`));
    if (hits.length !== 1 || !/^100644 blob [0-9a-f]{40}\t/.test(hits[0] ?? ''))
      throw new Error('untracked-source');
  }
}

/** Pure seams support tests; the executable offers no environment or fixture override. */
export function readCanaryLaunchContext(
  env: Readonly<Record<string, string | undefined>>,
  git: GitRead,
  owners: string,
  root: string
): LaunchContext {
  const e = Environment.parse(env);
  const receipt = parsePreflightReceipt(e.CANARY_PREFLIGHT_RECEIPT_JSON);
  if (!environmentMatches(e, root) || !receiptMatchesEnvironment(e, receipt))
    throw new Error('launch-identity-mismatch');
  trustedSource(git, root, e.CANARY_WORKFLOW_SHA);
  const patterns = governorPathsFromCodeowners(owners);
  for (const source of SOURCE_PATHS) {
    if (!isGovernorPath(source, patterns)) throw new Error('ungoverned-source');
  }
  return {
    invocation: {
      actorId: Number(e.GITHUB_ACTOR_ID),
      event: e.GITHUB_EVENT_NAME,
      ref: e.GITHUB_REF,
      workflowPath: P.workflowPath,
      workflowSha: e.CANARY_WORKFLOW_SHA,
      checkoutSha: e.GITHUB_SHA,
      runId: e.GITHUB_RUN_ID,
      runAttempt: 1,
    },
    expected: { pr: e.CANARY_PR, headSha: e.CANARY_HEAD_SHA, baseSha: e.CANARY_BASE_SHA },
    preflight: preflightEvidence(receipt),
    preflightReceipt: receipt,
    governor: {
      complete: true,
      patternCount: patterns.length,
      files: [P.path],
      matches: isGovernorPath(P.path, patterns) ? [P.path] : [],
    },
  };
}

function readActualCanaryLaunch(): LaunchContext {
  if (process.env['NEXUS_SCRIPT_ROOT'] !== undefined || process.cwd() !== REPOSITORY_ROOT)
    throw new Error('source-root-override-refused');
  for (const shadow of ['.github/CODEOWNERS', 'docs/CODEOWNERS']) {
    if (existsSync(join(ROOT, shadow))) throw new Error('shadow-codeowners');
  }
  const git: GitRead = (args) =>
    execFileSync('git', [...args], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
  return readCanaryLaunchContext(
    process.env,
    git,
    readFileSync(join(ROOT, 'CODEOWNERS'), 'utf8'),
    ROOT
  );
}

export function launcherFailure(cause: unknown): CanaryExecutionResult {
  return {
    status: 'unmeasured',
    reason: 'launcher-refused',
    writeAttempted: false,
    diagnostic: canaryFailureCause(cause),
  };
}

const SnapshotEvidence = z.object({
  status: z.literal('verified'),
  complete: z.literal(true),
  writeAttempted: z.literal(false),
  scope: z.literal('one-shot-7629-canary-readiness-only'),
  sourceFileCount: z.number().int().positive().max(20_000),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  authoredBaseTree: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/),
});
type CanarySnapshotEvidence = z.infer<typeof SnapshotEvidence>;

function boundedSnapshotFile(root: string, path: string): Buffer {
  const file = join(root, path);
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16_384)
    throw new Error('source-snapshot-evidence-mismatch');
  return readFileSync(file);
}

/** Retain only validated pre-tooling evidence, bound to the manifest's actual bytes. */
export function readCanarySnapshotEvidence(root: string): CanarySnapshotEvidence {
  const source: unknown = JSON.parse(
    boundedSnapshotFile(root, '.nexus-agents/native-approval-canary/source-snapshot.json').toString(
      'utf8'
    )
  );
  const snapshot = SnapshotEvidence.parse(source);
  const manifest = boundedSnapshotFile(
    root,
    'governance/native-approval-canary-source-snapshot.json'
  );
  if (createHash('sha256').update(manifest).digest('hex') !== snapshot.manifestSha256)
    throw new Error('source-snapshot-evidence-mismatch');
  return snapshot;
}

/** One attempt record; an existing record is never overwritten. */
export function persistCanaryResult(
  root: string,
  result: CanaryExecutionResult,
  snapshot?: CanarySnapshotEvidence
): void {
  const directory = join(root, '.nexus-agents/native-approval-canary');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const record = snapshot === undefined ? result : { ...result, sourceSnapshot: snapshot };
  writeFileSync(join(directory, 'result.json'), JSON.stringify(record, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
}

async function main(): Promise<void> {
  let context: LaunchContext;
  let snapshot: CanarySnapshotEvidence | undefined;
  try {
    context = readActualCanaryLaunch();
    snapshot = readCanarySnapshotEvidence(REPOSITORY_ROOT);
    await verifyCanaryPreflightRun(readCanaryJson, context.preflightReceipt);
  } catch (cause) {
    const failure = launcherFailure(cause);
    persistCanaryResult(REPOSITORY_ROOT, failure, snapshot);
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
    return;
  }
  const result = await executeNativeApprovalCanary({
    invocation: context.invocation,
    expected: context.expected,
    governor: context.governor,
    preflight: context.preflight,
    read: readCanaryJson,
    reviewer: createGitHubReviewWriter(P.repository),
  });
  console.log(
    JSON.stringify({
      status: result.status,
      reason: result.reason,
      writeAttempted: result.writeAttempted,
      reviewId: result.reviewId,
    })
  );
  persistCanaryResult(REPOSITORY_ROOT, result, snapshot);
  process.exitCode = result.status === 'eligible' || result.status === 'ineligible' ? 0 : 1;
}

if (process.argv[1]?.endsWith('native-approval-canary.ts') === true) {
  void main().catch((cause: unknown) => {
    console.error(
      JSON.stringify({
        status: 'unmeasured',
        reason: 'launcher-record-unavailable',
        diagnostic: canaryFailureCause(cause),
      })
    );
    process.exitCode = 1;
  });
}
