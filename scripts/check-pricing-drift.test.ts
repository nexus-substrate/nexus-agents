/**
 * Tests for the pricing-drift script's machine-readable verdict.
 *
 * @module scripts/check-pricing-drift.test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const ROOT = join(import.meta.dirname, '..');
const SCRIPT = readFileSync(join(ROOT, 'scripts/check-pricing-drift.ts'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/pricing-drift.yml'), 'utf8');

describe('check-pricing-drift emits a verdict on every path (#4927)', () => {
  // The script exits 0 unconditionally and says so, so the exit code carries
  // no signal at all. Every terminating path therefore has to print a status,
  // or the workflow's default fills it in — and the default used to be "0
  // fields drifted", which is a measurement.
  const terminatingPaths = [
    ['catalog fetch failure', 'catalog fetch failed'],
    ['no drift', 'No drift — our pricing matches litellm'],
    ['top-level error handler', 'pricing-drift check errored'],
  ] as const;

  it.each(terminatingPaths)('prints a status on the %s path', (_name, marker) => {
    const at = SCRIPT.indexOf(marker);
    expect(at, `marker not found: ${marker}`).toBeGreaterThan(-1);
    // The status line follows its marker within a few lines on each path.
    expect(SCRIPT.slice(at, at + 400)).toContain('PRICING_DRIFT_STATUS=');
  });

  it('reports a fetch failure as skipped, never as clean', () => {
    const at = SCRIPT.indexOf('catalog fetch failed');
    expect(SCRIPT.slice(at, at + 400)).toContain('PRICING_DRIFT_STATUS=skipped');
  });

  it('reports an unexpected error as skipped, never as clean', () => {
    const at = SCRIPT.indexOf('pricing-drift check errored');
    expect(SCRIPT.slice(at, at + 400)).toContain('PRICING_DRIFT_STATUS=skipped');
  });
});

describe('the pricing-drift workflow consumes the verdict (#4927)', () => {
  interface Step {
    readonly name?: string;
    readonly if?: string;
    readonly run?: string;
  }
  const parsed = parseYaml(WORKFLOW) as { jobs: Record<string, { steps: Step[] }> };
  const steps: Step[] = parsed.jobs.check?.steps ?? [];

  it('defaults the status to skipped when the script printed none', () => {
    // The whole point: an absent verdict must not read as a clean one.
    const check = steps.find((s) => s.name?.startsWith('Check pricing drift') === true);
    expect(check?.run).toContain(`|| echo "skipped"`);
  });

  it('warns loudly on a skip', () => {
    const skip = steps.find((s) => s.if?.includes("drift_status == 'skipped'") === true);
    expect(skip).toBeDefined();
    expect(skip?.run).toContain('::warning::');
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
