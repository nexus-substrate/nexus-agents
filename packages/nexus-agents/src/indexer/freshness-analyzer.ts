/**
 * nexus-agents/indexer - Freshness Analyzer
 *
 * Analyzes documentation freshness by comparing doc modification dates
 * against source file changes.
 *
 * (Source: Epic #261, Issue #269)
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { safeExecSandboxed } from '../cli/sandbox-exec.js';

// ============================================================================
// Types
// ============================================================================

/** Status of a document's freshness. */
export type FreshnessStatus = 'fresh' | 'stale' | 'warning' | 'unknown';

/** Information about a tracked document. */
export interface DocumentFreshness {
  readonly path: string;
  readonly lastModified: string | null;
  readonly lastModifiedRelative: string | null;
  readonly daysSinceModified: number | null;
  readonly status: FreshnessStatus;
  readonly dependencies: readonly string[];
  readonly newerDependencies: readonly string[];
}

/** Result of the freshness analysis. */
export interface FreshnessAnalysisResult {
  readonly documents: readonly DocumentFreshness[];
  readonly summary: {
    readonly total: number;
    readonly fresh: number;
    readonly warning: number;
    readonly stale: number;
    readonly unknown: number;
  };
  readonly analyzedAt: string;
}

/** Configuration for tracked documents. */
export interface TrackedDocument {
  readonly path: string;
  readonly dependencies: readonly string[];
  readonly staleThresholdDays: number;
  readonly warningThresholdDays: number;
}

// ============================================================================
// Default Tracked Documents
// ============================================================================

/** Documents to track with their source dependencies. */
export const DEFAULT_TRACKED_DOCUMENTS: readonly TrackedDocument[] = [
  {
    path: 'README.md',
    dependencies: ['packages/nexus-agents/src/index.ts', 'packages/nexus-agents/package.json'],
    staleThresholdDays: 60,
    warningThresholdDays: 30,
  },
  {
    path: 'ARCHITECTURE.md',
    dependencies: [
      'packages/nexus-agents/src/core/',
      'packages/nexus-agents/src/agents/',
      'packages/nexus-agents/src/mcp/',
    ],
    staleThresholdDays: 30,
    warningThresholdDays: 14,
  },
  {
    path: 'CLAUDE.md',
    dependencies: ['packages/nexus-agents/src/cli/', 'packages/nexus-agents/src/mcp/tools/'],
    staleThresholdDays: 30,
    warningThresholdDays: 14,
  },
  {
    path: 'CODING_STANDARDS.md',
    dependencies: [],
    staleThresholdDays: 90,
    warningThresholdDays: 60,
  },
  {
    path: 'docs/ENTRYPOINTS.md',
    dependencies: [
      'packages/nexus-agents/src/cli-commands.ts',
      'packages/nexus-agents/src/cli/',
      'packages/nexus-agents/src/mcp/tools/',
    ],
    staleThresholdDays: 14,
    warningThresholdDays: 7,
  },
  {
    path: 'docs/ALIGNMENT_ROADMAP.md',
    dependencies: ['docs/research/registry/techniques.yaml'],
    staleThresholdDays: 30,
    warningThresholdDays: 14,
  },
  {
    path: 'docs/research/RESEARCH_INDEX.md',
    dependencies: ['docs/research/registry/papers.yaml', 'docs/research/registry/techniques.yaml'],
    staleThresholdDays: 14,
    warningThresholdDays: 7,
  },
];

// ============================================================================
// Git Helpers
// ============================================================================

/**
 * Get the last commit date for a file/directory.
 */
function getLastCommitDate(filePath: string): Date | null {
  const output = safeExecSandboxed(`git log -1 --format=%ci -- "${filePath}"`, {
    context: 'git',
  });

  if (output === null || output === '') {
    return null;
  }

  return new Date(output);
}

/**
 * Get human-readable relative time string.
 */
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${String(diffDays)} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 week ago' : `${String(weeks)} weeks ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? '1 month ago' : `${String(months)} months ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return years === 1 ? '1 year ago' : `${String(years)} years ago`;
  }
}

/**
 * Calculate days since a date.
 */
