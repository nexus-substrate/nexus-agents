/**
 * nexus-agents system-review helpers
 *
 * Print, format, and display utilities for the system review command.
 * Extracted from system-review.ts for maintainability (file size limit).
 *
 * (Source: Issue #211, Process Automation Epic #209)
 */

import { getTimeProvider } from '../core/index.js';
import {
  SYSTEM_REVIEW_CONSTANTS,
  type SystemReviewResult,
  type TechniqueStats,
  type DocFreshness,
  type IssueHealth,
  type SecurityAudit,
  type CodeQuality,
} from './system-review-types.js';
import { safeExecSandboxed } from './sandbox-exec.js';
import { colors, symbols, writeLine } from './ansi-output.js';

// Re-export for backward compatibility
export { colors, symbols, writeLine };

const {
  COVERAGE_TARGET_PERCENT,
  HEALTH_SCORE_BASE,
  HEALTH_SCORE_WARN_THRESHOLD,
  HEALTH_SCORE_PASS_THRESHOLD,
  DOC_STALE_PENALTY,
  DOC_REVIEW_PENALTY,
  SECURITY_HIGH_PENALTY,
  SECURITY_MODERATE_PENALTY,
  TYPECHECK_FAIL_PENALTY,
  LINT_FAIL_PENALTY,
  LOW_COVERAGE_PENALTY,
  STALE_ISSUE_PENALTY,
} = SYSTEM_REVIEW_CONSTANTS;

/** Format a status indicator with color. */
export function formatStatus(status: 'pass' | 'warn' | 'fail'): string {
  const map = {
    pass: colors.green + symbols.check,
    warn: colors.yellow + symbols.warn,
    fail: colors.red + symbols.cross,
  };
  return map[status] + colors.reset;
}

/** Calculate overall health score from review results. */
export function calculateHealthScore(r: SystemReviewResult): number {
  let score = HEALTH_SCORE_BASE;
  for (const d of r.docs) {
    score -=
      d.status === 'stale' ? DOC_STALE_PENALTY : d.status === 'review' ? DOC_REVIEW_PENALTY : 0;
  }
  score -=
    r.security.high * SECURITY_HIGH_PENALTY + r.security.moderate * SECURITY_MODERATE_PENALTY;
  if (!r.quality.typecheckPass) score -= TYPECHECK_FAIL_PENALTY;
  if (!r.quality.lintPass) score -= LINT_FAIL_PENALTY;
  if (r.quality.coveragePercent !== null && r.quality.coveragePercent < COVERAGE_TARGET_PERCENT) {
    score -= LOW_COVERAGE_PENALTY;
  }
  score -= r.issues.staleCount * STALE_ISSUE_PENALTY;
  return Math.max(0, Math.min(HEALTH_SCORE_BASE, score));
}

/** Print Phase 1: Registry Reconciliation results. */
export function printPhase1(t: TechniqueStats): void {
  writeLine(`${colors.cyan}Phase 1: Registry Reconciliation${colors.reset}\n`);
  const tot = t.implemented + t.planned + t.notStarted + t.rejected;
  writeLine(`  Implemented: ${colors.green}${String(t.implemented)}${colors.reset}`);
  writeLine(`  Planned:     ${colors.yellow}${String(t.planned)}${colors.reset}`);
  writeLine(`  Not Started: ${colors.dim}${String(t.notStarted)}${colors.reset}`);
  writeLine(`  Rejected:    ${colors.dim}${String(t.rejected)}${colors.reset}`);
  writeLine(`  Total:       ${String(tot)}\n`);
}

/** Print Phase 2: Documentation Sync results. */
export function printPhase2(docs: DocFreshness[]): void {
  writeLine(`${colors.cyan}Phase 2: Documentation Sync${colors.reset}\n`);
  for (const d of docs) {
    const s =
      d.status === 'current'
        ? formatStatus('pass')
        : d.status === 'review'
          ? formatStatus('warn')
          : formatStatus('fail');

    // Show newer dependencies if any (Epic #261 source tracking)
    const newerCount = d.newerDependencies?.length ?? 0;
    const depInfo =
      newerCount > 0 ? ` ${colors.yellow}[${String(newerCount)} newer deps]${colors.reset}` : '';

    writeLine(`  ${s} ${d.file} (${String(d.daysSinceUpdate)} days)${depInfo}`);
  }
  writeLine('');
}

/** Print Phase 3: Issue Health results. */
export function printPhase3(i: IssueHealth): void {
  writeLine(`${colors.cyan}Phase 3: Issue Health${colors.reset}\n`);
  writeLine(`  Open:  ${String(i.openCount)}`);
  writeLine(
    `  Stale: ${i.staleCount > 0 ? colors.yellow : ''}${String(i.staleCount)}${colors.reset}`
  );
  for (const [l, c] of Object.entries(i.byLabel))
    if (c > 0) writeLine(`  ${colors.dim}${l}: ${String(c)}${colors.reset}`);
  writeLine('');
}

/** Print Phase 4: Security Audit results. */
export function printPhase4(s: SecurityAudit): void {
  writeLine(`${colors.cyan}Phase 4: Security Audit${colors.reset}\n`);
  if (s.totalVulns === 0) {
    writeLine(`  ${formatStatus('pass')} No vulnerabilities found`);
  } else {
    if (s.high > 0) writeLine(`  ${formatStatus('fail')} High: ${String(s.high)}`);
    if (s.moderate > 0) writeLine(`  ${formatStatus('warn')} Moderate: ${String(s.moderate)}`);
    if (s.low > 0) writeLine(`  ${formatStatus('pass')} Low: ${String(s.low)}`);
  }
  writeLine('');
}

