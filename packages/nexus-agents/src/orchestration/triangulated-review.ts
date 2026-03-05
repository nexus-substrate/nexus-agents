/**
 * nexus-agents/orchestration - Triangulated Code Review
 *
 * Dispatches code reviews across multiple CLIs with different review
 * perspectives. Merges findings with file+line proximity deduplication
 * and confidence weighting from the task specialization matrix.
 *
 * @module orchestration/triangulated-review
 * (Source: Issue #864 — Code review triangulation across CLIs)
 */

import type { Result, ILogger } from '../core/index.js';
import { getErrorMessage, ok, err, createLogger, getTimeProvider } from '../core/index.js';

import type { ICliAdapter, CliName, CliResponse, CliError } from '../cli-adapters/types.js';
import type { ReviewFinding } from '../dogfooding/pr-review-types.js';
import { SEVERITY_ORDER } from '../dogfooding/pr-review-types.js';
import { getOutcomeStore, categorizeOutcomeErrorMessage } from './outcomes/index.js';
import type {
  CliReviewPartition,
  DeduplicatedFinding,
  TriangulatedReviewResult,
  TriangulatedReviewConfig,
  ReviewSeverity,
} from './triangulated-review-types.js';
import { createDefaultReviewConfig } from './triangulated-review-types.js';

// ============================================================================
// Public API
// ============================================================================

/** Options for executeTriangulatedReview. */
export interface ReviewOptions {
  readonly config?: Partial<TriangulatedReviewConfig>;
  readonly logger?: ILogger;
}

/**
 * Dispatches a code review to multiple CLIs and merges findings.
 *
 * @param diff - The code diff or file content to review
 * @param adapters - Map of available CLI adapters
 * @param options - Optional configuration
 * @returns Triangulated review result with deduplicated findings
 */
export async function executeTriangulatedReview(
  diff: string,
  adapters: ReadonlyMap<CliName, ICliAdapter>,
  options?: ReviewOptions
): Promise<Result<TriangulatedReviewResult, Error>> {
  const logger = options?.logger ?? createLogger({ component: 'triangulated-review' });
  const config = { ...createDefaultReviewConfig(), ...options?.config };

  const selectedClis = selectReviewClis(adapters, config.maxClis);
  if (selectedClis.length === 0) {
    return err(new Error('No CLI adapters available for review'));
  }

  logger.info('Starting triangulated review', {
    clis: selectedClis.map((s) => s.cli),
    diffLength: diff.length,
  });

  const startTime = getTimeProvider().now();

  const partitions = await dispatchReviews(diff, selectedClis, config, logger);

  const totalDurationMs = getTimeProvider().now() - startTime;
  const clisUsed = partitions.filter((p) => p.success).map((p) => p.cli);

  // Collect all findings and deduplicate
  const allFindings = partitions.flatMap((p) => (p.success ? [...p.findings] : []));
  const deduplicated = deduplicateFindings(allFindings, partitions, config.lineProximity);

  const countBySeverity = countFindings(deduplicated);
  const summary = buildSummary(deduplicated, clisUsed);

  // Record outcomes (best-effort)
  recordReviewOutcomes(partitions);

  const result: TriangulatedReviewResult = {
    partitions,
    findings: deduplicated,
    clisUsed,
    totalDurationMs,
    summary,
    countBySeverity,
  };

  logger.info('Triangulated review completed', {
    totalDurationMs,
    clisUsed,
    totalFindings: allFindings.length,
    deduplicatedFindings: deduplicated.length,
  });

  return ok(result);
}

// ============================================================================
// Internal Helpers
// ============================================================================

interface SelectedCli {
  readonly cli: CliName;
  readonly adapter: ICliAdapter;
}

/** Review-preferred CLI order: codex (code patterns), claude (security), gemini (docs). */
const REVIEW_CLI_ORDER: readonly CliName[] = ['codex', 'claude', 'gemini'];

function selectReviewClis(
  adapters: ReadonlyMap<CliName, ICliAdapter>,
  maxCount: number
): readonly SelectedCli[] {
  const selected: SelectedCli[] = [];
  for (const cli of REVIEW_CLI_ORDER) {
    if (selected.length >= maxCount) break;
    const adapter = adapters.get(cli);
    if (adapter !== undefined) {
      selected.push({ cli, adapter });
    }
  }
  return selected;
}

/** Confidence bonus per CLI for code review (from specialization matrix). */
const CLI_REVIEW_BONUS: Readonly<Record<CliName, number>> = {
  codex: 0.15,
  claude: 0.1,
  gemini: 0.05,
  opencode: 0.08,
};

