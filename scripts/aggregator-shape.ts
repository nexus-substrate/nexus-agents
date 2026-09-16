/**
 * The ONE accepted aggregator shape (#6382, #6387) — governor-owned policy
 * over `ci-success` / `docs-success`. Extracted from check-required-jobs.ts
 * (its line cap) in the #6387 panel-4 rework; same owner, same gate.
 */
import { z } from 'zod';

/**
 * The ONE accepted aggregator shape (#6387 panel 3): a positive lock, not a
 * denylist. Three panels each found the next knob a non-governor workflow
 * could turn (`continue-on-error`, `if:`, `shell:`, a sibling step shadowing
 * `jq`, an extra env key); a denylist over an open key space cannot converge.
 * Any other key, a second step, or a job `if:` other than `always()` is drift.
 * `runs-on` stays free-form: a self-hosted runner is infrastructure a text
 * checker cannot judge (#6387 panel 4, non-blocking note).
 */
const WORKFLOW_KEYS = new Set(['name', 'on', 'permissions', 'concurrency', 'jobs']);
const AGGREGATOR_JOB_KEYS = new Set(['name', 'needs', 'runs-on', 'timeout-minutes', 'if', 'steps']);
const AGGREGATOR_STEP_KEYS = new Set(['name', 'env', 'run']);
const AGGREGATOR_ENV_KEYS = new Set(['NEEDS_JSON', 'SKIP_ALLOWED']);

const WorkflowRootSchema = z.object({ jobs: z.record(z.string(), z.unknown()) }).loose();

/** What the lock reads off a NEEDED job: the knobs that turn its failure into `success` or a licensed skip. */
const NeedJobSchema = z
  .object({
    'continue-on-error': z.unknown().optional(),
    uses: z.unknown().optional(),
    if: z.union([z.string(), z.boolean()]).optional(),
    steps: z.array(z.object({ 'continue-on-error': z.unknown().optional() }).loose()).optional(),
  })
  .loose();

/** The one condition under which a `skip_allowed` need may skip: the job is pull_request-only. */
const SKIP_ALLOWED_IF = "github.event_name == 'pull_request'";

const StepSchema = z
  .object({
    run: z.string().optional(),
    env: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

const JobSchema = z
  .object({
    needs: z.union([z.string(), z.array(z.string())]).optional(),
    steps: z.array(StepSchema).optional(),
    if: z.union([z.string(), z.boolean()]).optional(),
  })
  .loose();

/**
 * The ONE aggregator script (#6382): POLICY, owned here so that a workflow —
 * which is not a governor path — cannot weaken it. A `ci-success` /
 * `docs-success` step must carry this text as its `run:` byte for byte
 * (trailing whitespace aside), with `NEEDS_JSON: ${{ toJSON(needs) }}` and a
 * `SKIP_ALLOWED` env: a JSON array of the needs that may be `skipped`, or
 * `"*"` when every need may (path-filtered gates). Executed against ok /
 * failing / empty / null / skipped-required / cancelled inputs before it was
 * pinned. The #6387 panel refused a substring test for "consumes the
 * variable": `echo NEEDS_JSON` would have passed it.
 */
export const AGGREGATOR_RUN = String.raw`failing=$(jq -r --argjson ok "$SKIP_ALLOWED" '
  if (. | length) == 0 then "NO_NEEDS"
  else to_entries
    | map(.key as $k | select(.value.result != "success"
                 and ((.value.result != "skipped") or ($ok != "*" and (($ok | index($k)) == null)))))
    | map("\(.key)=\(.value.result)") | join(" ")
  end' <<< "$NEEDS_JSON")
if [ -n "$failing" ]; then
  echo "::error::One or more required jobs failed: $failing"
  exit 1
fi
echo "All required jobs passed."
`;

/**
 * How an aggregator job verifies the jobs it waits for (#6382). The one
 * accepted shape: a step whose env carries `NEEDS_JSON: ${{ toJSON(needs) }}`
 * and whose `run` IS {@link AGGREGATOR_RUN}.
 */
export interface AggregatorShape {
  /** True when a step reads `toJSON(needs)` into NEEDS_JSON and runs the pinned script. */
  readonly verifiesEveryNeed: boolean;
  /** The parsed SKIP_ALLOWED: a job list, `'*'`, or `undefined` when absent or malformed. */
  readonly skipAllowed: readonly string[] | '*' | undefined;
  /**
   * Every departure from the one accepted shape (#6387): a job, step or env
   * key outside the allowlist, a step count other than one, or a job `if:`
   * missing or other than `always()`. Empty when the shape is exact.
   */
  readonly neutralized: readonly string[];
}

export interface JobGate {
  needs: string[];
  gate: AggregatorShape;
}

const NEEDS_JSON_EXPRESSION = /^\$\{\{\s*toJSON\(needs\)\s*\}\}$/;

/** Byte equality up to trailing whitespace per line and at the end. */
function sameScript(a: string, b: string): boolean {
  const norm = (t: string): string =>
    t
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n+$/, '');
  return norm(a) === norm(b);
}

/** The aggregator shape of a job; a job with no such step verifies nothing. */
function aggregatorShapeOf(job: z.infer<typeof JobSchema>): AggregatorShape {
  for (const step of job.steps ?? []) {
    const env = step.env ?? {};
    const needsJson = env['NEEDS_JSON'];
    if (typeof needsJson !== 'string' || !NEEDS_JSON_EXPRESSION.test(needsJson.trim())) continue;
    if (typeof step.run !== 'string' || !sameScript(step.run, AGGREGATOR_RUN)) continue;
    return {
      verifiesEveryNeed: true,
      skipAllowed: parseSkipAllowed(env['SKIP_ALLOWED']),
      neutralized: neutralizations(job, step),
    };
  }
  return { verifiesEveryNeed: false, skipAllowed: undefined, neutralized: [] };
}

/** Keys of `record` outside `allowed`, rendered as `<what> key "k"`. */
function unexpectedKeys(what: string, record: object, allowed: ReadonlySet<string>): string[] {
  return Object.keys(record)
    .filter((key) => !allowed.has(key))
    .map((key) => `${what} key "${key}"`);
}

/** Every departure from the one accepted job + step + env shape. */
function neutralizations(
  job: z.infer<typeof JobSchema>,
  step: z.infer<typeof StepSchema>
): string[] {
  const found = unexpectedKeys('job', job, AGGREGATOR_JOB_KEYS);
  const jobIf = unbraced(job.if);
  if (jobIf === undefined) found.push('job if missing (always() required)');
  else if (jobIf !== 'always()') found.push(`job if "${String(jobIf)}" (always() required)`);
  const stepCount = job.steps?.length ?? 0;
  if (stepCount !== 1) found.push(`${String(stepCount)} steps (exactly one accepted)`);
  found.push(...unexpectedKeys('step', step, AGGREGATOR_STEP_KEYS));
  found.push(...unexpectedKeys('env', step.env ?? {}, AGGREGATOR_ENV_KEYS));
  return found;
}

/** `SKIP_ALLOWED` must be a JSON array of job ids; anything else is "none declared". */
function parseSkipAllowed(raw: unknown): readonly string[] | '*' | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === '*') return '*';
    return Array.isArray(parsed) && parsed.every((x): x is string => typeof x === 'string')
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

