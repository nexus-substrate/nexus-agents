/** Governor-owned CI wiring and required-context contract (#6343). */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { type AggregatorShape, type JobGate, extractWorkflowGate } from './aggregator-shape.js';
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

/** One workflow job and the status context it reports under (#6390). */
export interface WorkflowJob {
  /** Workflow file name, e.g. `ci.yml`. */
  readonly workflow: string;
  /** Job ID — the key under `jobs:`, what the shape lock looks up. */
  readonly id: string;
  /** GitHub's status-context rule: the job's `name`, else its ID. */
  readonly context: string;
}

/** Read every workflow GitHub would (`.yml` AND `.yaml`); an unnamed job's context is its ID. */
export function loadWorkflowJobs(directory = '.github/workflows'): WorkflowJob[] {
  return readdirSync(directory)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort()
    .flatMap((file) => {
      const parsed: unknown = parseYaml(readFileSync(join(directory, file), 'utf-8'));
      const workflow = WorkflowSchema.parse(parsed);
      return Object.entries(workflow.jobs).map(([id, job]) => ({
        workflow: file,
        id,
        context: job.name ?? id,
      }));
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

/** The one job that may report a required context: `jobs[job]` in `workflow`. */
const ProducerSchema = z
  .object({ workflow: z.string().regex(/^[^/]+\.ya?ml$/), job: z.string().min(1) })
  .strict();
type Producer = z.infer<typeof ProducerSchema>;

const ManifestSchema = z.object({
  description: z.string().min(1),
  version: z.literal('2.0.0'),
  ci_success_needs: z.array(z.string().min(1)),
  /** Jobs the aggregator may accept as `skipped` (push-only skips); every other need must be `success`. */
  skip_allowed: z.array(z.string().min(1)),
  /**
   * Required status context → its pinned producer (#6390). Branch protection
   * requires a context by job NAME while the shape lock judges a job by ID;
   * the binding is what stops a trivial twin from reporting the name.
   */
  required_contexts: z.record(z.string().min(1), ProducerSchema),
  audit_config_forbidden: z.boolean(),
});

interface RequiredJobsInput {
  readonly manifest: unknown;
  readonly ciSuccessNeeds: readonly string[];
  /** The aggregator's verification shape (#6382), as extracted from its step. */
  readonly ciSuccessGate: AggregatorShape;
  readonly packageJson: unknown;
  readonly requiredContexts: readonly string[] | 'unmeasured';
  readonly workflowJobs: readonly WorkflowJob[] | 'unmeasured';
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
  const required = manifest.required_contexts;
  const problems = manifestProblems(manifest);
  for (const job of manifest.ci_success_needs) {
    if (!input.ciSuccessNeeds.includes(job)) problems.push(`Missing ci-success.needs: ${job}`);
  }
  problems.push(...aggregatorProblems(input.ciSuccessGate, manifest.skip_allowed));
  problems.push(...packageProblems(input.packageJson, manifest.audit_config_forbidden));
  problems.push(...contextProblems(input, Object.keys(required)));
  problems.push(...pinnedProducerProblems(input.workflowJobs, required));
  problems.push(...unpinnedProducerProblems(input.workflowJobs, required));
  const unmeasured = unmeasuredProblems(input);
  let verdict: RequiredJobsResult['verdict'] = problems.length > 0 ? 'drift' : 'ok';
  if (problems.length === 0 && unmeasured.length > 0) verdict = 'unmeasured';
  return { verdict, problems: [...problems, ...unmeasured] };
}

/** Explicitly reject absence: an empty policy would otherwise approve every tree. */
function manifestProblems(manifest: z.infer<typeof ManifestSchema>): string[] {
  const problems: string[] = [];
  if (manifest.ci_success_needs.length === 0) problems.push('Manifest ci_success_needs is empty');
  const required = manifest.required_contexts;
  if (Object.keys(required).length === 0) problems.push('Manifest required_contexts is empty');
  for (const context of EXPECTED_REQUIRED_CONTEXTS) {
    if (!Object.hasOwn(required, context))
      problems.push(`Manifest pins no producer for required context: ${context}`);
  }
  return problems;
}

function unmeasuredProblems(input: RequiredJobsInput): string[] {
  const problems: string[] = [];
  if (input.requiredContexts === 'unmeasured') problems.push(PROTECTION_UNMEASURED);
  if (input.workflowJobs === 'unmeasured') problems.push(INVENTORY_UNMEASURED);
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
  const { workflowJobs } = input;
  const workflowJobNames =
    workflowJobs === 'unmeasured' ? workflowJobs : workflowJobs.map((job) => job.context);
  const result = checkRequiredContexts({ ...input, workflowJobNames, expectedContexts: expected });
  const problems = result.missing.map((name) => `Missing required context: ${name}`);
  problems.push(
    ...result.unproduced.map((name) => `Required context without workflow job: ${name}`)
  );
  if (workflowJobNames.length === 0) problems.push('No workflow job names were found');
  return problems;
}

/** The pinned `{workflow, job}` must exist and report exactly the required context (#6390). */
function pinnedProducerProblems(
  jobs: readonly WorkflowJob[] | 'unmeasured',
  required: Readonly<Record<string, Producer>>
): string[] {
  if (jobs === 'unmeasured') return [];
  const problems: string[] = [];
  for (const [context, pin] of Object.entries(required)) {
    const producer = jobs.find((job) => job.workflow === pin.workflow && job.id === pin.job);
    const where = `${pin.workflow} job ${pin.job}`;
    if (producer === undefined) {
      problems.push(`Required context producer missing: ${context} (${where})`);
    } else if (producer.context !== context) {
      problems.push(
        `Required context producer renamed: ${context} is ${where}, whose name is "${producer.context}"`
      );
    }
  }
  return problems;
}

/** No job in ANY workflow other than the pinned one may report a required context (#6390). */
function unpinnedProducerProblems(
  jobs: readonly WorkflowJob[] | 'unmeasured',
  required: Readonly<Record<string, Producer>>
): string[] {
  if (jobs === 'unmeasured') return [];
  const problems: string[] = [];
  for (const job of jobs) {
    const pin = Object.hasOwn(required, job.context) ? required[job.context] : undefined;
    if (pin === undefined || (pin.workflow === job.workflow && pin.job === job.id)) continue;
    problems.push(
      `Required context produced by an unpinned job: ${job.context} (${job.workflow} job ${job.id})`
    );
  }
  return problems;
}

/** The manifest's `skip_allowed` must equal the step's SKIP_ALLOWED as a set; the step must exist. */
function aggregatorProblems(gate: AggregatorShape, skipAllowed: readonly string[]): string[] {
  if (!gate.verifiesEveryNeed) {
    return [
      'ci-success does not verify every need: no step reads NEEDS_JSON: ${{ toJSON(needs) }} and runs the pinned AGGREGATOR_RUN (#6382)',
    ];
  }
  if (gate.neutralized.length > 0) {
    return [
      `ci-success aggregator departs from the one accepted shape: ${gate.neutralized.join(', ')} (#6387)`,
    ];
  }
  // A wildcard skip list is never acceptable for CI Success: `security` and
  // its peers must have RUN.
  if (gate.skipAllowed === '*') return ['ci-success SKIP_ALLOWED is "*"; every need may skip'];
  // Absent or malformed is drift, never "none declared" (#6387 panel 9): a
  // manifest with an empty skip list would otherwise read a default as a match.
  if (gate.skipAllowed === undefined)
    return ['ci-success SKIP_ALLOWED is missing or not a JSON array of job ids'];
  const declared = new Set(gate.skipAllowed);
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

/** Parse the real workflow and judge the ci-success job with its document root. */
export function loadCiSuccessGate(path = '.github/workflows/ci.yml'): JobGate {
  return extractWorkflowGate(parseYaml(readFileSync(path, 'utf8')), 'ci-success');
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
  let workflowJobs: readonly WorkflowJob[] | 'unmeasured';
  try {
    workflowJobs = loadWorkflowJobs(join(targetDir, '.github/workflows'));
  } catch {
    workflowJobs = 'unmeasured';
  }
  const result = checkRequiredJobs({
    manifest,
    ciSuccessNeeds: gate.needs,
    ciSuccessGate: gate.gate,
    packageJson,
    requiredContexts: loadRequiredContexts(),
    workflowJobs,
  });

  return report(result);
}

if (process.argv[1]?.endsWith('check-required-jobs.ts') === true) {
  process.exitCode = runRequiredJobsCheck(dirname(dirname(fileURLToPath(import.meta.url))));
}
