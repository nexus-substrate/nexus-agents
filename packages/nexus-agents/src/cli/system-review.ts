/**
 * nexus-agents system-review command
 *
 * Automated System Review per CLAUDE.md System Review Protocol.
 * Runs 5-phase checklist and optionally creates GitHub issue.
 *
 * (Source: Issue #211, Process Automation Epic #209)
 * (Consensus: 8.0/10, 5/5 UNANIMOUS APPROVE)
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  SystemReviewOptions,
  SystemReviewResult,
  TechniqueStats,
  DocFreshness,
  IssueHealth,
  SecurityAudit,
  CodeQuality,
  GhIssueItem,
  AuditMetadata,
  CoverageData,
} from './system-review-types.js';
import { analyzeFreshness } from '../indexer/freshness-analyzer.js';

export type { SystemReviewOptions, SystemReviewResult } from './system-review-types.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

const symbols = {
  check: process.platform === 'win32' ? '√' : '✓',
  cross: process.platform === 'win32' ? '×' : '✗',
  warn: process.platform === 'win32' ? '!' : '⚠',
  bullet: process.platform === 'win32' ? '*' : '•',
};

function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

function formatStatus(status: 'pass' | 'warn' | 'fail'): string {
  const map = {
    pass: colors.green + symbols.check,
    warn: colors.yellow + symbols.warn,
    fail: colors.red + symbols.cross,
  };
  return map[status] + colors.reset;
}

function safeExec(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function parseGhIssueList(json: string): GhIssueItem[] {
  try {
    const p: unknown = JSON.parse(json);
    return Array.isArray(p) ? (p as GhIssueItem[]) : [];
  } catch {
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
  const openCount = openOutput !== null ? parseGhIssueList(openOutput).length : 0;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const staleOutput = safeExec(
    `gh issue list --state open --json updatedAt --jq '[.[] | select(.updatedAt < "${thirtyDaysAgo}")] | length'`
  );
  const staleCount = staleOutput !== null ? parseInt(staleOutput, 10) : 0;
  const byLabel: Record<string, number> = {};
  for (const label of ['epic', 'bug', 'enhancement', 'research', 'documentation']) {
    const out = safeExec(`gh issue list --state open --label ${label} --json number`);
    byLabel[label] = out !== null ? parseGhIssueList(out).length : 0;
  }
  return { openCount, staleCount, byLabel };
}

function runPhase4(projectRoot: string): SecurityAudit {
  const def = { totalVulns: 0, high: 0, moderate: 0, low: 0 };
  const out = safeExec(`cd "${projectRoot}" && pnpm audit --json 2>/dev/null`);
  if (out === null) return def;
  try {
    const a: unknown = JSON.parse(out);
    const m = (a as { metadata?: AuditMetadata }).metadata?.vulnerabilities ?? {};
    return {
      totalVulns: m.total ?? 0,
      high: m.high ?? 0,
      moderate: m.moderate ?? 0,
      low: m.low ?? 0,
    };
  } catch {
    return def;
  }
}

function runPhase5(projectRoot: string): CodeQuality {
  const tc = safeExec(`cd "${projectRoot}" && pnpm typecheck 2>&1`);
  const lt = safeExec(`cd "${projectRoot}" && pnpm lint 2>&1`);
  let cov: number | null = null;
  const cf = path.join(projectRoot, 'packages/nexus-agents/coverage/coverage-summary.json');
  if (fs.existsSync(cf)) {
    try {
      const c: unknown = JSON.parse(fs.readFileSync(cf, 'utf-8'));
      cov = (c as CoverageData).total?.lines?.pct ?? null;
    } catch {
      /* ignore */
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
  if (q.coveragePercent !== null && q.coveragePercent < 80)
    items.push(`Improve coverage (${q.coveragePercent.toFixed(1)}%)`);
  return items;
}

function generateActionItems(
  r: Omit<SystemReviewResult, 'actionItems' | 'fixesApplied'>
): string[] {
  const items: string[] = [];
  if (r.techniques.notStarted > 5)
    items.push(`Review ${String(r.techniques.notStarted)} not-started techniques`);

  // Enhanced doc staleness with source dependency info (Epic #261)
  for (const d of r.docs) {
    if (d.status === 'stale') {
      const newerCount = d.newerDependencies?.length ?? 0;
      if (newerCount > 0) {
        items.push(`Update ${d.file} (${String(newerCount)} source files changed)`);
      } else {
        items.push(`Update ${d.file} (${String(d.daysSinceUpdate)} days stale)`);
      }
    }
  }

  if (r.issues.staleCount > 0) items.push(`Review ${String(r.issues.staleCount)} stale issues`);
  if (r.issues.openCount < 5) items.push('Run Research phase (low issue count)');
  if (r.security.high > 0)
    items.push(`Address ${String(r.security.high)} high-severity vulnerabilities`);
  items.push(...getQualityItems(r.quality));
  return items;
}

function applyFixes(projectRoot: string, result: SystemReviewResult): string[] {
  const fixes: string[] = [];
  if (!result.quality.lintPass) {
    const lf = safeExec(`cd "${projectRoot}" && pnpm lint:fix 2>&1`);
    if (lf !== null && !lf.includes('error')) fixes.push('Auto-fixed ESLint issues');
  }
  return fixes;
}

