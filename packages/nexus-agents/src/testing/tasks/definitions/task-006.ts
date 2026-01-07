/**
 * nexus-agents/testing/tasks/definitions - Task 006
 *
 * Task 006: Code Refactoring
 * Tests ability to improve existing code.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 6: Code Refactoring
 * Tests ability to improve existing code.
 */
export const TASK_006_REFACTORING: EvaluationTask = {
  id: 'task-006',
  name: 'Code Refactoring',
  category: 'refactoring',
  difficulty: 'medium',
  description: 'Refactor code to improve quality without changing behavior.',
  prompt: `Refactor the following TypeScript code to improve readability, maintainability, and type safety:

\`\`\`typescript
async function process(data: any) {
  let result = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i].type == 'user') {
      if (data[i].active == true) {
        if (data[i].email != null && data[i].email != '') {
          let user = {
            id: data[i].id,
            email: data[i].email.toLowerCase(),
            name: data[i].firstName + ' ' + data[i].lastName,
            status: 'active'
          };
          result.push(user);
        }
      }
    } else if (data[i].type == 'admin') {
      if (data[i].active == true) {
        if (data[i].email != null && data[i].email != '') {
          let admin = {
            id: data[i].id,
            email: data[i].email.toLowerCase(),
            name: data[i].firstName + ' ' + data[i].lastName,
            status: 'active',
            permissions: data[i].permissions || []
          };
          result.push(admin);
        }
      }
    }
  }
  return result;
}
\`\`\`

Requirements:
1. Add proper TypeScript types (no 'any')
2. Reduce nesting (max 2 levels)
3. Extract reusable logic
4. Use modern JavaScript features
5. Add input validation
6. Keep the same behavior

Show the refactored code with brief explanations of changes.`,
  expectedOutcome: {
    mustContain: ['interface', 'type', 'filter', 'map'],
    mustNotContain: ['any', '== true', '== null'],
    mustMatch: ['interface\\s+\\w+'],
    shouldContainCode: true,
    expectedLanguage: 'typescript',
  },
  scoringRubric: {
    criteria: [
      {
        id: 'type_safety',
        description: 'Proper TypeScript types added',
        weight: 0.3,
        maxScore: 10,
        indicators: ['interface', 'type', 'readonly'],
      },
      {
        id: 'reduced_nesting',
        description: 'Nesting reduced to 2 levels',
        weight: 0.25,
        maxScore: 10,
        indicators: ['filter', 'map', 'early return'],
      },
      {
        id: 'modern_js',
        description: 'Uses modern JavaScript features',
        weight: 0.25,
        maxScore: 10,
        indicators: ['const', '=>', 'template', 'destructuring'],
      },
      {
        id: 'behavior_preserved',
        description: 'Original behavior preserved',
        weight: 0.2,
        maxScore: 10,
        indicators: ['toLowerCase', 'active', 'email'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 6,
  },
  timeoutMs: 60000,
  optimalCli: 'claude',
  acceptableClis: ['claude', 'codex', 'gemini'],
  tags: ['refactoring', 'clean-code', 'typescript', 'best-practices'],
};
