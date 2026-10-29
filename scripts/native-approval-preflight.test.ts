import { describe, expect, it, vi } from 'vitest';
import { verifyCanaryPreflightRun } from './native-approval-canary.js';
import type { CanaryRead } from '../packages/nexus-agents/src/governance/native-approval-canary-read.js';
import { NATIVE_CANARY_POLICY as P } from '../packages/nexus-agents/src/governance/native-approval-canary.js';

const MAIN = 'b'.repeat(40);
const RECEIPT = {
  status: 'READABLE' as const,
  complete: true as const,
  repository: P.repository,
  repositoryId: P.repositoryId,
  actorId: P.actorId,
  event: 'workflow_dispatch' as const,
  ref: 'refs/heads/main' as const,
  workflowPath: P.preflightWorkflowPath,
  workflowSha: MAIN,
  runId: 800,
  runAttempt: 1 as const,
  observedMainSha: MAIN,
  prNumber: 7630,
  headSha: 'a'.repeat(40),
  baseSha: MAIN,
  querySha256: 'c'.repeat(64),
  responseSha256: 'd'.repeat(64),
};
const RUN = {
  id: 800,
  event: 'workflow_dispatch',
  head_branch: 'main',
  head_sha: MAIN,
  run_attempt: 1,
  status: 'completed',
  conclusion: 'success',
  actor: { id: P.actorId },
  path: P.preflightWorkflowPath,
};
const reader = (result: unknown): CanaryRead => vi.fn(() => Promise.resolve(result));

describe('canary preflight provenance', () => {
  it('accepts only the successful owner run bound to the receipt', async () => {
    await expect(verifyCanaryPreflightRun(reader(RUN), RECEIPT)).resolves.toBeUndefined();
  });

  it.each([
    ['wrong run ID', { ...RUN, id: 801 }],
    ['wrong actor', { ...RUN, actor: { id: 12 } }],
    ['wrong workflow', { ...RUN, path: '.github/workflows/other.yml' }],
    ['wrong event', { ...RUN, event: 'push' }],
    ['wrong ref', { ...RUN, head_branch: 'feature' }],
    ['wrong source', { ...RUN, head_sha: 'e'.repeat(40) }],
    ['failed run', { ...RUN, conclusion: 'failure' }],
    ['rerun', { ...RUN, run_attempt: 2 }],
  ])('rejects %s', async (_name, result) => {
    await expect(verifyCanaryPreflightRun(reader(result), RECEIPT)).rejects.toThrow();
  });
});
