/**
 * Release Validate Helpers
 *
 * Expert validator functions for release validation.
 * Each validator checks a specific domain (security, architecture, docs, devops).
 *
 * @module cli/release-validate-helpers
 * (Source: Issue #669 - Extract from release-validate-command.ts)
 */

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

// The four validators below are typed as promise producers because the command
// runs them through `Promise.all`; each one only runs local, synchronous checks
// today, so the result is resolved rather than awaited.

/** Checks for vulnerabilities, dependency issues, and security patterns. */
export function validateSecurity(_options: ValidatorOptions): Promise<ExpertValidationResult> {
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

  return Promise.resolve({
    expert: 'security',
    // whenEmpty = false: an empty list genuinely means "scanned, nothing
    // found" — every check above records a finding when it cannot run, which
    // for the secret scan required #4839 as well as #4581.
    passed: !anyOf(findings, (f) => f.severity === 'error', false),
    confidence: 0.85,
    findings,
    durationMs: Date.now() - startTime,
  });
}

/** The score finding: an error below the release threshold, otherwise an info line. */
function fitnessScoreFinding(fitnessScore: number): ValidationFinding {
  if (fitnessScore < 90) {
    return {
      severity: 'error',
      category: 'architecture',
      title: `Fitness score below threshold: ${String(fitnessScore)}/100`,
      description: 'Release gate requires fitness score >= 90.',
      remediation: 'Address fitness audit findings before release.',
    };
  }
  return {
    severity: 'info',
    category: 'architecture',
    title: `Fitness score: ${String(fitnessScore)}/100`,
    description: 'Fitness score meets release threshold.',
  };
}

/** One info finding per dimension entry in the audit's `findings` array. */
function fitnessDimensionFindings(audit: Record<string, unknown>): ValidationFinding[] {
  const auditFindings = audit['findings'];
  if (!Array.isArray(auditFindings)) return [];
  return (auditFindings as Array<Record<string, unknown>>).map((finding) => ({
    severity: 'info',
    category: 'architecture',
    title: typeof finding['message'] === 'string' ? finding['message'] : 'Fitness finding',
    description: typeof finding['suggestion'] === 'string' ? finding['suggestion'] : '',
  }));
}

/**
 * Architecture expert validator.
 * Validates fitness score and architectural quality.
 */
export function validateArchitecture(_options: ValidatorOptions): Promise<ExpertValidationResult> {
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
    findings.push(fitnessScoreFinding(fitnessScore), ...fitnessDimensionFindings(audit));
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

  return Promise.resolve({
    expert: 'architecture',
    passed: !hasErrors,
    confidence: 0.9,
    findings,
    durationMs: Date.now() - startTime,
  });
}

/**
 * Documentation expert validator.
 * Checks for stale or missing documentation.
 */
export function validateDocumentation(options: ValidatorOptions): Promise<ExpertValidationResult> {
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

  // The CLAUDE.md governance-staleness warning was REMOVED here in #5943, not
  // left to rot. It parsed `Governance Version: (\d{4}-\d{2}-\d{2})` out of
  // CLAUDE.md and warned above 30 days. That stamp is now a content digest, so
  // the regex would never match, `match?.[1]` would always be undefined, and
  // the whole check would silently never fire — a check that cannot fail by
  // construction, which is worse than no check.
  //
  // It is deleted rather than re-based on something else because what it
  // measured is not a defect: governance sources being unchanged for 30 days
  // is fine. If a staleness signal is wanted, it needs a basis other than a
  // date parsed out of a generated file.

  const hasErrors = findings.some((f) => f.severity === 'error');

  return Promise.resolve({
    expert: 'documentation',
    passed: !hasErrors,
    confidence: 0.85,
    findings,
    durationMs: Date.now() - startTime,
  });
}

/** One CI gate the release runs locally: the command, its guard timeout, and how to report it. */
interface CiGate {
  readonly command: string;
  readonly timeoutMs: number;
  readonly name: string;
  readonly script: string;
  readonly remediation: string;
}

const CI_GATES: readonly CiGate[] = [
  {
    command: 'pnpm build 2>/dev/null',
    timeoutMs: CLI_SUBPROCESS_TIMEOUTS.releaseValidateMs,
    name: 'Build',
    script: 'pnpm build',
    remediation: 'Fix build errors before release.',
  },
  {
    command: 'pnpm lint 2>/dev/null',
    timeoutMs: CLI_SUBPROCESS_TIMEOUTS.releaseBuildMs,
    name: 'Lint',
    script: 'pnpm lint',
    remediation: 'Fix lint errors before release.',
  },
  {
    command: 'pnpm typecheck 2>/dev/null',
    timeoutMs: CLI_SUBPROCESS_TIMEOUTS.releaseValidateMs,
    name: 'Type check',
    script: 'pnpm typecheck',
    remediation: 'Fix type errors before release.',
  },
];

/** Runs one gate and reports it as an info finding on success, an error finding on failure. */
function runCiGate(gate: CiGate): ValidationFinding {
  try {
    execSync(gate.command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: gate.timeoutMs,
    });
    return {
      severity: 'info',
      category: 'ci',
      title: `${gate.name} passes`,
      description: `${gate.script} completed successfully.`,
    };
  } catch {
    return {
      severity: 'error',
      category: 'ci',
      title: `${gate.name} failed`,
      description: `${gate.script} failed.`,
      remediation: gate.remediation,
    };
  }
}

/**
 * DevOps expert validator.
 * Verifies CI/CD gates and build status.
 */
export function validateDevOps(_options: ValidatorOptions): Promise<ExpertValidationResult> {
  const startTime = Date.now();
  const findings: ValidationFinding[] = CI_GATES.map(runCiGate);

  const hasErrors = findings.some((f) => f.severity === 'error');

  return Promise.resolve({
    expert: 'devops',
    passed: !hasErrors,
    confidence: 0.95,
    findings,
    durationMs: Date.now() - startTime,
  });
}
