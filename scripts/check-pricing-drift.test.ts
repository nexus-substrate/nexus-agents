/**
 * Tests for the pricing-drift script's machine-readable verdict, and for the
 * workflow step that consumes it.
 *
 * Two layers, each tested as a value rather than by string proximity:
 *
 * 1. {@link pricingDriftVerdict} — the pure function that turns a measurement
 *    into `clean | drift | skipped`.
 * 2. The `run:` block of the workflow's check step, EXECUTED under `bash -e`
 *    (the GitHub default: errexit, no pipefail) against a `pnpm` shim. The
 *    previous test asserted the fallback `|| echo "skipped"` was present; that
 *    fallback could never fire, because `tail -1` exits 0 on empty input, so a
 *    green test pinned a dead construct (#4927 finding 1).
 *
 * @module scripts/check-pricing-drift.test
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { pricingDriftVerdict, formatVerdict, type DriftReport } from './check-pricing-drift.js';

const ROOT = join(import.meta.dirname, '..');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/pricing-drift.yml'), 'utf8');

function report(field: DriftReport['field']): DriftReport {
  return { modelId: 'm', litellmKey: 'm', field, ours: 1, theirs: 2, delta: '1 → 2' };
}

describe('pricingDriftVerdict (#4927)', () => {
  it('reports a fetch failure as skipped — unmeasured, never clean', () => {
    const v = pricingDriftVerdict({ kind: 'unmeasured', reason: 'HTTP 503' });
    expect(v.status).toBe('skipped');
    expect(v.count).toBe(0);
  });

  it('reports a measured empty report set as clean with a genuine zero', () => {
    const v = pricingDriftVerdict({ kind: 'measured', reports: [] });
    expect(v).toEqual({ status: 'clean', count: 0 });
  });

  it('reports N drifted fields as drift with count N', () => {
    const reports = [report('contextWindow'), report('inputPer1M'), report('outputPer1M')];
    const v = pricingDriftVerdict({ kind: 'measured', reports });
    expect(v).toEqual({ status: 'drift', count: 3 });
  });

  it('formats the two lines the workflow greps for', () => {
    expect(formatVerdict({ status: 'drift', count: 7 })).toBe(
      'PRICING_DRIFT_STATUS=drift\nPRICING_DRIFT_COUNT=7'
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
  const dir = mkdtempSync(join(tmpdir(), 'pricing-drift-step-'));
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

describe('the pricing-drift check step, executed (#4927)', () => {
  it('reads a drift verdict and its count', () => {
    const r = runCheckStep('banner\nPRICING_DRIFT_STATUS=drift\nPRICING_DRIFT_COUNT=7\n', 0);
    expect(r.status).toBe(0);
    expect(r.outputs).toContain('drift_status=drift\n');
    expect(r.outputs).toContain('drift_count=7\n');
  });

  it('reads a clean verdict as a measured zero', () => {
    const r = runCheckStep('PRICING_DRIFT_STATUS=clean\nPRICING_DRIFT_COUNT=0\n', 0);
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
    const r = runCheckStep('PRICING_DRIFT_STATUS=clean\nPRICING_DRIFT_COUNT=0\n', 1);
    expect(r.status).toBe(0);
    expect(r.outputs).toContain('drift_status=skipped\n');
  });
});

describe('the pricing-drift workflow consumes the verdict (#4927)', () => {
  it('fails the run on a skip, with an error annotation that says unmeasured', () => {
    const skip = steps.find((s) => s.if?.includes("drift_status == 'skipped'") === true);
    expect(skip).toBeDefined();
    expect(skip?.run).toContain('::error::');
    expect(skip?.run).toContain('UNMEASURED');
    expect(skip?.run).toMatch(/^\s*exit 1\s*$/m);
  });

  it('files an issue only when drift was actually measured', () => {
    // Without the status term, a `skipped` run with a defaulted count of 0
    // and a `drift` run with a real count are the same input to this gate.
    const create = steps.find((s) => s.name?.startsWith('Create issue') === true);
    expect(create?.if).toContain("drift_status == 'drift'");
  });

  it('still reports drift that falls below the issue threshold', () => {
    // 1-5 drifted fields filed no issue and said nothing at all.
    const belowThreshold = steps.find((s) => s.if?.includes('drift_count <= 5') === true);
    expect(belowThreshold?.run).toContain('::warning::');
  });
});