function getCliBonus(cli: CliName): number {
  return CLI_REVIEW_BONUS[cli];
}

/** Builds the review prompt for a given CLI perspective. */
function buildReviewPrompt(diff: string, cli: CliName): string {
  const perspectives: Record<CliName, string> = {
    codex: 'Focus on: code logic bugs, performance issues, test coverage gaps.',
    claude: 'Focus on: security vulnerabilities, architectural concerns, edge cases.',
    gemini: 'Focus on: documentation quality, API misuse, naming conventions.',
    opencode: 'Focus on: cross-provider best practices, code quality, and maintainability.',
  };

  const perspective = perspectives[cli];

  return [
    `You are reviewing code changes. ${perspective}`,
    '',
    'Return findings as a JSON array. Each finding must have:',
    '{ "category": "security"|"performance"|"code_quality"|"testing"|"documentation"|"architecture",',
    '  "severity": "critical"|"high"|"medium"|"low"|"info",',
    '  "title": "short title", "description": "details",',
    '  "file": "path/to/file" (if known), "line": 42 (if known),',
    '  "suggestion": "how to fix" (optional) }',
    '',
    'Diff to review:',
    '```',
    diff.slice(0, 6000),
    '```',
    '',
    'Return ONLY a JSON array of findings. No markdown fences.',
  ].join('\n');
}

/** Dispatches reviews to all selected CLIs in parallel. */
async function dispatchReviews(
  diff: string,
  selectedClis: readonly SelectedCli[],
  config: TriangulatedReviewConfig,
  logger: ILogger
): Promise<readonly CliReviewPartition[]> {
  const promises = selectedClis.map(async ({ cli, adapter }): Promise<CliReviewPartition> => {
    const startTime = getTimeProvider().now();
    const prompt = buildReviewPrompt(diff, cli);

    try {
      const result: Result<CliResponse, CliError> = await Promise.race([
        adapter.execute({ content: prompt }),
        createTimeout(config.perCliTimeoutMs, cli),
      ]);

      const durationMs = getTimeProvider().now() - startTime;

      if (!result.ok) {
        logger.warn('Review CLI failed', { cli, error: result.error.message });
        return {
          cli,
          success: false,
          findings: [],
          summary: '',
          durationMs,
          error: result.error.message,
        };
      }

      const text = result.value.text.slice(0, config.maxOutputCharsPerCli);
      const findings = parseFindings(text, cli);
      const model = result.value.model;

      return model !== undefined
        ? { cli, success: true, findings, summary: text, durationMs, model }
        : { cli, success: true, findings, summary: text, durationMs };
    } catch (error) {
      const durationMs = getTimeProvider().now() - startTime;
      const message = getErrorMessage(error);
      logger.warn('Review CLI threw', { cli, error: message });
      return { cli, success: false, findings: [], summary: '', durationMs, error: message };
    }
  });

  return Promise.all(promises);
}

