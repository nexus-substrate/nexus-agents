/**
 * Context Distillation — extract structured summaries from phase outputs
 * to prevent prompt contamination and reduce token usage between phases.
 *
 * Unlike raw truncation (cross-wave-context.ts), distillation extracts
 * semantic meaning: decisions made, artifacts produced, findings, and errors.
 * Downstream phases receive a concise structured summary instead of
 * verbose reasoning chains.
 *
 * Inspired by CyberStrike's phase compartmentalization (adversary-lab).
 *
 * @module orchestration/aorchestra/context-distillation
 * (Source: adversary-lab research, nexus-agents #1607)
 */

import { z } from 'zod';

// ============================================================================
// Schema
// ============================================================================

/**
 * Structured summary of a phase's output.
 * This is what downstream phases receive instead of raw verbose text.
 */
export const PhaseDistillationSchema = z.object({
  /** Key decisions made during this phase */
  decisions: z.array(z.string()),
  /** Artifacts produced (file paths, URLs, IDs) */
  artifacts: z.array(z.string()),
  /** Important findings or observations */
  findings: z.array(z.string()),
  /** Errors encountered (if any) */
  errors: z.array(z.string()),
  /** One-sentence summary of the phase outcome */
  summary: z.string(),
});

export type PhaseDistillation = z.infer<typeof PhaseDistillationSchema>;

// ============================================================================
// Extraction Patterns
// ============================================================================

/** Patterns that indicate a decision was made. */
const DECISION_PATTERNS = [
  /(?:decided|chosen|selected|using|went with|picked|adopted|approved)\s+(.{10,100})/gi,
  /(?:will|should|must)\s+(use|implement|create|add|remove|change)\s+(.{10,80})/gi,
];

/** Patterns that indicate an artifact was produced. */
const ARTIFACT_PATTERNS = [
  /(?:created?|wrote|generated|built|saved|output)\s+(?:file|module|component|test|schema)?\s*[`"]?([/\w.-]+\.\w{1,6})[`"]?/gi,
  /(?:commit|push|deploy|publish)(?:ed|ing)?\s+(.{10,60})/gi,
];

/** Patterns that indicate an error. */
const ERROR_PATTERNS = [
  /(?:error|failed|failure|exception|crash|timeout|rejected):\s*(.{10,100})/gi,
  /(?:could not|unable to|cannot)\s+(.{10,80})/gi,
];

/** Patterns that indicate a finding/observation. */
const FINDING_PATTERNS = [
  /(?:found|discovered|detected|noticed|identified|observed)\s+(.{10,100})/gi,
  /(?:vulnerability|issue|bug|problem|concern|risk):\s*(.{10,100})/gi,
];

// ============================================================================
// Distillation Functions
// ============================================================================

/**
 * Extract unique matches from text using a list of regex patterns.
 * Deduplicates by lowercase comparison. Limits to maxItems.
 */
function extractMatches(text: string, patterns: RegExp[], maxItems: number): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const pattern of patterns) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null && results.length < maxItems) {
      // Use the last capture group (most specific)
      const value = (match[match.length - 1] ?? match[0]).trim();
      const normalized = value.toLowerCase();
      if (value.length > 5 && !seen.has(normalized)) {
        seen.add(normalized);
        results.push(value);
      }
      match = pattern.exec(text);
    }
  }

  return results;
}

/**
 * Distill a phase output into a structured summary.
 *
 * This is a deterministic, pattern-based extraction — no LLM required.
 * It extracts decisions, artifacts, findings, and errors from the raw
 * text using regex patterns, then produces a concise summary.
 *
 * @param phaseOutput - Raw text output from a completed phase
 * @param maxItemsPerCategory - Maximum items per category (default 5)
 * @returns Structured PhaseDistillation
 */
export function distillPhaseOutput(
  phaseOutput: string,
  maxItemsPerCategory = 5
): PhaseDistillation {
  const decisions = extractMatches(phaseOutput, DECISION_PATTERNS, maxItemsPerCategory);
  const artifacts = extractMatches(phaseOutput, ARTIFACT_PATTERNS, maxItemsPerCategory);
  const findings = extractMatches(phaseOutput, FINDING_PATTERNS, maxItemsPerCategory);
  const errors = extractMatches(phaseOutput, ERROR_PATTERNS, maxItemsPerCategory);

  // Generate a one-line summary from the first sentence or first 200 chars
  const firstSentence = phaseOutput.match(/^[^.!?\n]{10,200}[.!?]/);
  const summary = firstSentence
    ? firstSentence[0].trim()
    : phaseOutput.slice(0, 200).trim() + (phaseOutput.length > 200 ? '...' : '');

  return { decisions, artifacts, findings, errors, summary };
}

/** Format a list of items as a markdown section. */
function formatSection(lines: string[], heading: string, items: readonly string[]): void {
  if (items.length === 0) return;
  lines.push('');
  lines.push(`### ${heading}`);
  for (const item of items) {
    lines.push(`- ${item}`);
  }
}

/**
 * Format a PhaseDistillation as a concise text block for injection
 * into the next phase's context.
 *
 * @param distillation - Structured phase summary
 * @param phaseLabel - Optional label for the phase (e.g., "Research Phase")
 * @returns Formatted text block
 */
export function formatDistillation(distillation: PhaseDistillation, phaseLabel?: string): string {
  const lines: string[] = [];
  const heading =
    phaseLabel !== undefined && phaseLabel !== ''
      ? `## ${phaseLabel} Summary`
      : '## Prior Phase Summary';
  lines.push(heading);
  lines.push('');
  lines.push(distillation.summary);

  formatSection(lines, 'Decisions', distillation.decisions);
  formatSection(lines, 'Artifacts', distillation.artifacts);
  formatSection(lines, 'Findings', distillation.findings);
  formatSection(lines, 'Errors', distillation.errors);

  return lines.join('\n');
}

/**
 * Measure the token savings from distillation.
 *
 * @param originalLength - Character length of original output
 * @param distilledLength - Character length of distilled output
 * @returns Compression ratio (0-1, lower = more compression)
 */
export function compressionRatio(originalLength: number, distilledLength: number): number {
  if (originalLength === 0) return 1;
  return distilledLength / originalLength;
}
