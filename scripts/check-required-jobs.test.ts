/** Governor-owned required-job wiring contract (#6343). */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { AGGREGATOR_RUN } from './aggregator-shape.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const contexts = ['CI Success', 'Governor-path ratification gate'];
const manifest = {
  description: 'Required CI wiring',
  version: '1.0.0',
  ci_success_needs: ['lint', 'security'],
  skip_allowed: ['lint'],
  required_contexts: contexts,
  audit_config_forbidden: true,
};
const input = {
  manifest,
  ciSuccessNeeds: ['lint', 'security'],
  ciSuccessGate: { verifiesEveryNeed: true, skipAllowed: ['lint'], neutralized: [] },
  packageJson: {},
  requiredContexts: contexts,
  workflowJobNames: contexts,
};

// Dynamic imports let RED report each missing behavior, not just a collection error.
describe('checkRequiredJobs', () => {
  it('accepts measured matching wiring', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    expect(checkRequiredJobs(input)).toEqual({ verdict: 'ok', problems: [] });
  });

  it('detects a dropped need', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    expect(checkRequiredJobs({ ...input, ciSuccessNeeds: ['lint'] })).toEqual({
      verdict: 'drift',
      problems: ['Missing ci-success.needs: security'],
    });
  });

  it('detects an aggregator that does not verify every need (#6382)', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    expect(
      checkRequiredJobs({
        ...input,
        ciSuccessGate: { verifiesEveryNeed: false, skipAllowed: undefined, neutralized: [] },
      })
    ).toEqual({
      verdict: 'drift',
      problems: [
        'ci-success does not verify every need: no step reads NEEDS_JSON: ${{ toJSON(needs) }} and runs the pinned AGGREGATOR_RUN (#6382)',
      ],
    });
  });

  it('detects SKIP_ALLOWED drifting from the manifest in either direction', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    expect(
      checkRequiredJobs({
        ...input,
        ciSuccessGate: {
          verifiesEveryNeed: true,
          skipAllowed: ['lint', 'security'],
          neutralized: [],
        },
      }).problems
    ).toEqual(['ci-success SKIP_ALLOWED names jobs the manifest does not: security']);
    expect(
      checkRequiredJobs({
        ...input,
        ciSuccessGate: { verifiesEveryNeed: true, skipAllowed: [], neutralized: [] },
      }).problems
    ).toEqual(['ci-success SKIP_ALLOWED lacks manifest skip_allowed jobs: lint']);
    // A wildcard is never acceptable for CI Success.
    expect(
      checkRequiredJobs({
        ...input,
        ciSuccessGate: { verifiesEveryNeed: true, skipAllowed: '*', neutralized: [] },
      }).problems
    ).toEqual(['ci-success SKIP_ALLOWED is "*"; every need may skip']);
    // No SKIP_ALLOWED declared reads as none, and the manifest's pinned skip is then missing.
    expect(
      checkRequiredJobs({
        ...input,
        ciSuccessGate: { verifiesEveryNeed: true, skipAllowed: undefined, neutralized: [] },
      }).problems
    ).toEqual(['ci-success SKIP_ALLOWED lacks manifest skip_allowed jobs: lint']);
  });

  it.each([{}, null, { ignoreCves: [] }])(
    'detects auditConfig presence, including %j',
    async (auditConfig) => {
      const { checkRequiredJobs } = await import('./check-required-jobs.js');
      const result = checkRequiredJobs({ ...input, packageJson: { pnpm: { auditConfig } } });
      expect(result).toEqual({
        verdict: 'drift',
        problems: ['Forbidden package.json pnpm.auditConfig is present'],
      });
    }
  );

  it('allows auditConfig when the manifest permits it', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    expect(
      checkRequiredJobs({
        ...input,
        manifest: { ...manifest, audit_config_forbidden: false },
        packageJson: { pnpm: { auditConfig: {} } },
      }).verdict
    ).toBe('ok');
  });

  it('names an empty manifest list as drift', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    expect(
      checkRequiredJobs({ ...input, manifest: { ...manifest, ci_success_needs: [] } })
    ).toEqual({
      verdict: 'drift',
      problems: ['Manifest ci_success_needs is empty'],
    });
  });

  it('reports an otherwise healthy tree as unmeasured when protection is unreadable', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    expect(checkRequiredJobs({ ...input, requiredContexts: 'unmeasured' })).toEqual({
      verdict: 'unmeasured',
      problems: ['Required contexts: unmeasured (branch protection unreadable)'],
    });
  });

  it('does not hide measured drift behind unmeasured protection', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    const result = checkRequiredJobs({
      ...input,
      ciSuccessNeeds: [],
      requiredContexts: 'unmeasured',
    });
    expect(result.verdict).toBe('drift');
    expect(result.problems).toContain('Missing ci-success.needs: security');
    expect(result.problems).toContain(
      'Required contexts: unmeasured (branch protection unreadable)'
    );
  });

  it('folds in missing required contexts', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    const result = checkRequiredJobs({ ...input, requiredContexts: ['CI Success'] });
    expect(result.verdict).toBe('drift');
    expect(result.problems).toContain('Missing required context: Governor-path ratification gate');
  });

  it('folds in required contexts without producers', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    const result = checkRequiredJobs({ ...input, workflowJobNames: ['CI Success'] });
    expect(result.verdict).toBe('drift');
    expect(result.problems).toContain(
      'Required context without workflow job: Governor-path ratification gate'
    );
  });

  it('names the empty workflow inventory', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    const result = checkRequiredJobs({ ...input, workflowJobNames: [] });
    expect(result.verdict).toBe('drift');
    expect(result.problems).toContain('No workflow job names were found');
  });

  it('enforces contexts added to the manifest', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    const result = checkRequiredJobs({
      ...input,
      manifest: { ...manifest, required_contexts: [...contexts, 'Extra Gate'] },
    });
    expect(result.verdict).toBe('drift');
    expect(result.problems).toContain('Missing required context: Extra Gate');
  });

  it('checks additional manifest producers even when protection is unreadable', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    const result = checkRequiredJobs({
      ...input,
      requiredContexts: 'unmeasured',
      manifest: { ...manifest, required_contexts: [...contexts, 'Extra Gate'] },
    });
    expect(result.verdict).toBe('drift');
    expect(result.problems).toContain('Required context without workflow job: Extra Gate');
  });

  it('rejects a malformed manifest', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    expect(checkRequiredJobs({ ...input, manifest: {} }).verdict).toBe('drift');
  });
});

