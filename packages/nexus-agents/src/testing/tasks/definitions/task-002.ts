/**
 * nexus-agents/testing/tasks/definitions - Task 002
 *
 * Task 002: Complex Algorithm Design
 * Optimal for Claude - requires reasoning about efficiency and edge cases.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 2: Complex Algorithm Design
 * Optimal for Claude - requires reasoning about efficiency and edge cases.
 */
export const TASK_002_ALGORITHM_DESIGN: EvaluationTask = {
  id: 'task-002',
  name: 'Complex Algorithm Design',
  category: 'algorithm_design',
  difficulty: 'hard',
  description: 'Design an efficient algorithm with optimal time/space complexity.',
  prompt: `Design and implement a TypeScript class \`LRUCache<K, V>\` (Least Recently Used Cache) with O(1) time complexity for all operations.

Requirements:
- Constructor takes a capacity parameter
- \`get(key: K): V | undefined\` - returns value or undefined if not found
- \`put(key: K, value: V): void\` - inserts or updates value
- When capacity is exceeded, evict the least recently used item
- Both get and put should update the "recently used" status
- All operations must be O(1) time complexity

Explain your data structure choices and why they achieve O(1) complexity.

Include:
1. Complete implementation
2. Time/space complexity analysis
3. Example usage demonstrating eviction`,
  expectedOutcome: {
    mustContain: ['class', 'LRUCache', 'get', 'put', 'Map', 'O(1)'],
    mustNotContain: ['any', 'O(n)', 'Array.find', 'Array.indexOf'],
    mustMatch: ['class\\s+LRUCache'],
    shouldContainCode: true,
    expectedLanguage: 'typescript',
    minLength: 500,
  },
  scoringRubric: {
    criteria: [
      {
        id: 'correctness',
        description: 'LRU cache behaves correctly',
        weight: 0.3,
        maxScore: 10,
        indicators: ['capacity', 'evict', 'least recently'],
      },
      {
        id: 'complexity',
        description: 'Achieves O(1) time complexity',
        weight: 0.3,
        maxScore: 10,
        indicators: ['Map', 'doubly linked', 'O(1)'],
      },
      {
        id: 'explanation',
        description: 'Clear explanation of design choices',
        weight: 0.2,
        maxScore: 10,
        indicators: ['because', 'complexity', 'data structure'],
      },
      {
        id: 'type_safety',
        description: 'Generic types used correctly',
        weight: 0.2,
        maxScore: 10,
        indicators: ['<K, V>', 'generic', 'type'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 7,
    notes: 'O(1) typically requires combination of Map and doubly-linked list',
  },
  timeoutMs: 120000,
  optimalCli: 'claude',
  acceptableClis: ['claude', 'gemini'],
  tags: ['algorithm', 'data-structure', 'optimization', 'advanced'],
};
