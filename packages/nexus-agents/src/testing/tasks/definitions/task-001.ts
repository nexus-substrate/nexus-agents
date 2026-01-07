/**
 * nexus-agents/testing/tasks/definitions - Task 001
 *
 * Task 001: Simple Function Generation
 * Optimal for Codex - straightforward code generation.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 1: Simple Function Generation
 * Optimal for Codex - straightforward code generation.
 */
export const TASK_001_SIMPLE_FUNCTION: EvaluationTask = {
  id: 'task-001',
  name: 'Simple Function Generation',
  category: 'code_generation',
  difficulty: 'easy',
  description: 'Generate a simple utility function with clear inputs and outputs.',
  prompt: `Write a TypeScript function called \`formatBytes\` that converts a number of bytes into a human-readable string.

Requirements:
- Accept a number representing bytes
- Return a string like "1.5 KB", "2.3 MB", "1.0 GB"
- Support units: B, KB, MB, GB, TB, PB
- Round to 2 decimal places
- Handle edge cases: 0, negative numbers (return "0 B")
- Include JSDoc documentation

Example:
formatBytes(1024) // "1.00 KB"
formatBytes(1536) // "1.50 KB"
formatBytes(1073741824) // "1.00 GB"`,
  expectedOutcome: {
    mustContain: ['function', 'formatBytes', 'KB', 'MB', 'GB'],
    mustNotContain: ['any', 'TODO', 'FIXME'],
    shouldContainCode: true,
    expectedLanguage: 'typescript',
  },
  scoringRubric: {
    criteria: [
      {
        id: 'correctness',
        description: 'Function correctly converts bytes to human-readable format',
        weight: 0.4,
        maxScore: 10,
        indicators: ['1024', 'KB', '1.00'],
      },
      {
        id: 'edge_cases',
        description: 'Handles edge cases (0, negative, large numbers)',
        weight: 0.2,
        maxScore: 10,
        indicators: ['0', 'negative', 'if'],
      },
      {
        id: 'documentation',
        description: 'Includes JSDoc and clear naming',
        weight: 0.2,
        maxScore: 10,
        indicators: ['@param', '@returns', 'JSDoc'],
      },
      {
        id: 'type_safety',
        description: 'Uses proper TypeScript types',
        weight: 0.2,
        maxScore: 10,
        indicators: ['number', 'string', ': '],
      },
    ],
    maxTotalScore: 10,
    passingScore: 6,
  },
  timeoutMs: 30000,
  optimalCli: 'codex',
  acceptableClis: ['codex', 'claude', 'gemini'],
  tags: ['utility', 'formatting', 'typescript', 'beginner'],
};
