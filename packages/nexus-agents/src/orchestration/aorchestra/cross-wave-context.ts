/**
 * Cross-Wave Context — sanitize and format prior wave results for injection
 * into subsequent worker prompts.
 *
 * Uses a code-aware sanitizer that preserves fenced code blocks while
 * stripping prompt injection patterns from prose sections.
 *
 * @module orchestration/aorchestra/cross-wave-context
 * (Source: Issue #1308, Epic #1307)
 */

import type { WorkerResult } from './worker-dispatcher.js';
import { createLogger } from '../../core/index.js';
import {
  compressionRatio,
  distillPhaseOutput,
  formatDistillation,
} from './context-distillation.js';

const logger = createLogger({ component: 'cross-wave-context' });

// ============================================================================
// Constants
// ============================================================================

/** Maximum characters per individual worker output in prior-wave context. */
export const MAX_CHARS_PER_WORKER = 1500;

/** How many omitted roles the budget notice names before collapsing to a count (#5956). */
const MAX_NAMED_OMITTED_ROLES = 8;

/** Maximum total characters for the entire prior-wave context block. */
export const MAX_PRIOR_CONTEXT_CHARS = 6000;

/** Marker appended to a per-worker entry that hit MAX_CHARS_PER_WORKER. */
const TRUNCATED_MARKER = ' [truncated]';

/** Log message the distillation shadow record is recorded under (#5974). */
export const DISTILLATION_SHADOW_LOG_MESSAGE = 'Prior-wave distillation shadow (#5974)';

const PRIOR_WAVE_HEADER =
  '## Prior Wave Context\n\nThe following results were produced by prior wave workers. Use this context to inform your work.\n';

// ============================================================================
// Code-Aware Sanitizer
// ============================================================================

/**
 * Injection tag patterns to strip from prose (outside code blocks).
 * Matches: <system>, <human>, <assistant>, <instructions>, <img ...>, HTML comments.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /<\/?(?:system|human|assistant|instructions)(?:\s[^>]*)?>[\s\S]*?(?:<\/(?:system|human|assistant|instructions)>|$)/gi,
  /<img\b[^>]*>/gi,
  /<!--[\s\S]*?-->/g,
];

/**
 * Sanitize worker output using a code-aware approach.
 *
 * Preserves content inside fenced code blocks (```...```) while stripping
 * prompt injection patterns from prose sections. This addresses the
 * contrarian feedback that naive sanitization would corrupt valid code
 * containing XML/HTML (React components, SVGs, config files).
 *
 * @param input - Raw worker output string
 * @returns Sanitized string with code blocks intact
 */
export function sanitizeWorkerOutput(input: string): string {
  if (input === '') return '';

  // Split into code blocks and prose sections
  const segments = splitCodeBlocks(input);

  const sanitized = segments.map((segment) => {
    if (segment.isCode) {
      // Code blocks are passed through unchanged
      return segment.text;
    }
    // Prose sections get injection patterns stripped
    let text = segment.text;
    for (const pattern of INJECTION_PATTERNS) {
      // Reset lastIndex for global regexps
      pattern.lastIndex = 0;
      text = text.replace(pattern, '');
    }
    return text.replace(/\s{2,}/g, ' ').trim();
  });

  return sanitized.filter((s) => s !== '').join('\n');
}

// ============================================================================
// Code Block Splitter
// ============================================================================

interface TextSegment {
  readonly text: string;
  readonly isCode: boolean;
}

/**
 * Split text into alternating prose and code block segments.
 * Code blocks are delimited by ``` markers on their own lines.
 */