/** The needs list and the aggregator shape of one job, judged without its workflow. */
export function extractJobGate(value: unknown): JobGate {
  const job = JobSchema.parse(value ?? {});
  const needs = typeof job.needs === 'string' ? [job.needs] : (job.needs ?? []);
  return { needs, gate: aggregatorShapeOf(job) };
}

/**
 * The job's gate judged WITH its workflow document (#6387 panel 4): GitHub
 * applies a workflow-level `defaults.run.shell` or `env` to every run step
 * unless a job or step overrides it — and the lock forbids the override — so
 * the document root is held to the same positive lock as the job.
 */
export function extractWorkflowGate(workflow: unknown, jobId: string): JobGate {
  const root = WorkflowRootSchema.parse(workflow);
  const { needs, gate } = extractJobGate(root.jobs[jobId]);
  const neutralized = [
    ...unexpectedKeys('workflow', root, WORKFLOW_KEYS),
    ...gate.neutralized,
    ...needs.flatMap((need) => swallowedNeed(need, root.jobs[need], gate.skipAllowed)),
  ];
  return { needs, gate: { ...gate, neutralized } };
}

/**
 * A needed job with `continue-on-error` — on the job or on any step — reports
 * `needs.<id>.result == 'success'` after it fails, so the aggregator sees a
 * pass it should not (how `security` was advisory before #4794). Any value
 * counts. A job-level `uses:` calls a reusable workflow whose own jobs can
 * carry the same knob out of this checker's sight, so a need may not be one.
 * A `skip_allowed` need may skip only because the event is not a PR: its
 * `if:` must be exactly {@link SKIP_ALLOWED_IF}, or a non-governor edit could
 * skip the gate forever (#6387 self-review, executed vectors V1/V2).
 */
function swallowedNeed(
  need: string,
  value: unknown,
  skipAllowed: AggregatorShape['skipAllowed']
): string[] {
  // Fail CLOSED (#6387 panel 7): a need the workflow does not define, or one
  // whose shape the schema cannot read (`if: 1` is truthy to GitHub), is
  // drift — never a clean default.
  if (value === undefined) return [`need "${need}" is not a job in this workflow`];
  const parsed = NeedJobSchema.safeParse(value);
  if (!parsed.success) return [`need "${need}" has an unreadable shape`];
  const job = parsed.data;
  const found: string[] = [];
  if (job['continue-on-error'] !== undefined) found.push(`need "${need}" job continue-on-error`);
  if ((job.steps ?? []).some((step) => step['continue-on-error'] !== undefined))
    found.push(`need "${need}" step continue-on-error`);
  if (job.uses !== undefined) found.push(`need "${need}" calls a reusable workflow (uses)`);
  if (
    Array.isArray(skipAllowed) &&
    skipAllowed.includes(need) &&
    unbraced(job.if) !== SKIP_ALLOWED_IF
  )
    found.push(`need "${need}" may skip only under if: ${SKIP_ALLOWED_IF}`);
  return found;
}

/** `${{ expr }}` and `expr` are the same condition to GitHub. */
function unbraced(condition: string | boolean | undefined): string | boolean | undefined {
  return typeof condition === 'string'
    ? condition.replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim()
    : condition;
}
