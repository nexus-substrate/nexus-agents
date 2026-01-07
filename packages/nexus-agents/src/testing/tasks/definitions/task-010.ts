/**
 * nexus-agents/testing/tasks/definitions - Task 010
 *
 * Task 010: Error Handling Pattern
 * Tests understanding of robust error handling.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 10: Error Handling Pattern
 * Tests understanding of robust error handling.
 */
export const TASK_010_ERROR_HANDLING: EvaluationTask = {
  id: 'task-010',
  name: 'Error Handling Pattern',
  category: 'code_generation',
  difficulty: 'medium',
  description: 'Implement robust error handling patterns.',
  prompt: `Implement a robust error handling system for an API client:

\`\`\`typescript
// Implement these types and functions:

// 1. AppError discriminated union with these error types:
//    - NetworkError (timeout, connection refused)
//    - ApiError (status code, response body)
//    - ValidationError (field-level errors)
//    - AuthError (token expired, invalid credentials)

// 2. Result<T, E> type (already defined, just use it)

// 3. Retry logic with exponential backoff for retryable errors

// 4. Error recovery strategies per error type
\`\`\`

Requirements:
- Type-safe error handling (no 'any')
- Each error type has appropriate properties
- Implement \`isRetryable(error: AppError): boolean\`
- Implement \`async retryWithBackoff<T>(fn: () => Promise<T>, maxRetries: number): Promise<Result<T, AppError>>\`
- Implement \`getErrorMessage(error: AppError): string\` for user-friendly messages

Provide complete implementation with examples.`,
  expectedOutcome: {
    mustContain: ['NetworkError', 'ApiError', 'isRetryable', 'backoff'],
    mustNotContain: ['any', 'as any'],
    mustMatch: ['type\\s+AppError', 'async\\s+.*retryWithBackoff'],
    shouldContainCode: true,
    expectedLanguage: 'typescript',
  },
  scoringRubric: {
    criteria: [
      {
        id: 'error_types',
        description: 'All error types correctly defined',
        weight: 0.3,
        maxScore: 10,
        indicators: ['NetworkError', 'ApiError', 'ValidationError', 'AuthError'],
      },
      {
        id: 'retry_logic',
        description: 'Correct exponential backoff implementation',
        weight: 0.3,
        maxScore: 10,
        indicators: ['exponential', 'backoff', 'Math.pow', 'delay'],
      },
      {
        id: 'type_safety',
        description: 'Type-safe implementation',
        weight: 0.2,
        maxScore: 10,
        indicators: ['discriminated', 'type guard', 'Result'],
      },
      {
        id: 'completeness',
        description: 'All functions implemented with examples',
        weight: 0.2,
        maxScore: 10,
        indicators: ['isRetryable', 'getErrorMessage', 'example'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 6,
  },
  timeoutMs: 60000,
  optimalCli: 'claude',
  acceptableClis: ['claude', 'codex', 'gemini'],
  tags: ['error-handling', 'retry', 'resilience', 'typescript'],
};
