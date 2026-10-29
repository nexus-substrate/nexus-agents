/** Launcher trust boundary and concrete workflow wiring, without any GitHub writes. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCanaryLaunchContext } from './native-approval-canary.js';
import { governorPathsFromCodeowners, isGovernorPath } from './governor-section.js';
import { ROOT } from './script-paths.js';
import { parse as parseYaml } from 'yaml';

const BASE = 'b'.repeat(40);
const HEAD = 'a'.repeat(40);
const PREFLIGHT = {
  status: 'READABLE',
  complete: true,
  repository: 'nexus-substrate/nexus-agents',
  repositoryId: 1127393912,
  actorId: 14303249,
  event: 'workflow_dispatch',
  ref: 'refs/heads/main',
  workflowPath: '.github/workflows/native-approval-preflight.yml',
  workflowSha: BASE,
  runId: 800,
  runAttempt: 1,
  observedMainSha: BASE,
  prNumber: 7630,
  headSha: HEAD,
  baseSha: BASE,
  querySha256: 'c'.repeat(64),
  responseSha256: 'd'.repeat(64),
  actionsApprovalSetting: {
    status: 'readable',
    canApprovePullRequests: true,
    responseSha256: 'e'.repeat(64),
  },
};
const ENV = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'nexus-substrate/nexus-agents',
  GITHUB_REPOSITORY_ID: '1127393912',
  CANARY_OWNER_ID: '285505621',
  GITHUB_ACTOR_ID: '41898282',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: BASE,
  CANARY_WORKFLOW_SHA: BASE,
  GITHUB_WORKFLOW_REF:
    'nexus-substrate/nexus-agents/.github/workflows/native-approval-canary.yml@refs/heads/main',
  GITHUB_RUN_ID: '900',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_WORKSPACE: '/fixture/repo',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_API_URL: 'https://api.github.com',
  GH_HOST: 'github.com',
  GH_TOKEN: 'fixture-not-a-real-token',
  GITHUB_TOKEN: 'fixture-not-a-real-token',
  CANARY_PR: '7630',
  CANARY_HEAD_SHA: HEAD,
  CANARY_BASE_SHA: BASE,
  CANARY_PREFLIGHT_RUN_ID: '800',
  CANARY_PREFLIGHT_RECEIPT_JSON: JSON.stringify(PREFLIGHT),
};
const GOVERNED = [
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
  '.github/workflows/native-approval-preflight.yml',
  '.github/workflows/native-approval-canary.yml',
  'packages/nexus-agents/src/governance/native-approval-canary.ts',
  'packages/nexus-agents/src/scm/types.ts',
  'packages/nexus-agents/src/scm/github-provider-traits.ts',
  'packages/nexus-agents/src/scm/github-review-receipt.ts',
];
const OWNERS = [
  '# @governor-section-start',
  ...GOVERNED.map((p) => `/${p} @fixture-owner`),
  '# @governor-section-end',
].join('\n');
const git = (args: readonly string[]): string => {
  if (args.join(' ') === 'rev-parse HEAD') return BASE;
  if (args.join(' ') === 'rev-parse --show-toplevel') return '/fixture/repo';
  if (args[0] === 'status') return '';
  if (args[0] === 'ls-tree') return GOVERNED.map((p) => `100644 blob ${BASE}\t${p}`).join('\n');
  throw new Error('unexpected-fixture-git');
};

describe('native canary trusted-main launcher', () => {
  it('binds measured trusted source and canonical governor scope', () => {
    expect(readCanaryLaunchContext(ENV, git, OWNERS, '/fixture/repo')).toMatchObject({
      invocation: { checkoutSha: BASE, workflowSha: BASE, actorId: 41898282 },
      preflight: { actorId: 14303249, runId: 800, observedMainSha: BASE },
      expected: { pr: 7630, headSha: HEAD, baseSha: BASE },
      governor: { complete: true, patternCount: GOVERNED.length, matches: [] },
    });
  });
  it.each([
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_ACTOR_ID: '12' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_REPOSITORY_ID: '12' },
    { CANARY_OWNER_ID: '12' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_RUN_ATTEMPT: '2' },
    { CANARY_WORKFLOW_SHA: HEAD },
    { GITHUB_SHA: HEAD },
    { CANARY_PR: '1;echo x' },
    { CANARY_HEAD_SHA: '../head' },
    { CANARY_BASE_SHA: HEAD },
    { CANARY_PREFLIGHT_RUN_ID: '801' },
    { CANARY_PREFLIGHT_RECEIPT_JSON: '{}' },
    { GH_HOST: 'other.invalid' },
    { GITHUB_API_URL: 'https://other.invalid' },
    { GITHUB_TOKEN: '' },
    { GH_TOKEN: 'different-fixture' },
    { NEXUS_SCRIPT_ROOT: '/other' },
    { GITHUB_WORKSPACE: '/other' },
    { GITHUB_WORKFLOW_REF: 'other@refs/heads/main' },
  ])('refuses invalid invocation %# before API calls', (change) => {
    expect(() =>
      readCanaryLaunchContext({ ...ENV, ...change }, git, OWNERS, '/fixture/repo')
    ).toThrow();
  });
  it('rejects a dirty trusted checkout', () => {
    expect(() =>
      readCanaryLaunchContext(
        ENV,
        (args) => (args[0] === 'status' ? ' M source.ts' : git(args)),
        OWNERS,
        '/fixture/repo'
      )
    ).toThrow('dirty-checkout');
  });
  it('rejects source files absent from the trusted commit', () => {
    expect(() =>
      readCanaryLaunchContext(
        ENV,
        (args) => (args[0] === 'ls-tree' ? '' : git(args)),
        OWNERS,
        '/fixture/repo'
      )
    ).toThrow('untracked-source');
  });
  it('refuses an ungoverned write ingress', () => {
    expect(() =>
      readCanaryLaunchContext(
        ENV,
        git,
        OWNERS.replace('/packages/nexus-agents/src/scm/types.ts @fixture-owner\n', ''),
        '/fixture/repo'
      )
    ).toThrow('ungoverned-source');
  });
  it.each(GOVERNED)('actual CODEOWNERS governs %s', (path) => {
    const patterns = governorPathsFromCodeowners(readFileSync(join(ROOT, 'CODEOWNERS'), 'utf8'));
    expect(isGovernorPath(path, patterns)).toBe(true);
  });
});

describe('protected native canary workflow wiring', () => {
  it('only accepts the preflight-dispatched canary and keeps Actions write on the preflight workflow', () => {
    const source = readFileSync(join(ROOT, '.github/workflows/native-approval-canary.yml'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(source).toContain('  workflow_dispatch:');
    expect(source).not.toMatch(/^  (pull_request|pull_request_target|push|schedule):/m);
    expect(source).toContain('permissions: {}');
    expect(source).toContain('group: native-approval-eligibility-v1');
    expect(source).toContain('cancel-in-progress: false');
    expect(source).toContain("github.actor_id == '41898282' || github.actor_id == '14303249'");
    expect(source).toContain("github.ref == 'refs/heads/main'");
    expect(source).toContain('preflight_run_id:');
    expect(source).toContain('CANARY_PREFLIGHT_RECEIPT_JSON');
    expect(source).toContain('actions/download-artifact@');
    expect(source).toContain('run-id: ${{ inputs.preflight_run_id }}');
    expect(source).toContain('ref: ${{ github.workflow_sha }}');
    expect(source).toContain('persist-credentials: false');
    expect(source).toContain('pull-requests: write');
    expect(source).not.toMatch(/(contents|actions|checks|id-token|administration): write/);
    expect(source).toContain('run: pnpm exec tsx scripts/native-approval-canary.ts');
    expect(source).toContain('.nexus-agents/native-approval-canary/result.json');
    expect(source).not.toMatch(/gh pr merge|--admin|owner-ratified|secrets\.(?!GITHUB_TOKEN)/);
  });

  it('preflight is owner-dispatched, read-gated, and alone may dispatch the canary', () => {
    const workflow = parseYaml(
      readFileSync(join(ROOT, '.github/workflows/native-approval-preflight.yml'), 'utf8')
    ) as {
      on: Record<string, unknown>;
      jobs: Record<
        string,
        {
          permissions?: Record<string, string>;
          steps: Array<{ run?: string; uses?: string }>;
        }
      >;
    };
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.jobs.preflight?.permissions?.['actions']).toBe('write');
    expect(
      workflow.jobs.preflight?.steps.some(
        (step) => step.run?.includes('status:"READABLE"') === true
      )
    ).toBe(true);
    expect(
      workflow.jobs.preflight?.steps.some(
        (step) => step.run?.includes('.actor.id == 14303249 or .actor.id == 41898282') === true
      )
    ).toBe(true);
    expect(
      workflow.jobs.preflight?.steps.some((step) => step.run?.includes('/dispatches') === true)
    ).toBe(true);
    const upload =
      workflow.jobs.preflight?.steps.findIndex(
        (step) => step.uses?.startsWith('actions/upload-artifact@') === true
      ) ?? -1;
    const dispatch =
      workflow.jobs.preflight?.steps.findIndex(
        (step) => step.run?.includes('/dispatches') === true
      ) ?? -1;
    expect(upload).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(upload);
  });

  it('records whether GitHub Actions can approve pull requests', () => {
    const source = readFileSync(
      join(ROOT, '.github/workflows/native-approval-preflight.yml'),
      'utf8'
    );
    expect(source).toContain('/actions/permissions/workflow');
    expect(source).toContain('can_approve_pull_request_reviews');
    expect(source).toContain('actionsApprovalSetting');
    expect(source).toContain('actions_permissions_status=unmeasured');
    expect(source).toContain('if timeout -k 2s 20s gh api');
    expect(source).toContain("jq -r '.can_approve_pull_request_reviews'");
    expect(source).not.toContain("jq -er '.can_approve_pull_request_reviews'");
  });

  it('pins the preflight protection query to the canonical runtime query', () => {
    const workflow = readFileSync(
      join(ROOT, '.github/workflows/native-approval-preflight.yml'),
      'utf8'
    );
    const runtime = readFileSync(
      join(ROOT, 'packages/nexus-agents/src/governance/native-approval-canary-read.ts'),
      'utf8'
    );
    const canonical = /const PROTECTION_QUERY = `([^`]+)`;/.exec(runtime)?.[1];
    const actual = /query='([^']+)'/s.exec(workflow)?.[1];
    expect(canonical).toBeDefined();
    expect(actual?.replace(/\s+/g, ' ').trim()).toBe(canonical?.replace(/\s+/g, ' ').trim());
  });
});

it('runs the source import check before the credential-bearing launcher and retains both reports', () => {
  const workflow = parseYaml(
    readFileSync(join(ROOT, '.github/workflows/native-approval-canary.yml'), 'utf8')
  ) as {
    env?: Record<string, string>;
    jobs: {
      eligibility: {
        env?: Record<string, string>;
        steps: Array<{
          run?: string;
          uses?: string;
          env?: Record<string, string>;
          with?: { path?: string };
        }>;
      };
    };
  };
  const steps = workflow.jobs.eligibility.steps;
  const check = steps.findIndex(
    (step) => step.run === 'pnpm exec tsx scripts/check-native-canary-source.ts'
  );
  const launch = steps.findIndex(
    (step) => step.run === 'pnpm exec tsx scripts/native-approval-canary.ts'
  );
  expect(check).toBeGreaterThan(-1);
  expect(launch).toBeGreaterThan(check);
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN']) {
    expect(workflow.env?.[key]).toBeUndefined();
    expect(workflow.jobs.eligibility.env?.[key]).toBeUndefined();
    steps.forEach((step, index) => {
      if (index !== launch) expect(step.env?.[key]).toBeUndefined();
    });
    expect(steps[launch]?.env?.[key]).toBe('${{ github.token }}');
  }
  const upload = steps.find((step) => step.uses?.startsWith('actions/upload-artifact@') === true);
  expect(
    upload?.with?.path
      ?.trim()
      .split('\n')
      .map((line) => line.trim())
  ).toEqual([
    '${{ runner.temp }}/native-canary-fallback/fallback.json',
    '.nexus-agents/native-approval-canary/result.json',
    '.nexus-agents/native-approval-canary/source-closure.json',
    '.nexus-agents/native-approval-canary/source-snapshot.json',
  ]);
});

it('retains a fail-closed result when a dispatch fails before the launcher runs', () => {
  const workflow = parseYaml(
    readFileSync(join(ROOT, '.github/workflows/native-approval-canary.yml'), 'utf8')
  ) as {
    jobs: { eligibility: { steps: Array<{ name?: string; if?: string; run?: string }> } };
  };
  const steps = workflow.jobs.eligibility.steps;
  const fallback = steps.findIndex(
    (step) => step.name === 'Retain a fail-closed record if measurement did not produce one'
  );
  const upload = steps.findIndex((step) => step.name === 'Retain the measured evidence');
  expect(fallback).toBeGreaterThan(-1);
  expect(steps[fallback]?.if).toBe('always()');
  expect(steps[fallback]?.run).toContain('measurement-artifact-not-produced');
  expect(steps[fallback]?.run).toContain('writeAttempted:null');
  expect(steps[fallback]?.run).not.toContain('writeAttempted:false');
  expect(upload).toBeGreaterThan(fallback);
});

it('checks the isolated source snapshot immediately after clean checkout before all dependency tooling', () => {
  const workflow = parseYaml(
    readFileSync(join(ROOT, '.github/workflows/native-approval-canary.yml'), 'utf8')
  ) as {
    jobs: {
      eligibility: {
        steps: Array<{ run?: string; uses?: string; with?: Record<string, unknown> }>;
      };
    };
  };
  const steps = workflow.jobs.eligibility.steps;
  const artifactDownload = steps.findIndex(
    (step) => step.uses?.startsWith('actions/download-artifact@') === true
  );
  const receiptValidation = steps.findIndex(
    (step) => step.run?.includes('CANARY_PREFLIGHT_RECEIPT_JSON') === true
  );
  const checkout = steps.findIndex((step) => step.uses?.startsWith('actions/checkout@') === true);
  expect(artifactDownload).toBeGreaterThanOrEqual(0);
  expect(receiptValidation).toBeGreaterThan(artifactDownload);
  expect(steps[receiptValidation]?.run).toContain('select(type == "object"');
  expect(checkout).toBeGreaterThan(receiptValidation);
  expect(steps[checkout]?.with?.['clean']).toBe(true);
  expect(steps[checkout]?.with?.['persist-credentials']).toBe(false);
  expect(steps[checkout + 1]?.run).toBe(
    'command -v python3\npython3 -I -S scripts/check-native-canary-snapshot.py --check\n'
  );
  for (const name of ['pnpm/action-setup@', 'actions/setup-node@'])
    expect(steps.findIndex((step) => step.uses?.startsWith(name) === true)).toBeGreaterThan(
      checkout + 1
    );
  expect(steps.findIndex((step) => step.run?.includes('pnpm install') === true)).toBeGreaterThan(
    checkout + 1
  );
  expect(steps.some((step) => step.run?.includes('--write') === true)).toBe(false);
});
