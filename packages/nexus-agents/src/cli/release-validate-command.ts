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
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */

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
 * Runs all expert validations in parallel.
 *
 * @param options - Validation options
 * @returns Aggregated validation result
 */
export async function runReleaseValidate(
  options: Partial<ReleaseValidateOptions> = {}
): Promise<ReleaseValidateResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Determine version from package.json
  let version: string;
  if (opts.version) {
    version = opts.version;
  } else {
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
      version = (pkg.version as string) || 'unknown';
    } catch {
      version = 'unknown';
    }
  }

  if (opts.verbose) {
    console.log(`${colors.cyan}${colors.bold}Release Validation Swarm${colors.reset}`);
    console.log(`${colors.dim}Validating version ${version}...${colors.reset}`);
    console.log('');
  }

  // Run validators
  const skip = opts.skip || [];
  const validators: Promise<ExpertValidationResult>[] = [];

  if (!skip.includes('security')) {
    validators.push(validateSecurity({ version, verbose: opts.verbose }));
  }
  if (!skip.includes('architecture')) {
    validators.push(validateArchitecture({ version, verbose: opts.verbose }));
  }
  if (!skip.includes('docs')) {
    validators.push(validateDocumentation({ version, verbose: opts.verbose }));
  }
  if (!skip.includes('devops')) {
    validators.push(validateDevOps({ version, verbose: opts.verbose }));
  }

  const experts = await Promise.all(validators);

  // Aggregate results
  const summary = {
    errors: 0,
    warnings: 0,
    infos: 0,
  };

  for (const expert of experts) {
    for (const finding of expert.findings) {
      if (finding.severity === 'error') summary.errors++;
      else if (finding.severity === 'warning') summary.warnings++;
      else summary.infos++;
    }
  }

  const passed = opts.strict
    ? summary.errors === 0 && summary.warnings === 0
    : summary.errors === 0;

  // Extract fitness score if available
  const archExpert = experts.find((e) => e.expert === 'architecture');
  const fitnessFinding = archExpert?.findings.find((f) => f.title.startsWith('Fitness score:'));
  const fitnessScore = fitnessFinding
    ? parseInt(fitnessFinding.title.match(/(\d+)/)?.[1] || '0', 10)
    : undefined;

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
 * Prints the validation result to console.
 *
 * @param result - Validation result
 * @param verbose - Whether to show verbose output
 */
export function printReleaseValidateResult(result: ReleaseValidateResult, verbose = false): void {
  console.log('');
  console.log(`${colors.cyan}${colors.bold}Release Validation Report${colors.reset}`);
  console.log(`${colors.dim}${'═'.repeat(50)}${colors.reset}`);
  console.log(`${colors.dim}Version:${colors.reset} ${result.version}`);
  if (result.fitnessScore !== undefined) {
    console.log(`${colors.dim}Fitness Score:${colors.reset} ${result.fitnessScore}/100`);
  }
  console.log(`${colors.dim}Duration:${colors.reset} ${result.durationMs}ms`);
  console.log('');

  // Print expert results
  for (const expert of result.experts) {
    const status = expert.passed
      ? `${colors.green}PASS${colors.reset}`
      : `${colors.red}FAIL${colors.reset}`;
    console.log(`${colors.bold}${expert.expert.toUpperCase()}${colors.reset}: ${status}`);

    if (verbose || !expert.passed) {
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
        if (verbose && finding.description) {
          console.log(`    ${colors.dim}${finding.description}${colors.reset}`);
        }
        if (finding.remediation) {
          console.log(`    ${colors.cyan}→ ${finding.remediation}${colors.reset}`);
        }
      }
    }
    console.log('');
  }

  // Print summary
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
  console.log(
    `${colors.bold}Summary:${colors.reset} ` +
      `${colors.red}${result.summary.errors} errors${colors.reset}, ` +
      `${colors.yellow}${result.summary.warnings} warnings${colors.reset}, ` +
      `${result.summary.infos} infos`
  );

  if (result.passed) {
    console.log(`${colors.green}${colors.bold}✓ Release validation PASSED${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bold}✗ Release validation FAILED${colors.reset}`);
  }
}

/**
 * CLI command handler for release-validate.
 *
 * @param args - Command arguments
 * @returns Exit code
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
