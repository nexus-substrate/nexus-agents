/**
 * nexus-agents/swe-bench - Prompt Templates
 *
 * Prompts for running agents on SWE-bench instances.
 *
 * @module swe-bench/prompt-template
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { SWEBenchInstance } from './types.js';

/**
 * System prompt for SWE-bench agent.
 */
export const SWE_BENCH_SYSTEM_PROMPT = `You are an expert software engineer solving GitHub issues.

Your task is to find the root cause and fix it with a minimal patch. Change as few lines as possible. Do not refactor surrounding code.

Guidelines:
1. Read the problem statement carefully.
2. Read the FAIL_TO_PASS test names to understand expected behavior, but do NOT edit test files.
3. Start with files mentioned in the error/traceback, then search for the function/class name.
4. Identify the root cause of the issue.
5. Edit only the source files needed for a minimal fix. Maintain backward compatibility.
6. VERIFY your fix by running the failing test(s) BEFORE outputting the patch.
7. If the test still fails after your fix, analyze the failure output and iterate.
8. Run \`git diff\` to confirm your final changes.

CONTEXT BUDGET: You have limited context. Be efficient:
- Don't read entire files — use grep/search to find relevant sections
- Don't explore the whole codebase — go directly to files mentioned in the error
- Keep your analysis concise — focus on the root cause, not comprehensive review
- If you're running low on context, output your best patch immediately

IMPORTANT: After making your fix, output the patch using this exact format:

\`\`\`diff
[paste your "git diff" output here]
\`\`\``;

/**
 * Builds test context sections for the prompt (Strategy B).
 * Includes FAIL_TO_PASS test names and test_patch diff so the agent
 * understands exact expected behavior before writing patches.
 */
function buildTestContext(instance: SWEBenchInstance): string[] {
  const parts: string[] = [];

  if (instance.FAIL_TO_PASS !== undefined && instance.FAIL_TO_PASS.length > 0) {
    const testNames = Array.isArray(instance.FAIL_TO_PASS)
      ? instance.FAIL_TO_PASS
      : [instance.FAIL_TO_PASS];
    parts.push(
      '',
      '## Tests That Must Pass After Fix (CRITICAL)',
      '',
      'These tests currently fail and MUST pass after your fix:',
      ...testNames.map((t: string) => `- \`${t}\``),
      '',
      'Read these test functions to understand the EXACT expected behavior',
      'before writing your patch. The test assertions define correctness.',
      '',
      '**VERIFICATION LOOP:** After making your fix, run these tests:',
      ...testNames.map((t: string) => {
        // Extract test file path from test identifier
        const testFile = t.split('::')[0] ?? t.split(' ')[0] ?? t;
        return `  python -m pytest ${testFile} -x -v 2>&1 | tail -20`;
      }),
      '',
      'If tests fail, read the output, fix your code, and re-run.',
      'Only output the final patch after tests pass.'
    );
  }

  if (
    instance.test_patch !== undefined &&
    instance.test_patch.length > 0 &&
    instance.test_patch.length < 3000
  ) {
    parts.push(
      '',
      '## Test Expectations (from test patch)',
      '',
      'This diff shows what the tests expect. Study the assertions carefully:',
      '',
      '```diff',
      instance.test_patch.slice(0, 2500),
      '```'
    );
  }

  return parts;
}

/**
 * Creates a user prompt for a specific SWE-bench instance.
 */
export function createInstancePrompt(instance: SWEBenchInstance): string {
  const parts: string[] = [
    `## Repository: ${instance.repo}`,
    '',
    `## Issue ID: ${instance.instance_id}`,
    '',
    '## Problem Statement',
    '',
    instance.problem_statement,
  ];

  if (instance.hints_text !== undefined && instance.hints_text.length > 0) {
    parts.push('', '## Hints', '', instance.hints_text);
  }

  parts.push(...buildTestContext(instance));

  if (instance.version !== undefined) {
    parts.push('', `## Version: ${instance.version}`);
  }

  parts.push(
    '',
    '---',
    '',
    'Please analyze this issue and provide a git diff patch to fix it.',
    'Start by reading the failing tests to understand expected behavior,',
    'then explore the relevant source files in the repository.'
  );

  return parts.join('\n');
}

/**
 * Creates a retry prompt when the initial attempt failed.
 */
export function createRetryPrompt(
  error: string,
  previousPatch?: string,
  contextSummary?: string
): string {
  const parts: string[] = [];

  if (contextSummary !== undefined && contextSummary.length > 0) {
    parts.push('## Context from Previous Iterations', '', contextSummary, '');
  }

  parts.push('## Previous Attempt Failed', '', `Error: ${error}`);

  if (previousPatch !== undefined) {
    parts.push('', '## Previous Patch', '', '```diff', previousPatch, '```');
  }

  parts.push(
    '',
    'Do NOT retry the same approach. If your previous patch modified function X, try a different fix strategy.',
    'Common issues:',
    '- Patch does not apply cleanly (check file paths and context)',
    '- Tests still fail (ensure the fix addresses the root cause)',
    '- Syntax errors in the patch',
    '',
    'Try a completely different approach to solve the underlying problem.'
  );

  return parts.join('\n');
}

/** Ordered extraction patterns for diff/patch content (fenced forms only). */
const PATCH_PATTERNS: readonly RegExp[] = [
  // Code fence: ```diff
  /```diff\n([\s\S]*?)```/i,
  // Alternative fences: ```patch, ```text, ``` with diff --git
  /```(?:patch|text|)\n(diff --git[\s\S]*?)```/i,
  // Unified diff in fenced block: --- a/file
  /```(?:diff|patch|text|)\n(---\s+a\/[\s\S]*?)```/i,
];

