import { describe, expect, it, vi } from 'vitest';
import { verifyCanaryPreflightRun } from './native-approval-canary.js';
import type { CanaryRead } from '../packages/nexus-agents/src/governance/native-approval-canary-read.js';
import { NATIVE_CANARY_POLICY as P } from '../packages/nexus-agents/src/governance/native-approval-canary.js';
import { launcherFailure } from './native-approval-canary.js';

const MAIN = 'b'.repeat(40);
const RECEIPT = {
  status: 'CANARY_DISPATCH_AUTHORIZED' as const,
  complete: true as const,
  canaryDispatchAuthorized: true as const,
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
  actionsApprovalSetting: {
    status: 'readable' as const,
    canApprovePullRequests: true,
    responseSha256: 'e'.repeat(64),
  },
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
    { status: 'readable' as const, canApprovePullRequests: false, responseSha256: 'e'.repeat(64) },
    { status: 'unmeasured' as const, reason: 'api-read-unavailable' as const },
  ])('accepts a valid $status Actions approval-setting observation', async (setting) => {
    await expect(
      verifyCanaryPreflightRun(reader(RUN), { ...RECEIPT, actionsApprovalSetting: setting })
    ).resolves.toBeUndefined();
  });

  it.each([
    { status: 'READABLE', canaryDispatchAuthorized: undefined },
    { status: 'CANARY_DISPATCH_AUTHORIZED', canaryDispatchAuthorized: false },
  ])('rejects a receipt that is not explicitly dispatch-authorized: %#', async (change) => {
    await expect(
      verifyCanaryPreflightRun(reader(RUN), { ...RECEIPT, ...change })
    ).rejects.toThrow();
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

  it('waits for the dispatched preflight workflow to finish before authorizing the canary', async () => {
    vi.useFakeTimers();
    try {
      const read = vi
        .fn<CanaryRead>()
        .mockResolvedValueOnce({ ...RUN, status: 'in_progress', conclusion: null })
        .mockResolvedValueOnce(RUN);
      const wait = vi.fn(
        (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
      );
      const result = verifyCanaryPreflightRun(read, RECEIPT, wait);
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(result).resolves.toBeUndefined();
      expect(read).toHaveBeenCalledTimes(2);
      expect(wait).toHaveBeenCalledWith(2_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops after the bounded completion poll when the preflight remains active', async () => {
    const read = reader({ ...RUN, status: 'in_progress', conclusion: null });
    await expect(verifyCanaryPreflightRun(read, RECEIPT, async () => {})).rejects.toThrow(
      'preflight-run-completion-timeout'
    );
    expect(read).toHaveBeenCalledTimes(60);
  });

  it.each([
    'preflight-receipt-invalid',
    'preflight-run-not-successful',
    'preflight-run-completion-timeout',
    'preflight-run-provenance-mismatch',
  ])('retains the diagnostic code for %s', (code) => {
    expect(launcherFailure(new Error(code)).diagnostic).toMatchObject({ code });
  });
});
