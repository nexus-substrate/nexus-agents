/**
 * TRINITY Test Fixtures
 *
 * Sample responses and mock helpers for TRINITY E2E tests.
 * Extracted to keep main test file under 400 lines.
 *
 * @module testing/e2e/agents/trinity-fixtures
 */

import { vi } from 'vitest';
import type {
  IAgent,
  Task,
  TaskResult,
  AgentMessage,
  AgentResponse,
  AgentCapability,
} from '../../../core/index.js';
import { ok, err, AgentError, AgentCapability as Cap } from '../../../core/index.js';
import { generateTestId } from '../utils/index.js';

// =============================================================================
// Mock Agent Factory
// =============================================================================

export interface MockAgentOptions {
  responses?: string[];
  failOnCall?: number;
  delayMs?: number;
}

export function createMockAgent(options: MockAgentOptions = {}): IAgent {
  const { responses = [], failOnCall, delayMs = 0 } = options;
  let callIndex = 0;

  return {
    id: generateTestId('mock-agent'),
    role: 'custom',
    state: 'idle',
    capabilities: [Cap.TASK_EXECUTION] as readonly AgentCapability[],
    execute: vi.fn(async (task: Task) => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      if (failOnCall !== undefined && callIndex === failOnCall) {
        callIndex++;
        return err(new AgentError('Simulated agent failure'));
      }
      const response = responses[callIndex] ?? 'Default response';
      callIndex++;
      const result: TaskResult = {
        taskId: task.id,
        output: response,
        metadata: { durationMs: 100, tokensUsed: 50, toolsUsed: [], model: 'mock' },
      };
      return ok(result);
    }),
    handleMessage: vi.fn((_msg: AgentMessage) => {
      const response: AgentResponse = { messageId: _msg.id, status: 'completed' };
      return Promise.resolve(ok(response));
    }),
    initialize: vi.fn(() => Promise.resolve(ok(undefined))),
    cleanup: vi.fn(() => Promise.resolve()),
  };
}

export function createTestTask(description: string): Task {
  return { id: generateTestId('task'), description, context: {} };
}

// =============================================================================
// Sample TRINITY Responses
// =============================================================================

export const THINKER_SORT = `Problem Analysis: Implement efficient sorting.

Approach:
1. Use quicksort for O(n log n) average
2. Handle edge cases

Considerations:
- Memory efficiency
- Stability

Success Criteria:
- Returns sorted array
- Handles empty input`;

export const WORKER_SORT = `Implementation:
\`\`\`typescript
function quickSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;
  const pivot = arr[Math.floor(arr.length / 2)];
  return [...quickSort(arr.filter(x => x < pivot)), ...arr.filter(x => x === pivot), ...quickSort(arr.filter(x => x > pivot))];
}
\`\`\`

Steps Completed:
- Base case handling
- Recursive sorting

Deviations:
- None

Questions:
- None`;

export const VERIFIER_PASS = `Verdict: PASS

Correctness Check: Implementation correctly sorts arrays.

Quality Check: Clean code, handles edge cases.

Issues Found:
- None

Recommendations:
- Add JSDoc`;

export const VERIFIER_FAIL = `Verdict: FAIL

Correctness Check: Missing edge case handling.

Quality Check: Needs improvement.

Issues Found:
- No input validation
- Memory inefficient

Recommendations:
- Add input validation
- Use in-place sorting`;

export const THINKER_BUCKET = `Problem Analysis: Design rate limiter with token bucket.

Approach:
1. Define capacity and refill rate
2. Track tokens and timestamps

Considerations:
- Thread safety
- Precision

Success Criteria:
- Enforces rate limit
- Handles burst traffic`;

export const WORKER_BUCKET = `Implementation:
\`\`\`typescript
class TokenBucket {
  constructor(private capacity: number, private rate: number) {}
  tryConsume(): boolean { return this.capacity > 0 && (this.capacity--, true); }
}
\`\`\`

Steps Completed:
- Token bucket class
- Consume method

Deviations:
- Used class instead of functional approach

Questions:
- None`;
