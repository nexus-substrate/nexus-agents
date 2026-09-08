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

  const header =
    '## Prior Wave Context\n\nThe following results were produced by prior wave workers. Use this context to inform your work.\n';
  let totalChars = header.length;
  const entries: string[] = [];

  const omittedRoles: string[] = [];

  for (const result of successResults) {
    const sanitized = sanitizeWorkerOutput(result.output);
    const truncated =
      sanitized.length > MAX_CHARS_PER_WORKER
        ? sanitized.slice(0, MAX_CHARS_PER_WORKER) + ' [truncated]'
        : sanitized;

    const entry = `### ${result.role} (${result.status})\n${truncated}`;

    if (totalChars + entry.length > MAX_PRIOR_CONTEXT_CHARS) {
      omittedRoles.push(result.role);
      continue;
    }

    entries.push(entry);
    totalChars += entry.length;
  }

  if (entries.length === 0) return '';

  const failures = buildFailureSummary(results, MAX_PRIOR_CONTEXT_CHARS - totalChars);
  const omitted = [...omittedRoles, ...failures.omittedRoles];

  return header + '\n' + entries.join('\n\n') + failures.text + buildOmissionNotice(omitted);
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
