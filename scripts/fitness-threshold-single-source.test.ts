/**
 * The fitness bar lives in exactly one place (#5142, item 7).
 *
 * It used to exist as four numbers: `.rules/governance.md` and `CLAUDE.md`
 * said 90, `release.yml` passed 90, the action defaulted to 90 — and `ci.yml`
 * passed `threshold: '70'` with `warn-threshold: '90'`. So the PR gate could
 * not fail for the thing every document said it measured: a PR could land at
 * 71 and the *release* that followed would fail for it, in the hands of whoever
 * shipped next. Ratified 5/6: raise the PR gate to the documented bar, and get
 * there by DELETING the overrides so both workflows inherit the action's
 * default. One number, one file, nothing to compare.
 *
 * This test is the ratchet: an override reappearing in either workflow fails
 * it, and the action default is pinned to the documented value.
 *
 * @module scripts/fitness-threshold-single-source.test
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { ROOT } from './script-paths.js';

const ACTION = 'fitness-gate';
const DOCUMENTED_BAR = '90';

interface Step {
  readonly uses?: string;
  readonly with?: Record<string, unknown>;
}

function fitnessGateSteps(workflowFile: string): Step[] {
  const doc = parse(readFileSync(join(ROOT, '.github/workflows', workflowFile), 'utf-8')) as {
    jobs?: Record<string, { steps?: Step[] }>;
  };
  const steps: Step[] = [];
  for (const job of Object.values(doc.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (typeof step.uses === 'string' && step.uses.includes(ACTION)) steps.push(step);
    }
  }
  return steps;
}

describe('fitness threshold has one source (#5142 item 7)', () => {
  for (const workflow of ['ci.yml', 'release.yml']) {
    it(`${workflow} uses the fitness-gate action and passes no threshold override`, () => {
      const steps = fitnessGateSteps(workflow);

      // Name the empty case: a workflow that stopped using the action at all
      // would otherwise pass "no overrides" vacuously.
      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.with?.['threshold']).toBeUndefined();
        expect(step.with?.['warn-threshold']).toBeUndefined();
      }
    });
  }

  it('the action default is the documented bar', () => {
    const action = parse(
      readFileSync(join(ROOT, '.github/actions/fitness-gate/action.yml'), 'utf-8')
    ) as { inputs?: { threshold?: { default?: unknown } } };

    expect(String(action.inputs?.threshold?.default)).toBe(DOCUMENTED_BAR);
  });
});
