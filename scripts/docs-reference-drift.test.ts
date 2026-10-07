/** Independent documentation drift results must survive an earlier failed step. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { expect, it } from 'vitest';
import { ROOT } from './script-paths.js';

it('runs all three reference drift steps unless the workflow is cancelled', () => {
  const workflow = parse(readFileSync(join(ROOT, '.github/workflows/docs-check.yml'), 'utf8')) as {
    jobs: Record<string, { steps: { run?: string; if?: string }[] }>;
  };
  const steps = workflow.jobs['tool-reference-drift']?.steps;
  expect(steps).toBeDefined();
  for (const generator of ['tool', 'env', 'cli']) {
    const step = steps?.find(
      (item) => item.run?.includes(`generate-${generator}-reference.ts --check`) === true
    );
    expect(step, `${generator} drift step must exist`).toBeDefined();
    expect(step?.if, `${generator} drift must run after earlier failures`).toBe(
      '${{ !cancelled() }}'
    );
  }
});
