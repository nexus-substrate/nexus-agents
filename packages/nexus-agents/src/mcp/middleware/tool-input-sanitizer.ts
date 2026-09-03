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
  /**
   * Number of HTML comments removed (#5258).
   *
   * Reported rather than discarded so a reader can tell that content was taken
   * out. A stripped body is shorter than what the author wrote, and without
   * this count that difference is invisible — the reviewer would read a
   * truncated PR description with no indication anything was removed.
   */
  readonly commentsRemoved: number;
}

/**
 * XML-like tags that mimic conversation structure or system prompts.
 * Stripping these prevents prompt injection through tool arguments.
 */
const XML_INJECTION_PATTERN =
  /<\/?(system|human|assistant|instructions|user|prompt|context|tool_use|tool_result)\b[^>]*>/gi;

/**
 * Patterns that indicate attempted prompt injection.
 *
 * A detection here is not merely logged: at an elevated `securityTier`,
 * `checkSecurityTier` (secure-handler.ts) turns any entry in
 * `detectedPatterns` into a hard `permission` refusal with no fallback. So a
 * detector that false-positives takes the tool offline for that input. Add one
 * only when the pattern cannot appear in benign text.
 *
 * There is deliberately NO `hidden_instruction` detector. Classifying the
 * interior of an HTML comment was attempted twice (#5258, #5262, #5270) and
 * failed on both axes: the trigger list `/execute|delete|merge|apply/i`
 * refused GitHub's own default PR template (`<!-- Please delete options that
 * are not relevant -->`), and every regex form of the containment check
 * backtracked catastrophically. `stripHtmlComments` replaces it — removing the
 * comment is strictly stronger than judging its contents, and produces no
 * detection, so it cannot false-positive into a refusal.
 */
const INJECTION_DETECTORS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'system_prompt_override', pattern: /ignore (?:all )?previous (?:instructions|rules)/i },
  { name: 'role_impersonation', pattern: /i(?:'m| am) the (?:repo |project )?(?:owner|admin)/i },
];

/**
 * Remove HTML comments from untrusted input (#5258, panel option "strip",
 * 5 of 5 approvers, audit #144).
 *
 * The vector is an ASYMMETRY, not the words: a comment is invisible in rendered
 * markdown, so a human reviewer never sees it while a model reading the raw
 * body does. Removing the comment removes the asymmetry outright — a hostile
 * instruction cannot influence a model that never receives it — which is
 * strictly stronger than classifying comment interiors and does not invite the
 * bypass arms race that narrowing a trigger list does.
 *
 * It also fixes the reason this changed: GitHub's own default PR template
 * contains `<!-- Please delete options that are not relevant -->`, whose
 * `delete` matched the trigger list, so a contributor using the template GitHub
 * offers had their review hard-refused with no override.
 *
 * **Applied at EVERY tier**, which the security reviewer and the dissenting
 * reviewer independently agreed on: there is no legitimate reason for an agent
 * to act on instructions hidden in a comment, from any source.
 *
 * **No exemption for fenced code blocks**, and that is a deliberate cost. The
 * dissent is right that a frontend or markdown PR can legitimately show
 * `<!-- … -->` as example code, and that example is lost from the model's view.
 * Exempting fences would hand an attacker a one-line bypass — wrap the payload
 * in a fence — so the collateral damage is accepted rather than traded for a
 * hole. The removal is counted and reported, so a reader can see that something
 * was taken out rather than silently reading a shortened body.
 *
 * Unterminated comments are left alone: `<!--` with no `-->` has no interior,
 * and treating the rest of the document as comment would delete the body.
 */
function stripHtmlComments(value: string): { cleaned: string; removed: number } {
  const OPEN = '<!--';
  const CLOSE = '-->';
  let out = '';
  let from = 0;
  let removed = 0;
  for (;;) {
    const open = value.indexOf(OPEN, from);
    if (open === -1) break;
    const close = value.indexOf(CLOSE, open + OPEN.length);
    if (close === -1) break;
    out += value.slice(from, open);
    from = close + CLOSE.length;
    removed++;
  }
  return { cleaned: removed === 0 ? value : out + value.slice(from), removed };
}

/**
 * Sanitizes a single string value by stripping XML injection tags and HTML
 * comments. Returns the cleaned string, whether it changed, and how many
 * comments were removed.
 */
function sanitizeString(value: string): {
  cleaned: string;
  modified: boolean;
  commentsRemoved: number;
} {
  // Loop to a fixed point over BOTH strips together. Each one can reconstruct
  // what the other removes, in both directions, so neither is safe alone:
  //
  //   tag → tag:      `<sys<system>tem>x</sys</system>tem>`
  //                   removing the inner `<system>` closes the outer fragments
  //                   into a live `<system>x</system>` (#1496).
  //   comment → comment: `<!-<!-- -->- payload -->`
  //                   removing the inner comment splices `<!-` onto `- payload
  //                   -->`, yielding a live `<!-- payload -->`.
  //   comment → tag:  `<sys<!-- -->tem>x</sys<!-- -->tem>`
  //                   removing the comments reconstructs `<system>x</system>`.
  //
  // The third case is why the comment strip cannot simply run once after the
  // tag loop: doing so closed the first direction and opened the other. Both
  // run in every pass, and the pass repeats until the string stops changing.
  //
  // Bounded rather than `while`: a pathological input must not spin here, and
  // five passes clears any nesting depth seen in practice (two suffice for the
  // payloads above). If the cap is ever hit the value is returned as it stands
  // and reported modified, so the caller still sees that something was stripped.
  const MAX_PASSES = 5;
  let cleaned = value;
  let commentsRemoved = 0;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    XML_INJECTION_PATTERN.lastIndex = 0;
    const afterTags = cleaned.replace(XML_INJECTION_PATTERN, '');
    const { cleaned: afterComments, removed } = stripHtmlComments(afterTags);
    // Counted per pass and accumulated: a comment removed on pass 2 was really
    // removed, and under-reporting it would hide content from the reader for
    // exactly the reason this count exists.
    commentsRemoved += removed;
    if (afterComments === cleaned) break;
    cleaned = afterComments;
  }
  return {
    cleaned,
    modified: cleaned !== value,
    commentsRemoved,
  };
}

