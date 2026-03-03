/**
 * Release Validate Helpers
 *
 * Expert validator functions for release validation.
 * Each validator checks a specific domain (security, architecture, docs, devops).
 *
 * @module cli/release-validate-helpers
 * (Source: Issue #669 - Extract from release-validate-command.ts)
 */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */

/* eslint-disable @typescript-eslint/require-await */

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-lines-per-function */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { ExpertValidationResult, ValidationFinding } from './release-validate-types.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';

/** Options passed to each expert validator. */
export interface ValidatorOptions {
  readonly version: string;
  readonly verbose: boolean;
}

/**
 * Security expert validator.
 * Checks for vulnerabilities, dependency issues, and security patterns.
 */
export async function validateSecurity(options: ValidatorOptions): Promise<ExpertValidationResult> {
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

  return {
    expert: 'security',
    passed: !findings.some((f) => f.severity === 'error'),
    confidence: 0.85,
    findings,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Architecture expert validator.
 * Validates fitness score and architectural quality.
 */
export async function validateArchitecture(
  options: ValidatorOptions
): Promise<ExpertValidationResult> {
  const startTime = Date.now();
  const findings: ValidationFinding[] = [];

  // Run fitness audit
  try {
    const result = execSync('npx nexus-agents fitness-audit --format=json 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const audit = JSON.parse(result) as Record<string, unknown>;
    const fitnessScore = typeof audit['score'] === 'number' ? audit['score'] : 0;

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
    const auditFindings = audit['findings'];
    if (Array.isArray(auditFindings)) {
      for (const finding of auditFindings as Array<Record<string, unknown>>) {
        findings.push({
          severity: 'info',
          category: 'architecture',
          title: typeof finding['message'] === 'string' ? finding['message'] : 'Fitness finding',
          description: typeof finding['suggestion'] === 'string' ? finding['suggestion'] : '',
        });
      }
    }
  } catch {
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
export async function validateDocumentation(
  options: ValidatorOptions
): Promise<ExpertValidationResult> {
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
  } else if (!readFileSync('CHANGELOG.md', 'utf-8').includes(options.version)) {
    findings.push({
      severity: 'warning',
      category: 'docs',
      title: `Root CHANGELOG.md missing version ${options.version}`,
      description: 'Root CHANGELOG.md does not contain the current version.',
      remediation: 'Update root CHANGELOG.md or run pnpm changeset:version.',
    });
  }
  // Check package-level CHANGELOG.md (auto-generated by changesets - Issue #634)
  const pkgCl = 'packages/nexus-agents/CHANGELOG.md';
  if (existsSync(pkgCl) && !readFileSync(pkgCl, 'utf-8').includes(options.version)) {
    findings.push({
      severity: 'warning',
      category: 'docs',
      title: `Package CHANGELOG.md missing version ${options.version}`,
      description: 'Run pnpm changeset:version to generate changelog entries.',
      remediation: 'Run pnpm changeset:version to generate changelog from pending changesets.',
    });
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
export async function validateDevOps(options: ValidatorOptions): Promise<ExpertValidationResult> {
  const startTime = Date.now();
  const findings: ValidationFinding[] = [];

  // Check if build passes
  try {
    execSync('pnpm build 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: CLI_SUBPROCESS_TIMEOUTS.releaseValidateMs,
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
      timeout: CLI_SUBPROCESS_TIMEOUTS.releaseBuildMs,
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
      timeout: CLI_SUBPROCESS_TIMEOUTS.releaseValidateMs,
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
