/**
 * nexus-agents/testing/tasks/definitions - Task 009
 *
 * Task 009: Performance Optimization
 * Tests ability to identify and fix performance issues.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 9: Performance Optimization
 * Tests ability to identify and fix performance issues.
 */
export const TASK_009_PERFORMANCE: EvaluationTask = {
  id: 'task-009',
  name: 'Performance Optimization',
  category: 'algorithm_design',
  difficulty: 'hard',
  description: 'Identify and fix performance bottlenecks.',
  prompt: `Optimize the following code for better performance:

\`\`\`typescript
interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  tags: string[];
}

function searchProducts(
  products: Product[],
  query: string,
  category?: string,
  minPrice?: number,
  maxPrice?: number,
  tags?: string[]
): Product[] {
  let results = products;

  // Filter by category
  if (category) {
    results = results.filter(p => p.category === category);
  }

  // Filter by price range
  if (minPrice !== undefined) {
    results = results.filter(p => p.price >= minPrice);
  }
  if (maxPrice !== undefined) {
    results = results.filter(p => p.price <= maxPrice);
  }

  // Filter by tags (must have all specified tags)
  if (tags && tags.length > 0) {
    results = results.filter(p =>
      tags.every(tag => p.tags.includes(tag))
    );
  }

  // Search by name (case-insensitive partial match)
  if (query) {
    const lowerQuery = query.toLowerCase();
    results = results.filter(p =>
      p.name.toLowerCase().includes(lowerQuery)
    );
  }

  return results;
}
\`\`\`

This function is called frequently with 100,000+ products.

Provide:
1. Analysis of current performance issues
2. Optimized implementation
3. Big-O analysis (before and after)
4. Consider indexing strategies
5. Benchmark comparison approach`,
  expectedOutcome: {
    mustContain: ['O(n)', 'index', 'Map', 'Set', 'optimize'],
    mustNotContain: [],
    shouldContainCode: true,
    expectedLanguage: 'typescript',
    minLength: 600,
  },
  scoringRubric: {
    criteria: [
      {
        id: 'problem_identification',
        description: 'Correctly identifies performance issues',
        weight: 0.25,
        maxScore: 10,
        indicators: ['multiple passes', 'O(n)', 'inefficient'],
      },
      {
        id: 'optimization',
        description: 'Provides effective optimization',
        weight: 0.35,
        maxScore: 10,
        indicators: ['Map', 'Set', 'index', 'single pass'],
      },
      {
        id: 'complexity_analysis',
        description: 'Accurate Big-O analysis',
        weight: 0.2,
        maxScore: 10,
        indicators: ['O(n)', 'O(1)', 'O(m)', 'complexity'],
      },
      {
        id: 'practical_approach',
        description: 'Considers real-world factors',
        weight: 0.2,
        maxScore: 10,
        indicators: ['memory', 'trade-off', 'benchmark'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 6,
  },
  timeoutMs: 90000,
  optimalCli: 'claude',
  acceptableClis: ['claude', 'gemini'],
  tags: ['performance', 'optimization', 'algorithm', 'indexing'],
};
