/**
 * Tests for the parameter-drift script's machine-readable verdict, and for the
 * workflow step that consumes it (#6237).
 *
 * Two layers, each tested as a value rather than by string proximity:
 *
 * 1. {@link parameterDriftVerdict} — the pure function that turns a measurement
 *    into `clean | drift | skipped`.
 * 2. The `run:` block of the workflow's check step, EXECUTED under `bash -e`
 *    (the GitHub default: errexit, no pipefail) against a `pnpm` shim. The
 *    workflow used to default the status with `| tail -1 || echo "skipped"`;
 *    that fallback could never fire, because `tail -1` exits 0 on empty input,
 *    so an absent verdict became `drift_status=` (empty) and a green run.
 *
 * Same shape as scripts/check-pricing-drift.test.ts (#4927 finding 1).
 *
 * @module scripts/check-parameter-drift.test
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { parameterDriftVerdict, formatVerdict } from './check-parameter-drift.js';
import type { ParameterDriftFinding } from './parameter-drift-reconcile.js';

const ROOT = join(import.meta.dirname, '..');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/parameter-drift.yml'), 'utf8');

function finding(param: string): ParameterDriftFinding {
  return {
    modelId: 'm',
    providerId: 'vendor/m',
    param,
    registrySupported: true,
    providerSupported: false,
  };
}

describe('parameterDriftVerdict (#6237)', () => {
  it('reports an unmeasured run as skipped — never clean', () => {
    const v = parameterDriftVerdict({ kind: 'unmeasured', reason: 'empty catalog' });
    expect(v.status).toBe('skipped');
    expect(v.count).toBe(0);
  });

  it('reports a measured empty finding set as clean with a genuine zero', () => {
    const v = parameterDriftVerdict({ kind: 'measured', findings: [] });
    expect(v).toEqual({ status: 'clean', count: 0 });
  });

  it('reports N drifted pairs as drift with count N', () => {
    const findings = [finding('temperature'), finding('top_p'), finding('max_tokens')];
    const v = parameterDriftVerdict({ kind: 'measured', findings });
    expect(v).toEqual({ status: 'drift', count: 3 });
  });

  it('formats the two lines the workflow greps for', () => {
    expect(formatVerdict({ status: 'drift', count: 7 })).toBe(
      'PARAM_DRIFT_STATUS=drift\nPARAM_DRIFT_COUNT=7'
    );
  });
});

interface Step {
  readonly name?: string;
  readonly id?: string;
  readonly if?: string;
  readonly run?: string;
}
const parsed = parseYaml(WORKFLOW) as { jobs: Record<string, { steps: Step[] }> };
const steps: Step[] = parsed.jobs.check?.steps ?? [];
const checkStep = steps.find((s) => s.id === 'drift');

/**
 * Run the check step's shell exactly as GitHub would (`bash -e`, no pipefail),
 * with `pnpm` replaced by a shim that prints `output` and exits `exitCode`.
 * Returns the `$GITHUB_OUTPUT` lines the step wrote.
 */
function runCheckStep(output: string, exitCode: number): { outputs: string; status: number } {
  const dir = mkdtempSync(join(tmpdir(), 'parameter-drift-step-'));
  dirs.push(dir);
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const shim = join(bin, 'pnpm');
  writeFileSync(shim, `#!/bin/bash\nprintf '%s\\n' "$FAKE_OUTPUT"\nexit "$FAKE_EXIT"\n`);
  chmodSync(shim, 0o755);
  const ghOutput = join(dir, 'github_output');
  writeFileSync(ghOutput, '');
  const script = checkStep?.run;
  if (script === undefined) throw new Error('check step has no run block');
  const r = spawnSync('bash', ['-e', '-c', script], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      FAKE_OUTPUT: output,
      FAKE_EXIT: String(exitCode),
      GITHUB_OUTPUT: ghOutput,
    },
  });
  return { outputs: readFileSync(ghOutput, 'utf8'), status: r.status ?? -1 };
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('the parameter-drift check step, executed (#6237)', () => {
  it('reads a drift verdict and its count', () => {
    const r = runCheckStep('banner\nPARAM_DRIFT_STATUS=drift\nPARAM_DRIFT_COUNT=3\n', 0);
    expect(r.status).toBe(0);
    expect(r.outputs).toContain('drift_status=drift\n');
    expect(r.outputs).toContain('drift_count=3\n');
  });

  it('reads a clean verdict as a measured zero', () => {
    const r = runCheckStep('PARAM_DRIFT_STATUS=clean\nPARAM_DRIFT_COUNT=0\n', 0);
    expect(r.outputs).toContain('drift_status=clean\n');
    expect(r.outputs).toContain('drift_count=0\n');
  });

  it('defaults an ABSENT verdict to skipped, not to an empty string', () => {
    // The whole point. With `| tail -1 || echo skipped` this produced
    // `drift_status=` and a green run.
    const r = runCheckStep('tsx banner, then nothing', 0);
    expect(r.status).toBe(0);
    expect(r.outputs).toContain('drift_status=skipped\n');
    expect(r.outputs).toContain('drift_count=0\n');
  });

  it('treats a non-zero script exit as skipped even if a verdict was printed', () => {
    const r = runCheckStep('PARAM_DRIFT_STATUS=clean\nPARAM_DRIFT_COUNT=0\n', 1);
    expect(r.status).toBe(0);
    expect(r.outputs).toContain('drift_status=skipped\n');
  });
});

describe('the parameter-drift workflow consumes the verdict (#6237)', () => {
  const skip = steps.find((s) => s.if?.includes("drift_status == 'skipped'") === true);

  it('fails the run on a skip, with an error annotation that says unmeasured', () => {
    expect(skip).toBeDefined();
    expect(skip?.run).toContain('::error::');
    expect(skip?.run).toContain('UNMEASURED');
    expect(skip?.run).toMatch(/^\s*exit 1\s*$/m);
  });

  it('the skip step, executed, exits 1', () => {
    const script = skip?.run;
    if (script === undefined) throw new Error('skip step has no run block');
    const r = spawnSync('bash', ['-e', '-c', script], { encoding: 'utf8' });
    expect(r.status).toBe(1);
  });

  it('files an issue only when drift was actually measured', () => {
    // Without the status term, a `skipped` run with a defaulted count of 0
    // and a `drift` run with a real count are the same input to this gate.
    const create = steps.find((s) => s.name?.startsWith('Create issue') === true);
    expect(create?.if).toContain("drift_status == 'drift'");
  });
});