/**
 * Maximum input length for raw-patch extraction. Real patches are well under
 * this; bounding input prevents pathological-input ReDoS in the raw extractors
 * (CodeQL js/polynomial-redos #50). 256KB ≈ ~5000 lines of unified diff.
 */
const MAX_RAW_EXTRACT_LEN = 256 * 1024;

/**
 * Extract a `diff --git` block from raw (non-fenced) response. Index-based
 * scanning instead of regex to avoid polynomial backtracking on input with
 * many `diff --git` repetitions.
 */
function extractRawDiffGit(response: string): string | null {
  const start = response.indexOf('diff --git');
  if (start === -1) return null;
  // Find the natural end: a `\n\n` followed by a non-`d` char, OR end of input
  let i = start;
  while (i < response.length) {
    const nl = response.indexOf('\n\n', i);
    if (nl === -1) return response.slice(start);
    const after = response.charAt(nl + 2);
    if (after !== 'd' && after !== '') return response.slice(start, nl);
    i = nl + 2;
  }
  return response.slice(start);
}

/**
 * Extract a `--- a/ ... +++ b/` unified diff from raw response. Index-based,
 * no regex backtracking.
 */
function extractRawUnifiedDiff(response: string): string | null {
  const start = response.indexOf('\n--- a/');
  if (start === -1) return null;
  const plusIdx = response.indexOf('\n+++ b/', start);
  if (plusIdx === -1) return null;
  // Find end: a `\n\n` followed by non-diff-line char (not `-`, `+`, `@`, ` `)
  let i = plusIdx;
  while (i < response.length) {
    const nl = response.indexOf('\n\n', i);
    if (nl === -1) return response.slice(start + 1);
    const after = response.charAt(nl + 2);
    if (after !== '-' && after !== '+' && after !== '@' && after !== ' ' && after !== '') {
      return response.slice(start + 1, nl);
    }
    i = nl + 2;
  }
  return response.slice(start + 1);
}

/**
 * Extracts a git diff patch from agent response.
 */
export function extractPatch(response: string): string | null {
  for (const pattern of PATCH_PATTERNS) {
    const match = pattern.exec(response);
    if (match?.[1] !== undefined) {
      return normalizePatch(match[1]);
    }
  }
  // Raw forms — bounded length to avoid pathological-input ReDoS classes
  // even though we're now using index-based extraction (defense in depth).
  const bounded = response.length > MAX_RAW_EXTRACT_LEN
    ? response.slice(0, MAX_RAW_EXTRACT_LEN)
    : response;
  const raw1 = extractRawDiffGit(bounded);
  if (raw1 !== null) return normalizePatch(raw1);
  const raw2 = extractRawUnifiedDiff(bounded);
  if (raw2 !== null) return normalizePatch(raw2);
  return null;
}

/**
 * Normalizes a patch for git apply compatibility.
 * - Strips leading/trailing whitespace but ensures trailing newline
 * - Removes trailing whitespace from each line (git apply is strict)
 */
function normalizePatch(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return trimmed;
  // Strip trailing whitespace per line, then ensure final newline
  const lines = trimmed.split('\n').map((line) => line.trimEnd());
  return lines.join('\n') + '\n';
}

/**
 * Validates that a patch looks like a valid git diff.
 */
export function validatePatchFormat(patch: string): { valid: boolean; error?: string } {
  if (patch.length === 0) {
    return { valid: false, error: 'Empty patch' };
  }

  if (!patch.startsWith('diff --git')) {
    return { valid: false, error: 'Patch must start with "diff --git"' };
  }

  // Check for file headers
  const hasFileHeader = /^---\s+a\//.test(patch) || /\n---\s+a\//.test(patch);
  const hasPlusHeader = /^\+\+\+\s+b\//.test(patch) || /\n\+\+\+\s+b\//.test(patch);

  if (!hasFileHeader) {
    return { valid: false, error: 'Missing "--- a/..." file header' };
  }

  if (!hasPlusHeader) {
    return { valid: false, error: 'Missing "+++ b/..." file header' };
  }

  // Check for hunk headers
  const hasHunkHeader = /@@ -\d+(?:,\d*)? \+\d+(?:,\d*)? @@/.test(patch);
  if (!hasHunkHeader) {
    return { valid: false, error: 'Missing hunk header (@@)' };
  }

  return { valid: true };
}

/**
 * Creates a summary prompt for generating final output.
 */
export function createSummaryPrompt(
  instance: SWEBenchInstance,
  patch: string,
  iterations: number
): string {
  return [
    `## Solution Summary`,
    '',
    `Instance: ${instance.instance_id}`,
    `Repository: ${instance.repo}`,
    `Iterations: ${iterations.toString()}`,
    '',
    '## Generated Patch',
    '',
    '```diff',
    patch,
    '```',
    '',
    'Patch generated successfully.',
  ].join('\n');
}

/**
 * Creates initial exploration prompt for understanding the codebase.
 */
export function createExplorationPrompt(instance: SWEBenchInstance): string {
  return [
    `Before writing a fix, explore the codebase to understand the issue.`,
    '',
    `Repository: ${instance.repo}`,
    '',
    'Suggested exploration steps:',
    '1. Find files mentioned in the problem statement',
    '2. Look for related test files to understand expected behavior',
    '3. Search for function/class definitions involved in the issue',
    '4. Review recent changes to affected files if relevant',
    '',
    'Report your findings and proposed approach before writing the patch.',
  ].join('\n');
}
