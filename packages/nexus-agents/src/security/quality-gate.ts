/**
 * Quality Gate — QA Validation Engine (#1684)
 *
 * Runs configurable quality checks against code changes and returns
 * structured pass/fail results with actionable feedback.
 *
 * @module security/quality-gate
 */

import { resolveCheckCommand, type ScriptedCheck } from './quality-gate-commands.js';
import type {
  PipelineStage,
  GateCheckResult,
  QualityGateResult,
  GateVerdict,
} from './quality-gate-types.js';

// ============================================================================
// Gate Check Functions
// ============================================================================

/** A single quality check function. */
export type GateCheckFn = () => Promise<GateCheckResult>;

/** Run a shell command and return pass/fail based on exit code. */
async function runCommandCheck(
  name: string,
  command: string,
  args: readonly string[],
  cwd: string
): Promise<GateCheckResult> {
  const start = Date.now();
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    // #4355: `cwd` was never set, so every check ran in the MCP server's own
    // working directory. Three checks partly hid it by passing projectDir as
    // an argument; `pnpm build` passed nothing and built whatever project sat
    // at that cwd — arbitrary under a global install.
    await exec(command, [...args], { timeout: 120_000, cwd });
    return {
      name,
      verdict: 'pass',
      details: `${name} completed successfully`,
      durationMs: Date.now() - start,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name,
      verdict: 'fail',
      details: msg.slice(0, 500),
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// Built-in Checks
// ============================================================================

/**
 * Build a check that runs the repository's OWN declared script (#4355).
 *
 * When the repository declares no such script the check reports `skip` with
 * the reason, rather than substituting a tool the project never chose. The
 * previous behaviour hard-coded `npx eslint` / `npx tsc` / `npx vitest` /
 * `pnpm build`, which failed an Oxlint+npm repo whose own lint was green and
 * downloaded an unpinned ESLint to do it.
 *
 * `skip` is deliberate rather than `fail`: nothing was measured, and a gate
 * asserting a project is broken on evidence it never gathered is the same
 * defect in the other direction. {@link runQualityGate} makes sure a skip
 * cannot be read as a pass.
 */
function scriptedCheck(name: string, check: ScriptedCheck, projectDir: string): GateCheckFn {
  return async () => {
    const resolved = resolveCheckCommand(projectDir, check);
    if (resolved.kind === 'unconfigured') {
      return {
        name,
        verdict: 'skip',
        details: `Not run: ${resolved.reason}. Declare the script to enable this check.`,
        durationMs: 0,
      };
    }
    return runCommandCheck(name, resolved.command, resolved.args, projectDir);
  };
}

/** Check: the repository's declared typecheck script passes. */
export function checkTypeCheck(projectDir: string): GateCheckFn {
  return scriptedCheck('type_check', 'typecheck', projectDir);
}

/** Check: the repository's declared lint script passes. */
export function checkLint(projectDir: string): GateCheckFn {
  return scriptedCheck('lint', 'lint', projectDir);
}

/** Check: the repository's declared test script passes. */
export function checkTests(projectDir: string): GateCheckFn {
  return scriptedCheck('tests', 'tests', projectDir);
}

/**
 * Check: the repository's declared build script succeeds.
 *
 * Takes `projectDir` (#4355). It previously took no argument and ran
 * `pnpm build` wherever the server happened to be, so its verdict described
 * an unrelated project.
 */
export function checkBuild(projectDir: string): GateCheckFn {
  return scriptedCheck('build', 'build', projectDir);
}

// ============================================================================
// Gate Runner
// ============================================================================

/**
 * Aggregate individual check results into a gate verdict.
 *
 * A gate that ran nothing does NOT pass (#4355). The old rule was
 * `fail > 0 ? 'fail' : 'pass'`, so a run in which every check was skipped
 * reported `pass` — a verdict that could not fail by construction, and the
 * most dangerous possible reading of "we did not look". Now an all-skipped
 * run reports `skip`: the gate is telling the caller it has no opinion, which
 * is the truth.
 *
 * A partial run still passes on the checks that did run; the `summary.skip`
 * count and each skipped check's details say what was not covered.
 */
function aggregateResults(checks: readonly GateCheckResult[]): {
  verdict: GateVerdict;
  summary: { pass: number; fail: number; skip: number };
} {
  let pass = 0;
  let fail = 0;
  let skip = 0;
  for (const c of checks) {
    if (c.verdict === 'pass') pass++;
    else if (c.verdict === 'fail') fail++;
    else skip++;
  }
  const verdict: GateVerdict = fail > 0 ? 'fail' : pass === 0 && skip > 0 ? 'skip' : 'pass';
  return { verdict, summary: { pass, fail, skip } };
}

/** Generate actionable feedback from failed checks. */
function generateFeedback(checks: readonly GateCheckResult[]): string {
  const failures = checks.filter((c) => c.verdict === 'fail');
  const skipped = checks.filter((c) => c.verdict === 'skip');

  // #4355: a skip has to be visible in the feedback too. "All checks passed"
  // over a run where half of them never executed is the report a human
  // spot-check trusts, and it would be wrong.
  const skipNote =
    skipped.length > 0
      ? `\n${String(skipped.length)} check(s) did not run:\n${skipped
          .map((s) => `- ${s.name}: ${s.details}`)
          .join('\n')}`
      : '';

  if (failures.length === 0) {
    const ran = checks.length - skipped.length;
    const headline = ran === 0 ? 'No checks ran.' : `All ${String(ran)} check(s) that ran passed.`;
    return `${headline}${skipNote}`;
  }

  const lines = failures.map((f) => `- ${f.name}: ${f.details}`);
  return `${String(failures.length)} check(s) failed:\n${lines.join('\n')}${skipNote}`;
}

/**
 * Run all quality gate checks for a pipeline stage.
 *
 * @param stage - Which pipeline stage is being evaluated
 * @param checks - Array of check functions to execute
 * @param iteration - Current iteration number (1-based)
 * @returns Aggregate result with verdict, feedback, and per-check details
 */
export async function runQualityGate(
  stage: PipelineStage,
  checks: readonly GateCheckFn[],
  iteration = 1
): Promise<QualityGateResult> {
  const results: GateCheckResult[] = [];
  for (const check of checks) {
    const result = await check();
    results.push(result);
  }

  const { verdict, summary } = aggregateResults(results);
  return {
    stage,
    verdict,
    checks: results,
    summary,
    feedback: generateFeedback(results),
    iteration,
  };
}
