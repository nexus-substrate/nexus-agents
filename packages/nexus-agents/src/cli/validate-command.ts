/**
 * nexus-agents/cli - Validate Command
 *
 * Unified validation command that runs doctor checks, fitness audit,
 * and config validation in sequence, reporting a combined pass/fail.
 *
 * @module cli/validate-command
 * (Source: Issue #1598)
 */

import type { ParsedCliArgs } from '../cli-types.js';
import { runDoctor } from './doctor.js';
import type { DoctorResult } from './doctor.js';
import { calculateFitnessScore } from '../governance/index.js';
import type { FitnessAudit } from '../governance/index.js';
import { VERSION } from '../version.js';
import { colors, symbols, writeLine } from './ansi-output.js';

/** Minimum fitness score to pass validation. */
const MIN_FITNESS_SCORE = 90;

/** Result of a single validation phase. */
export interface ValidatePhaseResult {
  readonly name: string;
  readonly passed: boolean;
  readonly summary: string;
}

/** Combined validation result. */
export interface ValidateResult {
  readonly phases: readonly ValidatePhaseResult[];
  readonly allPassed: boolean;
}

/**
 * Evaluates doctor check results into a phase result.
 */
function evaluateDoctor(doctor: DoctorResult): ValidatePhaseResult {
  const installedCount = doctor.clis.filter((c) => c.installed).length;
  const total = doctor.clis.length;
  const summary = doctor.allHealthy
    ? `All systems healthy (${String(installedCount)}/${String(total)} CLIs installed)`
    : `Issues detected (${String(installedCount)}/${String(total)} CLIs installed)`;
  return { name: 'Doctor', passed: doctor.allHealthy, summary };
}

/**
 * Evaluates fitness audit results into a phase result.
 */
function evaluateFitness(audit: FitnessAudit): ValidatePhaseResult {
  const passed = audit.score >= MIN_FITNESS_SCORE;
  const summary = `Score ${String(audit.score)}/100 (minimum: ${String(MIN_FITNESS_SCORE)})`;
  return { name: 'Fitness Audit', passed, summary };
}

/**
 * Evaluates config file presence into a phase result.
 */
function evaluateConfig(doctor: DoctorResult): ValidatePhaseResult {
  const found = doctor.configFile.found;
  const summary = found
    ? `Config found: ${doctor.configFile.path ?? 'unknown'}`
    : 'No nexus-agents.yaml found (optional)';
  // Config is optional — pass even when absent
  return { name: 'Config', passed: true, summary };
}

/**
 * Prints the validation report to stdout.
 */
function printReport(result: ValidateResult): void {
  writeLine();
  writeLine(`${colors.bold}nexus-agents validate${colors.reset}`);
  writeLine('─'.repeat(50));
  writeLine();

  for (const phase of result.phases) {
    const icon = phase.passed
      ? `${colors.green}${symbols.check}${colors.reset}`
      : `${colors.red}${symbols.cross}${colors.reset}`;
    writeLine(`  ${icon} ${colors.bold}${phase.name}${colors.reset}: ${phase.summary}`);
  }

  writeLine();
  if (result.allPassed) {
    writeLine(`${colors.green}${colors.bold}PASS${colors.reset}: All validation checks passed.`);
  } else {
    writeLine(
      `${colors.red}${colors.bold}FAIL${colors.reset}: One or more validation checks failed.`
    );
  }
  writeLine();
}

/**
 * Runs all validation phases and returns a combined result.
 */
export async function runValidate(): Promise<ValidateResult> {
  const doctor = await runDoctor();
  const audit = calculateFitnessScore(`v${VERSION}`);

  const phases: ValidatePhaseResult[] = [
    evaluateDoctor(doctor),
    evaluateFitness(audit),
    evaluateConfig(doctor),
  ];

  return {
    phases,
    allPassed: phases.every((p) => p.passed),
  };
}

/**
 * CLI handler for the validate command.
 */
export async function handleValidateCommand(args: ParsedCliArgs): Promise<void> {
  const result = await runValidate();
  const isJson = args.options.format === 'json';

  if (isJson) {
    writeLine(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }

  process.exit(result.allPassed ? 0 : 1);
}