function createTimeout(ms: number, cli: CliName): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Review timeout after ${String(ms)}ms for ${cli}`));
    }, ms);
  });
}

const moduleLogger = createLogger({ component: 'triangulated-review' });

/** Parses CLI output into structured findings. */
function parseFindings(text: string, cli: CliName): ReviewFinding[] {
  try {
    // Try to extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch === null) return [];

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item, idx) => ({
        id: `${cli}-${String(idx)}`,
        category: validateCategory(item.category),
        severity: validateSeverity(item.severity),
        title: typeof item.title === 'string' ? item.title : 'Untitled finding',
        description: typeof item.description === 'string' ? item.description : '',
        ...(typeof item.file === 'string' ? { file: item.file } : {}),
        ...(typeof item.line === 'number' ? { line: item.line } : {}),
        ...(typeof item.suggestion === 'string' ? { suggestion: item.suggestion } : {}),
        expertId: cli,
        confidence: 0.7 + getCliBonus(cli),
      }));
  } catch (e: unknown) {
    moduleLogger.warn('Failed to parse CLI review findings as JSON; discarding', {
      cli,
      error: String(e),
    });
    return [];
  }
}

const VALID_CATEGORIES = new Set([
  'security',
  'performance',
  'code_quality',
  'testing',
  'documentation',
  'architecture',
]);
const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);

function validateCategory(value: unknown): ReviewFinding['category'] {
  if (typeof value === 'string' && VALID_CATEGORIES.has(value)) {
    return value as ReviewFinding['category'];
  }
  return 'code_quality';
}

function validateSeverity(value: unknown): ReviewFinding['severity'] {
  if (typeof value === 'string' && VALID_SEVERITIES.has(value)) {
    return value as ReviewFinding['severity'];
  }
  return 'medium';
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Deduplicates findings by file+line proximity and category.
 * Findings from different CLIs at nearby lines in the same file
 * with the same category are merged.
 */
function deduplicateFindings(
  allFindings: readonly ReviewFinding[],
  partitions: readonly CliReviewPartition[],
  lineProximity: number
): readonly DeduplicatedFinding[] {
  if (allFindings.length === 0) return [];

  const groups: DeduplicatedFinding[] = [];

  for (const finding of allFindings) {
    const match = findDuplicate(groups, finding, lineProximity);
    if (match !== undefined) {
      // Add this CLI to the existing group
      const cli = finding.expertId as CliName;
      if (!match.reportedBy.includes(cli)) {
        const updated: DeduplicatedFinding = {
          finding: pickBestFinding(match.finding, finding),
          reportedBy: [...match.reportedBy, cli],
          weightedConfidence: Math.min(1, match.weightedConfidence + 0.1),
          corroborationCount: match.corroborationCount + 1,
        };
        const idx = groups.indexOf(match);
        groups[idx] = updated;
      }
    } else {
      groups.push({
        finding,
        reportedBy: [finding.expertId as CliName],
        weightedConfidence: finding.confidence,
        corroborationCount: 1,
      });
    }
  }

  // Sort by severity (descending) then confidence (descending)
  return groups.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[b.finding.severity] - SEVERITY_ORDER[a.finding.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.weightedConfidence - a.weightedConfidence;
  });
}

function findDuplicate(
  groups: readonly DeduplicatedFinding[],
  finding: ReviewFinding,
  lineProximity: number
): DeduplicatedFinding | undefined {
  for (const group of groups) {
    if (isSimilar(group.finding, finding, lineProximity)) {
      return group;
    }
  }
  return undefined;
}

function isSimilar(a: ReviewFinding, b: ReviewFinding, lineProximity: number): boolean {
  if (a.category !== b.category) return false;
  if (a.file !== b.file) return false;
  if (a.file === undefined) {
    // Both have no file — match on title similarity
    return a.title.toLowerCase() === b.title.toLowerCase();
  }
  // Same file + category — check line proximity
  if (a.line === undefined || b.line === undefined) return true;
  return Math.abs(a.line - b.line) <= lineProximity;
}

function pickBestFinding(existing: ReviewFinding, candidate: ReviewFinding): ReviewFinding {
  // Pick the one with higher confidence
  return candidate.confidence > existing.confidence ? candidate : existing;
}

// ============================================================================
// Summary & Counting
// ============================================================================

function countFindings(
  deduplicated: readonly DeduplicatedFinding[]
): Record<ReviewSeverity, number> {
  const counts: Record<ReviewSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const d of deduplicated) {
    counts[d.finding.severity]++;
  }
  return counts;
}

function buildSummary(
  deduplicated: readonly DeduplicatedFinding[],
  clisUsed: readonly CliName[]
): string {
  if (clisUsed.length === 0) {
    return 'All review CLIs failed. No findings to report.';
  }

  const total = deduplicated.length;
  const corroborated = deduplicated.filter((d) => d.corroborationCount > 1).length;
  const critical = deduplicated.filter((d) => d.finding.severity === 'critical').length;
  const high = deduplicated.filter((d) => d.finding.severity === 'high').length;

  const lines = [
    `## Triangulated Code Review (${String(clisUsed.length)} CLIs)`,
    '',
    `**${String(total)} findings** (${String(corroborated)} corroborated by multiple CLIs)`,
  ];

  if (critical > 0 || high > 0) {
    lines.push(`**Attention:** ${String(critical)} critical, ${String(high)} high severity`);
  }

  lines.push('', `CLIs: ${clisUsed.join(', ')}`);

  return lines.join('\n');
}

// ============================================================================
// Outcome Recording
// ============================================================================

function recordReviewOutcomes(partitions: readonly CliReviewPartition[]): void {
  try {
    const store = getOutcomeStore();
    for (const p of partitions) {
      store.append({
        id: `rev-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
        cli: p.cli,
        category: 'code_review',
        model: p.model ?? 'unknown',
        success: p.success,
        durationMs: p.durationMs,
        timestamp: new Date(getTimeProvider().now()).toISOString(),
        source: 'delegate',
        ...(!p.success && p.error !== undefined
          ? {
              failureCategory: categorizeOutcomeErrorMessage(p.error),
              errorMessage: p.error.slice(0, 500),
            }
          : {}),
      });
    }
  } catch (error: unknown) {
    createLogger({ component: 'triangulated-review' }).warn('Failed to record review outcomes', {
      error: getErrorMessage(error),
      partitionCount: partitions.length,
    });
  }
}