/**
 * Detects injection patterns in a string without modifying it.
 */
function detectPatterns(value: string): string[] {
  const detected: string[] = [];
  for (const { name, pattern } of INJECTION_DETECTORS) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) detected.push(name);
  }
  return detected;
}

/**
 * Recursively sanitizes all string values in an object/array.
 * Returns a deep copy with XML injection tags stripped from strings.
 */
function sanitizeValue(
  value: unknown,
  stats: { count: number; patterns: string[]; commentsRemoved: number }
): unknown {
  if (typeof value === 'string') {
    const patterns = detectPatterns(value);
    if (patterns.length > 0) {
      stats.patterns.push(...patterns);
    }
    const { cleaned, modified, commentsRemoved } = sanitizeString(value);
    if (modified) stats.count++;
    stats.commentsRemoved += commentsRemoved;
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
    return {
      sanitized: args,
      wasModified: false,
      modifiedCount: 0,
      detectedPatterns: [],
      commentsRemoved: 0,
    };
  }

  const stats = { count: 0, patterns: [] as string[], commentsRemoved: 0 };
  const sanitized = sanitizeValue(args, stats);
  const uniquePatterns = [...new Set(stats.patterns)];

  return {
    sanitized,
    wasModified: stats.count > 0,
    modifiedCount: stats.count,
    detectedPatterns: uniquePatterns,
    commentsRemoved: stats.commentsRemoved,
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
  if (result.commentsRemoved > 0) {
    // Separate from the line above because it means something different to a
    // reader: content the author wrote is absent from what the model saw. It
    // is not necessarily an attack — GitHub's default PR template trips it —
    // so this records the removal without characterizing intent (#5258).
    logger.warn('Tool input sanitized — HTML comments removed', {
      tool: toolName,
      commentsRemoved: result.commentsRemoved,
    });
  }
  if (result.detectedPatterns.length > 0) {
    logger.warn('Injection patterns detected in tool input', {
      tool: toolName,
      patterns: result.detectedPatterns,
    });
  }
}
