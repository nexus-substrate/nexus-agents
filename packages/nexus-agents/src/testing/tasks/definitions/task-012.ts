/**
 * nexus-agents/testing/tasks/definitions - Task 012
 *
 * Task 012: Concurrent Code
 * Tests understanding of concurrency patterns.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 12: Concurrent Code
 * Tests understanding of concurrency patterns.
 */
export const TASK_012_CONCURRENCY: EvaluationTask = {
  id: 'task-012',
  name: 'Concurrent Code',
  category: 'code_generation',
  difficulty: 'hard',
  description: 'Implement safe concurrent operations.',
  prompt: `Implement a concurrent task queue with the following features:

\`\`\`typescript
interface ConcurrentQueue<T, R> {
  // Add a task to the queue
  enqueue(task: () => Promise<T>): Promise<R>;

  // Pause processing (finish current, don't start new)
  pause(): void;

  // Resume processing
  resume(): void;

  // Get current queue statistics
  getStats(): QueueStats;

  // Graceful shutdown (wait for all to complete)
  shutdown(): Promise<void>;
}

interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
}
\`\`\`

Requirements:
- Maximum concurrency limit (configurable)
- Tasks execute in order (FIFO)
- Individual task timeout support
- Error handling (don't stop queue on single failure)
- Progress tracking
- Memory efficient (don't hold completed results indefinitely)

Provide complete TypeScript implementation with:
1. The ConcurrentQueue class
2. Error handling for task failures
3. Example usage showing pause/resume
4. Unit test outline`,
  expectedOutcome: {
    mustContain: ['Promise', 'async', 'concurrency', 'queue', 'pending'],
    mustNotContain: ['any'],
    shouldContainCode: true,
    expectedLanguage: 'typescript',
    minLength: 600,
  },
  scoringRubric: {
    criteria: [
      {
        id: 'correctness',
        description: 'Queue functions correctly',
        weight: 0.35,
        maxScore: 10,
        indicators: ['enqueue', 'dequeue', 'process', 'FIFO'],
      },
      {
        id: 'concurrency_control',
        description: 'Proper concurrency limiting',
        weight: 0.25,
        maxScore: 10,
        indicators: ['maxConcurrency', 'running', 'limit'],
      },
      {
        id: 'pause_resume',
        description: 'Pause/resume works correctly',
        weight: 0.2,
        maxScore: 10,
        indicators: ['pause', 'resume', 'paused'],
      },
      {
        id: 'error_handling',
        description: 'Handles failures gracefully',
        weight: 0.2,
        maxScore: 10,
        indicators: ['catch', 'failed', 'continue'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 6,
  },
  timeoutMs: 90000,
  optimalCli: 'claude',
  acceptableClis: ['claude', 'codex'],
  tags: ['concurrency', 'async', 'queue', 'advanced'],
};
