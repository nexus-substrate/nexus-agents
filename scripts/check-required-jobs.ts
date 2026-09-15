/** Governor-owned CI wiring and required-context contract (#6343). */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  checkRequiredContexts,
  loadRequiredContexts,
  loadWorkflowJobNames,
} from './check-required-contexts.js';

const ManifestSchema = z.object({
  description: z.string().min(1),
  version: z.literal('1.0.0'),
  ci_success_needs: z.array(z.string().min(1)),
  required_contexts: z.array(z.string().min(1)),
  audit_config_forbidden: z.boolean(),
});

interface RequiredJobsInput {
  readonly manifest: unknown;
  readonly ciSuccessNeeds: readonly string[];
  readonly ciSuccessResultChecks: readonly string[];
  readonly packageJson: unknown;
  readonly requiredContexts: readonly string[] | 'unmeasured';
  readonly workflowJobNames: readonly string[];
}

interface RequiredJobsResult {
  verdict: 'ok' | 'drift' | 'unmeasured';
  problems: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Compare measured local wiring; unavailable protection never masks local drift. */
export function checkRequiredJobs(input: RequiredJobsInput): RequiredJobsResult {
  const parsed = ManifestSchema.safeParse(input.manifest);
  if (!parsed.success) return { verdict: 'drift', problems: ['Invalid required-jobs manifest'] };
  const manifest = parsed.data;
  const problems: string[] = [];
  // Explicitly reject absence: an empty policy would otherwise approve every tree.
  if (manifest.ci_success_needs.length === 0) problems.push('Manifest ci_success_needs is empty');
  if (manifest.required_contexts.length === 0) problems.push('Manifest required_contexts is empty');
  for (const job of manifest.ci_success_needs) {
    if (!input.ciSuccessNeeds.includes(job)) problems.push(`Missing ci-success.needs: ${job}`);
    if (!input.ciSuccessResultChecks.includes(job)) {
      problems.push(`Missing ci-success result check: ${job}`);
    }
  }
  problems.push(...packageProblems(input.packageJson, manifest.audit_config_forbidden));
  problems.push(...contextProblems(input, manifest.required_contexts));
  // Local policy/wiring were measured even when the remote sub-check was not.
  const verdict = problems.length > 0 ? 'drift' : 'ok';
  if (input.requiredContexts === 'unmeasured') {
    problems.push('Required contexts: unmeasured (branch protection unreadable)');
  }
  return { verdict, problems };
}

function packageProblems(packageJson: unknown, auditConfigForbidden: boolean): string[] {
  if (!isObject(packageJson)) return ['Invalid package.json: expected an object'];
  const pnpm = packageJson['pnpm'];
  if (auditConfigForbidden && isObject(pnpm) && Object.hasOwn(pnpm, 'auditConfig')) {
    return ['Forbidden package.json pnpm.auditConfig is present'];
  }
  return [];
}

function contextProblems(input: RequiredJobsInput, expected: readonly string[]): string[] {
  const result = checkRequiredContexts(input);
  if (input.requiredContexts === 'unmeasured') return [];
  const required = input.requiredContexts;
  // Preserve #6346's contract and enforce additional manifest contexts too.
  const missing = new Set([
    ...result.missing,
    ...expected.filter((name) => !required.includes(name)),
  ]);
  const problems = [...missing].map((name) => `Missing required context: ${name}`);
  problems.push(
    ...result.unproduced.map((name) => `Required context without workflow job: ${name}`)
  );
  if (input.workflowJobNames.length === 0) problems.push('No workflow job names were found');
  return problems;
}

const JobSchema = z.object({
  needs: z.union([z.string(), z.array(z.string())]).optional(),
  steps: z
    .array(
      z.object({
        if: z.union([z.string(), z.boolean()]).optional(),
        run: z.string().optional(),
      })
    )
    .optional(),
});

interface JobGate {
  needs: string[];
  gateScript: string;
  resultChecks: string[];
}

/** Shared with ci-required-jobs.test.ts: collect step if/run text exactly once. */
export function extractJobGate(value: unknown): JobGate {
  const job = JobSchema.parse(value ?? {});
  const needs = typeof job.needs === 'string' ? [job.needs] : (job.needs ?? []);
  const gateScript = (job.steps ?? [])
    .map((step) => [typeof step.if === 'string' ? step.if : '', step.run ?? ''].join('\n'))
    .join('\n');
  const resultChecks = [...gateScript.matchAll(/\bneeds\.([\w-]+)\.result\b/g)]
    .map((match) => match[1])
    .filter((id): id is string => id !== undefined);
  return { needs, gateScript, resultChecks: [...new Set(resultChecks)] };
}

/** Parse the real workflow before extracting the ci-success job's wiring. */
export function loadCiSuccessGate(path = '.github/workflows/ci.yml'): JobGate {
  const workflow = z
    .object({ jobs: z.record(z.string(), z.unknown()) })
    .parse(parseYaml(readFileSync(path, 'utf8')));
  return extractJobGate(workflow.jobs['ci-success']);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** Print one annotation per problem and map the measured verdict to its exit code. */
function report(result: RequiredJobsResult): number {
  console.log(`Required jobs: ${result.verdict}`);
  for (const problem of result.problems) console.log(`::error::${problem}`);
  if (result.verdict === 'drift') return 1;
  return result.verdict === 'unmeasured' ? 2 : 0;
}

function reportManifestFailure(directory: string, error: unknown): number {
  if (error instanceof SyntaxError) {
    return report({ verdict: 'drift', problems: ['Invalid required-jobs manifest JSON'] });
  }
  try {
    readdirSync(directory);
  } catch {
    return report({
      verdict: 'unmeasured',
      problems: ['Repository tree unreadable; no checks measured'],
    });
  }
  return report({
    verdict: 'drift',
    problems: ['Required-jobs manifest missing or unreadable in repository tree'],
  });
}

/** Run local checks even when the workflow inventory or protection API is unavailable. */
export function runRequiredJobsCheck(directory = '.'): number {
  let manifest: unknown;
  try {
    manifest = readJson(join(directory, 'governance/required-jobs.json'));
  } catch (error: unknown) {
    return reportManifestFailure(directory, error);
  }
  let gate: JobGate;
  let packageJson: unknown;
  try {
    gate = loadCiSuccessGate(join(directory, '.github/workflows/ci.yml'));
    packageJson = readJson(join(directory, 'package.json'));
  } catch {
    return report({
      verdict: 'drift',
      problems: ['Required local CI wiring or package.json is missing or invalid'],
    });
  }
  let workflowJobNames: string[] = [];
  let requiredContexts: readonly string[] | 'unmeasured' = 'unmeasured';
  let inventoryUnreadable = false;
  try {
    workflowJobNames = loadWorkflowJobNames(join(directory, '.github/workflows'));
    requiredContexts = loadRequiredContexts();
  } catch {
    inventoryUnreadable = true;
  }
  const result = checkRequiredJobs({
    manifest,
    ciSuccessNeeds: gate.needs,
    ciSuccessResultChecks: gate.resultChecks,
    packageJson,
    requiredContexts,
    workflowJobNames,
  });
  if (inventoryUnreadable) {
    result.problems = result.problems.filter(
      (problem) => !problem.includes('branch protection unreadable')
    );
    result.problems.push('Required contexts: unmeasured (workflow inventory unreadable)');
  }
  return report(result);
}

if (process.argv[1]?.endsWith('check-required-jobs.ts') === true) {
  process.exitCode = runRequiredJobsCheck();
}
