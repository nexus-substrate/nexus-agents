/** Governor-owned required-job wiring contract (#6343). */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const contexts = ['CI Success', 'Governor-path ratification gate'];
const manifest = {
  description: 'Required CI wiring',
  version: '1.0.0',
  ci_success_needs: ['lint', 'security'],
  required_contexts: contexts,
  audit_config_forbidden: true,
};
const input = {
  manifest,
  ciSuccessNeeds: ['lint', 'security'],
  ciSuccessResultChecks: ['lint', 'security'],
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

  it('detects a dropped result check', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    expect(checkRequiredJobs({ ...input, ciSuccessResultChecks: ['lint'] })).toEqual({
      verdict: 'drift',
      problems: ['Missing ci-success result check: security'],
    });
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

  it('keeps an otherwise measured ok tree ok when protection is unmeasured', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    expect(checkRequiredJobs({ ...input, requiredContexts: 'unmeasured' })).toEqual({
      verdict: 'ok',
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

  it('rejects a malformed manifest', async () => {
    const { checkRequiredJobs } = await import('./check-required-jobs.js');
    expect(checkRequiredJobs({ ...input, manifest: {} }).verdict).toBe('drift');
  });
});

describe('shared job gate extraction', () => {
  it('reads needs and result references from step if and run text', async () => {
    const { extractJobGate } = await import('./check-required-jobs.js');
    const gate = extractJobGate({
      needs: ['lint', 'security'],
      steps: [
        { if: "needs.lint.result == 'success'", run: 'echo ok' },
        { run: 'test "${{ needs.security.result }}" = success' },
      ],
    });
    expect(gate.needs).toEqual(['lint', 'security']);
    expect(gate.resultChecks).toEqual(['lint', 'security']);
  });

  it('names a missing gate as empty wiring', async () => {
    const { extractJobGate } = await import('./check-required-jobs.js');
    expect(extractJobGate(undefined)).toEqual({ needs: [], gateScript: '', resultChecks: [] });
  });

  it('matches the manifest to the REAL ci-success.needs exactly and checks the tree', async () => {
    const { checkRequiredJobs, extractJobGate, loadCiSuccessGate } =
      await import('./check-required-jobs.js');
    const { loadWorkflowJobNames } = await import('./check-required-contexts.js');
    const actualManifest: unknown = JSON.parse(
      readFileSync('governance/required-jobs.json', 'utf8')
    );
    const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
      jobs: Record<string, unknown>;
    };
    const gate = extractJobGate(ci.jobs['ci-success']);
    expect(actualManifest).toMatchObject({ ci_success_needs: gate.needs });
    expect(loadCiSuccessGate()).toEqual(gate);
    expect(
      checkRequiredJobs({
        manifest: actualManifest,
        ciSuccessNeeds: gate.needs,
        ciSuccessResultChecks: gate.resultChecks,
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
    steps:
      - run: needs.lint.result needs.security.result
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

  it('prints ok and exits 0 for measured matching inputs', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    expect(runRequiredJobsCheck(directory)).toBe(0);
    expect(output).toEqual(['Required jobs: ok']);
  });

  it('prints each measured drift on its own error line and exits 1', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    writeFileSync(join(directory, 'package.json'), '{"pnpm":{"auditConfig":{}}}');
    vi.mocked(execFileSync).mockReturnValue('{"contexts":[]}');
    expect(runRequiredJobsCheck(directory)).toBe(1);
    expect(output).toEqual([
      'Required jobs: drift',
      '::error::Forbidden package.json pnpm.auditConfig is present',
      '::error::Missing required context: CI Success',
      '::error::Missing required context: Governor-path ratification gate',
    ]);
  });

  it('prints the unreadable protection sub-check while exiting 0 for a measured ok tree', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('API unavailable');
    });
    expect(runRequiredJobsCheck(directory)).toBe(0);
    expect(output).toContain(
      '::error::Required contexts: unmeasured (branch protection unreadable)'
    );
  });

  it('returns unmeasured and exits 2 when no tree can be read', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    expect(runRequiredJobsCheck(join(directory, 'absent'))).toBe(2);
    expect(output[0]).toBe('Required jobs: unmeasured');
  });

  it('treats a missing required manifest in a readable tree as drift', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    rmSync(join(directory, 'governance/required-jobs.json'));
    expect(runRequiredJobsCheck(directory)).toBe(1);
    expect(output[0]).toBe('Required jobs: drift');
  });

  it('treats malformed manifest JSON as measured drift', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    writeFileSync(join(directory, 'governance/required-jobs.json'), '{invalid');
    expect(runRequiredJobsCheck(directory)).toBe(1);
    expect(output[0]).toBe('Required jobs: drift');
  });

  it('preserves local drift when a sibling workflow cannot be parsed', async () => {
    const { runRequiredJobsCheck } = await import('./check-required-jobs.js');
    writeFileSync(join(directory, '.github/workflows/broken.yml'), '[');
    writeFileSync(join(directory, 'package.json'), '{"pnpm":{"auditConfig":{}}}');
    expect(runRequiredJobsCheck(directory)).toBe(1);
    expect(output).toContain('::error::Forbidden package.json pnpm.auditConfig is present');
    expect(output).toContain(
      '::error::Required contexts: unmeasured (workflow inventory unreadable)'
    );
  });
});