function splitCodeBlocks(input: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Match fenced code blocks: ```<optional-lang>\n...\n```
  const codeBlockRegex = /```[^\n]*\n[\s\S]*?```/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null = codeBlockRegex.exec(input);

  while (match !== null) {
    // Add prose before this code block
    if (match.index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, match.index), isCode: false });
    }
    // Add the code block
    segments.push({ text: match[0], isCode: true });
    lastIndex = match.index + match[0].length;
    match = codeBlockRegex.exec(input);
  }

  // Add remaining text after last code block.
  // Check for unterminated fence — treat everything from the opening ``` as code.
  if (lastIndex < input.length) {
    const remainder = input.slice(lastIndex);
    const unterminatedFenceIdx = remainder.indexOf('```');
    if (unterminatedFenceIdx >= 0) {
      // Prose before the unterminated fence
      if (unterminatedFenceIdx > 0) {
        segments.push({ text: remainder.slice(0, unterminatedFenceIdx), isCode: false });
      }
      // Everything from ``` onward is code (unterminated)
      segments.push({ text: remainder.slice(unterminatedFenceIdx), isCode: true });
    } else {
      segments.push({ text: remainder, isCode: false });
    }
  }

  return segments;
}

// ============================================================================
// Prior Wave Context Block Builder
// ============================================================================

/**
 * Build a formatted "Prior Wave Context" section from prior wave results.
 *
 * Only includes successful results. Each result is attributed to its role,
 * sanitized, and truncated to MAX_CHARS_PER_WORKER. Total block size is
 * capped at MAX_PRIOR_CONTEXT_CHARS.
 *
 * @param results - Results from previous wave(s)
 * @returns Formatted prior wave context block, or empty string if no valid results
 */
export function buildPriorWaveContextBlock(results: readonly WorkerResult[]): string {
  const successResults = results.filter((r) => r.status === 'success' && r.output !== '');

  if (successResults.length === 0) {
    // Log when ALL prior wave results failed — downstream workers get no context (Issue #1326)
    if (results.length > 0) {
      const failedRoles = results.map((r) => r.role);
      logger.warn('All prior wave workers failed — no context for next wave', { failedRoles });
    }
    return '';
  }

  let totalChars = PRIOR_WAVE_HEADER.length;
  const entries: string[] = [];

  const omittedRoles: string[] = [];
  const shadowInputs: ShadowInput[] = [];

  for (const result of successResults) {
    const sanitized = sanitizeWorkerOutput(result.output);
    shadowInputs.push({ role: result.role, sanitized });
    const entry = formatEntry(result.role, truncateWorkerOutput(sanitized));

    if (totalChars + entry.length > MAX_PRIOR_CONTEXT_CHARS) {
      omittedRoles.push(result.role);
      continue;
    }

    entries.push(entry);
    totalChars += entry.length;
  }

  // Shadow-first (#5974): distillation is measured against the truncation
  // that just ran, on the same sanitized input and the same budget, and the
  // record is logged. It changes nothing the model receives; the flip waits
  // on this evidence.
  logger.info(DISTILLATION_SHADOW_LOG_MESSAGE, { ...shadowDistillPriorWave(shadowInputs) });

  if (entries.length === 0) return '';

  const failures = buildFailureSummary(results, MAX_PRIOR_CONTEXT_CHARS - totalChars);
  const omitted = [...omittedRoles, ...failures.omittedRoles];

  return (
    PRIOR_WAVE_HEADER + '\n' + entries.join('\n\n') + failures.text + buildOmissionNotice(omitted)
  );
}

/** The per-worker compression step that ships today: cap + marker. */
function truncateWorkerOutput(sanitized: string): string {
  return sanitized.length > MAX_CHARS_PER_WORKER
    ? sanitized.slice(0, MAX_CHARS_PER_WORKER) + TRUNCATED_MARKER
    : sanitized;
}

function formatEntry(role: string, body: string): string {
  return `### ${role} (success)\n${body}`;
}

// ============================================================================
// Distillation Shadow (#5974)
// ============================================================================

/** One successful worker's sanitized output, as the block builder sees it. */
export interface ShadowInput {
  readonly role: string;
  readonly sanitized: string;
}

