/** Release staging and promotion wiring (#6514). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { ROOT } from './script-paths.js';

const Step = z.object({
  name: z.string().optional(),
  run: z.string().optional(),
  if: z.string().optional(),
  with: z.record(z.string(), z.unknown()).optional(),
});
const Workflow = z.object({
  jobs: z.record(z.string(), z.object({ 'timeout-minutes': z.number(), steps: z.array(Step) })),
});
const workflow = Workflow.parse(
  parse(readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8'))
);

describe('safe latest promotion (#6514)', () => {
  for (const jobName of ['release', 'manual-publish']) {
    it(`${jobName}: pins OIDC-capable npm and allows staging plus build time`, () => {
      const job = workflow.jobs[jobName];
      expect(job).toBeDefined();
      expect(job?.['timeout-minutes']).toBe(150);
      expect(
        job?.steps.some(
          (step) =>
            step.run === 'pnpm exec tsx scripts/publish-env.ts npm install --global npm@11.21.0'
        )
      ).toBe(true);
    });

    it(`${jobName}: awaits both committed tarballs before promotion, with matching success guards`, () => {
      const steps = workflow.jobs[jobName]?.steps ?? [];
      const awaitIndex = steps.findIndex(
        (step) => step.name === 'Await published tarballs (#6514)'
      );
      const promoteIndex = steps.findIndex(
        (step) => step.name === 'Promote published packages to latest (#6514)'
      );
      expect(awaitIndex).toBeGreaterThanOrEqual(0);
      expect(promoteIndex).toBe(awaitIndex + 1);
      const awaitStep = Step.parse(steps[awaitIndex]);
      const promoteStep = Step.parse(steps[promoteIndex]);
      expect(awaitStep.run).toContain('--package nexus-agents --version "$agents_version"');
      expect(awaitStep.run).toContain('--package nexus-memory --version "$memory_version"');
      expect(awaitStep.run).toContain('git show "$GITHUB_SHA:packages/nexus-memory/package.json"');
      expect(awaitStep.run).toContain('wait "$agents_wait"');
      expect(awaitStep.run).toContain('wait "$memory_wait"');
      expect(promoteStep.run).toContain('scripts/promote-published-package.ts "$pkg" "$version"');
      expect(promoteStep.if).toBe(awaitStep.if);
      expect(promoteStep.if).not.toContain('always()');
      if (jobName === 'release')
        expect(promoteStep.if).toContain('steps.fallback-publish.outputs.already_published');
      else expect(promoteStep.if).toContain('inputs.dry_run != true');
    });
  }

  it('manual publish and dry run pass next to pnpm publish', () => {
    const publish =
      workflow.jobs['manual-publish']?.steps.filter(
        (step) => step.name?.startsWith('Publish packages') === true
      ) ?? [];
    expect(publish).toHaveLength(2);
    for (const step of publish) expect(step.run).toContain('publish --tag next --access public');
  });

  it('skew measures versions independently of latest and supports recovery', () => {
    const release = workflow.jobs['release'];
    const ahead = release?.steps.find((step) => step.name === 'Detect npm-ahead version skew');
    const fallback = release?.steps.find(
      (step) => step.name?.startsWith('Detect publish-race') === true
    );
    expect(ahead?.run).toContain('npm view nexus-agents versions --json');
    expect(fallback?.run).toContain('npm view nexus-agents versions --json');
    expect(fallback?.run).toContain('npm view nexus-memory versions --json');
    expect(fallback?.run).toContain('already_published=true');
    expect(fallback?.run).not.toContain('npm view nexus-agents version ');
  });
});
