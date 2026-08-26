import { describe, expect, it } from 'vitest';

import { assessWiring, isReachableFromCi } from './check-script-wiring.js';

describe('isReachableFromCi', () => {
  it('does not count a paths: trigger entry as wiring (#5028)', () => {
    // The gate whose job is catching unwired gates used a bare
    // `workflowText.includes(basename)`. Deleting the
    // `run: npx tsx scripts/check-governor-ratification.ts` step from
    // governor-review.yml leaves the filename in two `paths:` blocks, so the
    // script reported as reachable while nothing executed it.
    const pathsOnly = [
      'on:',
      '  pull_request:',
      '    paths:',
      "      - 'scripts/check-governor-ratification.ts'",
    ].join('\n');

    expect(isReachableFromCi('check-governor-ratification.ts', pathsOnly, {})).toBe(false);
  });

  it('still counts a real run: step as wiring', () => {
    // The pair: tightening must not report a genuinely wired script as unwired,
    // which is how a gate teaches people to ignore it.
    const withRun =
      'jobs:\n  x:\n    steps:\n      - run: npx tsx scripts/check-governor-ratification.ts';

    expect(isReachableFromCi('check-governor-ratification.ts', withRun, {})).toBe(true);
  });

  const noNpm = {};

  it('counts a direct filename reference in a workflow', () => {
    expect(isReachableFromCi('check-x.ts', 'run: npx tsx scripts/check-x.ts', noNpm)).toBe(true);
  });

  it('counts an npm-script hop', () => {
    // check-pricing-drift.ts appears in no workflow; `check:pricing-drift` does.
    expect(
      isReachableFromCi('check-x.ts', 'run: pnpm check:x', {
        'check:x': 'npx tsx scripts/check-x.ts',
      })
    ).toBe(true);
  });

  it('tolerates flags between the package manager and the script name', () => {
    // ci.yml uses `pnpm --silent check:model-drift`. A stricter pattern reported
    // that script as unwired — a false positive found by running the gate.
    expect(
      isReachableFromCi('check-x.ts', 'OUTPUT=$(pnpm --silent check:x 2>&1)', {
        'check:x': 'npx tsx scripts/check-x.ts',
      })
    ).toBe(true);
  });

  it('does NOT count an npm script that no workflow invokes', () => {
    // The exact state of check-authority-tier-drift before #4562: an npm
    // script existed, nothing ran it.
    expect(
      isReachableFromCi('check-x.ts', 'run: pnpm lint', { 'check:x': 'npx tsx scripts/check-x.ts' })
    ).toBe(false);
  });

  it('does not count a bare mention of the script name in prose', () => {
    expect(
      isReachableFromCi('check-x.ts', '# see check:x for details', {
        'check:x': 'npx tsx scripts/check-x.ts',
      })
    ).toBe(false);
  });

  it('reports a script with neither a workflow nor an npm script as unreachable', () => {
    expect(isReachableFromCi('check-x.ts', 'run: pnpm lint', noNpm)).toBe(false);
  });
});

describe('assessWiring', () => {
  it('partitions reachable from unreachable', () => {
    const verdict = assessWiring({
      checkScripts: ['check-a.ts', 'check-b.ts'],
      workflowText: 'npx tsx scripts/check-a.ts',
      npmScripts: {},
    });

    expect(verdict.wired).toEqual(['check-a.ts']);
    expect(verdict.unwired).toEqual(['check-b.ts']);
  });

  it('reports nothing unwired when everything is reachable', () => {
    const verdict = assessWiring({
      checkScripts: ['check-a.ts'],
      workflowText: 'npx tsx scripts/check-a.ts',
      npmScripts: {},
    });

    expect(verdict.unwired).toEqual([]);
  });
});