/** Per-worker measurement of truncation against distillation (#5974). */
export interface DistillationShadowEntry {
  readonly role: string;
  /** Characters after sanitization — the input both strategies compress. */
  readonly sanitizedChars: number;
  /** Characters truncation emits (cap + marker); what the model receives today. */
  readonly truncatedChars: number;
  /** Characters `formatDistillation` emits for this worker. */
  readonly distilledChars: number;
  /** Characters the flip WOULD emit: distilled, or truncated when no pattern hit. */
  readonly candidateChars: number;
  /** `compressionRatio(sanitized, truncated)`. */
  readonly truncationRatio: number;
  /** `compressionRatio(sanitized, distilled)`. */
  readonly distillationRatio: number;
  /** Items extracted per category, each capped at `distillPhaseOutput`'s 5. */
  readonly patternHits: {
    readonly decisions: number;
    readonly artifacts: number;
    readonly findings: number;
    readonly errors: number;
  };
  /** False when every pattern set came back empty — the degenerate case. */
  readonly matchedAnyPattern: boolean;
  /** True when the candidate is truncation because no pattern matched. */
  readonly fellBackToTruncation: boolean;
}

/** Block-level comparison of the two strategies under one budget (#5974). */
export interface PriorWaveDistillationShadow {
  readonly workers: readonly DistillationShadowEntry[];
  /** The aggregate budget both strategies were measured against. */
  readonly budgetChars: number;
  /** Predecessors truncation keeps whole under the budget — what ships today. */
  readonly truncationKept: number;
  /** Predecessors the candidate would keep under the same budget. */
  readonly distillationWouldKeep: number;
  /** Workers on which no distillation pattern matched. */
  readonly degenerateCount: number;
  readonly totalSanitizedChars: number;
  readonly totalTruncatedChars: number;
  readonly totalCandidateChars: number;
}

/**
 * Shadow-compute distillation against truncation for one prior-wave block.
 *
 * Pure and side-effect free so the record can be asserted directly. Runs the
 * same fit-under-budget loop `buildPriorWaveContextBlock` runs, once per
 * strategy, so `truncationKept` equals the number of entries the real block
 * emitted and `distillationWouldKeep` is the counterfactual for the flip.
 *
 * The candidate models the fallback the panel made binding: on output no
 * pattern matches, distillation degenerates to a 200-char head, so the
 * candidate for that worker is truncation and the entry says so. The raw
 * `distilledChars` is still recorded so the degenerate case stays measurable.
 *
 * Empty input yields an all-zero record with no workers. The caller decides
 * whether that is worth logging; here it is not, because "0 kept vs 0 kept"
 * would read as parity and is a measurement of nothing.
 */
export function shadowDistillPriorWave(
  inputs: readonly ShadowInput[],
  budgetChars: number = MAX_PRIOR_CONTEXT_CHARS
): PriorWaveDistillationShadow {
  const workers = inputs.map((input) => measureWorker(input));

  return {
    workers,
    budgetChars,
    truncationKept: countKeptUnderBudget(workers, (w) => w.truncatedChars, budgetChars),
    distillationWouldKeep: countKeptUnderBudget(workers, (w) => w.candidateChars, budgetChars),
    degenerateCount: workers.filter((w) => !w.matchedAnyPattern).length,
    totalSanitizedChars: workers.reduce((n, w) => n + w.sanitizedChars, 0),
    totalTruncatedChars: workers.reduce((n, w) => n + w.truncatedChars, 0),
    totalCandidateChars: workers.reduce((n, w) => n + w.candidateChars, 0),
  };
}

