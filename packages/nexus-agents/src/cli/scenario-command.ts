/**
 * nexus-agents CLI — Scenario Command (Epic #952, Phase 4)
 *
 * Run and list canonical scenario fixtures for E2E validation.
 *
 * Usage:
 *   nexus-agents scenario list
 *   nexus-agents scenario run <name>
 *
 * @module cli/scenario-command
 */

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createScenarioRunner } from '../testing/e2e/scenario-runner.js';
import type { ScenarioResult } from '../testing/e2e/types.js';
import type { CliExitResult, ParsedCliArgs } from '../cli-types.js';
import { EXIT_CODES, cliExit } from '../cli-types.js';

const FIXTURES_DIR = resolve(import.meta.dirname, '../testing/e2e/fixtures');

const SCENARIO_SUFFIX = '.scenario.yaml';

/** List available scenario fixtures. */
async function listScenarios(): Promise<string[]> {
  try {
    const files = await readdir(FIXTURES_DIR);
    return files
      .filter((f) => f.endsWith(SCENARIO_SUFFIX))
      .map((f) => f.replace(SCENARIO_SUFFIX, ''));
  } catch {
    return [];
  }
}

/** Print scenario list. Returns SUCCESS (0), matching the prior inline exit. */
async function handleList(): Promise<CliExitResult> {
  const names = await listScenarios();
  if (names.length === 0) {
    process.stdout.write('No scenario fixtures found.\n');
  } else {
    process.stdout.write('Available scenarios:\n');
    for (const n of names) {
      process.stdout.write(`  - ${n}\n`);
    }
  }
  return cliExit(EXIT_CODES.SUCCESS);
}

/** Print scenario result to stdout. */
function printResult(result: ScenarioResult): void {
  process.stdout.write(`Scenario: ${result.scenarioId}\n`);
  process.stdout.write(`Passed: ${String(result.passed)}\n`);
  process.stdout.write(`Duration: ${String(result.durationMs)}ms\n`);

  for (const step of result.stepResults) {
    const icon = step.passed ? '[PASS]' : '[FAIL]';
    process.stdout.write(`  ${icon} ${step.stepId}\n`);
    for (const f of step.failures) {
      process.stdout.write(`    - ${f}\n`);
    }
  }

  if (result.error !== undefined) {
    process.stdout.write(`Error: ${result.error}\n`);
  }
}

/**
 * Run a single scenario by name. Exit codes match the prior inline exits:
 * missing name → SERVER_START_FAILED (1); run → SUCCESS (0) if passed else 1;
 * load/run throw → 1.
 */
async function handleRun(args: ParsedCliArgs): Promise<CliExitResult> {
  const name = args.positionals[1] ?? args.positionals[0];
  if (name === undefined || name === 'run') {
    process.stdout.write('Usage: nexus-agents scenario run <name>\n');
    return cliExit(EXIT_CODES.SERVER_START_FAILED);
  }

  const runner = createScenarioRunner();
  const fixturePath = join(FIXTURES_DIR, `${name}${SCENARIO_SUFFIX}`);

  try {
    const fixture = await runner.loadFixture(fixturePath);
    const result = await runner.run(fixture);
    printResult(result);
    const code = result.passed ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED;
    return cliExit(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`Failed to run scenario: ${msg}\n`);
    return cliExit(EXIT_CODES.SERVER_START_FAILED);
  }
}

/**
 * Handle the `scenario` CLI command.
 *
 * #3942: RETURNS a {@link CliExitResult}; the dispatcher owns `process.exit`.
 * Exit codes are byte-identical to the prior inline exits (see helpers above);
 * an unknown subcommand returns SERVER_START_FAILED (1).
 */
export async function handleScenarioCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const sub = args.subcommand ?? args.positionals[0] ?? 'list';

  if (sub === 'list') {
    return handleList();
  }

  if (sub === 'run') {
    return handleRun(args);
  }

  process.stdout.write(`Unknown subcommand: ${sub}\n`);
  process.stdout.write('Usage: nexus-agents scenario [list|run <name>]\n');
  return cliExit(EXIT_CODES.SERVER_START_FAILED);
}
