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
  required_contexts: z.array(z.string().min(1)),
  audit_config_forbidden: z.boolean(),
});

interface RequiredJobsInput {
  readonly manifest: unknown;
  readonly ciSuccessNeeds: readonly string[];
  readonly ciSuccessResultChecks: readonly string[];
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
    if (!input.ciSuccessResultChecks.includes(job)) {
      problems.push(`Missing ci-success result check: ${job} (missing or commented out)`);
    }
  }
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

/** Skip an Actions expression without treating its string literals as shell quotes. */
function expressionEnd(text: string, start: number): number {
  let quote = '';
  for (let index = start + 3; index < text.length; index++) {
    const char = text[index];
    if (quote !== '') {
      if (char === quote) quote = '';
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (text.startsWith('}}', index)) {
      return index + 2;
    }
  }
  // An incomplete expression is preserved; guessing its shell syntax is unsafe.
  return text.length;
}

/** A `#` opens a shell comment only outside quotes and only at a word start. */
/**
 * Bash opens a comment when `#` BEGINS A WORD: at the start of the text,
 * after whitespace, or after an unquoted metacharacter (`; & | ( ) < >` and
 * a backquote). `echo ok;# hidden` runs only `echo ok` (#6378 panel: the
 * whitespace-only rule let `;# needs.security.result` read as a live check).
 */
const WORD_START_BEFORE_HASH = /[\s;&|()<>`]/;

function startsComment(text: string, index: number, quote: string): boolean {
  return (
    quote === '' && text[index] === '#' && WORD_START_BEFORE_HASH.test(text[index - 1] ?? '\n')
  );
}

/** Index just past the token that begins at `index`: an expression, an escape, or one char. */
function tokenEnd(text: string, index: number, quote: string): number {
  if (text.startsWith('${{', index)) return expressionEnd(text, index);
  if (text[index] === '\\' && quote !== "'") return index + 2;
  return index + 1;
}

/** The quote state after consuming one plain character. */
function nextQuote(char: string, quote: string): string {
  if (quote !== '') return char === quote ? '' : quote;
  return char === "'" || char === '"' ? char : '';
}

/** Strip unquoted shell comments, preserving quoted hashes and Actions expressions. */
export function stripShellComments(text: string): string {
  let quote = '';
  let live = '';
  let index = 0;
  while (index < text.length) {
    if (startsComment(text, index, quote)) {
      const newline = text.indexOf('\n', index);
      index = newline === -1 ? text.length : newline;
      continue;
    }
    const end = tokenEnd(text, index, quote);
    const token = text.slice(index, end);
    if (end === index + 1) quote = nextQuote(token, quote);
    live += token;
    index = end;
  }
  // Empty or comments-only text yields no result references, never evidence of health.
  return live;
}

/** Shared with ci-required-jobs.test.ts: collect live run text and unchanged step ifs. */
export function extractJobGate(value: unknown): JobGate {
  const job = JobSchema.parse(value ?? {});
  const needs = typeof job.needs === 'string' ? [job.needs] : (job.needs ?? []);
  const gateScript = (job.steps ?? [])
    .map((step) =>
      [typeof step.if === 'string' ? step.if : '', stripShellComments(step.run ?? '')].join('\n')
    )
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
export function runRequiredJobsCheck(targetDir: string): number {
  let manifest: unknown;
  try {
    manifest = readJson(join(targetDir, 'governance/required-jobs.json'));
  } catch (error: unknown) {
    return reportManifestFailure(targetDir, error);
  }
  let gate: JobGate;
  let packageJson: unknown;
  try {
    gate = loadCiSuccessGate(join(targetDir, '.github/workflows/ci.yml'));
    packageJson = readJson(join(targetDir, 'package.json'));
  } catch {
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
    ciSuccessResultChecks: gate.resultChecks,
    packageJson,
    requiredContexts: loadRequiredContexts(),
    workflowJobNames,
  });

  return report(result);
}

if (process.argv[1]?.endsWith('check-required-jobs.ts') === true) {
  process.exitCode = runRequiredJobsCheck(dirname(dirname(fileURLToPath(import.meta.url))));
}
