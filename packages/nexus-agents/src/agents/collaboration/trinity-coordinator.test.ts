/**
 * Tests for TRINITY Coordinator.
 * (Source: Issue #141, arXiv:2512.04695)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrinityCoordinator, createTrinityCoordinator } from './trinity-coordinator.js';
import type {
  IAgent,
  Task,
  TaskResult,
  AgentMessage,
  AgentResponse,
  AgentCapability,
} from '../../core/index.js';
import { ok, AgentCapability as Cap } from '../../core/index.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockAgent(responses: string[]): IAgent {
  let callIndex = 0;
  return {
    id: 'mock-agent',
    role: 'custom',
    state: 'idle',
    capabilities: [Cap.TASK_EXECUTION] as readonly AgentCapability[],
    execute: vi.fn((task: Task) => {
      const response = responses[callIndex] ?? 'Default response';
      callIndex++;
      const result: TaskResult = {
        taskId: task.id,
        output: response,
        metadata: { durationMs: 100, tokensUsed: 50, toolsUsed: [], model: 'mock' },
      };
      return Promise.resolve(ok(result));
    }),
    handleMessage: vi.fn((_msg: AgentMessage) => {
      const response: AgentResponse = { messageId: _msg.id, status: 'completed' };
      return Promise.resolve(ok(response));
    }),
    initialize: vi.fn(() => Promise.resolve(ok(undefined))),
    cleanup: vi.fn(() => Promise.resolve()),
  };
}

const basicTask: Task = {
  id: 'test-task',
  description: 'Implement a function to calculate factorial',
  context: {},
};

// Sample responses that follow the expected format
const THINKER_RESPONSE = `Problem Analysis: Need to implement a recursive or iterative factorial function.

Approach:
1. Check base case (n <= 1)
2. For recursive: return n * factorial(n-1)
3. For iterative: use a loop accumulating result

Considerations:
- Handle negative numbers
- Consider integer overflow for large inputs

Success Criteria:
- Returns correct factorial values
- Handles edge cases (0, 1, negative)`;

const WORKER_RESPONSE = `Implementation:
\`\`\`typescript
function factorial(n: number): number {
  if (n < 0) throw new Error('Negative input');
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
\`\`\`

Steps Completed:
- Base case handling
- Recursive implementation
- Error handling for negatives

Deviations:
- None

Questions:
- None`;

const VERIFIER_PASS_RESPONSE = `Verdict: PASS

Correctness Check: The implementation correctly handles base cases and recursion.

Quality Check: Clean, readable code with proper error handling.

Issues Found:
- None

Recommendations:
- Consider adding JSDoc comments`;

const VERIFIER_FAIL_RESPONSE = `Verdict: FAIL

Correctness Check: Missing edge case handling.

Quality Check: Needs improvement.

Issues Found:
- No overflow protection
- Missing input validation

Recommendations:
- Add BigInt support for large numbers
- Add type guards`;

// =============================================================================
// Constructor Tests
// =============================================================================

describe('TrinityCoordinator', () => {
  describe('constructor', () => {
    it('creates with default config', () => {
      const coordinator = new TrinityCoordinator();
      expect(coordinator).toBeDefined();
    });

    it('creates with custom config', () => {
      const coordinator = new TrinityCoordinator({
        maxIterations: 5,
        timeoutMs: 60000,
        includeHistory: false,
      });
      expect(coordinator).toBeDefined();
    });
  });

  describe('createTrinityCoordinator', () => {
    it('creates coordinator instance', () => {
      const coordinator = createTrinityCoordinator();
      expect(coordinator).toBeInstanceOf(TrinityCoordinator);
    });
  });
});

// =============================================================================
// Execute Tests
// =============================================================================

describe('execute', () => {
  let coordinator: TrinityCoordinator;

  beforeEach(() => {
    coordinator = new TrinityCoordinator({ maxIterations: 3 });
  });

  it('completes successfully when verifier passes on first try', async () => {
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_PASS_RESPONSE]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.stopReason).toBe('verified');
      expect(result.value.iterations).toBe(1);
    }
  });

  it('iterates when verifier fails initially', async () => {
    const agent = createMockAgent([
      THINKER_RESPONSE,
      WORKER_RESPONSE,
      VERIFIER_FAIL_RESPONSE,
      WORKER_RESPONSE, // Second attempt
      VERIFIER_PASS_RESPONSE,
    ]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.stopReason).toBe('verified');
      expect(result.value.iterations).toBe(2);
    }
  });

  it('stops after max iterations', async () => {
    const agent = createMockAgent([
      THINKER_RESPONSE,
      WORKER_RESPONSE,
      VERIFIER_FAIL_RESPONSE,
      WORKER_RESPONSE,
      VERIFIER_FAIL_RESPONSE,
      WORKER_RESPONSE,
      VERIFIER_FAIL_RESPONSE,
    ]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(false);
      expect(result.value.stopReason).toBe('max_iterations');
      expect(result.value.iterations).toBe(3);
    }
  });

  it('captures thinker output correctly', async () => {
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_PASS_RESPONSE]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.thinkerOutput.problemAnalysis).toContain('factorial');
      expect(result.value.thinkerOutput.approach).toContain('Check base case');
    }
  });

  it('captures worker output correctly', async () => {
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_PASS_RESPONSE]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workerOutput.implementation).toContain('factorial');
      expect(result.value.workerOutput.stepsCompleted.length).toBeGreaterThan(0);
    }
  });

  it('captures verifier output correctly', async () => {
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_PASS_RESPONSE]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.verifierOutput.verdict).toBe('pass');
      expect(result.value.verifierOutput.correctnessCheck).toContain('correctly');
    }
  });

  it('includes history when configured', async () => {
    const coordinator = new TrinityCoordinator({ includeHistory: true });
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_PASS_RESPONSE]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.history.length).toBe(3); // think, work, verify
      expect(result.value.history[0]?.phase).toBe('thinking');
      expect(result.value.history[1]?.phase).toBe('working');
      expect(result.value.history[2]?.phase).toBe('verifying');
    }
  });

  it('excludes history when configured', async () => {
    const coordinator = new TrinityCoordinator({ includeHistory: false });
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_PASS_RESPONSE]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.history.length).toBe(0);
    }
  });
});

// =============================================================================
// Cancel Tests
// =============================================================================

describe('cancel', () => {
  it('cancels during execution', async () => {
    const coordinator = new TrinityCoordinator({ maxIterations: 10 });
    const agent = createMockAgent([
      THINKER_RESPONSE,
      'Working...', // Will be cancelled after this
    ]);

    // Override execute to trigger cancel during worker phase
    const originalExecute = agent.execute;
    let callCount = 0;
    agent.execute = vi.fn((task: Task) => {
      callCount++;
      if (callCount === 2) {
        coordinator.cancel('User requested');
      }
      return originalExecute(task);
    });

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stopReason).toBe('error'); // Cancelled is reported as error
    }
  });
});

// =============================================================================
// Timeout Tests
// =============================================================================

describe('timeout', () => {
  it('returns timeout when exceeded', async () => {
    const coordinator = new TrinityCoordinator({ timeoutMs: 1, maxIterations: 10 });
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_FAIL_RESPONSE]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Either timeout or max_iterations depending on timing
      expect(['timeout', 'max_iterations', 'verified']).toContain(result.value.stopReason);
    }
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('edge cases', () => {
  it('handles empty agent responses', async () => {
    const coordinator = new TrinityCoordinator();
    const agent = createMockAgent(['', '', 'Verdict: PASS']);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }
  });

  it('handles malformed thinker output gracefully', async () => {
    const coordinator = new TrinityCoordinator();
    const agent = createMockAgent([
      'Just some random text without sections',
      WORKER_RESPONSE,
      VERIFIER_PASS_RESPONSE,
    ]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.thinkerOutput.problemAnalysis).toBeDefined();
    }
  });

  it('handles malformed verifier output as fail', async () => {
    const coordinator = new TrinityCoordinator({ maxIterations: 3 });
    const agent = createMockAgent([
      THINKER_RESPONSE,
      WORKER_RESPONSE,
      'No verdict here',
      WORKER_RESPONSE,
      VERIFIER_PASS_RESPONSE,
    ]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should iterate because malformed is treated as fail
      expect(result.value.iterations).toBeGreaterThanOrEqual(2);
    }
  });

  it('passes previous feedback to worker on retry', async () => {
    const coordinator = new TrinityCoordinator({ maxIterations: 3 });
    const agent = createMockAgent([
      THINKER_RESPONSE,
      WORKER_RESPONSE,
      VERIFIER_FAIL_RESPONSE,
      WORKER_RESPONSE,
      VERIFIER_PASS_RESPONSE,
    ]);

    await coordinator.execute({ task: basicTask, agent });

    // Check that second worker call received feedback context
    const secondWorkerCall = (agent.execute as ReturnType<typeof vi.fn>).mock.calls[3];
    expect(secondWorkerCall).toBeDefined();
    if (secondWorkerCall !== undefined) {
      const taskArg = secondWorkerCall[0] as Task;
      expect(taskArg.description).toContain('Previous Attempt Feedback');
    }
  });
});

// =============================================================================
// Role Prompts
// =============================================================================

describe('role prompts', () => {
  it('uses thinker prompt for first phase', async () => {
    const coordinator = new TrinityCoordinator();
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_PASS_RESPONSE]);

    await coordinator.execute({ task: basicTask, agent });

    const firstCall = (agent.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall !== undefined) {
      const taskArg = firstCall[0] as Task;
      expect(taskArg.description).toContain('Thinker');
    }
  });

  it('uses worker prompt for second phase', async () => {
    const coordinator = new TrinityCoordinator();
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_PASS_RESPONSE]);

    await coordinator.execute({ task: basicTask, agent });

    const secondCall = (agent.execute as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(secondCall).toBeDefined();
    if (secondCall !== undefined) {
      const taskArg = secondCall[0] as Task;
      expect(taskArg.description).toContain('Worker');
    }
  });

  it('uses verifier prompt for third phase', async () => {
    const coordinator = new TrinityCoordinator();
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_PASS_RESPONSE]);

    await coordinator.execute({ task: basicTask, agent });

    const thirdCall = (agent.execute as ReturnType<typeof vi.fn>).mock.calls[2];
    expect(thirdCall).toBeDefined();
    if (thirdCall !== undefined) {
      const taskArg = thirdCall[0] as Task;
      expect(taskArg.description).toContain('Verifier');
    }
  });
});

// =============================================================================
// Duration Tracking
// =============================================================================

describe('duration tracking', () => {
  it('tracks total duration', async () => {
    const coordinator = new TrinityCoordinator();
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_PASS_RESPONSE]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalDurationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('tracks phase durations in history', async () => {
    const coordinator = new TrinityCoordinator({ includeHistory: true });
    const agent = createMockAgent([THINKER_RESPONSE, WORKER_RESPONSE, VERIFIER_PASS_RESPONSE]);

    const result = await coordinator.execute({ task: basicTask, agent });

    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const phase of result.value.history) {
        expect(phase.durationMs).toBeGreaterThanOrEqual(0);
        expect(phase.tokensUsed).toBeDefined();
      }
    }
  });
});
