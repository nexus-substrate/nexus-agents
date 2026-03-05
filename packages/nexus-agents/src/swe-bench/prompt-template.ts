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

Your task is to analyze the problem, find the root cause, and fix it by editing the source files directly.

Guidelines:
1. Read the problem statement carefully.
2. Explore the codebase — find relevant files, read them, understand the structure.
3. Identify the root cause of the issue.
4. Edit the source files directly to implement a minimal fix.
5. Do NOT edit test files — tests are run separately for evaluation.
6. Maintain backward compatibility unless the issue specifically requires breaking changes.

IMPORTANT: After making your fix, you MUST output the complete patch in your response using this exact format:

\`\`\`diff
[run "git diff" to get your changes and paste the output here]
\`\`\`

If you used tools to edit files, run \`git diff\` in the repository to capture your changes, then include the output in a diff code block.`;

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

  if (instance.version !== undefined) {
    parts.push('', `## Version: ${instance.version}`);
  }

  parts.push(
    '',
    '---',
    '',
    'Please analyze this issue and provide a git diff patch to fix it.',
    'Start by exploring the relevant files in the repository.'
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
    'Please analyze the error and try a different approach.',
    'Common issues:',
    '- Patch does not apply cleanly (check file paths and context)',
    '- Tests still fail (ensure the fix addresses the root cause)',
    '- Syntax errors in the patch'
  );

  return parts.join('\n');
}

/**
 * Extracts a git diff patch from agent response.
 */
export function extractPatch(response: string): string | null {
  // Try to find diff block with code fence
  const diffBlockMatch = /```diff\n([\s\S]*?)```/i.exec(response);
  if (diffBlockMatch !== null) {
    const patch = diffBlockMatch[1];
    if (patch !== undefined) {
      return patch.trim();
    }
  }

  // Try to find diff block without language specifier
  const codeBlockMatch = /```\n(diff --git[\s\S]*?)```/i.exec(response);
  if (codeBlockMatch !== null) {
    const patch = codeBlockMatch[1];
    if (patch !== undefined) {
      return patch.trim();
    }
  }

  // Try to find raw diff content starting with diff --git
  const rawDiffMatch = /(diff --git[\s\S]*?)(?:\n\n[^d]|$)/.exec(response);
  if (rawDiffMatch !== null) {
    const patch = rawDiffMatch[1];
    if (patch !== undefined) {
      return patch.trim();
    }
  }

  return null;
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
