/**
 * Quality Gate — QA Validation Engine (#1684)
 *
 * Runs configurable quality checks against code changes and returns
 * structured pass/fail results with actionable feedback.
 *
 * @module security/quality-gate
 */

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

/** Check: TypeScript compilation passes. */
export function checkTypeCheck(projectDir: string): GateCheckFn {
  return () =>
    runCommandCheck('type_check', 'npx', ['tsc', '--noEmit', '--project', projectDir], projectDir);
}

/** Check: ESLint passes. */
export function checkLint(projectDir: string): GateCheckFn {
  return () =>
    runCommandCheck('lint', 'npx', ['eslint', '--max-warnings', '0', projectDir], projectDir);
}

/** Check: Tests pass. */
export function checkTests(projectDir: string): GateCheckFn {
  return () => runCommandCheck('tests', 'npx', ['vitest', 'run', '--dir', projectDir], projectDir);
}

/**
 * Check: Build succeeds.
 *
 * Takes `projectDir` (#4355). It previously took no argument and ran
 * `pnpm build` wherever the server happened to be, so its verdict described
 * an unrelated project.
 */
export function checkBuild(projectDir: string): GateCheckFn {
  return () => runCommandCheck('build', 'pnpm', ['build'], projectDir);
}

// ============================================================================
// Gate Runner
// ============================================================================

/** Aggregate individual check results into a gate verdict. */
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
  return { verdict: fail > 0 ? 'fail' : 'pass', summary: { pass, fail, skip } };
}

/** Generate actionable feedback from failed checks. */
function generateFeedback(checks: readonly GateCheckResult[]): string {
  const failures = checks.filter((c) => c.verdict === 'fail');
  if (failures.length === 0) return 'All checks passed.';
  const lines = failures.map((f) => `- ${f.name}: ${f.details}`);
  return `${String(failures.length)} check(s) failed:\n${lines.join('\n')}`;
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
