/** Governor-owned CI wiring and required-context contract (#6343). */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
export const EXPECTED_REQUIRED_CONTEXTS = [
  'CI Success',
  'Governor-path ratification gate',
] as const;

interface RequiredContextsInput {
  readonly expectedContexts?: readonly string[];
  readonly requiredContexts: readonly string[] | 'unmeasured';
  readonly workflowJobNames: readonly string[] | 'unmeasured';
}

interface RequiredContextsResult {
  verdict: 'ok' | 'drift' | 'unmeasured';
  missing: string[];
  unproduced: string[];
  expected: readonly string[];
}

/** Measure protection and producers independently; measured drift wins over unavailable input. */
export function checkRequiredContexts(input: RequiredContextsInput): RequiredContextsResult {
  const { requiredContexts, workflowJobNames } = input;
  const expected = [...new Set([...EXPECTED_REQUIRED_CONTEXTS, ...(input.expectedContexts ?? [])])];
  const missing =
    requiredContexts === 'unmeasured'
      ? []
      : expected.filter((context) => !requiredContexts.includes(context));
  const contexts = new Set([
    ...expected,
    ...(requiredContexts === 'unmeasured' ? [] : requiredContexts),
  ]);
  const unproduced =
    workflowJobNames === 'unmeasured'
      ? []
      : [...contexts].filter((context) => !workflowJobNames.includes(context));
  // The two built-in expected contexts make an empty measured inventory unproduced.
  const drift = missing.length > 0 || unproduced.length > 0;
  let verdict: RequiredContextsResult['verdict'] = drift ? 'drift' : 'ok';
  if (!drift && (requiredContexts === 'unmeasured' || workflowJobNames === 'unmeasured')) {
    verdict = 'unmeasured';
  }
  return { verdict, missing, unproduced, expected };
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

const ManifestSchema = z.object({
  description: z.string().min(1),
  version: z.literal('1.0.0'),
  ci_success_needs: z.array(z.string().min(1)),
  /** Jobs the aggregator may accept as `skipped` (push-only skips); every other need must be `success`. */
  skip_allowed: z.array(z.string().min(1)),
  required_contexts: z.array(z.string().min(1)),
  audit_config_forbidden: z.boolean(),
});

interface RequiredJobsInput {
  readonly manifest: unknown;
  readonly ciSuccessNeeds: readonly string[];
  /** The aggregator's verification shape (#6382), as extracted from its step. */
  readonly ciSuccessGate: AggregatorShape;
  readonly packageJson: unknown;
  readonly requiredContexts: readonly string[] | 'unmeasured';
  readonly workflowJobNames: readonly string[] | 'unmeasured';
}

const PROTECTION_UNMEASURED = 'Required contexts: unmeasured (branch protection unreadable)';
const INVENTORY_UNMEASURED = 'Required contexts: unmeasured (workflow inventory unreadable)';

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
  }
  problems.push(...aggregatorProblems(input.ciSuccessGate, manifest.skip_allowed));
  problems.push(...packageProblems(input.packageJson, manifest.audit_config_forbidden));
  problems.push(...contextProblems(input, manifest.required_contexts));
  const unmeasured = unmeasuredProblems(input);
  let verdict: RequiredJobsResult['verdict'] = problems.length > 0 ? 'drift' : 'ok';
  if (problems.length === 0 && unmeasured.length > 0) verdict = 'unmeasured';
  return { verdict, problems: [...problems, ...unmeasured] };
}

function unmeasuredProblems(input: RequiredJobsInput): string[] {
  const problems: string[] = [];
  if (input.requiredContexts === 'unmeasured') problems.push(PROTECTION_UNMEASURED);
  if (input.workflowJobNames === 'unmeasured') problems.push(INVENTORY_UNMEASURED);
  return problems;
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
  const result = checkRequiredContexts({ ...input, expectedContexts: expected });
  const problems = result.missing.map((name) => `Missing required context: ${name}`);
  problems.push(
    ...result.unproduced.map((name) => `Required context without workflow job: ${name}`)
  );
  if (input.workflowJobNames.length === 0) problems.push('No workflow job names were found');
  return problems;
}

const StepSchema = z.object({
  if: z.union([z.string(), z.boolean()]).optional(),
  run: z.string().optional(),
  env: z.record(z.string(), z.unknown()).optional(),
});

const JobSchema = z.object({
  needs: z.union([z.string(), z.array(z.string())]).optional(),
  steps: z.array(StepSchema).optional(),
});

/**
 * How an aggregator job verifies the jobs it waits for (#6382). The one
 * accepted shape: a step whose env carries `NEEDS_JSON: ${{ toJSON(needs) }}`
 * and whose `run` consumes it — every listed need is then verified because
 * it is listed, and there is no per-job line a PR could comment out. The
 * step's `SKIP_ALLOWED` env is the JSON list of needs that may be `skipped`
 * (push-only jobs); absent means none may.
 */