function printPhase1(t: TechniqueStats): void {
  writeLine(`${colors.cyan}Phase 1: Registry Reconciliation${colors.reset}\n`);
  const tot = t.implemented + t.planned + t.notStarted + t.rejected;
  writeLine(`  Implemented: ${colors.green}${String(t.implemented)}${colors.reset}`);
  writeLine(`  Planned:     ${colors.yellow}${String(t.planned)}${colors.reset}`);
  writeLine(`  Not Started: ${colors.dim}${String(t.notStarted)}${colors.reset}`);
  writeLine(`  Rejected:    ${colors.dim}${String(t.rejected)}${colors.reset}`);
  writeLine(`  Total:       ${String(tot)}\n`);
}

function printPhase2(docs: DocFreshness[]): void {
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

function printPhase3(i: IssueHealth): void {
  writeLine(`${colors.cyan}Phase 3: Issue Health${colors.reset}\n`);
  writeLine(`  Open:  ${String(i.openCount)}`);
  writeLine(
    `  Stale: ${i.staleCount > 0 ? colors.yellow : ''}${String(i.staleCount)}${colors.reset}`
  );
  for (const [l, c] of Object.entries(i.byLabel))
    if (c > 0) writeLine(`  ${colors.dim}${l}: ${String(c)}${colors.reset}`);
  writeLine('');
}

function printPhase4(s: SecurityAudit): void {
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

function printPhase5(q: CodeQuality): void {
  writeLine(`${colors.cyan}Phase 5: Code Quality${colors.reset}\n`);
  writeLine(`  ${formatStatus(q.typecheckPass ? 'pass' : 'fail')} TypeScript`);
  writeLine(`  ${formatStatus(q.lintPass ? 'pass' : 'fail')} ESLint`);
  if (q.coveragePercent !== null)
    writeLine(
      `  ${formatStatus(q.coveragePercent >= 80 ? 'pass' : 'warn')} Coverage: ${q.coveragePercent.toFixed(1)}%`
    );
  writeLine('');
}

function calculateHealthScore(r: SystemReviewResult): number {
  let s = 100;
  for (const d of r.docs) s -= d.status === 'stale' ? 5 : d.status === 'review' ? 2 : 0;
  s -= r.security.high * 20 + r.security.moderate * 5;
  if (!r.quality.typecheckPass) s -= 15;
  if (!r.quality.lintPass) s -= 15;
  if (r.quality.coveragePercent !== null && r.quality.coveragePercent < 80) s -= 10;
  s -= r.issues.staleCount * 2;
  return Math.max(0, Math.min(100, s));
}

/** Print system review results. */
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
  writeLine(
    `${colors.bold}Health Score: ${hs >= 80 ? colors.green : hs >= 60 ? colors.yellow : colors.red}${String(hs)}/100${colors.reset}\n`
  );
}

function formatDocRow(d: DocFreshness): string {
  const newerCount = d.newerDependencies?.length ?? 0;
  const statusIcon = d.status === 'current' ? '✅' : d.status === 'review' ? '⚠️' : '❌';
  const newerInfo = newerCount > 0 ? ` (${String(newerCount)} newer deps)` : '';
  return `| ${d.file} | ${String(d.daysSinceUpdate)} | ${statusIcon}${newerInfo} |`;
}

function createIssueBody(r: SystemReviewResult): string {
  const date = new Date().toISOString().split('T')[0] ?? 'unknown';
  const tz = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const s = String(calculateHealthScore(r));
  return `## System Review: ${date}\n\n**Generated:** ${tz} ET\n**Health Score:** ${s}/100\n\n---\n\n### Phase 1: Registry\n\n| Status | Count |\n|--------|-------|\n| Implemented | ${String(r.techniques.implemented)} |\n| Planned | ${String(r.techniques.planned)} |\n| Not Started | ${String(r.techniques.notStarted)} |\n| Rejected | ${String(r.techniques.rejected)} |\n\n### Phase 2: Docs\n\n| Document | Days | Status |\n|----------|------|--------|\n${r.docs.map(formatDocRow).join('\n')}\n\n### Phase 3: Issues\n\n- Open: ${String(r.issues.openCount)}\n- Stale: ${String(r.issues.staleCount)}\n\n### Phase 4: Security\n\n- High: ${String(r.security.high)}\n- Moderate: ${String(r.security.moderate)}\n- Low: ${String(r.security.low)}\n\n### Phase 5: Quality\n\n- TypeScript: ${r.quality.typecheckPass ? '✅' : '❌'}\n- ESLint: ${r.quality.lintPass ? '✅' : '❌'}\n- Coverage: ${r.quality.coveragePercent !== null ? `${r.quality.coveragePercent.toFixed(1)}%` : 'Unknown'}\n\n---\n\n### Action Items\n\n${r.actionItems.length > 0 ? r.actionItems.map((i) => `- [ ] ${i}`).join('\n') : '_No action items_'}\n\n---\n\n_Generated by \`nexus-agents system-review\`_`;
}

function createIssue(result: SystemReviewResult): string | null {
  const date = new Date().toISOString().split('T')[0] ?? 'unknown';
  const body = createIssueBody(result).replace(/"/g, '\\"');
  const out = safeExec(
    `gh issue create --title "System Review: ${date}" --body "${body}" --label system-review`
  );
  if (out !== null) {
    const m = out.match(/https:\/\/github\.com\/[^\s]+/);
    return m !== null ? m[0] : null;
  }
  return null;
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
  printSystemReviewResult(result);
  if (options.createIssue === true) {
    writeLine(`${colors.cyan}Creating GitHub issue...${colors.reset}`);
    const url = createIssue(result);
    writeLine(
      url !== null
        ? `${formatStatus('pass')} Issue created: ${url}`
        : `${formatStatus('fail')} Failed to create issue`
    );
    writeLine('');
  }
  return calculateHealthScore(result) >= 60 ? 0 : 1;
}
