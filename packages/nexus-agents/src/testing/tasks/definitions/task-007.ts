/**
 * nexus-agents/testing/tasks/definitions - Task 007
 *
 * Task 007: Bug Debugging
 * Tests debugging and problem-solving skills.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 7: Bug Debugging
 * Tests debugging and problem-solving skills.
 */
export const TASK_007_DEBUGGING: EvaluationTask = {
  id: 'task-007',
  name: 'Bug Debugging',
  category: 'debugging',
  difficulty: 'medium',
  description: 'Identify and fix bugs in provided code.',
  prompt: `The following code has several bugs. Find and fix all of them:

\`\`\`typescript
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(count: number = 1): Promise<boolean> {
    this.refill();

    if (this.tokens >= count) {
      this.tokens =- count;  // Bug 1: typo
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    // Bug 2: lastRefill not updated
  }

  async acquireOrWait(count: number = 1, timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await this.acquire(count)) {
        return true;
      }
      // Bug 3: no await, causes infinite loop
      new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }

  getAvailableTokens(): number {
    // Bug 4: should refill before returning
    return this.tokens;
  }
}
\`\`\`

For each bug:
1. Identify the bug
2. Explain why it's a problem
3. Provide the fix
4. Show the complete corrected code`,
  expectedOutcome: {
    mustContain: ['-=', 'lastRefill', 'await', 'refill'],
    mustNotContain: ['=-'],
    shouldContainCode: true,
    expectedLanguage: 'typescript',
  },
  scoringRubric: {
    criteria: [
      {
        id: 'bug_identification',
        description: 'All 4 bugs correctly identified',
        weight: 0.4,
        maxScore: 10,
        indicators: ['Bug 1', 'Bug 2', 'Bug 3', 'Bug 4'],
      },
      {
        id: 'explanations',
        description: 'Clear explanations of why each is a bug',
        weight: 0.2,
        maxScore: 10,
        indicators: ['because', 'causes', 'results in'],
      },
      {
        id: 'correct_fixes',
        description: 'All fixes are correct',
        weight: 0.3,
        maxScore: 10,
        indicators: ['-=', 'lastRefill =', 'await'],
      },
      {
        id: 'complete_code',
        description: 'Complete corrected code provided',
        weight: 0.1,
        maxScore: 10,
        indicators: ['class', 'RateLimiter', 'export'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 7,
  },
  timeoutMs: 60000,
  optimalCli: 'claude',
  acceptableClis: ['claude', 'codex', 'gemini'],
  tags: ['debugging', 'bug-fix', 'code-review', 'async'],
};
