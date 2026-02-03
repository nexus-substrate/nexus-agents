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
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { colors } from './ansi-output.js';
import {
  type ReleaseValidateOptions,
  type ReleaseValidateResult,
  type ExpertValidationResult,
  type ValidationFinding,
} from './release-validate-types.js';

/**
 * Default options for the release-validate command.
 */
const DEFAULT_OPTIONS: ReleaseValidateOptions = {
  verbose: false,
  strict: false,
};

/**
 * Security expert validator.
 * Checks for vulnerabilities, dependency issues, and security patterns.
 */
async function validateSecurity(options: {
  version: string;
  verbose: boolean;
}): Promise<ExpertValidationResult> {
  const startTime = Date.now();
  const findings: ValidationFinding[] = [];

  // Check for npm audit issues
  try {
    execSync('npm audit --audit-level=high 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    findings.push({
      severity: 'warning',
      category: 'security',
      title: 'npm audit has findings',
      description: 'npm audit reported high or critical vulnerabilities.',
      remediation: 'Run npm audit fix or review and update vulnerable dependencies.',
    });
  }

  // Check for .env files that shouldn't be committed
  if (existsSync('.env')) {
    findings.push({
      severity: 'error',
      category: 'security',
      title: '.env file present',
      description: 'A .env file exists in the repository root.',
      remediation: 'Ensure .env is in .gitignore and not committed.',
    });
  }

  // Check for hardcoded secrets patterns
  try {
    const result = execSync(
      'git diff HEAD~10..HEAD -- "*.ts" "*.js" | grep -iE "(api[_-]?key|secret|password|token)" | head -5',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    if (result.trim()) {
      findings.push({
        severity: 'warning',
        category: 'security',
        title: 'Potential secrets in recent commits',
        description: 'Recent commits may contain hardcoded secrets.',
        remediation: 'Review commits for any exposed credentials.',
      });
    }
  } catch {
    // No matches found, which is good
  }

  const hasErrors = findings.some((f) => f.severity === 'error');

  return {
    expert: 'security',
    passed: !hasErrors,
    confidence: 0.85,
    findings,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Architecture expert validator.
 * Validates fitness score and architectural quality.
 */
async function validateArchitecture(options: {
  version: string;
  verbose: boolean;
}): Promise<ExpertValidationResult> {
  const startTime = Date.now();
  const findings: ValidationFinding[] = [];
  let fitnessScore = 0;

  // Run fitness audit
  try {
    const result = execSync('npx nexus-agents fitness-audit --format=json 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const audit = JSON.parse(result);
    fitnessScore = audit.score || 0;

    if (fitnessScore < 90) {
      findings.push({
        severity: 'error',
        category: 'architecture',
        title: `Fitness score below threshold: ${fitnessScore}/100`,
        description: 'Release gate requires fitness score >= 90.',
        remediation: 'Address fitness audit findings before release.',
      });
    } else {
      findings.push({
        severity: 'info',
        category: 'architecture',
        title: `Fitness score: ${fitnessScore}/100`,
        description: 'Fitness score meets release threshold.',
      });
    }

    // Add individual dimension findings
    if (audit.findings) {
      for (const finding of audit.findings) {
        findings.push({
          severity: 'info',
          category: 'architecture',
          title: finding.message || 'Fitness finding',
          description: finding.suggestion || '',
        });
      }
    }
  } catch (error) {
    findings.push({
      severity: 'warning',
      category: 'architecture',
      title: 'Fitness audit failed to run',
      description: 'Could not execute fitness audit command.',
      remediation: 'Ensure nexus-agents is built and fitness-audit command is available.',
    });
  }

  const hasErrors = findings.some((f) => f.severity === 'error');

  return {
    expert: 'architecture',
    passed: !hasErrors,
    confidence: 0.9,
    findings,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Documentation expert validator.
 * Checks for stale or missing documentation.
 */
async function validateDocumentation(options: {
  version: string;
  verbose: boolean;
}): Promise<ExpertValidationResult> {
  const startTime = Date.now();
  const findings: ValidationFinding[] = [];

  // Check CHANGELOG.md exists and has current version
  if (!existsSync('CHANGELOG.md')) {
    findings.push({
      severity: 'error',
      category: 'docs',
      title: 'CHANGELOG.md missing',
      description: 'No CHANGELOG.md found in repository root.',
      remediation: 'Create CHANGELOG.md following Keep a Changelog format.',
    });
  } else {
    const changelog = readFileSync('CHANGELOG.md', 'utf-8');
    if (!changelog.includes(options.version)) {
      findings.push({
        severity: 'error',
        category: 'docs',
        title: `CHANGELOG.md missing version ${options.version}`,
        description: 'CHANGELOG.md does not contain the current version.',
        remediation: 'Add release notes for the current version to CHANGELOG.md.',
      });
    }
  }

  // Check README.md exists
  if (!existsSync('README.md')) {
    findings.push({
      severity: 'error',
      category: 'docs',
      title: 'README.md missing',
      description: 'No README.md found in repository root.',
      remediation: 'Create README.md with project overview and usage instructions.',
    });
  }

  // Check for stale CLAUDE.md governance version
  if (existsSync('CLAUDE.md')) {
    const claudeMd = readFileSync('CLAUDE.md', 'utf-8');
    const match = claudeMd.match(/Governance Version: (\d{4}-\d{2}-\d{2})/);
    if (match?.[1]) {
      const governanceDate = new Date(match[1]);
      const daysSinceUpdate = (Date.now() - governanceDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate > 30) {
        findings.push({
          severity: 'warning',
          category: 'docs',
          title: 'CLAUDE.md governance version stale',
          description: `Governance version is ${Math.round(daysSinceUpdate)} days old.`,
          remediation: 'Review and update CLAUDE.md governance version if needed.',
        });
      }
    }
  }

  const hasErrors = findings.some((f) => f.severity === 'error');

  return {
    expert: 'documentation',
    passed: !hasErrors,
    confidence: 0.85,
    findings,
    durationMs: Date.now() - startTime,
  };
}

/**
 * DevOps expert validator.
 * Verifies CI/CD gates and build status.
 */
async function validateDevOps(options: {
  version: string;
  verbose: boolean;
}): Promise<ExpertValidationResult> {
  const startTime = Date.now();
  const findings: ValidationFinding[] = [];

  // Check if build passes
  try {
    execSync('pnpm build 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
    });
    findings.push({
      severity: 'info',
      category: 'ci',
      title: 'Build passes',
      description: 'pnpm build completed successfully.',
    });
  } catch {
    findings.push({
      severity: 'error',
      category: 'ci',
      title: 'Build failed',
      description: 'pnpm build failed.',
      remediation: 'Fix build errors before release.',
    });
  }

  // Check if lint passes
  try {
    execSync('pnpm lint 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 180000,
    });
    findings.push({
      severity: 'info',
      category: 'ci',
      title: 'Lint passes',
      description: 'pnpm lint completed successfully.',
    });
  } catch {
    findings.push({
      severity: 'error',
      category: 'ci',
      title: 'Lint failed',
      description: 'pnpm lint failed.',
      remediation: 'Fix lint errors before release.',
    });
  }

  // Check if typecheck passes
  try {
    execSync('pnpm typecheck 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
    });
    findings.push({
      severity: 'info',
      category: 'ci',
      title: 'Type check passes',
      description: 'pnpm typecheck completed successfully.',
    });
  } catch {
    findings.push({
      severity: 'error',
      category: 'ci',
      title: 'Type check failed',
      description: 'pnpm typecheck failed.',
      remediation: 'Fix type errors before release.',
    });
  }

  const hasErrors = findings.some((f) => f.severity === 'error');

  return {
    expert: 'devops',
    passed: !hasErrors,
    confidence: 0.95,
    findings,
    durationMs: Date.now() - startTime,
  };
}

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
    ? parseInt(fitnessFinding.title.match(/(\d+)/)?.[1] || '0')
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