describe('shared job gate extraction (#6382)', () => {
  const NEEDS = '${{ toJSON(needs) }}';

  it('recognizes the one accepted aggregator shape: NEEDS_JSON from toJSON(needs), consumed by run', async () => {
    const { extractJobGate } = await import('./aggregator-shape.js');
    const gate = extractJobGate({
      needs: ['lint', 'security'],
      if: 'always()',
      steps: [
        {
          env: { NEEDS_JSON: NEEDS, SKIP_ALLOWED: '["lint"]' },
          run: AGGREGATOR_RUN,
        },
      ],
    });
    expect(gate).toEqual({
      needs: ['lint', 'security'],
      gate: { verifiesEveryNeed: true, skipAllowed: ['lint'], neutralized: [] },
    });
  });

  it.each([
    { env: { NEEDS_JSON: '${{ toJSON(needs.lint) }}' }, run: 'AGGREGATOR' },
    { env: { NEEDS_JSON: NEEDS }, run: 'echo unrelated' },
    // The #6387 panel's bypass: mentioning the variable is not running the script.
    { env: { NEEDS_JSON: NEEDS }, run: 'echo NEEDS_JSON' },
    { env: { NEEDS_JSON: NEEDS }, run: '# NEEDS_JSON\necho ok' },
    // One byte off the pinned script — a relaxed exit, a dropped check — is not the script.
    { env: { NEEDS_JSON: NEEDS }, run: 'AGGREGATOR_MINUS_EXIT' },
    { env: {}, run: 'test "${{ needs.security.result }}" = success' },
    { run: '# NEEDS_JSON: ${{ toJSON(needs) }}' },
  ])('does not accept a per-job, partial, mention-only or altered shape: %j', async (step) => {
    const { extractJobGate } = await import('./aggregator-shape.js');
    const run =
      step.run === 'AGGREGATOR'
        ? AGGREGATOR_RUN
        : step.run === 'AGGREGATOR_MINUS_EXIT'
          ? AGGREGATOR_RUN.replace('  exit 1\n', '')
          : step.run;
    expect(extractJobGate({ needs: ['lint'], steps: [{ ...step, run }] }).gate).toEqual({
      verifiesEveryNeed: false,
      skipAllowed: undefined,
      neutralized: [],
    });
  });

  it('accepts the pinned script with trailing-whitespace differences only, and a "*" skip list', async () => {
    const { extractJobGate } = await import('./aggregator-shape.js');
    const padded = AGGREGATOR_RUN.split('\n')
      .map((l) => l + '  ')
      .join('\n');
    expect(
      extractJobGate({
        if: 'always()',
        steps: [{ env: { NEEDS_JSON: NEEDS, SKIP_ALLOWED: '"*"' }, run: padded }],
      }).gate
    ).toEqual({ verifiesEveryNeed: true, skipAllowed: '*', neutralized: [] });
  });

  it.each([
    { job: { if: 'always()' }, step: {}, expected: [] },
    { job: { if: '${{ always() }}' }, step: {}, expected: [] },
    {
      job: { if: 'always()', name: 'CI Success', 'runs-on': 'x', 'timeout-minutes': 5 },
      step: { name: 'Check' },
      expected: [],
    },
    // Panel 2: the script runs, its exit does not decide the job.
    {
      job: { if: 'always()' },
      step: { 'continue-on-error': true },
      expected: ['step key "continue-on-error"'],
    },
    { job: { if: 'always()' }, step: { if: 'false' }, expected: ['step key "if"'] },
    {
      job: { if: 'always()', 'continue-on-error': true },
      step: {},
      expected: ['job key "continue-on-error"'],
    },
    { job: { if: 'false' }, step: {}, expected: ['job if "false" (always() required)'] },
    {
      job: { if: "github.event_name == 'push'" },
      step: {},
      expected: ['job if "github.event_name == \'push\'" (always() required)'],
    },
    // Panel 3: without `if: always()` GitHub skips the aggregator after a failed need — grey, not red.
    { job: {}, step: {}, expected: ['job if missing (always() required)'] },
    // Panel 3: a custom shell template never executes the pinned body (`bash -c true {0}`).
    {
      job: { if: 'always()' },
      step: { shell: 'bash -c true {0}' },
      expected: ['step key "shell"'],
    },
    {
      job: { if: 'always()', defaults: { run: { shell: 'true {0}' } } },
      step: {},
      expected: ['job key "defaults"'],
    },
    { job: { if: 'always()', container: 'alpine' }, step: {}, expected: ['job key "container"'] },
    // Panel 3: an env key can shadow `jq` (PATH) or source a file first (BASH_ENV).
    { job: { if: 'always()' }, step: { env: { PATH: '/fake' } }, expected: ['env key "PATH"'] },
    {
      job: { if: 'always()' },
      step: { env: { BASH_ENV: '/tmp/x' } },
      expected: ['env key "BASH_ENV"'],
    },
    {
      job: { if: 'always()' },
      step: { 'working-directory': '/tmp' },
      expected: ['step key "working-directory"'],
    },
  ])(
    'names every departure from the one accepted shape (#6387): %j',
    async ({ job, step, expected }) => {
      const { extractJobGate } = await import('./aggregator-shape.js');
      const { checkRequiredJobs } = await import('./check-required-jobs.js');
      const { env: extraEnv, ...stepRest } = step as { env?: Record<string, string> };
      const gate = extractJobGate({
        ...job,
        needs: ['lint', 'security'],
        steps: [
          {
            ...stepRest,
            env: { NEEDS_JSON: NEEDS, SKIP_ALLOWED: '["lint"]', ...extraEnv },
            run: AGGREGATOR_RUN,
          },
        ],
      }).gate;
      expect(gate.neutralized).toEqual(expected);
      const result = checkRequiredJobs({ ...input, ciSuccessGate: gate });
      if (expected.length === 0) expect(result.verdict).toBe('ok');
      else {
        expect(result.verdict).toBe('drift');
        expect(result.problems).toEqual([
          `ci-success aggregator departs from the one accepted shape: ${expected.join(', ')} (#6387)`,
        ]);
      }
    }
  );

  it('a sibling step before the pinned one (it could shadow jq via $GITHUB_PATH) is drift (#6387 panel 3)', async () => {
    const { extractJobGate } = await import('./aggregator-shape.js');
    const pinned = { env: { NEEDS_JSON: NEEDS, SKIP_ALLOWED: '[]' }, run: AGGREGATOR_RUN };
    const gate = extractJobGate({
      if: 'always()',
      steps: [{ run: 'echo /tmp/b >> "$GITHUB_PATH"' }, pinned],
    }).gate;
    expect(gate.verifiesEveryNeed).toBe(true);
    expect(gate.neutralized).toEqual(['2 steps (exactly one accepted)']);
  });

  it('the shape is a lock, not a list: an unknown key at every level is named', async () => {
    const { extractJobGate } = await import('./aggregator-shape.js');
    const gate = extractJobGate({
      if: 'always()',
      services: {},
      steps: [
        {
          uses: 'x/y@v1',
          env: { NEEDS_JSON: NEEDS, SKIP_ALLOWED: '[]', NOVEL: '1' },
          run: AGGREGATOR_RUN,
        },
      ],
    }).gate;
    expect(gate.neutralized).toEqual(['job key "services"', 'step key "uses"', 'env key "NOVEL"']);
  });

  it.each([
    {
      root: { defaults: { run: { shell: 'bash -c true {0}' } } },
      expected: ['workflow key "defaults"'],
    },
    { root: { env: { BASH_ENV: '/tmp/x.sh' } }, expected: ['workflow key "env"'] },
    {
      root: { defaults: {}, env: {} },
      expected: ['workflow key "defaults"', 'workflow key "env"'],
    },
    { root: { name: 'CI', on: 'push', permissions: {}, concurrency: {} }, expected: [] },
  ])(
    'the workflow root is held to the same lock: a top-level defaults/env reaches the step the job may not override (#6387 panel 4): %j',
    async ({ root, expected }) => {
      const { extractWorkflowGate } = await import('./aggregator-shape.js');
      const gate = extractWorkflowGate(
        {
          ...root,
          jobs: {
            lint: { steps: [{ run: 'pnpm lint' }] },
            'ci-success': {
              if: 'always()',
              needs: ['lint'],
              steps: [{ env: { NEEDS_JSON: NEEDS, SKIP_ALLOWED: '[]' }, run: AGGREGATOR_RUN }],
            },
          },
        },
        'ci-success'
      );
      expect(gate).toEqual({
        needs: ['lint'],
        gate: { verifiesEveryNeed: true, skipAllowed: [], neutralized: expected },
      });
    }
  );

  it.each([
    { need: { 'continue-on-error': true }, expected: ['need "security" job continue-on-error'] },
    {
      need: { 'continue-on-error': '${{ true }}' },
      expected: ['need "security" job continue-on-error'],
    },
    {
      need: { steps: [{ run: 'pnpm audit', 'continue-on-error': true }] },
      expected: ['need "security" step continue-on-error'],
    },
    {
      need: { 'continue-on-error': false, steps: [{ 'continue-on-error': false }] },
      expected: ['need "security" job continue-on-error', 'need "security" step continue-on-error'],
    },
    { need: { steps: [{ run: 'pnpm audit' }] }, expected: [] },
    // GitHub refuses a workflow whose needs name no job; the checker says so instead of reading clean.
    { need: undefined, expected: ['need "security" is not a job in this workflow'] },
    // A shape the schema cannot read fails CLOSED: `if: 1` is truthy to GitHub, and the job ran advisory.
    {
      need: { if: 1, 'continue-on-error': true },
      expected: ['need "security" has an unreadable shape'],
    },
    { need: { steps: 'not a list' }, expected: ['need "security" has an unreadable shape'] },
    // A reusable workflow's jobs can carry the knob where this checker cannot see (V1).
    {
      need: { uses: './.github/workflows/audit.yml' },
      expected: ['need "security" calls a reusable workflow (uses)'],
    },
    // security is not skip_allowed, so any if: is its own business: false skips → jq reddens.
    { need: { if: 'false', steps: [] }, expected: [] },
  ])(
    'a NEEDED job that swallows its own failure with continue-on-error is drift (#6387): %j',
    async ({ need, expected }) => {
      const { extractWorkflowGate } = await import('./aggregator-shape.js');
      const gate = extractWorkflowGate(
        {
          jobs: {
            security: need,
            'ci-success': {
              if: 'always()',
              needs: ['security'],
              steps: [{ env: { NEEDS_JSON: NEEDS, SKIP_ALLOWED: '[]' }, run: AGGREGATOR_RUN }],
            },
          },
        },
        'ci-success'
      ).gate;
      expect(gate.neutralized).toEqual(expected);
    }
  );

  it.each([
    { cond: "github.event_name == 'pull_request'", expected: [] },
    { cond: "${{ github.event_name == 'pull_request' }}", expected: [] },
    // A skip_allowed need that skips for any other reason is a gate disabled forever (V2).
    {
      cond: "github.event_name == 'never'",
      expected: ['need "commitlint" may skip only under if: github.event_name == \'pull_request\''],
    },
    {
      cond: undefined,
      expected: ['need "commitlint" may skip only under if: github.event_name == \'pull_request\''],
    },
    {
      cond: false,
      expected: ['need "commitlint" may skip only under if: github.event_name == \'pull_request\''],
    },
  ])(
    'a skip_allowed need may skip only because the event is not a PR (#6387): %j',
    async ({ cond, expected }) => {
      const { extractWorkflowGate } = await import('./aggregator-shape.js');
      const gate = extractWorkflowGate(
        {
          jobs: {
            commitlint: { if: cond, steps: [{ run: 'x' }] },
            'ci-success': {
              if: 'always()',
              needs: ['commitlint'],
              steps: [
                { env: { NEEDS_JSON: NEEDS, SKIP_ALLOWED: '["commitlint"]' }, run: AGGREGATOR_RUN },
              ],
            },
          },
        },
        'ci-success'
      ).gate;
      expect(gate.neutralized).toEqual(expected);
    }
  );

  it('a "*" skip list (docs-success) pins no if: on its needs — they path-filter', async () => {
    const { extractWorkflowGate } = await import('./aggregator-shape.js');
    const gate = extractWorkflowGate(
      {
        jobs: {
          lintdocs: { if: "contains(github.event.head_commit.modified, 'docs/')", steps: [] },
          'docs-success': {
            if: 'always()',
            needs: ['lintdocs'],
            steps: [{ env: { NEEDS_JSON: NEEDS, SKIP_ALLOWED: '"*"' }, run: AGGREGATOR_RUN }],
          },
        },
      },
      'docs-success'
    ).gate;
    expect(gate.neutralized).toEqual([]);
  });

  it('workflow-root drift and job drift are both named, root first', async () => {
    const { extractWorkflowGate } = await import('./aggregator-shape.js');
    const gate = extractWorkflowGate(
      {
        env: {},
        jobs: { 'ci-success': { steps: [{ env: { NEEDS_JSON: NEEDS }, run: AGGREGATOR_RUN }] } },
      },
      'ci-success'
    ).gate;
    expect(gate.neutralized).toEqual(['workflow key "env"', 'job if missing (always() required)']);
  });

  it('the pinned script is what the real ci.yml and docs-check.yml steps run', async () => {
    const { loadCiSuccessGate } = await import('./check-required-jobs.js');
    expect(loadCiSuccessGate().gate.verifiesEveryNeed).toBe(true);
  });

  it.each(['not json', '{"a":1}', '["ok", 1]'])(
    'a SKIP_ALLOWED that is not a JSON array of ids reads as none declared: %s',
    async (raw) => {
      const { extractJobGate } = await import('./aggregator-shape.js');
      const gate = extractJobGate({
        if: 'always()',
        steps: [{ env: { NEEDS_JSON: NEEDS, SKIP_ALLOWED: raw }, run: AGGREGATOR_RUN }],
      });
      expect(gate.gate).toEqual({
        verifiesEveryNeed: true,
        skipAllowed: undefined,
        neutralized: [],
      });
    }
  );

  it('names a missing gate as verifying nothing', async () => {
    const { extractJobGate } = await import('./aggregator-shape.js');
    expect(extractJobGate(undefined)).toEqual({
      needs: [],
      gate: { verifiesEveryNeed: false, skipAllowed: undefined, neutralized: [] },
    });
  });

  it('matches the manifest to the REAL ci-success.needs exactly and checks the tree', async () => {
    const { checkRequiredJobs, loadCiSuccessGate } = await import('./check-required-jobs.js');
    const { extractWorkflowGate } = await import('./aggregator-shape.js');
    const { loadWorkflowJobNames } = await import('./check-required-jobs.js');
    const actualManifest: unknown = JSON.parse(
      readFileSync('governance/required-jobs.json', 'utf8')
    );
    const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
      jobs: Record<string, unknown>;
    };
    const gate = extractWorkflowGate(ci, 'ci-success');
    expect(actualManifest).toMatchObject({ ci_success_needs: gate.needs });
    expect(loadCiSuccessGate()).toEqual(gate);
    expect(
      checkRequiredJobs({
        manifest: actualManifest,
        ciSuccessNeeds: gate.needs,
        ciSuccessGate: gate.gate,
        packageJson: JSON.parse(readFileSync('package.json', 'utf8')) as unknown,
        requiredContexts: contexts,
        workflowJobNames: loadWorkflowJobNames(),
      })
    ).toEqual({ verdict: 'ok', problems: [] });
  });
});

