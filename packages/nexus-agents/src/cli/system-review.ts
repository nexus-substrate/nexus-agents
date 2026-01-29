/**
 * nexus-agents system-review command
 *
 * Automated System Review per CLAUDE.md System Review Protocol.
 * Runs 5-phase checklist and optionally creates GitHub issue.
 *
 * (Source: Issue #211, Process Automation Epic #209)
 * (Consensus: 8.0/10, 5/5 UNANIMOUS APPROVE)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../core/logger.js';
import { safeExecSandboxed } from './sandbox-exec.js';

const logger = createLogger({ component: 'system-review' });
import {
  SYSTEM_REVIEW_CONSTANTS,
  type SystemReviewOptions,
  type SystemReviewResult,
  type TechniqueStats,
  type DocFreshness,
  type IssueHealth,
  type SecurityAudit,
  type CodeQuality,
  type GhIssueItem,
  type AuditMetadata,
  type CoverageData,
} from './system-review-types.js';
import {
  colors,
  formatStatus,
  calculateHealthScore,
  createIssue,
  printSystemReviewResult as printResult,
} from './system-review-helpers.js';
import { analyzeFreshness } from '../indexer/freshness-analyzer.js';

const {
  STALE_ISSUE_DAYS,
  MS_PER_DAY,
  COVERAGE_TARGET_PERCENT,
  LOW_ISSUE_COUNT_THRESHOLD,
  NOT_STARTED_TECHNIQUE_THRESHOLD,
  HEALTH_SCORE_WARN_THRESHOLD,
} = SYSTEM_REVIEW_CONSTANTS;

export type { SystemReviewOptions, SystemReviewResult } from './system-review-types.js';

// Re-export printSystemReviewResult for backward compatibility
export { printSystemReviewResult } from './system-review-helpers.js';

function safeExec(command: string, cwd?: string): string | null {
  // Use sandbox-aware execution with appropriate context
  // gh/git = git context, pnpm = write context (runs build/lint), others = read
  const context = command.startsWith('gh ')
    ? 'gh'
    : command.startsWith('git ')
      ? 'git'
      : command.startsWith('pnpm ')
        ? 'write'
        : 'read';
  // Only include cwd if defined (exactOptionalPropertyTypes)
  return cwd !== undefined
    ? safeExecSandboxed(command, { context, cwd })
    : safeExecSandboxed(command, { context });
}

function parseGhIssueList(json: string, context: string): GhIssueItem[] {
  try {
    const p: unknown = JSON.parse(json);
    if (!Array.isArray(p)) {
      logger.warn('gh issue list returned non-array', { context, type: typeof p });
      return [];
    }
    return p as GhIssueItem[];
  } catch (error) {
    // Issue #515: Log parse errors instead of silent swallow
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Failed to parse gh issue list JSON', {
      context,
      error: message,
      jsonPreview: json.slice(0, 100),
    });
    return [];
  }
}

function runPhase1(projectRoot: string): TechniqueStats {
  const f = path.join(projectRoot, 'docs/research/registry/techniques.yaml');
  if (!fs.existsSync(f)) return { implemented: 0, planned: 0, notStarted: 0, rejected: 0 };
  const c = fs.readFileSync(f, 'utf-8');
  return {
    implemented: (c.match(/status: implemented/g) ?? []).length,
    planned: (c.match(/status: planned/g) ?? []).length,
    notStarted: (c.match(/status: not-started/g) ?? []).length,
    rejected: (c.match(/status: rejected/g) ?? []).length,
  };
}

function mapFreshnessStatus(freshnessStatus: string): 'current' | 'review' | 'stale' {
  switch (freshnessStatus) {
    case 'fresh':
      return 'current';
    case 'warning':
      return 'review';
    case 'stale':
    case 'unknown':
    default:
      return 'stale';
  }
}

function runPhase2(projectRoot: string): DocFreshness[] {
  // Use freshness analyzer for source-dependency tracking (Epic #261)
  const freshnessResult = analyzeFreshness(undefined, projectRoot);
  const results: DocFreshness[] = [];

  for (const doc of freshnessResult.documents) {
    results.push({
      file: doc.path,
      daysSinceUpdate: doc.daysSinceModified ?? 0,
      status: mapFreshnessStatus(doc.status),
      dependencies: doc.dependencies,
      newerDependencies: doc.newerDependencies,
    });
  }

  return results;
}

function runPhase3(): IssueHealth {
  const openOutput = safeExec('gh issue list --state open --json number');
  const openCount = openOutput !== null ? parseGhIssueList(openOutput, 'open issues').length : 0;
  const staleCutoff = new Date(Date.now() - STALE_ISSUE_DAYS * MS_PER_DAY).toISOString();
  const staleOutput = safeExec(
    `gh issue list --state open --json updatedAt --jq '[.[] | select(.updatedAt < "${staleCutoff}")] | length'`
  );
  const staleCount = staleOutput !== null ? parseInt(staleOutput, 10) : 0;
  const byLabel: Record<string, number> = {};
  for (const label of ['epic', 'bug', 'enhancement', 'research', 'documentation']) {
    const out = safeExec(`gh issue list --state open --label ${label} --json number`);
    byLabel[label] = out !== null ? parseGhIssueList(out, `label:${label}`).length : 0;
  }
  return { openCount, staleCount, byLabel };
}

function runPhase4(projectRoot: string): SecurityAudit {
  const def = { totalVulns: 0, high: 0, moderate: 0, low: 0, parseError: false };
  const out = safeExec('pnpm audit --json', projectRoot);
  if (out === null) {
    logger.warn('pnpm audit command failed or returned null', { projectRoot });
    return { ...def, parseError: true };
  }
  try {
    const a: unknown = JSON.parse(out);
    const m = (a as { metadata?: AuditMetadata }).metadata?.vulnerabilities ?? {};
    return {
      totalVulns: m.total ?? 0,
      high: m.high ?? 0,
      moderate: m.moderate ?? 0,
      low: m.low ?? 0,
      parseError: false,
    };
  } catch (error) {
    // Issue #515: Log parse errors instead of silent swallow
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Failed to parse pnpm audit JSON', {
      error: message,
      outputPreview: out.slice(0, 200),
    });
    return { ...def, parseError: true };
  }
}

function runPhase5(projectRoot: string): CodeQuality {
  const tc = safeExec('pnpm typecheck', projectRoot);
  const lt = safeExec('pnpm lint', projectRoot);
  let cov: number | null = null;
  const cf = path.join(projectRoot, 'packages/nexus-agents/coverage/coverage-summary.json');
  if (fs.existsSync(cf)) {
    try {
      const c: unknown = JSON.parse(fs.readFileSync(cf, 'utf-8'));
      cov = (c as CoverageData).total?.lines?.pct ?? null;
    } catch (error) {
      // Issue #515: Log parse errors instead of silent swallow
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('Failed to parse coverage JSON', { error: message, file: cf });
    }
  }
  return {
    typecheckPass: tc !== null && !tc.includes('error'),
    lintPass: lt !== null && !lt.includes('error'),
    coveragePercent: cov,
  };
}

function getQualityItems(q: CodeQuality): string[] {
  const items: string[] = [];
  if (!q.typecheckPass) items.push('Fix TypeScript errors');
  if (!q.lintPass) items.push('Fix ESLint errors');
  if (q.coveragePercent !== null && q.coveragePercent < COVERAGE_TARGET_PERCENT)
    items.push(`Improve coverage (${q.coveragePercent.toFixed(1)}%)`);
  return items;
}

/** Get security-related action items. (Issue #515) */
function getSecurityItems(security: SecurityAudit): string[] {
  if (security.parseError === true) {
    return ['WARNING: Security audit parsing failed - verify pnpm audit manually'];
  }
  if (security.high > 0) {
    return [`Address ${String(security.high)} high-severity vulnerabilities`];
  }
  return [];
}

