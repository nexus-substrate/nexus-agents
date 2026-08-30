/**
 * nexus-agents/mcp - Tool Input Sanitizer Middleware
 *
 * Lightweight sanitization for MCP tool arguments. Strips XML-like
 * conversation injection tags and detects prompt injection patterns
 * in all string values within tool arguments.
 *
 * Defense-in-depth layer that protects against prompt injection
 * through tool arguments containing external content.
 *
 * @module mcp/middleware/tool-input-sanitizer
 * (Source: Issue #828 — Wire security modules into production pipeline)
 */

import type { ILogger } from '../../core/index.js';

/**
 * Result of sanitizing tool input.
 */
export interface SanitizeToolInputResult {
  /** Sanitized arguments (XML tags stripped from string values) */
  readonly sanitized: unknown;
  /** Whether any modification was made */
  readonly wasModified: boolean;
  /** Count of strings that were modified */
  readonly modifiedCount: number;
  /** Injection patterns detected (for logging) */
  readonly detectedPatterns: readonly string[];
}

/**
 * XML-like tags that mimic conversation structure or system prompts.
 * Stripping these prevents prompt injection through tool arguments.
 */
const XML_INJECTION_PATTERN =
  /<\/?(system|human|assistant|instructions|user|prompt|context|tool_use|tool_result)\b[^>]*>/gi;

/**
 * Patterns that indicate attempted prompt injection.
 * These are logged but not necessarily stripped (detection only).
 */
const INJECTION_DETECTORS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'system_prompt_override', pattern: /ignore (?:all )?previous (?:instructions|rules)/i },
  { name: 'role_impersonation', pattern: /i(?:'m| am) the (?:repo |project )?(?:owner|admin)/i },
  // The trigger must sit INSIDE one comment. `[\s\S]*?` used to cross an
  // intervening `-->`, so any body with an opening comment, a trigger word
  // anywhere in ordinary prose, and a later closing comment matched — a real
  // PR body like "<!-- header -->\nsafe to merge after CI\n<!-- footer -->"
  // was flagged (#5258). `(?:(?!-->)[\s\S])*?` is the standard tempered-dot
  // form: consume any character that does not begin the terminator.
  //
  // KNOWN RESIDUAL: GitHub's default PR template contains
  // "<!-- Please delete options that are not relevant -->", where the trigger
  // genuinely is inside a single comment. Containment cannot help there; the
  // trigger vocabulary overlaps ordinary English. Tracked in #5258.
  {
    name: 'hidden_instruction',
    pattern: /<!--(?:(?!-->)[\s\S])*?(?:execute|delete|merge|apply)(?:(?!-->)[\s\S])*?-->/i,
  },
];

/**
 * Sanitizes a single string value by stripping XML injection tags.
 * Returns the cleaned string and whether it was modified.
 */
function sanitizeString(value: string): { cleaned: string; modified: boolean } {
  // Loop to a fixed point. A single pass RECONSTRUCTS the tag it strips:
  // `<sys<system>tem>x</sys</system>tem>` has its inner `<system>` removed,
  // and the outer fragments close up into a live `<system>x</system>`. The
  // sibling in `input-sanitizer.ts` has done this since #1496; this copy did
  // not, and it is the one guarding fork-authored PR descriptions.
  //
  // Bounded rather than `while`: a pathological input must not spin here, and
  // five passes clears any nesting depth seen in practice (two suffice for the
  // payload above). If the cap is ever hit the value is returned as-is and
  // reported modified, so the caller still sees that something was stripped.
  const MAX_PASSES = 5;
  let cleaned = value;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    XML_INJECTION_PATTERN.lastIndex = 0;
    const next = cleaned.replace(XML_INJECTION_PATTERN, '');
    if (next === cleaned) break;
    cleaned = next;
  }
  return { cleaned, modified: cleaned !== value };
}

/**
 * Detects injection patterns in a string without modifying it.
 */
function detectPatterns(value: string): string[] {
  const detected: string[] = [];
  for (const { name, pattern } of INJECTION_DETECTORS) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) {
      detected.push(name);
    }
  }
  return detected;
}

/**
 * Recursively sanitizes all string values in an object/array.
 * Returns a deep copy with XML injection tags stripped from strings.
 */
function sanitizeValue(value: unknown, stats: { count: number; patterns: string[] }): unknown {
  if (typeof value === 'string') {
    const patterns = detectPatterns(value);
    if (patterns.length > 0) {
      stats.patterns.push(...patterns);
    }
    const { cleaned, modified } = sanitizeString(value);
    if (modified) stats.count++;
    return cleaned;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, stats));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeValue(val, stats);
    }
    return result;
  }

  return value;
}

/**
 * Sanitizes MCP tool arguments by stripping XML injection tags
 * from all string values and detecting injection patterns.
 *
 * @param args - Tool arguments to sanitize
 * @returns Sanitized result with modification tracking
 */
export function sanitizeToolInput(args: unknown): SanitizeToolInputResult {
  if (args === undefined || args === null) {
    return { sanitized: args, wasModified: false, modifiedCount: 0, detectedPatterns: [] };
  }

  const stats = { count: 0, patterns: [] as string[] };
  const sanitized = sanitizeValue(args, stats);
  const uniquePatterns = [...new Set(stats.patterns)];

  return {
    sanitized,
    wasModified: stats.count > 0,
    modifiedCount: stats.count,
    detectedPatterns: uniquePatterns,
  };
}

/**
 * Logs sanitization results when modifications or detections occur.
 */
export function logSanitizationResult(
  result: SanitizeToolInputResult,
  logger: ILogger,
  toolName: string
): void {
  if (result.wasModified) {
    logger.warn('Tool input sanitized — XML injection tags stripped', {
      tool: toolName,
      modifiedFields: result.modifiedCount,
    });
  }
  if (result.detectedPatterns.length > 0) {
    logger.warn('Injection patterns detected in tool input', {
      tool: toolName,
      patterns: result.detectedPatterns,
    });
  }
}