export interface AggregatorShape {
  /** True when a step reads `toJSON(needs)` into NEEDS_JSON and consumes it in `run`. */
  readonly verifiesEveryNeed: boolean;
  /** The parsed SKIP_ALLOWED list; `undefined` when the step declares none or it does not parse. */
  readonly skipAllowed: readonly string[] | undefined;
}

interface JobGate {
  needs: string[];
  gate: AggregatorShape;
}

const NEEDS_JSON_EXPRESSION = /^\$\{\{\s*toJSON\(needs\)\s*\}\}$/;

/** The aggregator shape of one job's steps; a job with no such step verifies nothing. */
function aggregatorShapeOf(steps: readonly z.infer<typeof StepSchema>[]): AggregatorShape {
  for (const step of steps) {
    const env = step.env ?? {};
    const needsJson = env['NEEDS_JSON'];
    if (typeof needsJson !== 'string' || !NEEDS_JSON_EXPRESSION.test(needsJson.trim())) continue;
    if (typeof step.run !== 'string' || !step.run.includes('NEEDS_JSON')) continue;
    const raw = env['SKIP_ALLOWED'];
    return { verifiesEveryNeed: true, skipAllowed: parseSkipAllowed(raw) };
  }
  return { verifiesEveryNeed: false, skipAllowed: undefined };
}

/** `SKIP_ALLOWED` must be a JSON array of job ids; anything else is "none declared". */
function parseSkipAllowed(raw: unknown): readonly string[] | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x): x is string => typeof x === 'string')
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

/** The manifest's `skip_allowed` must equal the step's SKIP_ALLOWED as a set; the step must exist. */
function aggregatorProblems(gate: AggregatorShape, skipAllowed: readonly string[]): string[] {
  if (!gate.verifiesEveryNeed) {
    return [
      'ci-success does not verify every need: no step reads NEEDS_JSON: ${{ toJSON(needs) }} (#6382)',
    ];
  }
  const declared = new Set(gate.skipAllowed ?? []);
  const pinned = new Set(skipAllowed);
  const extra = [...declared].filter((j) => !pinned.has(j));
  const missing = [...pinned].filter((j) => !declared.has(j));
  const problems: string[] = [];
  if (extra.length > 0)
    problems.push(`ci-success SKIP_ALLOWED names jobs the manifest does not: ${extra.join(', ')}`);
  if (missing.length > 0)
    problems.push(
      `ci-success SKIP_ALLOWED lacks manifest skip_allowed jobs: ${missing.join(', ')}`
    );
  return problems;
}

/** Shared with ci-required-jobs.test.ts: the needs list and the aggregator shape. */
export function extractJobGate(value: unknown): JobGate {
  const job = JobSchema.parse(value ?? {});
  const needs = typeof job.needs === 'string' ? [job.needs] : (job.needs ?? []);
  return { needs, gate: aggregatorShapeOf(job.steps ?? []) };
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
  for (const problem of result.problems) {
    const unmeasured =
      result.verdict === 'unmeasured' ||
      problem === PROTECTION_UNMEASURED ||
      problem === INVENTORY_UNMEASURED;
    console.log(`::${unmeasured ? 'warning' : 'error'}::${problem}`);
  }
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
const POLICY_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/** `policyDir` defaults to this gate's checkout; tests inject a fixture policy root. */
export function runRequiredJobsCheck(targetDir: string, policyDir: string = POLICY_DIR): number {
  let manifest: unknown;
  try {
    // POLICY from the gate checkout (this script's root), never from the tree
    // under review — a PR editing the manifest is judged by the base manifest.
    manifest = readJson(join(policyDir, 'governance/required-jobs.json'));
  } catch (error: unknown) {
    return reportManifestFailure(policyDir, error);
  }
  let gate: JobGate;
  let packageJson: unknown;
  try {
    gate = loadCiSuccessGate(join(targetDir, '.github/workflows/ci.yml'));
    packageJson = readJson(join(targetDir, 'package.json'));
  } catch {
    // A target tree that cannot be read at all is unmeasured; a readable tree
    // whose wiring is missing or malformed is drift.
    try {
      readdirSync(targetDir);
    } catch {
      return report({
        verdict: 'unmeasured',
        problems: ['Repository tree unreadable; no checks measured'],
      });
    }
    return report({
      verdict: 'drift',
      problems: ['Required local CI wiring or package.json is missing or invalid'],
    });
  }
  let workflowJobNames: readonly string[] | 'unmeasured';
  try {
    workflowJobNames = loadWorkflowJobNames(join(targetDir, '.github/workflows'));
  } catch {
    workflowJobNames = 'unmeasured';
  }
  const result = checkRequiredJobs({
    manifest,
    ciSuccessNeeds: gate.needs,
    ciSuccessGate: gate.gate,
    packageJson,
    requiredContexts: loadRequiredContexts(),
    workflowJobNames,
  });

  return report(result);
}

if (process.argv[1]?.endsWith('check-required-jobs.ts') === true) {
  process.exitCode = runRequiredJobsCheck(dirname(dirname(fileURLToPath(import.meta.url))));
}