describe('required-jobs CLI reporting', () => {
  let directory: string;
  let output: string[];
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'required-jobs-'));
    mkdirSync(join(directory, 'governance'));
    mkdirSync(join(directory, '.github/workflows'), { recursive: true });
    writeFileSync(join(directory, 'governance/required-jobs.json'), JSON.stringify(manifest));
    writeFileSync(join(directory, 'package.json'), '{}');
    writeFileSync(
      join(directory, '.github/workflows/ci.yml'),
      `jobs:
  ci-success:
    name: CI Success
    needs: [lint, security]
    if: always()
    steps:
      - env:
          NEEDS_JSON: \${{ toJSON(needs) }}
          SKIP_ALLOWED: '["lint"]'
        run: |
${AGGREGATOR_RUN.split('\n')
  .map((l) => '          ' + l)
  .join('\n')}
  lint:
    if: github.event_name == 'pull_request'
    steps:
      - run: pnpm lint
  security:
    steps:
      - run: pnpm audit
  governor:
    name: Governor-path ratification gate
`
    );
    vi.mocked(execFileSync).mockReset().mockReturnValue(JSON.stringify({ contexts }));
    output = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      output.push(line);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it('reads the manifest from the POLICY checkout, never from the target under review', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    const policyDir = mkdtempSync(join(tmpdir(), 'required-jobs-policy-'));
    try {
      mkdirSync(join(policyDir, 'governance'));
      // Policy pins a job the target's ci-success does not carry: drift, even
      // though the target's OWN manifest (which a PR could edit) says otherwise.
      writeFileSync(
        join(policyDir, 'governance/required-jobs.json'),
        JSON.stringify({
          ...manifest,
          ci_success_needs: [...manifest.ci_success_needs, 'typecheck'],
        })
      );
      expect(runRequiredJobsCheck(directory, policyDir)).toBe(1);
      expect(output).toContain('::error::Missing ci-success.needs: typecheck');
      // And the target's manifest being broken changes nothing when policy is sound.
      writeFileSync(join(directory, 'governance/required-jobs.json'), 'not json');
      writeFileSync(join(policyDir, 'governance/required-jobs.json'), JSON.stringify(manifest));
      output.length = 0;
      expect(runRequiredJobsCheck(directory, policyDir)).toBe(0);
    } finally {
      rmSync(policyDir, { recursive: true, force: true });
    }
  });

  it('changes when only the target package or target workflow changes', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    expect(runRequiredJobsCheck(directory, directory)).toBe(0);
    writeFileSync(join(directory, 'package.json'), '{"pnpm":{"auditConfig":{}}}');
    expect(runRequiredJobsCheck(directory, directory)).toBe(1);
    writeFileSync(join(directory, 'package.json'), '{}');
    expect(runRequiredJobsCheck(directory, directory)).toBe(0);
    const workflowPath = join(directory, '.github/workflows/ci.yml');
    writeFileSync(
      workflowPath,
      readFileSync(workflowPath, 'utf8').replace('CI Success', 'Renamed')
    );
    expect(runRequiredJobsCheck(directory, directory)).toBe(1);
    expect(output.join('\n')).toContain('Required context without workflow job: CI Success');
  });

  it('a workflow-level defaults.run.shell in the target ci.yml is drift the live checker names (#6387 panel 4)', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    const workflowPath = join(directory, '.github/workflows/ci.yml');
    writeFileSync(
      workflowPath,
      'defaults:\n  run:\n    shell: bash -c true {0}\n' + readFileSync(workflowPath, 'utf8')
    );
    expect(runRequiredJobsCheck(directory, directory)).toBe(1);
    expect(output).toContain(
      '::error::ci-success aggregator departs from the one accepted shape: workflow key "defaults" (#6387)'
    );
  });

  it('prints ok and exits 0 for measured matching inputs', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    expect(runRequiredJobsCheck(directory, directory)).toBe(0);
    expect(output).toEqual(['Required jobs: ok']);
  });

  it('prints each measured drift on its own error line and exits 1', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    writeFileSync(join(directory, 'package.json'), '{"pnpm":{"auditConfig":{}}}');
    vi.mocked(execFileSync).mockReturnValue('{"contexts":[]}');
    expect(runRequiredJobsCheck(directory, directory)).toBe(1);
    expect(output).toEqual([
      'Required jobs: drift',
      '::error::Forbidden package.json pnpm.auditConfig is present',
      '::error::Missing required context: CI Success',
      '::error::Missing required context: Governor-path ratification gate',
    ]);
  });

  it('warns and exits 2 when protection is unreadable and local checks pass', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('API unavailable');
    });
    expect(runRequiredJobsCheck(directory, directory)).toBe(2);
    expect(output).toEqual([
      'Required jobs: unmeasured',
      '::warning::Required contexts: unmeasured (branch protection unreadable)',
    ]);
  });

  it.each(contexts)('fails offline when the expected producer %s is missing', async (name) => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    const workflow = join(directory, '.github/workflows/ci.yml');
    writeFileSync(
      workflow,
      readFileSync(workflow, 'utf8').replace(`name: ${name}`, 'name: Renamed')
    );
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('API unavailable');
    });
    expect(runRequiredJobsCheck(directory, directory)).toBe(1);
    expect(output).toEqual([
      'Required jobs: drift',
      `::error::Required context without workflow job: ${name}`,
      '::warning::Required contexts: unmeasured (branch protection unreadable)',
    ]);
  });

  it('fails online when a required producer is missing', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    const workflow = join(directory, '.github/workflows/ci.yml');
    writeFileSync(
      workflow,
      readFileSync(workflow, 'utf8').replace('name: CI Success', 'name: Renamed')
    );
    expect(runRequiredJobsCheck(directory, directory)).toBe(1);
    expect(output).toEqual([
      'Required jobs: drift',
      '::error::Required context without workflow job: CI Success',
    ]);
  });

  it('returns unmeasured and exits 2 when no tree can be read', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    expect(runRequiredJobsCheck(join(directory, 'absent'), directory)).toBe(2);
    expect(output).toEqual([
      'Required jobs: unmeasured',
      '::warning::Repository tree unreadable; no checks measured',
    ]);
  });

  it('treats a missing required manifest in a readable tree as drift', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    rmSync(join(directory, 'governance/required-jobs.json'));
    expect(runRequiredJobsCheck(directory, directory)).toBe(1);
    expect(output[0]).toBe('Required jobs: drift');
  });

  it('treats malformed manifest JSON as measured drift', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    writeFileSync(join(directory, 'governance/required-jobs.json'), '{invalid');
    expect(runRequiredJobsCheck(directory, directory)).toBe(1);
    expect(output[0]).toBe('Required jobs: drift');
  });

  it('warns without inventing missing producers when the inventory is unreadable', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    writeFileSync(join(directory, '.github/workflows/broken.yml'), '[');
    expect(runRequiredJobsCheck(directory, directory)).toBe(2);
    expect(output).toEqual([
      'Required jobs: unmeasured',
      '::warning::Required contexts: unmeasured (workflow inventory unreadable)',
    ]);
  });

  it('still measures protection drift when the workflow inventory is unreadable', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    writeFileSync(join(directory, '.github/workflows/broken.yml'), '[');
    vi.mocked(execFileSync).mockReturnValue('{"contexts":[]}');
    expect(runRequiredJobsCheck(directory, directory)).toBe(1);
    expect(output).toEqual([
      'Required jobs: drift',
      '::error::Missing required context: CI Success',
      '::error::Missing required context: Governor-path ratification gate',
      '::warning::Required contexts: unmeasured (workflow inventory unreadable)',
    ]);
  });

  it('preserves local drift when a sibling workflow cannot be parsed', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    writeFileSync(join(directory, '.github/workflows/broken.yml'), '[');
    writeFileSync(join(directory, 'package.json'), '{"pnpm":{"auditConfig":{}}}');
    expect(runRequiredJobsCheck(directory, directory)).toBe(1);
    expect(output).toContain('::error::Forbidden package.json pnpm.auditConfig is present');
    expect(output).toContain(
      '::warning::Required contexts: unmeasured (workflow inventory unreadable)'
    );
  });
});