function daysSince(date: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if a dependency has been modified more recently than the document.
 */
function isNewerThan(dependencyPath: string, documentDate: Date): boolean {
  const depDate = getLastCommitDate(dependencyPath);
  if (depDate === null) {
    return false;
  }
  return depDate > documentDate;
}

// ============================================================================
// Freshness Analysis
// ============================================================================

/**
 * Create an unknown freshness result for missing or untracked documents.
 */
function createUnknownFreshness(tracked: TrackedDocument): DocumentFreshness {
  return {
    path: tracked.path,
    lastModified: null,
    lastModifiedRelative: null,
    daysSinceModified: null,
    status: 'unknown',
    dependencies: tracked.dependencies,
    newerDependencies: [],
  };
}

/**
 * Determine freshness status based on age and dependency changes.
 */
function determineFreshnessStatus(
  days: number,
  newerDepsCount: number,
  tracked: TrackedDocument
): FreshnessStatus {
  if (newerDepsCount > 0) return 'stale';
  if (days >= tracked.staleThresholdDays) return 'stale';
  if (days >= tracked.warningThresholdDays) return 'warning';
  return 'fresh';
}

/**
 * Analyze freshness of a single document.
 */
function analyzeDocument(tracked: TrackedDocument, projectRoot: string): DocumentFreshness {
  const fullPath = path.join(projectRoot, tracked.path);

  if (!fs.existsSync(fullPath)) {
    return createUnknownFreshness(tracked);
  }

  const lastModifiedDate = getLastCommitDate(tracked.path);
  if (lastModifiedDate === null) {
    return createUnknownFreshness(tracked);
  }

  const days = daysSince(lastModifiedDate);
  const newerDeps = tracked.dependencies.filter((dep) => isNewerThan(dep, lastModifiedDate));
  const status = determineFreshnessStatus(days, newerDeps.length, tracked);

  return {
    path: tracked.path,
    lastModified: lastModifiedDate.toISOString().split('T')[0] ?? null,
    lastModifiedRelative: getRelativeTime(lastModifiedDate),
    daysSinceModified: days,
    status,
    dependencies: tracked.dependencies,
    newerDependencies: newerDeps,
  };
}

/**
 * Analyze freshness of all tracked documents.
 */
export function analyzeFreshness(
  trackedDocuments: readonly TrackedDocument[] = DEFAULT_TRACKED_DOCUMENTS,
  projectRoot: string = process.cwd()
): FreshnessAnalysisResult {
  const documents = trackedDocuments.map((tracked) => analyzeDocument(tracked, projectRoot));

  const summary = {
    total: documents.length,
    fresh: documents.filter((d) => d.status === 'fresh').length,
    warning: documents.filter((d) => d.status === 'warning').length,
    stale: documents.filter((d) => d.status === 'stale').length,
    unknown: documents.filter((d) => d.status === 'unknown').length,
  };

  return {
    documents,
    summary,
    analyzedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Formatting
// ============================================================================

const STATUS_ICONS: Record<FreshnessStatus, string> = {
  fresh: '✓',
  warning: '⚠',
  stale: '✗',
  unknown: '?',
};

const STATUS_COLORS: Record<FreshnessStatus, string> = {
  fresh: '\x1b[32m', // green
  warning: '\x1b[33m', // yellow
  stale: '\x1b[31m', // red
  unknown: '\x1b[90m', // gray
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

/**
 * Format freshness analysis as a table.
 */
export function formatFreshnessTable(result: FreshnessAnalysisResult): string {
  const lines: string[] = [];

  lines.push(`${BOLD}Documentation Freshness Dashboard${RESET}`);
  lines.push(`Analyzed: ${result.analyzedAt.split('T')[0] ?? ''}`);
  lines.push('');

  // Summary
  const { summary } = result;
  lines.push(
    `${BOLD}Summary:${RESET} ${String(summary.fresh)} fresh, ${String(summary.warning)} warnings, ${String(summary.stale)} stale, ${String(summary.unknown)} unknown`
  );
  lines.push('');

  // Table header
  lines.push(
    `${BOLD}Document${RESET}                              ${BOLD}Status${RESET}    ${BOLD}Last Modified${RESET}    ${BOLD}Issues${RESET}`
  );
  lines.push('-'.repeat(90));

  // Table rows
  for (const doc of result.documents) {
    const statusIcon = STATUS_ICONS[doc.status];
    const statusColor = STATUS_COLORS[doc.status];
    const statusStr = `${statusColor}${statusIcon}${RESET}`;

    const pathStr = doc.path.padEnd(35);
    const modifiedStr = (doc.lastModifiedRelative ?? 'unknown').padEnd(16);
    const issuesStr =
      doc.newerDependencies.length > 0
        ? `${DIM}${String(doc.newerDependencies.length)} newer deps${RESET}`
        : '';

    lines.push(`${pathStr} ${statusStr}         ${modifiedStr} ${issuesStr}`);
  }

  // Details for stale documents
  const staleDocs = result.documents.filter(
    (d) => d.status === 'stale' && d.newerDependencies.length > 0
  );
  if (staleDocs.length > 0) {
    lines.push('');
    lines.push(`${BOLD}Stale Document Details:${RESET}`);
    for (const doc of staleDocs) {
      lines.push(`  ${doc.path}:`);
      for (const dep of doc.newerDependencies) {
        lines.push(`    - ${DIM}${dep}${RESET}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format freshness analysis as JSON.
 */
export function formatFreshnessJson(result: FreshnessAnalysisResult): string {
  return JSON.stringify(result, null, 2);
}
