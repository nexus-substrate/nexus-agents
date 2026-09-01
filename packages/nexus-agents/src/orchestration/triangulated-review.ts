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
import {
  getErrorMessage,
  ok,
  err,
  createLogger,
  getTimeProvider,
  getRandomProvider,
  extractJsonArray,
  withStep,
} from '../core/index.js';

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
import {
  packDiffForReview,
  type DiffReviewPacking,
  type PrReviewCoverage,
} from '../mcp/tools/pr-review-diff-budget.js';

/**
 * Bytes of the diff the reviewers are shown.
 *
 * Unchanged from the value that was inline as `diff.slice(0, 6000)`, so
 * behaviour on ordinary diffs is identical. What changed is that exceeding it
 * is disclosed — to the reviewers in the prompt, and on the result — instead of
 * being applied silently beneath a prompt that says "Diff to review" (#5301).
 *
 * `packDiffForReview` rather than a character slice because this is a diff:
 * it packs WHOLE files, so no reviewer receives a corrupted mid-hunk fragment
 * that reads as complete.
 */
const TRIANGULATED_DIFF_BUDGET = 6000;

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

  return withStep(
    {
      name: 'triangulated-review',
      kind: 'consensus.vote',
      attrs: {
        clis: selectedClis.map((s) => s.cli),
        diffLength: diff.length,
      },
    },
    async (ctx) => {
      const startTime = getTimeProvider().now();

      // Packed ONCE, outside the per-CLI map. Every reviewer must see the same
      // subset: corroboration across CLIs is the signal a reader trusts most,
      // and it would mean much less if the CLIs had been shown different files.
      const packing = packDiffForReview(diff, TRIANGULATED_DIFF_BUDGET);
      const partitions = await dispatchReviews(packing, selectedClis, config, logger);

      const totalDurationMs = getTimeProvider().now() - startTime;
      const clisUsed = partitions.filter((p) => p.success).map((p) => p.cli);

      // Collect all findings and deduplicate
      const allFindings = partitions.flatMap((p) => (p.success ? [...p.findings] : []));
      const deduplicated = deduplicateFindings(allFindings, partitions, config.lineProximity);

      const countBySeverity = countFindings(deduplicated);
      const summary = buildSummary(deduplicated, clisUsed, packing.coverage);

      // Record outcomes (best-effort)
      recordReviewOutcomes(partitions);

      const result: TriangulatedReviewResult = {
        partitions,
        findings: deduplicated,
        clisUsed,
        totalDurationMs,
        summary,
        countBySeverity,
        ...(packing.coverage === undefined ? {} : { coverage: packing.coverage }),
      };

      ctx.setSummary(
        `${String(deduplicated.length)} findings (${String(allFindings.length)} raw), ${String(clisUsed.length)}/${String(selectedClis.length)} CLIs`
      );
      return ok(result);
    }
  );
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

/**
 * Per-CLI review priority, from the specialization matrix.
 *
 * This is a CONSTANT keyed on the CLI's name, not a measurement of anything the
 * model produced (#5119). It is a prior — "when two CLIs report the same issue
 * and we must keep one, prefer the one we expect to be better at review" — and
 * every finding from a given CLI carries the identical value.
 */
const CLI_REVIEW_PRIORITY: Readonly<Record<CliName, number>> = {
  codex: 0.15,
  claude: 0.1,
  gemini: 0.05,
  opencode: 0.08,
};

function getCliPriority(cli: CliName): number {
  return CLI_REVIEW_PRIORITY[cli];
}

/**
 * The reporting CLI's priority, or 0 for a finding from an unrecognized source.
 *
 * Falls back rather than throwing: `expertId` is a plain string on
 * {@link ReviewFinding}, so a finding reaching dedup from a non-CLI producer is
 * representable. 0 sorts it below every configured CLI, which is the
 * conservative choice — an unknown source never displaces a known one.
 */
function findingPriority(finding: ReviewFinding): number {
  // Indexed as a plain string rather than through an `as CliName` cast. The
  // cast would ASSERT that every expertId is a configured CLI, which is exactly
  // the thing not known here — and it made the `?? 0` look unreachable to
  // eslint, since `Record<CliName, number>` can never miss. Widening the index
  // type instead keeps the fallback honest and reachable.
  const lookup: Readonly<Record<string, number | undefined>> = CLI_REVIEW_PRIORITY;
  return lookup[finding.expertId] ?? 0;
}

