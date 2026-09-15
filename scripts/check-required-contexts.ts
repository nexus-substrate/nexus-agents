/** Detect required branch-protection contexts without workflow producers (#6346). */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const EXPECTED_REQUIRED_CONTEXTS = [
  'CI Success',
  'Governor-path ratification gate',
] as const;

interface RequiredContextsInput {
  readonly requiredContexts: readonly string[] | 'unmeasured';
  readonly workflowJobNames: readonly string[];
}

interface RequiredContextsResult {
  verdict: 'ok' | 'drift' | 'unmeasured';
  missing: string[];
  unproduced: string[];
  expected: readonly string[];
}

/** Compare measured protection settings with expected contexts and workflow job names. */
export function checkRequiredContexts(input: RequiredContextsInput): RequiredContextsResult {
  const { requiredContexts, workflowJobNames } = input;
  const expected = EXPECTED_REQUIRED_CONTEXTS;
  if (requiredContexts === 'unmeasured') {
    return { verdict: 'unmeasured', missing: [], unproduced: [], expected };
  }
  const missing = expected.filter((context) => !requiredContexts.includes(context));
  const unproduced = requiredContexts.filter((context) => !workflowJobNames.includes(context));
  // An empty producer inventory is drift, including when protection is empty too.
  const drift = workflowJobNames.length === 0 || missing.length > 0 || unproduced.length > 0;
  return { verdict: drift ? 'drift' : 'ok', missing, unproduced, expected };
}

const WorkflowSchema = z.object({
  jobs: z.record(z.string(), z.object({ name: z.string().optional() })),
});
const RequiredStatusChecksSchema = z.object({ contexts: z.array(z.string()) });

/** Read every .yml workflow; an unnamed job produces its job ID as the context. */
export function loadWorkflowJobNames(directory = '.github/workflows'): string[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.yml'))
    .sort()
    .flatMap((file) => {
      const parsed: unknown = parseYaml(readFileSync(join(directory, file), 'utf-8'));
      const workflow = WorkflowSchema.parse(parsed);
      return Object.entries(workflow.jobs).map(([id, job]) => job.name ?? id);
    });
}

/** Failed access or invalid API data leaves branch protection unmeasured. */
export function loadRequiredContexts(): readonly string[] | 'unmeasured' {
  try {
    const response = execFileSync(
      'gh',
      ['api', 'repos/nexus-substrate/nexus-agents/branches/main/protection/required_status_checks'],
      { encoding: 'utf-8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const parsed: unknown = JSON.parse(response);
    return RequiredStatusChecksSchema.parse(parsed).contexts;
  } catch {
    return 'unmeasured';
  }
}

/** Print the measurement and return the CLI exit status: ok=0, drift=1, unmeasured=2. */
export function runRequiredContextsCheck(directory = '.github/workflows'): number {
  let workflowJobNames: string[];
  try {
    workflowJobNames = loadWorkflowJobNames(directory);
  } catch {
    console.log('Required contexts: unmeasured');
    console.log(
      'Workflow job names were not measured: workflow files could not be read or parsed.'
    );
    return 2;
  }
  const result = checkRequiredContexts({
    requiredContexts: loadRequiredContexts(),
    workflowJobNames,
  });
  console.log(`Required contexts: ${result.verdict}`);
  if (result.verdict === 'unmeasured') {
    console.log(
      'Branch protection required status checks were not measured: gh API access or response validation failed.'
    );
    return 2;
  }
  if (result.verdict === 'drift') {
    if (workflowJobNames.length === 0) console.log('No workflow job names were found.');
    console.log(`Missing expected required contexts: ${result.missing.join(', ') || '(none)'}`);
    console.log(
      `Required contexts without workflow jobs: ${result.unproduced.join(', ') || '(none)'}`
    );
    return 1;
  }
  return 0;
}

if (process.argv[1]?.endsWith('check-required-contexts.ts') === true) {
  process.exitCode = runRequiredContextsCheck();
}
