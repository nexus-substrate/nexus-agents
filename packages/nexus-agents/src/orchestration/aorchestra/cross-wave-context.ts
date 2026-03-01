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

// ============================================================================
// Constants
// ============================================================================

/** Maximum characters per individual worker output in prior-wave context. */
export const MAX_CHARS_PER_WORKER = 1500;

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

  // Add remaining prose after last code block
  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), isCode: false });
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

  if (successResults.length === 0) return '';

  const header =
    '## Prior Wave Context\n\nThe following results were produced by prior wave workers. Use this context to inform your work.\n';
  let totalChars = header.length;
  const entries: string[] = [];

  for (const result of successResults) {
    const sanitized = sanitizeWorkerOutput(result.output);
    const truncated =
      sanitized.length > MAX_CHARS_PER_WORKER
        ? sanitized.slice(0, MAX_CHARS_PER_WORKER) + ' [truncated]'
        : sanitized;

    const entry = `### ${result.role} (${result.status})\n${truncated}`;

    if (totalChars + entry.length > MAX_PRIOR_CONTEXT_CHARS) {
      break;
    }

    entries.push(entry);
    totalChars += entry.length;
  }

  if (entries.length === 0) return '';

  return header + '\n' + entries.join('\n\n');
}