function measureWorker(input: ShadowInput): DistillationShadowEntry {
  const { role, sanitized } = input;
  const truncatedChars = truncateWorkerOutput(sanitized).length;

  const distillation = distillPhaseOutput(sanitized);
  const distilledChars = formatDistillation(distillation, role).length;
  const patternHits = {
    decisions: distillation.decisions.length,
    artifacts: distillation.artifacts.length,
    findings: distillation.findings.length,
    errors: distillation.errors.length,
  };
  const matchedAnyPattern =
    patternHits.decisions + patternHits.artifacts + patternHits.findings + patternHits.errors > 0;
  const fellBackToTruncation = !matchedAnyPattern;

  return {
    role,
    sanitizedChars: sanitized.length,
    truncatedChars,
    distilledChars,
    candidateChars: fellBackToTruncation ? truncatedChars : distilledChars,
    truncationRatio: compressionRatio(sanitized.length, truncatedChars),
    distillationRatio: compressionRatio(sanitized.length, distilledChars),
    patternHits,
    matchedAnyPattern,
    fellBackToTruncation,
  };
}

/**
 * The block builder's fit loop, replayed over a per-worker size. Mirrors
 * `buildPriorWaveContextBlock` exactly — header charged first, an entry that
 * would overrun is skipped rather than ending the loop — so the two counts
 * are comparable.
 */
function countKeptUnderBudget(
  workers: readonly DistillationShadowEntry[],
  sizeOf: (w: DistillationShadowEntry) => number,
  budgetChars: number
): number {
  let total = PRIOR_WAVE_HEADER.length;
  let kept = 0;
  for (const w of workers) {
    const entryChars = formatEntry(w.role, '').length + sizeOf(w);
    if (total + entryChars > budgetChars) continue;
    total += entryChars;
    kept += 1;
  }
  return kept;
}

/** Max chars for individual error snippets in failure summary. */
const MAX_ERROR_SNIPPET_CHARS = 100;

/** Build a brief summary of failed workers for cross-wave context (#1507). */
/**
 * Discloses what the context budget left out (#5956).
 *
 * The budget itself is fine — a worker prompt cannot carry every prior output.
 * Hiding it is not: the block is headed "The following results were produced
 * by prior wave workers", which reads as complete, so a downstream worker had
 * no way to tell that two of its predecessors were dropped. Per-entry
 * truncation already says `[truncated]`; whole-worker omission said nothing.
 *
 * Roles are NAMED rather than counted, so the reader can ask for a specific
 * one, and the list is capped so the notice cannot itself overrun the budget
 * it is reporting on.
 *
 * @returns The notice, or '' when nothing was omitted — the empty case must
 *          stay silent or the marker would appear on every complete block.
 */
function buildOmissionNotice(omittedRoles: readonly string[]): string {
  if (omittedRoles.length === 0) return '';

  const shown = omittedRoles.slice(0, MAX_NAMED_OMITTED_ROLES);
  const rest = omittedRoles.length - shown.length;
  const names = shown.join(', ') + (rest > 0 ? `, and ${String(rest)} more` : '');

  logger.warn('Prior-wave context truncated — worker results omitted', {
    omittedCount: omittedRoles.length,
    omittedRoles,
  });

  return `\n\n_[Context budget reached: ${String(omittedRoles.length)} prior-wave result(s) omitted — ${names}. This block is PARTIAL.]_`;
}

function buildFailureSummary(
  results: readonly WorkerResult[],
  budget: number
): { readonly text: string; readonly omittedRoles: readonly string[] } {
  const failures = results.filter((r) => r.status === 'error');
  if (failures.length === 0) return { text: '', omittedRoles: [] };
  // Below the floor nothing fits, so every failure is omitted — and the
  // caller has to be told that, not handed an empty section (#5956).
  if (budget < 50) return { text: '', omittedRoles: failures.map((f) => f.role) };

  const lines: string[] = ['\n\n### Failed Workers'];
  let used = lines[0]?.length ?? 0;
  const omittedRoles: string[] = [];

  for (const f of failures) {
    const snippet = (f.error ?? 'unknown error').slice(0, MAX_ERROR_SNIPPET_CHARS);
    const line = `- **${f.role}**: ${snippet}`;
    if (used + line.length > budget) {
      omittedRoles.push(f.role);
      continue;
    }
    lines.push(line);
    used += line.length;
  }

  return { text: lines.length > 1 ? lines.join('\n') : '', omittedRoles };
}