// Context contract and loaders folded from the retired standalone gate.
describe('required-context contract', () => {
  let subject: typeof import('./check-required-jobs.js');
  let workflowDirectory: string;
  const EXPECTED = ['CI Success', 'Governor-path ratification gate'];
  const REAL_WORKFLOWS = fileURLToPath(new URL('../.github/workflows/', import.meta.url));

  beforeEach(async () => {
    subject = await import('./check-required-jobs.js');
    workflowDirectory = mkdtempSync(join(tmpdir(), 'required-contexts-'));
    vi.mocked(execFileSync).mockReset();
  });

  afterEach(() => {
    if (workflowDirectory !== undefined)
      rmSync(workflowDirectory, { recursive: true, force: true });
  });

  describe('checkRequiredContexts', () => {
    it('accepts required contexts with matching producers', () => {
      expect(subject.EXPECTED_REQUIRED_CONTEXTS).toEqual(EXPECTED);
      expect(
        subject.checkRequiredContexts({ requiredContexts: EXPECTED, workflowJobNames: EXPECTED })
      ).toEqual({ verdict: 'ok', missing: [], unproduced: [], expected: EXPECTED });
    });

    it('reports an expected context missing from branch protection', () => {
      expect(
        subject.checkRequiredContexts({
          requiredContexts: ['CI Success'],
          workflowJobNames: EXPECTED,
        })
      ).toEqual({
        verdict: 'drift',
        missing: ['Governor-path ratification gate'],
        unproduced: [],
        expected: EXPECTED,
      });
    });

    it('reports a renamed workflow job as an unproduced context', () => {
      expect(
        subject.checkRequiredContexts({
          requiredContexts: EXPECTED,
          workflowJobNames: ['CI Success', 'Renamed gate'],
        })
      ).toEqual({
        verdict: 'drift',
        missing: [],
        unproduced: ['Governor-path ratification gate'],
        expected: EXPECTED,
      });
    });

    it('reports an extra required context without a producer', () => {
      expect(
        subject.checkRequiredContexts({
          requiredContexts: [...EXPECTED, 'Obsolete check'],
          workflowJobNames: EXPECTED,
        })
      ).toEqual({
        verdict: 'drift',
        missing: [],
        unproduced: ['Obsolete check'],
        expected: EXPECTED,
      });
    });

    it('accepts extra required contexts when they have producers', () => {
      expect(
        subject.checkRequiredContexts({
          requiredContexts: [...EXPECTED, 'Extra check'],
          workflowJobNames: [...EXPECTED, 'Extra check'],
        }).verdict
      ).toBe('ok');
    });

    it('reports an empty job list as drift', () => {
      expect(
        subject.checkRequiredContexts({ requiredContexts: EXPECTED, workflowJobNames: [] })
      ).toEqual({ verdict: 'drift', missing: [], unproduced: EXPECTED, expected: EXPECTED });
    });

    it('reports empty branch protection as drift', () => {
      expect(
        subject.checkRequiredContexts({ requiredContexts: [], workflowJobNames: EXPECTED })
      ).toEqual({ verdict: 'drift', missing: EXPECTED, unproduced: [], expected: EXPECTED });
    });

    it('reports both empty collections as drift', () => {
      expect(
        subject.checkRequiredContexts({ requiredContexts: [], workflowJobNames: [] }).verdict
      ).toBe('drift');
    });

    it('keeps only the protection half unmeasured when all producers exist', () => {
      expect(
        subject.checkRequiredContexts({
          requiredContexts: 'unmeasured',
          workflowJobNames: EXPECTED,
        })
      ).toEqual({ verdict: 'unmeasured', missing: [], unproduced: [], expected: EXPECTED });
    });

    it.each([
      { workflowJobNames: [] },
      { workflowJobNames: ['CI Success'] },
      { workflowJobNames: ['Governor-path ratification gate'] },
    ])(
      'detects missing expected producers offline with inventory $workflowJobNames',
      ({ workflowJobNames }) => {
        expect(
          subject.checkRequiredContexts({
            requiredContexts: 'unmeasured',
            workflowJobNames,
          })
        ).toEqual({
          verdict: 'drift',
          missing: [],
          unproduced: EXPECTED.filter((name) => !workflowJobNames.includes(name)),
          expected: EXPECTED,
        });
      }
    );
  });

  describe('loadWorkflowJobNames', () => {
    it('reads names from every workflow and falls back to unnamed job IDs', () => {
      writeFileSync(
        join(workflowDirectory, 'first.yml'),
        'jobs:\n  gate:\n    name: CI Success\n  unnamed:\n    runs-on: ubuntu-latest\n'
      );
      writeFileSync(
        join(workflowDirectory, 'second.yml'),
        'jobs:\n  governor:\n    name: Governor-path ratification gate\n'
      );
      writeFileSync(join(workflowDirectory, 'ignored.txt'), 'not yaml');
      expect(subject.loadWorkflowJobNames(workflowDirectory).sort()).toEqual(
        [...EXPECTED, 'unnamed'].sort()
      );
    });

    it('returns no producers for an empty directory', () => {
      expect(subject.loadWorkflowJobNames(workflowDirectory)).toEqual([]);
    });

    it('rejects a malformed workflow instead of claiming complete coverage', () => {
      writeFileSync(join(workflowDirectory, 'broken.yml'), 'jobs: [');
      expect(() => subject.loadWorkflowJobNames(workflowDirectory)).toThrow();
    });

    it('rejects invalid job names', () => {
      writeFileSync(join(workflowDirectory, 'broken.yml'), 'jobs:\n  gate:\n    name: 42\n');
      expect(() => subject.loadWorkflowJobNames(workflowDirectory)).toThrow();
    });

    it('finds both expected producers in the REAL repository workflows without an API call', () => {
      const names = subject.loadWorkflowJobNames(REAL_WORKFLOWS);
      expect(names).toEqual(expect.arrayContaining(EXPECTED));
      expect(execFileSync).not.toHaveBeenCalled();
    });
  });

  describe('loadRequiredContexts', () => {
    it('reads contexts through gh with separate arguments', () => {
      vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ contexts: EXPECTED }));
      expect(subject.loadRequiredContexts()).toEqual(EXPECTED);
      expect(execFileSync).toHaveBeenCalledWith(
        'gh',
        [
          'api',
          'repos/nexus-substrate/nexus-agents/branches/main/protection/required_status_checks',
        ],
        expect.objectContaining({ encoding: 'utf-8', timeout: expect.any(Number) })
      );
    });

    it('preserves a measured empty contexts array', () => {
      vi.mocked(execFileSync).mockReturnValue('{"contexts":[]}');
      expect(subject.loadRequiredContexts()).toEqual([]);
    });

    it('reports failed API access as unmeasured', () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('HTTP 403');
      });
      expect(subject.loadRequiredContexts()).toBe('unmeasured');
    });

    it.each(['not json', '{}', '{"contexts":null}', '{"contexts":[42]}'])(
      'reports invalid API data %s as unmeasured',
      (response) => {
        vi.mocked(execFileSync).mockReturnValue(response);
        expect(subject.loadRequiredContexts()).toBe('unmeasured');
      }
    );
  });
});
