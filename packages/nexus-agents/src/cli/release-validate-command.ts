/**
 * Release Validate Command
 *
 * CLI command for validating releases with expert swarm.
 * Runs security, architecture, documentation, and DevOps validations.
 *
 * @module cli/release-validate-command
 * (Source: Issue #640 - Multi-model release validation swarm)
 */

/* eslint-disable no-console */

import { readFileSync } from 'node:fs';
import { colors } from './ansi-output.js';
import type {
  ReleaseValidateOptions,
  ReleaseValidateResult,
  ExpertValidationResult,
} from './release-validate-types.js';
import {
  validateSecurity,
  validateArchitecture,
  validateDocumentation,
  validateDevOps,
} from './release-validate-helpers.js';

/**
 * Default options for the release-validate command.
 */
const DEFAULT_OPTIONS: ReleaseValidateOptions = {
  verbose: false,
  strict: false,
};

/**
 * Reads the version string from package.json, or returns 'unknown'.
 */
function readVersionFromPackage(): string {
  try {
    const raw: unknown = JSON.parse(readFileSync('package.json', 'utf-8'));
    if (typeof raw === 'object' && raw !== null && 'version' in raw) {
      const pkg = raw;
      return typeof pkg.version === 'string' ? pkg.version : 'unknown';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Aggregates finding counts across expert results.
 */
function aggregateFindings(experts: readonly ExpertValidationResult[]): {
  errors: number;
  warnings: number;
  infos: number;
} {
  const summary = { errors: 0, warnings: 0, infos: 0 };
  for (const expert of experts) {
    for (const finding of expert.findings) {
      if (finding.severity === 'error') summary.errors++;
      else if (finding.severity === 'warning') summary.warnings++;
      else summary.infos++;
    }
  }
  return summary;
}

/**
 * Extracts fitness score from architecture expert findings.
 */
function extractFitnessScore(experts: readonly ExpertValidationResult[]): number | undefined {
  const archExpert = experts.find((e) => e.expert === 'architecture');
  const fitnessFinding = archExpert?.findings.find((f) => f.title.startsWith('Fitness score:'));
  if (fitnessFinding === undefined) return undefined;
  const match = fitnessFinding.title.match(/(\d+)/);
  return match?.[1] !== undefined ? parseInt(match[1], 10) : undefined;
}

/**
 * Builds the list of expert validator promises based on skip list.
 */
function buildValidators(
  skip: readonly string[],
  params: { version: string; verbose: boolean }
): Promise<ExpertValidationResult>[] {
  const validators: Promise<ExpertValidationResult>[] = [];
  if (!skip.includes('security')) validators.push(validateSecurity(params));
  if (!skip.includes('architecture')) validators.push(validateArchitecture(params));
  if (!skip.includes('docs')) validators.push(validateDocumentation(params));
  if (!skip.includes('devops')) validators.push(validateDevOps(params));
  return validators;
}

/**
 * Runs all expert validations in parallel.
 */
export async function runReleaseValidate(
  options: Partial<ReleaseValidateOptions> = {}
): Promise<ReleaseValidateResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const version = opts.version ?? readVersionFromPackage();

  if (opts.verbose) {
    console.log(`${colors.cyan}${colors.bold}Release Validation Swarm${colors.reset}`);
    console.log(`${colors.dim}Validating version ${version}...${colors.reset}`);
    console.log('');
  }

  const validators = buildValidators(opts.skip ?? [], { version, verbose: opts.verbose });
  const experts = await Promise.all(validators);
  const summary = aggregateFindings(experts);

  const passed = opts.strict
    ? summary.errors === 0 && summary.warnings === 0
    : summary.errors === 0;

  const fitnessScore = extractFitnessScore(experts);

  return {
    success: true,
    version,
    passed,
    experts,
    summary,
    ...(fitnessScore !== undefined && { fitnessScore }),
    durationMs: Date.now() - startTime,
  };
}

/**
 * Prints findings for a single expert.
 */
function printExpertFindings(expert: ExpertValidationResult, verbose: boolean): void {
  const status = expert.passed
    ? `${colors.green}PASS${colors.reset}`
    : `${colors.red}FAIL${colors.reset}`;
  console.log(`${colors.bold}${expert.expert.toUpperCase()}${colors.reset}: ${status}`);

  if (!verbose && expert.passed) return;

  for (const finding of expert.findings) {
    const severityColor =
      finding.severity === 'error'
        ? colors.red
        : finding.severity === 'warning'
          ? colors.yellow
          : colors.dim;
    console.log(
      `  ${severityColor}[${finding.severity.toUpperCase()}]${colors.reset} ${finding.title}`
    );
    if (verbose && finding.description !== '') {
      console.log(`    ${colors.dim}${finding.description}${colors.reset}`);
    }
    if (finding.remediation !== undefined) {
      console.log(`    ${colors.cyan}→ ${finding.remediation}${colors.reset}`);
    }
  }
  console.log('');
}

/**
 * Prints the validation result to console.
 */
export function printReleaseValidateResult(result: ReleaseValidateResult, verbose = false): void {
  console.log('');
  console.log(`${colors.cyan}${colors.bold}Release Validation Report${colors.reset}`);
  console.log(`${colors.dim}${'═'.repeat(50)}${colors.reset}`);
  console.log(`${colors.dim}Version:${colors.reset} ${result.version}`);
  if (result.fitnessScore !== undefined) {
    console.log(`${colors.dim}Fitness Score:${colors.reset} ${String(result.fitnessScore)}/100`);
  }
  console.log(`${colors.dim}Duration:${colors.reset} ${String(result.durationMs)}ms`);
  console.log('');

  for (const expert of result.experts) {
    printExpertFindings(expert, verbose);
  }

  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
  console.log(
    `${colors.bold}Summary:${colors.reset} ` +
      `${colors.red}${String(result.summary.errors)} errors${colors.reset}, ` +
      `${colors.yellow}${String(result.summary.warnings)} warnings${colors.reset}, ` +
      `${String(result.summary.infos)} infos`
  );

  if (result.passed) {
    console.log(`${colors.green}${colors.bold}✓ Release validation PASSED${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bold}✗ Release validation FAILED${colors.reset}`);
  }
}

/**
 * CLI command handler for release-validate.
 */
export async function releaseValidateCommand(args: {
  positionals: string[];
  options: {
    version?: string;
    verbose?: boolean;
    strict?: boolean;
    skip?: string[];
  };
}): Promise<number> {
  const options: Partial<ReleaseValidateOptions> = {
    verbose: args.options.verbose ?? false,
    strict: args.options.strict ?? false,
  };
  if (args.options.version !== undefined) options.version = args.options.version;
  if (args.options.skip !== undefined) options.skip = args.options.skip;

  const result = await runReleaseValidate(options);

  printReleaseValidateResult(result, args.options.verbose);
  return result.passed ? 0 : 1;
}