/** Print Phase 5: Code Quality results. */
export function printPhase5(q: CodeQuality): void {
  writeLine(`${colors.cyan}Phase 5: Code Quality${colors.reset}\n`);
  writeLine(`  ${formatStatus(q.typecheckPass ? 'pass' : 'fail')} TypeScript`);
  writeLine(`  ${formatStatus(q.lintPass ? 'pass' : 'fail')} ESLint`);
  if (q.coveragePercent !== null)
    writeLine(
      `  ${formatStatus(q.coveragePercent >= COVERAGE_TARGET_PERCENT ? 'pass' : 'warn')} Coverage: ${q.coveragePercent.toFixed(1)}%`
    );
  writeLine('');
}

/** Format a doc row for the GitHub issue body. */
function formatDocRow(d: DocFreshness): string {
  const newerCount = d.newerDependencies?.length ?? 0;
  const statusIcon = d.status === 'current' ? '✅' : d.status === 'review' ? '⚠️' : '❌';
  const newerInfo = newerCount > 0 ? ` (${String(newerCount)} newer deps)` : '';
  return `| ${d.file} | ${String(d.daysSinceUpdate)} | ${statusIcon}${newerInfo} |`;
}

/** Create the GitHub issue body from review results. */
export function createIssueBody(r: SystemReviewResult): string {
  const now = new Date(getTimeProvider().now());
  const date = now.toISOString().split('T')[0] ?? 'unknown';
  const tz = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const s = String(calculateHealthScore(r));
  return `## System Review: ${date}\n\n**Generated:** ${tz} ET\n**Health Score:** ${s}/${String(HEALTH_SCORE_BASE)}\n\n---\n\n### Phase 1: Registry\n\n| Status | Count |\n|--------|-------|\n| Implemented | ${String(r.techniques.implemented)} |\n| Planned | ${String(r.techniques.planned)} |\n| Not Started | ${String(r.techniques.notStarted)} |\n| Rejected | ${String(r.techniques.rejected)} |\n\n### Phase 2: Docs\n\n| Document | Days | Status |\n|----------|------|--------|\n${r.docs.map(formatDocRow).join('\n')}\n\n### Phase 3: Issues\n\n- Open: ${String(r.issues.openCount)}\n- Stale: ${String(r.issues.staleCount)}\n\n### Phase 4: Security\n\n- High: ${String(r.security.high)}\n- Moderate: ${String(r.security.moderate)}\n- Low: ${String(r.security.low)}\n\n### Phase 5: Quality\n\n- TypeScript: ${r.quality.typecheckPass ? '✅' : '❌'}\n- ESLint: ${r.quality.lintPass ? '✅' : '❌'}\n- Coverage: ${r.quality.coveragePercent !== null ? `${r.quality.coveragePercent.toFixed(1)}%` : 'Unknown'}\n\n---\n\n### Action Items\n\n${r.actionItems.length > 0 ? r.actionItems.map((i) => `- [ ] ${i}`).join('\n') : '_No action items_'}\n\n---\n\n_Generated by \`nexus-agents system-review\`_`;
}

/** Create a GitHub issue with review results. Returns the issue URL or null. */
export function createIssue(result: SystemReviewResult): string | null {
  const date = getTimeProvider().nowIso().split('T')[0] ?? 'unknown';
  const body = createIssueBody(result).replace(/"/g, '\\"');
  const out = safeExecSandboxed(
    `gh issue create --title "System Review: ${date}" --body "${body}" --label system-review`,
    { context: 'gh' }
  );
  if (out !== null) {
    const m = out.match(/https:\/\/github\.com\/[^\s]+/);
    return m !== null ? m[0] : null;
  }
  return null;
}

/** Print the complete system review results. */
export function printSystemReviewResult(r: SystemReviewResult): void {
  writeLine(`\n${colors.bold}Nexus Agents System Review${colors.reset}`);
  writeLine('===========================');
  writeLine(
    `${colors.dim}Generated: ${r.timestamp.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET${colors.reset}\n`
  );
  printPhase1(r.techniques);
  printPhase2(r.docs);
  printPhase3(r.issues);
  printPhase4(r.security);
  printPhase5(r.quality);
  if (r.actionItems.length > 0) {
    writeLine(`${colors.cyan}Action Items${colors.reset}\n`);
    for (const i of r.actionItems) writeLine(`  ${symbols.bullet} ${i}`);
    writeLine('');
  }
  if (r.fixesApplied.length > 0) {
    writeLine(`${colors.green}Fixes Applied${colors.reset}\n`);
    for (const f of r.fixesApplied) writeLine(`  ${formatStatus('pass')} ${f}`);
    writeLine('');
  }
  const hs = calculateHealthScore(r);
  const scoreColor =
    hs >= HEALTH_SCORE_PASS_THRESHOLD
      ? colors.green
      : hs >= HEALTH_SCORE_WARN_THRESHOLD
        ? colors.yellow
        : colors.red;
  writeLine(
    `${colors.bold}Health Score: ${scoreColor}${String(hs)}/${String(HEALTH_SCORE_BASE)}${colors.reset}\n`
  );
}
