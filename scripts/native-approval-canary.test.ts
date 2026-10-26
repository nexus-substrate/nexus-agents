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
const ENV = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'nexus-substrate/nexus-agents',
  GITHUB_REPOSITORY_ID: '1127393912',
  CANARY_OWNER_ID: '285505621',
  GITHUB_ACTOR_ID: '14303249',
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
      invocation: { checkoutSha: BASE, workflowSha: BASE, actorId: 14303249 },
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
  it('uses only manual dispatch, trusted main source, narrow token permissions and single-use concurrency', () => {
    const source = readFileSync(join(ROOT, '.github/workflows/native-approval-canary.yml'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(source).toContain('  workflow_dispatch:');
    expect(source).not.toMatch(/^  (pull_request|pull_request_target|push|schedule):/m);
    expect(source).toContain('permissions: {}');
    expect(source).toContain('group: native-approval-eligibility-v1');
    expect(source).toContain('cancel-in-progress: false');
    expect(source).toContain("github.actor_id == '14303249'");
    expect(source).toContain("github.ref == 'refs/heads/main'");
    expect(source).toContain('ref: ${{ github.workflow_sha }}');
    expect(source).toContain('persist-credentials: false');
    expect(source).toContain('pull-requests: write');
    expect(source).not.toMatch(/(contents|actions|checks|id-token|administration): write/);
    expect(source).toContain('run: pnpm exec tsx scripts/native-approval-canary.ts');
    expect(source).toContain('.nexus-agents/native-approval-canary/result.json');
    expect(source).not.toMatch(/gh pr merge|--admin|owner-ratified|secrets\.(?!GITHUB_TOKEN)/);
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
    '.nexus-agents/native-approval-canary/result.json',
    '.nexus-agents/native-approval-canary/source-closure.json',
    '.nexus-agents/native-approval-canary/source-snapshot.json',
  ]);
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
  expect(steps[0]?.uses).toMatch(/^actions\/checkout@/);
  expect(steps[0]?.with?.['clean']).toBe(true);
  expect(steps[0]?.with?.['persist-credentials']).toBe(false);
  expect(steps[1]?.run).toBe(
    'command -v python3\npython3 -I -S scripts/check-native-canary-snapshot.py --check\n'
  );
  for (const name of ['pnpm/action-setup@', 'actions/setup-node@'])
    expect(steps.findIndex((step) => step.uses?.startsWith(name) === true)).toBeGreaterThan(1);
  expect(steps.findIndex((step) => step.run?.includes('pnpm install') === true)).toBeGreaterThan(1);
  expect(steps.some((step) => step.run?.includes('--write') === true)).toBe(false);
});
