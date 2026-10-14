/** The Pages job must allow its action to finish polling and cancel cleanly (#7414). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { ROOT } from './script-paths.js';

const Step = z.object({
  uses: z.string().optional(),
  with: z.record(z.string(), z.unknown()).optional(),
});
const Workflow = z.object({
  jobs: z.object({
    deploy: z.object({
      'timeout-minutes': z.number().positive(),
      steps: z.array(Step),
    }),
  }),
});
const workflow = Workflow.parse(
  parse(readFileSync(join(ROOT, '.github/workflows/deploy-website.yml'), 'utf8'))
);
const deploy = workflow.jobs.deploy;
const deploySteps = deploy.steps.filter(
  (step) => step.uses?.startsWith('actions/deploy-pages@') === true
);
const TimeoutMs = z
  .union([z.number(), z.string()])
  .transform((value) => Number(value))
  .pipe(z.number().positive());

// Default and runtime maximum in the pinned deploy-pages v5.0.1 action. The
// explicit input test prevents an upstream default from silently changing it.
const DEPLOY_PAGES_MAX_TIMEOUT_MS = 600_000;
const MIN_SETUP_AND_CANCELLATION_HEADROOM_MS = 60_000;

describe('website deployment deadline (#7414)', () => {
  it('lets the action use its wait budget with setup and cancellation headroom', () => {
    expect(deploySteps).toHaveLength(1);
    const requestedTimeoutMs = TimeoutMs.parse(
      deploySteps[0]?.with?.['timeout'] ?? DEPLOY_PAGES_MAX_TIMEOUT_MS
    );
    const actionTimeoutMs = Math.min(requestedTimeoutMs, DEPLOY_PAGES_MAX_TIMEOUT_MS);

    expect(deploy['timeout-minutes'] * 60_000).toBeGreaterThanOrEqual(
      actionTimeoutMs + MIN_SETUP_AND_CANCELLATION_HEADROOM_MS
    );
  });

  it('sets an explicit action wait budget instead of inheriting an upstream default', () => {
    expect(deploySteps).toHaveLength(1);
    const configuredTimeout = deploySteps[0]?.with?.['timeout'];
    expect(configuredTimeout).toBeDefined();
    expect(TimeoutMs.safeParse(configuredTimeout).success).toBe(true);
  });
});
