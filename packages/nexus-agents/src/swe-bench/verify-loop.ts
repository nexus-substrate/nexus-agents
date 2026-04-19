/**
 * Post-patch verification loop (#2032).
 *
 * Pure utilities for classifying patch-verification failures, deciding
 * whether to retry, and building retry hints for the agent. Deliberately
 * decoupled from the evaluation-harness I/O so it can be unit-tested
 * without spinning up Docker — integration with `agent-runner.ts` is a
 * separate follow-up.
 *
 * Mirrors the pattern established by #2031 and #2034: ship pure logic
 * first, wire into the live path in a follow-up PR so each change stays
 * reviewable.
 *
 * @module swe-bench/verify-loop
 */

import type { FailureCategory } from './evaluation-failure-types.js';

/** Default maximum retries per instance. */
export const DEFAULT_MAX_VERIFY_RETRIES = 2;

/**
 * Classification of a single verify-phase failure, suitable for
 * feeding back into the agent as a retry hint.
 */
export interface VerifyFailureClassification {
  readonly category: FailureCategory;
  /** Short description extracted from stdout/stderr. */
  readonly summary: string;
  /** Test names or file paths pulled out of the failure output. */
  readonly affectedTests: readonly string[];
}

/** Pattern for recognizing a failure category in captured output. */
interface FailurePattern {
  readonly category: FailureCategory;
  readonly regex: RegExp;
  readonly summarizer: (match: RegExpExecArray, stderr: string, stdout: string) => string;
}

const FAILURE_PATTERNS: readonly FailurePattern[] = [
  {
    category: 'patch_not_applicable',
    regex: /patch .*?does not apply|hunk #\d+ FAILED|Reversed .*patch detected/i,
    summarizer: (m) => `Patch did not apply cleanly: ${m[0]}`,
  },
  {
    category: 'syntax_error',
    regex: /SyntaxError: (.*?)(?:\n|$)|IndentationError: (.*?)(?:\n|$)/,
    summarizer: (m) => `Syntax error in generated patch: ${m[1] ?? m[2] ?? m[0]}`.trim(),
  },
  {
    category: 'timeout',
    regex: /Timeout\b|timed out after \d+\s?s\b|TIMEOUT_EXCEEDED/i,
    summarizer: (m) => `Test run exceeded timeout: ${m[0]}`,
  },
  {
    category: 'missing_dependency',
    regex:
      /ModuleNotFoundError: No module named '([^']+)'|ImportError: cannot import name '([^']+)'|No module named "([^"]+)"/,
    summarizer: (m) =>
      `Missing dependency: ${m[1] ?? m[2] ?? m[3] ?? 'unknown'}. Patch may need an import.`,
  },
  {
    category: 'runtime_error',
    regex: /([A-Z][a-zA-Z]+Error): (.*?)(?:\n|$)/,
    summarizer: (m) => `Runtime error ${m[1] ?? ''}: ${m[2] ?? ''}`.trim(),
  },
  {
    category: 'test_failure',
    regex: /FAILED .*?::(\S+)|AssertionError|FAIL: (\S+)/,
    summarizer: (_m, stderr, stdout) => {
      const failed = extractFailedTests(stderr, stdout);
      return failed.length > 0
        ? `Tests still failing: ${failed.slice(0, 5).join(', ')}`
        : 'One or more tests failed after patch';
    },
  },
];

/**
 * Classify a verify-phase failure from captured stdout + stderr. Returns
 * `unknown` category when no pattern matches.
 */
export function classifyPatchFailure(stderr: string, stdout: string): VerifyFailureClassification {
  const haystack = `${stderr}\n${stdout}`;
  for (const pattern of FAILURE_PATTERNS) {
    const match = pattern.regex.exec(haystack);
    if (match !== null) {
      return {
        category: pattern.category,
        summary: pattern.summarizer(match, stderr, stdout),
        affectedTests: extractFailedTests(stderr, stdout),
      };
    }
  }
  return {
    category: 'unknown',
    summary: haystack.trim().slice(0, 200) || 'No failure details captured',
    affectedTests: extractFailedTests(stderr, stdout),
  };
}

/**
 * Pull `repo/path::test_name` style test identifiers out of pytest-style
 * output. Best-effort — returns empty array when nothing parseable.
 */