/** Builds the review prompt for a given CLI perspective. */
function buildReviewPrompt(packedDiff: string, note: string, cli: CliName): string {
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
    ...(note === '' ? [] : [note]),
    'Diff to review:',
    '```',
    packedDiff,
    '```',
    '',
    'Return ONLY a JSON array of findings. No markdown fences.',
  ].join('\n');
}

/** Dispatches reviews to all selected CLIs in parallel. */
async function dispatchReviews(
  packing: DiffReviewPacking,
  selectedClis: readonly SelectedCli[],
  config: TriangulatedReviewConfig,
  logger: ILogger
): Promise<readonly CliReviewPartition[]> {
  const promises = selectedClis.map(async ({ cli, adapter }): Promise<CliReviewPartition> => {
    const startTime = getTimeProvider().now();
    const prompt = buildReviewPrompt(packing.packedDiff, packing.note, cli);
    // #3026 finding 2: cancel the adapter call when the race timeout
    // wins so the subprocess doesn't keep running past its decision.
    const controller = new AbortController();

    try {
      const result: Result<CliResponse, CliError> = await Promise.race([
        adapter.execute({ content: prompt }, { signal: controller.signal }),
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
    } finally {
      controller.abort();
    }
  });

  return Promise.all(promises);
}

function createTimeout(ms: number, cli: CliName): Promise<never> {
  return new Promise((_, reject) => {
    // .unref() so a winning fast review doesn't keep the event loop alive waiting
    // on this ghost timer. Closes #2976.
    setTimeout(() => {
      reject(new Error(`Review timeout after ${String(ms)}ms for ${cli}`));
    }, ms).unref();
  });
}

const moduleLogger = createLogger({ component: 'triangulated-review' });

/** Parses CLI output into structured findings. */
function parseFindings(text: string, cli: CliName): ReviewFinding[] {
  try {
    // ReDoS-safe extraction (#1912): indexOf/lastIndexOf is O(n) vs regex
    // backtracking. Previously `/\[[\s\S]*\]/` — same class as #1899.
    const candidate = extractJsonArray(text);
    if (candidate === undefined) return [];

    const parsed: unknown = JSON.parse(candidate);
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
        // NOT a measurement (#5119): a per-CLI constant, identical for every
        // finding this CLI reports, never informed by the model's output. It is
        // a source prior. Dedup ordering deliberately does not read this field
        // — see `pickBestFinding`.
        confidence: 0.7 + getCliPriority(cli),
      }));
  } catch (e: unknown) {
    moduleLogger.warn('Failed to parse CLI review findings as JSON; discarding', {
      cli,
      error: getErrorMessage(e),
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

/**
 * Chooses which of two duplicate findings survives dedup — a deterministic
 * tiebreak on the reporting CLI's configured priority (#5119).
 *
 * It reads {@link CLI_REVIEW_PRIORITY} directly rather than comparing
 * `confidence`, which is what it used to do. Those were the same comparison,
 * because a triangulated finding's `confidence` is `0.7 + priority(cli)` — a
 * per-CLI constant that never consults the model's output. So the old line read
 * as if it weighed evidence while in fact it only compared CLI names: a better
 * finding from a lower-priority CLI lost to a worse one, deterministically and
 * invisibly.
 *
 * Behaviour is unchanged today. What changes is that the tiebreak no longer
 * DEPENDS on the confidence field, so if `confidence` later becomes a real
 * per-finding measurement, dedup ordering will not silently change meaning
 * along with it. Two mechanisms that happen to agree are not one mechanism.
 *
 * Ties keep `existing`, making the result independent of the order findings
 * arrive in.
 */
function pickBestFinding(existing: ReviewFinding, candidate: ReviewFinding): ReviewFinding {
  return findingPriority(candidate) > findingPriority(existing) ? candidate : existing;
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
  clisUsed: readonly CliName[],
  coverage?: PrReviewCoverage
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

  // A partial review presented like a whole-diff one is the failure this
  // guards against — the corroboration count above is exactly the number a
  // reader treats as independent confirmation.
  if (coverage?.partial === true) {
    lines.push(
      '',
      `**Partial review:** ${String(coverage.reviewedFiles)} of ${String(coverage.totalFiles)} ` +
        `files reviewed (security-prioritized). Findings cover only the reviewed files.`
    );
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
        id: `rev-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 8)}`,
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
