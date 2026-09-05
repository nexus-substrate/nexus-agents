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
import { z } from 'zod';
import type { ExpertValidationResult, ValidationFinding } from './release-validate-types.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';
import { anyOf } from '../utils/verdict-aggregation.js';
import { safeJsonParse } from '../utils/type-coercion.js';
import { scanRecentCommitsForSecrets } from './release-secret-scan.js';

export interface ValidatorOptions {
  readonly version: string;
  readonly verbose: boolean;
}

const NPM_AUDIT_REPORT_SCHEMA = z.object({
  metadata: z.object({
    vulnerabilities: z.object({
      moderate: z.number().int().nonnegative(),
      high: z.number().int().nonnegative(),
      critical: z.number().int().nonnegative(),
    }),
  }),
});

type NpmAuditCounts = z.infer<typeof NPM_AUDIT_REPORT_SCHEMA>['metadata']['vulnerabilities'];

function parseNpmAuditCounts(output: string): NpmAuditCounts | undefined {
  const parsed = NPM_AUDIT_REPORT_SCHEMA.safeParse(safeJsonParse(output));
  return parsed.success ? parsed.data.metadata.vulnerabilities : undefined;
}

function createNpmAuditFinding(counts: NpmAuditCounts): ValidationFinding | undefined {
  const severeCounts = [
    ...(counts.high > 0 ? [`${String(counts.high)} high`] : []),
    ...(counts.critical > 0 ? [`${String(counts.critical)} critical`] : []),
  ];
  if (severeCounts.length > 0) {
    return {
      severity: 'error',
      category: 'security',
      title: `npm audit found ${severeCounts.join(' and ')} vulnerabilities`,
      description: 'npm audit reported high or critical vulnerabilities.',
      remediation: 'Run npm audit fix or review and update vulnerable dependencies.',
    };
  }
  if (counts.moderate === 0) return undefined;
  return {
    severity: 'warning',
    category: 'security',
    title: `npm audit found ${String(counts.moderate)} moderate vulnerabilities`,
    description: 'npm audit reported moderate vulnerabilities.',
    remediation: 'Review and update vulnerable dependencies.',
  };
}

function unavailableNpmAuditFinding(reason: string): ValidationFinding {
  return {
    severity: 'error',
    category: 'security',
    title: `npm audit unavailable: ${reason}`,
    description: 'npm audit did not produce a valid vulnerability report.',
    remediation: 'Restore npm audit availability and rerun release validation.',
  };
}

function getErrorStdout(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('stdout' in error)) return undefined;
  return typeof error.stdout === 'string' ? error.stdout : undefined;
}

function runNpmAudit(): ValidationFinding | undefined {
  try {
    const output = execSync('npm audit --json --audit-level=high', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: CLI_SUBPROCESS_TIMEOUTS.ghCommandMs,
    });
    const counts = parseNpmAuditCounts(output);
    return counts === undefined
      ? unavailableNpmAuditFinding('invalid JSON response')
      : createNpmAuditFinding(counts);
  } catch (error) {
    const stdout = getErrorStdout(error);
    const counts = stdout === undefined ? undefined : parseNpmAuditCounts(stdout);
    if (counts !== undefined) return createNpmAuditFinding(counts);
    const reason = error instanceof Error ? error.message : String(error);
    return unavailableNpmAuditFinding(reason);
  }
}

/** Checks for vulnerabilities, dependency issues, and security patterns. */
export async function validateSecurity(options: ValidatorOptions): Promise<ExpertValidationResult> {
  const startTime = Date.now();
  const findings: ValidationFinding[] = [];

  // Check for npm audit issues
  const auditFinding = runNpmAudit();
  if (auditFinding !== undefined) findings.push(auditFinding);

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
  const scan = scanRecentCommitsForSecrets();
  if (!scan.ok) {
    findings.push({
      severity: 'warning',
      category: 'security',
      title: 'Secret scan did not run',
      description: `The hardcoded-secret scan over recent commits failed to execute: ${scan.reason}`,
      remediation: 'Re-run with a full git history available, then review the output.',
    });
  } else if (scan.matches.length > 0) {
    findings.push({
      severity: 'warning',
      category: 'security',
      title: 'Potential secrets in recent commits',
      description: 'Recent commits may contain hardcoded secrets.',
      remediation: 'Review commits for any exposed credentials.',
    });
  }

  return {
    expert: 'security',
    // whenEmpty = false: an empty list genuinely means "scanned, nothing
    // found" — every check above records a finding when it cannot run, which
    // for the secret scan required #4839 as well as #4581.
    passed: !anyOf(findings, (f) => f.severity === 'error', false),
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
      timeout: CLI_SUBPROCESS_TIMEOUTS.releaseValidateMs,
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
