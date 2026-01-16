/**
 * nexus-agents/agents - Constitutional Critic Helpers
 *
 * Pure helper functions for Constitutional AI self-critique protocol.
 * Extracted from constitutional-critic.ts to maintain file size limits.
 *
 * @module agents/collaboration/constitutional-critic-helpers
 * (Source: arXiv:2212.08073, Issue #147)
 */

import type { Violation, ViolationSeverity } from './constitutional-types.js';

/**
 * Severity ordering for comparisons.
 */
export const SEVERITY_ORDER: Record<ViolationSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Result of violation detection.
 */
export interface DetectionResult {
  readonly location?: string;
  readonly confidence: number;
}

/**
 * Gets detection regex patterns for a principle.
 */
export function getDetectionPatterns(principleId: string): RegExp[] {
  const patterns: Record<string, RegExp[]> = {
    'no-secrets': [
      /(?:api[_-]?key|secret|password|token)\s*[=:]\s*["'][^"']+["']/gi,
      /sk-[a-zA-Z0-9]{20,}/g,
      /\b(?:ghp|gho|ghu|ghs)_[a-zA-Z0-9]{36}\b/g,
    ],
    'input-validation': [/JSON\.parse\([^)]*(?:req|input|user)/gi, /eval\(/gi],
    'error-handling': [/\.then\([^)]*\)(?!.*\.catch)/g],
    'no-console': [/console\.(log|warn|error)\(/g],
    'type-safety': [/:\s*any\b/g, /as\s+\w+(?!.*Schema\.parse)/g],
    'no-eval': [/\beval\s*\(/g, /new\s+Function\s*\(/g],
    'sql-injection': [/`SELECT.*\$\{/gi, /`INSERT.*\$\{/gi, /`UPDATE.*\$\{/gi],
  };

  return patterns[principleId] ?? [];
}

/**
 * Gets line number for a position in text.
 */
export function getLineNumber(text: string, position: number): number {
  return text.substring(0, position).split('\n').length;
}

/**
 * Calculates overall score based on violations.
 */
export function calculateScore(violations: readonly Violation[], principleCount: number): number {
  if (principleCount === 0) return 10;

  let penalty = 0;
  for (const v of violations) {
    penalty += SEVERITY_ORDER[v.severity] * v.confidence;
  }

  const maxPenalty = principleCount * 4; // Max severity * principle count
  const score = 10 * (1 - penalty / maxPenalty);
  return Math.max(0, Math.min(10, score));
}

/**
 * Checks if output passes based on violations and failing severities.
 */
export function checksPasses(
  violations: readonly Violation[],
  failingSeverities: readonly ViolationSeverity[]
): boolean {
  const failingSet = new Set(failingSeverities);
  return !violations.some((v) => failingSet.has(v.severity));
}

/**
 * Generates critique summary.
 */
export function generateSummary(
  violations: readonly Violation[],
  score: number,
  passes: boolean
): string {
  if (violations.length === 0) {
    return 'No violations found. Output adheres to all principles.';
  }

  const critical = violations.filter((v) => v.severity === 'critical').length;
  const high = violations.filter((v) => v.severity === 'high').length;
  const medium = violations.filter((v) => v.severity === 'medium').length;
  const low = violations.filter((v) => v.severity === 'low').length;

  const parts = [`Found ${String(violations.length)} violation(s).`];
  if (critical > 0) parts.push(`Critical: ${String(critical)}`);
  if (high > 0) parts.push(`High: ${String(high)}`);
  if (medium > 0) parts.push(`Medium: ${String(medium)}`);
  if (low > 0) parts.push(`Low: ${String(low)}`);
  parts.push(`Score: ${score.toFixed(1)}/10.`);
  parts.push(passes ? 'Passes constitution.' : 'Fails constitution.');

  return parts.join(' ');
}

/**
 * Summarizes changes between iterations.
 */
export function summarizeChanges(previous: string, current: string): string {
  const prevLines = previous.split('\n').length;
  const currLines = current.split('\n').length;
  const lineDiff = currLines - prevLines;

  if (lineDiff > 0) {
    return `Added ${String(lineDiff)} line(s) with fix annotations`;
  } else if (lineDiff < 0) {
    return `Removed ${String(Math.abs(lineDiff))} line(s)`;
  }
  return 'Modified existing lines';
}

/**
 * Matches keywords from a pattern against output text.
 * Returns confidence based on keyword match ratio.
 */
export function matchKeywords(pattern: string, output: string): number {
  const keywords = pattern
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const outputLower = output.toLowerCase();
  let matchedKeywords = 0;

  for (const keyword of keywords) {
    if (outputLower.includes(keyword)) {
      matchedKeywords++;
    }
  }

  return keywords.length > 0 ? matchedKeywords / keywords.length : 0;
}

/**
 * Applies a suggested fix to output by adding a comment.
 */
export function applyFix(output: string, violation: Violation): string {
  // Simple replacement - in real implementation would use AST
  // For now, just add a comment noting the violation
  if (violation.location !== undefined) {
    const lineMatch = /line (\d+)/.exec(violation.location);
    if (lineMatch !== null) {
      const lineNum = parseInt(lineMatch[1] ?? '0', 10);
      const lines = output.split('\n');
      if (lineNum > 0 && lineNum <= lines.length) {
        const comment = `// TODO: ${violation.principleName} - ${violation.suggestedFix}`;
        lines.splice(lineNum - 1, 0, comment);
        return lines.join('\n');
      }
    }
  }
  return output;
}

/**
 * Filters violations by minimum severity.
 */
export function filterViolationsBySeverity(
  violations: readonly Violation[],
  minSeverity: ViolationSeverity
): readonly Violation[] {
  return violations.filter((v) => SEVERITY_ORDER[v.severity] >= SEVERITY_ORDER[minSeverity]);
}