function extractFailedTests(stderr: string, stdout: string): readonly string[] {
  const combined = `${stderr}\n${stdout}`;
  const results = new Set<string>();
  const pytestPattern = /FAILED (\S+::\S+)/g;
  let match;
  while ((match = pytestPattern.exec(combined)) !== null) {
    if (match[1] !== undefined) results.add(match[1]);
  }
  const unittestPattern = /FAIL: (\S+) \(/g;
  while ((match = unittestPattern.exec(combined)) !== null) {
    if (match[1] !== undefined) results.add(match[1]);
  }
  return Array.from(results);
}

/**
 * Retry policy. Hard-capped at `maxRetries` iterations; certain
 * failure categories (e.g. `missing_dependency`, `patch_not_applicable`)
 * are always retryable because the agent can likely fix them; others
 * (e.g. `timeout`) hit the cap immediately because extra iterations
 * won't help.
 */
/** Categories that benefit from retrying — the agent can fix these. */
const ALWAYS_RETRYABLE: ReadonlySet<FailureCategory> = new Set([
  'patch_not_applicable',
  'syntax_error',
  'missing_dependency',
  'test_failure',
  'runtime_error',
  'incomplete_fix',
]);

/** Categories that never benefit from retry (extra iterations won't help). */
const NEVER_RETRYABLE: ReadonlySet<FailureCategory> = new Set(['timeout']);

export function shouldRetry(
  category: FailureCategory,
  iteration: number,
  maxRetries: number = DEFAULT_MAX_VERIFY_RETRIES
): boolean {
  if (iteration >= maxRetries) return false;
  if (NEVER_RETRYABLE.has(category)) return false;
  if (ALWAYS_RETRYABLE.has(category)) return true;
  // Uncertain categories (wrong_file_modified, regression_introduced,
  // unknown): give exactly one retry; anything more is noise.
  return iteration < 1;
}

/**
 * Build a prompt fragment the agent can use to focus the next
 * iteration. Kept terse so the agent's context budget isn't dominated
 * by verifier chatter.
 */
export function buildRetryHint(
  classification: VerifyFailureClassification,
  iteration: number,
  maxRetries: number = DEFAULT_MAX_VERIFY_RETRIES
): string {
  const header = `Verification attempt ${String(iteration + 1)}/${String(maxRetries + 1)} failed.`;
  const bodyLines = [
    header,
    `Category: ${classification.category}`,
    `Summary: ${classification.summary}`,
  ];
  if (classification.affectedTests.length > 0) {
    const count = String(classification.affectedTests.length);
    const names = classification.affectedTests.slice(0, 5).join(', ');
    const overflow = classification.affectedTests.length > 5 ? ', ...' : '';
    bodyLines.push(`Affected tests (${count}): ${names}${overflow}`);
  }
  bodyLines.push('Fix the root cause, not the symptom. Re-emit the full patch.');
  return bodyLines.join('\n');
}

/**
 * Result of a single verify phase. Consumers chain these in a loop.
 */
export interface VerifyAttemptOutcome {
  readonly ok: boolean;
  readonly iteration: number;
  readonly classification?: VerifyFailureClassification;
  readonly retryHint?: string;
  readonly willRetry: boolean;
}

/**
 * Build the outcome record for one verify attempt. Pure — no I/O, no
 * side effects. The integration layer calls this after running the
 * actual test harness with the current patch.
 */
export function buildVerifyOutcome(params: {
  readonly passed: boolean;
  readonly iteration: number;
  readonly stderr: string;
  readonly stdout: string;
  readonly maxRetries?: number;
}): VerifyAttemptOutcome {
  const maxRetries = params.maxRetries ?? DEFAULT_MAX_VERIFY_RETRIES;
  if (params.passed) {
    return { ok: true, iteration: params.iteration, willRetry: false };
  }
  const classification = classifyPatchFailure(params.stderr, params.stdout);
  const willRetry = shouldRetry(classification.category, params.iteration, maxRetries);
  return {
    ok: false,
    iteration: params.iteration,
    classification,
    retryHint: buildRetryHint(classification, params.iteration, maxRetries),
    willRetry,
  };
}