/** Get stale doc items. */
function getStaleDocItems(docs: readonly DocFreshness[]): string[] {
  const items: string[] = [];
  for (const d of docs) {
    if (d.status === 'stale') {
      const newerCount = d.newerDependencies?.length ?? 0;
      if (newerCount > 0) {
        items.push(`Update ${d.file} (${String(newerCount)} source files changed)`);
      } else {
        items.push(`Update ${d.file} (${String(d.daysSinceUpdate)} days stale)`);
      }
    }
  }
  return items;
}

function generateActionItems(
  r: Omit<SystemReviewResult, 'actionItems' | 'fixesApplied'>
): string[] {
  const items: string[] = [];
  if (r.techniques.notStarted > NOT_STARTED_TECHNIQUE_THRESHOLD)
    items.push(`Review ${String(r.techniques.notStarted)} not-started techniques`);
  items.push(...getStaleDocItems(r.docs));
  if (r.issues.staleCount > 0) items.push(`Review ${String(r.issues.staleCount)} stale issues`);
  if (r.issues.openCount < LOW_ISSUE_COUNT_THRESHOLD)
    items.push('Run Research phase (low issue count)');
  items.push(...getSecurityItems(r.security));
  items.push(...getQualityItems(r.quality));
  return items;
}

function applyFixes(projectRoot: string, result: SystemReviewResult): string[] {
  const fixes: string[] = [];
  if (!result.quality.lintPass) {
    const lf = safeExec('pnpm lint:fix', projectRoot);
    if (lf !== null && !lf.includes('error')) fixes.push('Auto-fixed ESLint issues');
  }
  return fixes;
}

/** Runs the system review. */
export function runSystemReview(options: SystemReviewOptions = {}): SystemReviewResult {
  const pr = options.projectRoot ?? process.cwd();
  const techniques = runPhase1(pr),
    docs = runPhase2(pr),
    issues = runPhase3(),
    security = runPhase4(pr),
    quality = runPhase5(pr);
  const partial = { timestamp: new Date(), techniques, docs, issues, security, quality };
  const actionItems = generateActionItems(partial);
  const fixesApplied =
    options.fix === true ? applyFixes(pr, { ...partial, actionItems, fixesApplied: [] }) : [];
  return { ...partial, actionItems, fixesApplied };
}

/** Main system-review command. */
export function systemReviewCommand(options: SystemReviewOptions = {}): number {
  const result = runSystemReview(options);
  printResult(result);
  if (options.createIssue === true) {
    process.stdout.write(`${colors.cyan}Creating GitHub issue...${colors.reset}\n`);
    const url = createIssue(result);
    process.stdout.write(
      url !== null
        ? `${formatStatus('pass')} Issue created: ${url}\n`
        : `${formatStatus('fail')} Failed to create issue\n`
    );
    process.stdout.write('\n');
  }
  return calculateHealthScore(result) >= HEALTH_SCORE_WARN_THRESHOLD ? 0 : 1;
}
