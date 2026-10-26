/** Exercise the literal read-only workflow body; never call GitHub or use real tokens. */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REPOSITORY_ROOT } from './script-paths.js';

interface Step {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
  'working-directory'?: string;
  'continue-on-error'?: boolean;
}
const workflow = parse(
  readFileSync(join(REPOSITORY_ROOT, '.github/workflows/governor-review.yml'), 'utf8')
) as {
  jobs: Record<string, { permissions: Record<string, string>; steps: Step[] }>;
};
const job = workflow.jobs['governor-ratification'];
const step = job?.steps.find((item) => item.id === 'native-canary-read-preflight');
const HEAD = 'a'.repeat(40),
  MAIN = 'b'.repeat(40),
  WORKFLOW = 'c'.repeat(40);
const roots: string[] = [];
function response(): Record<string, unknown> {
  return {
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
            requiredStatusChecks: [{ context: 'CI Success', app: { databaseId: 15368 } }],
          },
        },
      },
    },
  };
}
function execute(
  body: string,
  exit = 0,
  mode = 'normal'
): { code: number | null; stdout: string; summary: string; calls: string } {
  const root = mkdtempSync(join(tmpdir(), 'canary-read-preflight-'));
  roots.push(root);
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'body'), body);
  writeFileSync(
    join(root, 'bin/gh'),
    '#!/bin/bash\nprintf \'%s\\n\' "$@" >> "$CALLS"\nprintf \'%s\\n\' \'test-private-stderr\' >&2\ncat "$BODY"\nexit "$FAKE_EXIT"\n',
    { mode: 0o700 }
  );
  if (mode === 'timeout')
    writeFileSync(join(root, 'bin/timeout'), '#!/bin/sh\nexit 124\n', { mode: 0o700 });
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step?.run ?? 'exit 97'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    env: {
      PATH: join(root, 'bin') + ':/usr/bin:/bin',
      RUNNER_TEMP: root,
      GH_TOKEN: mode === 'missing-token' ? '' : 'TEST-FAKE-TOKEN',
      GH_HOST: 'github.com',
      BODY: join(root, 'body'),
      CALLS: join(root, 'calls'),
      FAKE_EXIT: String(exit),
      GITHUB_STEP_SUMMARY: join(root, 'summary'),
      GITHUB_REPOSITORY: 'nexus-substrate/nexus-agents',
      GITHUB_WORKFLOW: 'Governor Review Gate',
      GITHUB_RUN_ID: '12',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_EVENT_NAME: 'pull_request',
      PREFLIGHT_HEAD_SHA: mode === 'bad-provenance' ? '' : HEAD,
      PREFLIGHT_WORKFLOW_SHA: WORKFLOW,
    },
  });
  const read = (name: string): string => {
    try {
      return readFileSync(join(root, name), 'utf8');
    } catch {
      return '';
    }
  };
  return {
    code: result.status,
    stdout: result.stdout,
    summary: read('summary'),
    calls: read('calls'),
  };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe('non-canary Actions-token protection read', () => {
  it('runs only on the exact same-repository implementation branch, after the gate even when it fails', () => {
    const actual = step!;
    expect(actual).toBeDefined();
    expect(actual.if).toBe(
      "${{ always() && github.repository == 'nexus-substrate/nexus-agents' && github.event.pull_request.head.repo.full_name == github.repository && github.event.pull_request.head.ref == 'feat/7621-native-approval-canary' }}"
    );
    expect(actual['working-directory']).toBe('gate');
    expect(actual['continue-on-error']).toBeUndefined();
    expect(job!.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' });
    expect(actual.env?.['GH_TOKEN']).toBe('${{ github.token }}');
    expect(actual.env?.['GH_HOST']).toBe('github.com');
    expect(actual.run).not.toMatch(/tsx|scripts\/|gh pr|--method POST|mutation/);
    expect(actual.run).toContain('timeout -k 2s 20s gh api graphql');
    expect(actual.run).toContain('ulimit -f 128');
    const steps = job!.steps;
    expect(steps.indexOf(actual)).toBeGreaterThan(
      steps.findIndex((s) => s.run?.includes('governor-gate.ts ratification') === true)
    );
    expect(steps.at(-1)?.name).toBe('Verdict when no governor path is touched');
  });
  it('uses the exact canonical GraphQL query as literal data', () => {
    const source = readFileSync(
      join(REPOSITORY_ROOT, 'packages/nexus-agents/src/governance/native-approval-canary-read.ts'),
      'utf8'
    );
    const canonical = /const PROTECTION_QUERY = `([^`]+)`;/.exec(source)?.[1];
    const actual = /QUERY='([^']+)'/.exec(step?.run ?? '')?.[1];
    expect(canonical).toBeDefined();
    expect(actual).toBe(canonical);
  });
  it('retains READABLE provenance only for a complete successful response', () => {
    const result = execute(JSON.stringify(response()));
    expect(result.code).toBe(0);
    const line = result.stdout.split('\n').find((s) => s.startsWith('{'));
    expect(line).toBeDefined();
    const proof: unknown = JSON.parse(line!);
    expect(proof).toMatchObject({
      status: 'READABLE',
      repository: 'nexus-substrate/nexus-agents',
      headSha: HEAD,
      workflowSha: WORKFLOW,
      runId: '12',
      runAttempt: '1',
      event: 'pull_request',
      observedMainSha: MAIN,
      tokenKind: 'GITHUB_TOKEN',
      declaredPermissions: { contents: 'read', 'pull-requests': 'read' },
      capturedResponseSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      responseComplete: true,
    });
    expect(result.summary).toContain('READABLE');
    expect(result.calls).toContain('graphql');
    expect(result.calls).not.toContain('POST');
  });
  it.each([
    'null',
    'errors',
    'empty-errors',
    'missing',
    'empty',
    'schema',
    'bad-provenance',
    'missing-token',
    'malformed',
    'api-failure',
    'timeout',
    'oversized',
  ])(
    'names %s UNMEASURED without failing the existing governor job or leaking raw data',
    (mode) => {
      const valid = JSON.stringify(response());
      const bodies: Record<string, string> = {
        null: '{"data":{"repository":{"defaultBranchRef":{"branchProtectionRule":null}}}}',
        errors: JSON.stringify({ ...response(), errors: [{ message: 'test-private-error' }] }),
        'empty-errors': JSON.stringify({ ...response(), errors: [] }),
        missing: '{}',
        empty: '',
        schema: valid.replace('"dismissesStaleReviews":true', '"dismissesStaleReviews":"true"'),
        malformed: 'test-private-invalid-json',
        oversized: valid + ' '.repeat(500000),
      };
      const result = execute(bodies[mode] ?? valid, mode === 'api-failure' ? 1 : 0, mode);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('UNMEASURED');
      expect(result.stdout + result.summary).not.toMatch(/test-private|TEST-FAKE-TOKEN/);
      if (mode === 'bad-provenance' || mode === 'missing-token') expect(result.calls).toBe('');
    }
  );
});
