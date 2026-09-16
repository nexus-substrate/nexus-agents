/** Governor-owned required-job wiring contract (#6343). */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
      problems: ['Missing ci-success result check: security (missing or commented out)'],
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

  it.each([
    "# needs.security.result != 'success'",
    "  # needs.security.result != 'success'",
    "echo ok # needs.security.result != 'success'",
    "echo ok\t# needs.security.result != 'success'",
    "# unmatched quote ' needs.security.result",
    // #6378 panel: `#` begins a word after an unquoted metacharacter too —
    // bash runs none of these (`bash -c 'echo ok;# echo HIDDEN'` prints ok).
    "echo ok;# needs.security.result != 'success'",
    "true &&# needs.security.result != 'success'",
    "true ||# needs.security.result != 'success'",
    "(echo ok;# needs.security.result != 'success'\n)",
    'echo ok >/dev/null<# needs.security.result',
  ])('rejects a commented-out result check: %s', async (comment) => {
    const { extractJobGate, checkRequiredJobs } = await import('./check-required-jobs.js');
    const gate = extractJobGate({
      needs: input.ciSuccessNeeds,
      steps: [{ run: 'test "${{ needs.lint.result }}" = success\n' + comment }],
    });
    const result = checkRequiredJobs({ ...input, ciSuccessResultChecks: gate.resultChecks });
    expect(result.verdict).toBe('drift');
    expect(result.problems).toContain(
      'Missing ci-success result check: security (missing or commented out)'
    );
    expect(gate.gateScript).not.toContain('needs.security.result');
  });

  it.each([
    'test "${{ needs.security.result }}" = success',
    'echo \'#\'; test "${{ needs.security.result }}" = success',
    'echo "#"; test "${{ needs.security.result }}" = success',
    'echo word#suffix; test "${{ needs.security.result }}" = success',
    'echo \\#; test "${{ needs.security.result }}" = success',
    'echo "escaped \\" #"; test "${{ needs.security.result }}" = success',
    "echo '${{ contains(' #', '#') }}'; test \"${{ needs.security.result }}\" = success",
    'echo "${{ contains(\' }} #\', \'#\') }}"; test "${{ needs.security.result }}" = success',
  ])('accepts a live check with quoted or literal hashes: %s', async (run) => {
    const { extractJobGate, checkRequiredJobs } = await import('./check-required-jobs.js');
    const gate = extractJobGate({
      needs: input.ciSuccessNeeds,
      steps: [{ if: "needs.lint.result == 'success'", run }],
    });
    expect(checkRequiredJobs({ ...input, ciSuccessResultChecks: gate.resultChecks })).toEqual({
      verdict: 'ok',
      problems: [],
    });
  });

  it('preserves if expressions as-is, with no shell comment syntax', async () => {
    const { extractJobGate } = await import('./check-required-jobs.js');
    const expression = "contains(' #', '#') && needs.security.result == 'success'";
    const gate = extractJobGate({ steps: [{ if: expression }] });
    expect(gate.gateScript).toContain(expression);
    expect(gate.resultChecks).toEqual(['security']);
  });

  it.each(['', '# needs.lint.result\n  # needs.security.result'])(
    'names empty live wiring as drift for every manifest id: %j',
    async (run) => {
      const { extractJobGate, checkRequiredJobs } = await import('./check-required-jobs.js');
      const gate = extractJobGate({ needs: input.ciSuccessNeeds, steps: [{ run }] });
      const result = checkRequiredJobs({ ...input, ciSuccessResultChecks: gate.resultChecks });
      expect(result.verdict).toBe('drift');
      expect(result.problems).toEqual(
        manifest.ci_success_needs.map(
          (id) => `Missing ci-success result check: ${id} (missing or commented out)`
        )
      );
      expect(gate.resultChecks).toEqual([]);
      expect(gate.gateScript.trim()).toBe('');
    }
  );

  it('names a missing gate as empty wiring', async () => {
    const { extractJobGate } = await import('./check-required-jobs.js');
    expect(extractJobGate(undefined)).toEqual({ needs: [], gateScript: '', resultChecks: [] });
  });

  it('matches the manifest to the REAL ci-success.needs exactly and checks the tree', async () => {
    const { checkRequiredJobs, extractJobGate, loadCiSuccessGate } =
      await import('./check-required-jobs.js');
    const { loadWorkflowJobNames } = await import('./check-required-jobs.js');
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
