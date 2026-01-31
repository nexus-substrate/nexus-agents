/**
 * nexus-agents CLI - Fitness Audit Command
 *
 * Runs the CLI Orchestration Fitness Score audit and reports results.
 *
 * @module cli/fitness-audit
 * (Source: System Mandate LOOP I)
 */

import {
  calculateFitnessScore,
  type FitnessAudit,
  type FitnessFinding,
} from '../governance/index.js';
import { VERSION } from '../version.js';

/**
 * ANSI color codes for terminal output.
 */
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

/**
 * Write line to stdout.
 */
function writeLine(text = ''): void {
  process.stdout.write(text + '\n');
}

/**
 * Format a dimension score with color based on percentage of max.
 */
function formatScore(score: number, max: number): string {
  const percentage = (score / max) * 100;
  let color: string;

  if (percentage >= 80) {
    color = COLORS.green;
  } else if (percentage >= 50) {
    color = COLORS.yellow;
  } else {
    color = COLORS.red;
  }

  return `${color}${String(score)}/${String(max)}${COLORS.reset}`;
}

/**
 * Format a severity badge.
 */
function formatSeverity(severity: 'info' | 'warning' | 'critical'): string {
  switch (severity) {
    case 'critical':
      return `${COLORS.red}[CRITICAL]${COLORS.reset}`;
    case 'warning':
      return `${COLORS.yellow}[WARNING]${COLORS.reset}`;
    case 'info':
      return `${COLORS.dim}[INFO]${COLORS.reset}`;
  }
}

/**
 * Print the report header.
 */
function printHeader(): void {
  writeLine();
  writeLine(
    `${COLORS.bold}${COLORS.cyan}╔══════════════════════════════════════════════════════════════╗${COLORS.reset}`
  );
  writeLine(
    `${COLORS.bold}${COLORS.cyan}║        CLI ORCHESTRATION FITNESS AUDIT                        ║${COLORS.reset}`
  );
  writeLine(
    `${COLORS.bold}${COLORS.cyan}╚══════════════════════════════════════════════════════════════╝${COLORS.reset}`
  );
  writeLine();
}

/**
 * Print the summary section.
 */
function printSummary(score: number, version: string, timestamp: string): void {
  const scoreColor = score >= 90 ? COLORS.green : score >= 70 ? COLORS.yellow : COLORS.red;
  writeLine(
    `${COLORS.bold}Overall Score:${COLORS.reset} ${scoreColor}${COLORS.bold}${String(score)}/100${COLORS.reset}`
  );
  writeLine(`${COLORS.dim}Version: ${version}${COLORS.reset}`);
  writeLine(`${COLORS.dim}Timestamp: ${timestamp}${COLORS.reset}`);
  writeLine();
}

/**
 * Print the dimension scores section.
 */
function printDimensions(dimensions: FitnessAudit['dimensions']): void {
  writeLine(`${COLORS.bold}Dimension Scores:${COLORS.reset}`);
  writeLine(
    `  Canonical Paths:        ${formatScore(dimensions.canonicalPaths, 20)}  (duplicate path elimination)`
  );
  writeLine(
    `  Explicit Behavior:      ${formatScore(dimensions.explicitBehavior, 15)}  (no magic/hidden behavior)`
  );
  writeLine(
    `  Determinism:            ${formatScore(dimensions.determinism, 15)}  (predictable execution)`
  );
  writeLine(
    `  Observability:          ${formatScore(dimensions.observability, 15)}  (telemetry coverage)`
  );
  writeLine(
    `  Config Simplicity:      ${formatScore(dimensions.configSimplicity, 10)}  (config surface area)`
  );
  writeLine(
    `  Layer Separation:       ${formatScore(dimensions.layerSeparation, 10)}  (clean architecture)`
  );
  writeLine(
    `  Operator Ergonomics:    ${formatScore(dimensions.operatorErgonomics, 10)}  (CLI usability)`
  );
  writeLine(
    `  Governance Integration: ${formatScore(dimensions.governanceIntegration, 5)}  (policy enforcement)`
  );
  writeLine();
}

/**
 * Print the findings section.
 */
function printFindings(findings: readonly FitnessFinding[]): void {
  if (findings.length > 0) {
    writeLine(`${COLORS.bold}Findings (${String(findings.length)}):${COLORS.reset}`);
    const critical = findings.filter((f) => f.severity === 'critical');
    const warning = findings.filter((f) => f.severity === 'warning');
    const info = findings.filter((f) => f.severity === 'info');
    for (const finding of [...critical, ...warning, ...info]) {
      printFinding(finding);
    }
  } else {
    writeLine(`${COLORS.green}No findings - all checks passed!${COLORS.reset}`);
  }
  writeLine();
}

/**
 * Print the audit report to stdout.
 */
function printReport(audit: FitnessAudit): void {
  printHeader();
  printSummary(audit.score, audit.version, audit.timestamp);
  printDimensions(audit.dimensions);
  printFindings(audit.findings);
  writeLine(`${COLORS.bold}Target:${COLORS.reset} 90+/100 after consolidation`);
  writeLine(`${COLORS.dim}See Issue #574 for consolidation roadmap${COLORS.reset}`);
  writeLine();
}

/**
 * Print a single finding.
 */
function printFinding(finding: FitnessFinding): void {
  writeLine(`  ${formatSeverity(finding.severity)} ${finding.description}`);
  writeLine(
    `    ${COLORS.dim}Dimension: ${finding.dimension}, Points: -${String(finding.pointsDeducted)}${COLORS.reset}`
  );
  if (finding.suggestion !== undefined && finding.suggestion !== '') {
    writeLine(`    ${COLORS.cyan}→ ${finding.suggestion}${COLORS.reset}`);
  }
  if (finding.location !== undefined && finding.location !== '') {
    writeLine(`    ${COLORS.dim}Location: ${finding.location}${COLORS.reset}`);
  }
}

/**
 * Options for fitness audit command.
 */
export interface FitnessAuditOptions {
  /** Output as JSON instead of formatted text */
  json?: boolean;
  /** Only show findings above this severity */
  minSeverity?: 'info' | 'warning' | 'critical';
}

/**
 * Run the fitness audit command.
 *
 * @param options - Command options
 * @returns Exit code (0 = success, 1 = score below threshold)
 */
export function fitnessAuditCommand(options: FitnessAuditOptions = {}): number {
  const audit = calculateFitnessScore(`v${VERSION}`);
  const isJson = options.json === true;

  if (isJson) {
    writeLine(JSON.stringify(audit, null, 2));
  } else {
    printReport(audit);
  }

  // Exit with error if score is below minimum threshold
  const MIN_SCORE = 70;
  if (audit.score < MIN_SCORE) {
    if (!isJson) {
      writeLine(
        `${COLORS.red}${COLORS.bold}FAIL:${COLORS.reset} Score ${String(audit.score)} is below minimum threshold of ${String(MIN_SCORE)}`
      );
    }
    return 1;
  }

  if (!isJson) {
    writeLine(
      `${COLORS.green}${COLORS.bold}PASS:${COLORS.reset} Score ${String(audit.score)} meets minimum threshold of ${String(MIN_SCORE)}`
    );
  }

  return 0;
}
