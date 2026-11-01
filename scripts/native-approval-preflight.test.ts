import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
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

const shellFixtures: string[] = [];

afterEach(() => {
  for (const fixture of shellFixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a workflow object');
  }
  return value as Record<string, unknown>;
}

function readPreflightShell(): string {
  const path = join(process.cwd(), '.github/workflows/native-approval-preflight.yml');
  const workflow = asRecord(parseYaml(readFileSync(path, 'utf8')));
  const jobs = asRecord(workflow['jobs']);
  const preflight = asRecord(jobs['preflight']);
  const steps = preflight['steps'];
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('Missing preflight steps');
  const run = asRecord(steps[0])['run'];
  if (typeof run !== 'string') throw new Error('Missing preflight shell');
  return run;
}

function runPreflightShell(
  actionsBody: string,
  actionsStatus = '200'
): {
  receipt: Record<string, unknown>;
  calls: string;
  summary: string;
} {
  const temp = mkdtempSync(join(tmpdir(), 'native-preflight-shell-'));
  shellFixtures.push(temp);
  const bin = join(temp, 'bin');
  const runnerTemp = join(temp, 'runner');
  mkdirSync(bin);
  mkdirSync(runnerTemp);
  const graphResponse = join(temp, 'graphql.json');
  const rulesResponse = join(temp, 'rules.json');
  const historyResponse = join(temp, 'history.json');
  const actionResponse = join(temp, 'actions.json');
  const callsPath = join(temp, 'calls.log');
  const summaryPath = join(temp, 'summary.md');
  const actionPermissionsPath = join(temp, 'actions-permissions.json');
  writeFileSync(
    graphResponse,
    JSON.stringify({
      data: {
        repository: {
          defaultBranchRef: {
            name: 'main',
            target: { oid: MAIN },
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
              requiredStatusChecks: [{ context: 'CI', app: { databaseId: 123 } }],
            },
          },
        },
      },
    })
  );
  writeFileSync(rulesResponse, '[]\n');
  writeFileSync(historyResponse, '{"total_count":0,"workflow_runs":[]}\n');
  writeFileSync(actionResponse, actionsBody);
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\nset -eu\nprintf '%s\\n' "$*" >> "$GH_CALL_LOG"\n[ "$1" = api ] || exit 91\ncase "$2" in\n  graphql) cat "$GRAPHQL_RESPONSE" ;;\n  repos/nexus-substrate/nexus-agents/rules/branches/main) cat "$RULES_RESPONSE" ;;\n  repos/nexus-substrate/nexus-agents/actions/permissions/workflow)\n    if [ "$ACTIONS_HTTP_STATUS" != 200 ]; then printf 'HTTP 403\\n' >&2; exit 1; fi\n    cat "$ACTIONS_RESPONSE" ;;\n  *) printf 'unexpected API read\\n' >&2; exit 92 ;;\nesac\n`
  );
  writeFileSync(
    join(bin, 'curl'),
    '#!/bin/sh\nset -eu\nprintf "%s\\n" "$*" >> "$GH_CALL_LOG"\ncat "$HISTORY_RESPONSE"\n'
  );
  chmodSync(join(bin, 'gh'), 0o755);
  chmodSync(join(bin, 'curl'), 0o755);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(process.env['PATH'] === undefined ? {} : { PATH: `${bin}:${process.env['PATH']}` }),
    GH_CALL_LOG: callsPath,
    GRAPHQL_RESPONSE: graphResponse,
    RULES_RESPONSE: rulesResponse,
    HISTORY_RESPONSE: historyResponse,
    ACTIONS_RESPONSE: actionResponse,
    ACTIONS_HTTP_STATUS: actionsStatus,
    GITHUB_REPOSITORY: P.repository,
    GITHUB_ACTOR_ID: String(P.actorId),
    GITHUB_REF: 'refs/heads/main',
    GITHUB_RUN_ID: '800',
    GITHUB_RUN_ATTEMPT: '1',
    PREFLIGHT_WORKFLOW_SHA: MAIN,
    PREFLIGHT_ACTIONS_PERMISSIONS_FILE: actionPermissionsPath,
    CANARY_PR: '7630',
    CANARY_HEAD_SHA: 'a'.repeat(40),
    CANARY_BASE_SHA: MAIN,
    RUNNER_TEMP: runnerTemp,
    GITHUB_STEP_SUMMARY: summaryPath,
    GH_TOKEN: 'offline-fixture',
    GH_HOST: 'github.com',
  };
  execFileSync('bash', ['-euo', 'pipefail', '-c', readPreflightShell()], {
    cwd: process.cwd(),
    env,
    stdio: 'pipe',
  });
  return {
    receipt: asRecord(
      JSON.parse(readFileSync(join(runnerTemp, 'native-canary-preflight/receipt.json'), 'utf8'))
    ),
    calls: readFileSync(callsPath, 'utf8'),
    summary: readFileSync(summaryPath, 'utf8'),
  };
}

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

describe('native preflight Actions approval-setting shell branch (#7697)', () => {
  it.each([
    {
      name: 'true',
      body: '{"can_approve_pull_request_reviews":true}\n',
      status: '200',
      expected: { status: 'readable', canApprovePullRequests: true },
    },
    {
      name: 'false',
      body: '{"can_approve_pull_request_reviews":false}\n',
      status: '200',
      expected: { status: 'readable', canApprovePullRequests: false },
    },
    {
      name: 'API 403',
      body: '',
      status: '403',
      expected: { status: 'unmeasured', reason: 'api-read-unavailable' },
    },
    {
      name: 'malformed JSON',
      body: '{not-json\n',
      status: '200',
      expected: { status: 'unmeasured', reason: 'api-read-unavailable' },
    },
  ])(
    'retains $name as measured or unmeasured without aborting preflight',
    ({ body, status, expected }) => {
      const result = runPreflightShell(body, status);
      expect(result.receipt['status']).toBe('READABLE');
      expect(result.receipt['canaryDispatchAuthorized']).toBe(false);
      expect(result.receipt['actionsApprovalSetting']).toMatchObject(expected);
      expect(result.summary).toContain('READABLE; no canary dispatch was attempted.');
      expect(result.calls).toContain('actions/permissions/workflow');
      expect(result.calls).not.toMatch(/POST|dispatches|pulls\/\d+\/reviews/i);
    }
  );
});
