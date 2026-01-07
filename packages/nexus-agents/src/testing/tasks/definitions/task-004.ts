/**
 * nexus-agents/testing/tasks/definitions - Task 004
 *
 * Task 004: Rapid Test Generation
 * Optimal for Codex - fast, repetitive code generation.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 4: Rapid Test Generation
 * Optimal for Codex - fast, repetitive code generation.
 */
export const TASK_004_TEST_GENERATION: EvaluationTask = {
  id: 'task-004',
  name: 'Rapid Test Generation',
  category: 'test_generation',
  difficulty: 'medium',
  description: 'Generate comprehensive unit tests quickly.',
  prompt: `Generate Vitest unit tests for the following TypeScript function:

\`\`\`typescript
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: Date;
}

function validateUser(user: unknown): user is User {
  if (typeof user !== 'object' || user === null) return false;

  const u = user as Record<string, unknown>;

  return (
    typeof u.id === 'string' && u.id.length > 0 &&
    typeof u.email === 'string' && /^[^@]+@[^@]+\\.[^@]+$/.test(u.email) &&
    typeof u.name === 'string' && u.name.length > 0 &&
    (u.role === 'admin' || u.role === 'user' || u.role === 'guest') &&
    u.createdAt instanceof Date && !isNaN(u.createdAt.getTime())
  );
}
\`\`\`

Generate tests covering:
1. Valid users with all role types
2. Invalid id (empty, wrong type, missing)
3. Invalid email (wrong format, wrong type, missing)
4. Invalid name (empty, wrong type, missing)
5. Invalid role (wrong value, wrong type, missing)
6. Invalid createdAt (invalid date, wrong type, missing)
7. Null and undefined inputs
8. Non-object inputs (string, number, array)

Use describe/it blocks with clear test names.`,
  expectedOutcome: {
    mustContain: ['describe', 'it', 'expect', 'validateUser', 'true', 'false'],
    mustNotContain: ['any', 'jest', 'mocha'],
    mustMatch: ['describe\\s*\\(', 'it\\s*\\(', 'expect\\s*\\('],
    shouldContainCode: true,
    expectedLanguage: 'typescript',
    minLength: 800,
  },
  scoringRubric: {
    criteria: [
      {
        id: 'coverage',
        description: 'Tests cover all specified scenarios',
        weight: 0.4,
        maxScore: 10,
        indicators: ['admin', 'user', 'guest', 'null', 'undefined'],
      },
      {
        id: 'structure',
        description: 'Well-organized describe/it blocks',
        weight: 0.2,
        maxScore: 10,
        indicators: ['describe', 'it', 'nested'],
      },
      {
        id: 'assertions',
        description: 'Correct assertions for each case',
        weight: 0.3,
        maxScore: 10,
        indicators: ['toBe(true)', 'toBe(false)', 'expect'],
      },
      {
        id: 'edge_cases',
        description: 'Handles edge cases well',
        weight: 0.1,
        maxScore: 10,
        indicators: ['null', 'undefined', 'empty'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 6,
  },
  timeoutMs: 45000,
  optimalCli: 'codex',
  acceptableClis: ['codex', 'claude', 'gemini'],
  tags: ['testing', 'vitest', 'validation', 'coverage'],
};
