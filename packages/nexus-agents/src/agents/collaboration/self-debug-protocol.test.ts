/**
 * Tests for Self-Debug Protocol.
 * (Source: Issue #131, arXiv:2304.05128)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelfDebugProtocol, createSelfDebugProtocol } from './self-debug-protocol.js';
import type { CodeExecutor, SelfDebugExecuteOptions } from './self-debug-protocol.js';
import type { ExecutionResult, ParsedError, SelfDebugConfig } from './self-debug-types.js';
// SyntheticDebugError exported for consumers but not used directly in tests

/**
 * Helper to create a test protocol with synthetic errors allowed.
 * (Issue #510) Tests use synthetic errors which require explicit opt-in.
 */
function createTestProtocol(config?: SelfDebugConfig): SelfDebugProtocol {
  return createSelfDebugProtocol({
    ...config,
    allowSyntheticErrors: true,
  });
}
import type {
  IAgent,
  Task,
  TaskResult,
  AgentMessage,
  AgentResponse,
  AgentState,
  AgentRole,
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
    role: 'custom' as AgentRole,
    state: 'idle' as AgentState,
    capabilities: [Cap.TASK_EXECUTION] as readonly AgentCapability[],
    execute: vi.fn((task: Task) => {
      const response = responses[callIndex] ?? 'No response';
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

function createSuccessExecutor(): CodeExecutor {
  return (_code: string): Promise<ExecutionResult> =>
    Promise.resolve({
      success: true,
      exitCode: 0,
      stdout: 'All tests passed',
      stderr: '',
      durationMs: 100,
      errors: [],
    });
}

function createFailingExecutor(errorOutput: string, errors: ParsedError[] = []): CodeExecutor {
  let callCount = 0;
  return (_code: string): Promise<ExecutionResult> => {
    callCount++;
    if (callCount > 2) {
      return Promise.resolve({
        success: true,
        exitCode: 0,
        stdout: 'Fixed!',
        stderr: '',
        durationMs: 100,
        errors: [],
      });
    }
    return Promise.resolve({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: errorOutput,
      durationMs: 100,
      errors,
    });
  };
}

function createPermanentlyFailingExecutor(errorOutput: string): CodeExecutor {
  return (_code: string): Promise<ExecutionResult> =>
    Promise.resolve({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: errorOutput,
      durationMs: 100,
      errors: [],
    });
}

const basicTask: Task = {
  id: 'test-task',
  description: 'Debug this code',
  context: {},
};

// =============================================================================
// Constructor Tests
// =============================================================================

describe('SelfDebugProtocol', () => {
  describe('constructor', () => {
    it('creates with default config', () => {
      const protocol = new SelfDebugProtocol();
      expect(protocol).toBeDefined();
    });

    it('creates with custom config', () => {
      const protocol = new SelfDebugProtocol({
        maxIterations: 10,
        includeExplanation: false,
      });
      expect(protocol).toBeDefined();
    });
  });

  describe('createSelfDebugProtocol', () => {
    it('creates protocol instance', () => {
      const protocol = createSelfDebugProtocol();
      expect(protocol).toBeInstanceOf(SelfDebugProtocol);
    });
  });
});

// =============================================================================
// Execute Tests
// =============================================================================

describe('execute', () => {
  let protocol: SelfDebugProtocol;

  beforeEach(() => {
    // Use createTestProtocol to allow synthetic errors (Issue #510)
    protocol = createTestProtocol({ maxIterations: 3 });
  });

  it('returns success when code passes initially', async () => {
    const agent = createMockAgent([]);
    const executor = createSuccessExecutor();

    const options: SelfDebugExecuteOptions = {
      code: 'const x = 1;',
      task: basicTask,
      agent,
      executor,
    };

    const result = await protocol.execute(options);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.stopReason).toBe('success');
      expect(result.value.totalIterations).toBe(0);
    }
  });

  it('attempts to fix errors through iterations', async () => {
    const agent = createMockAgent([
      'Summary: Undefined variable\nRoot cause: Variable not declared',
      '```javascript\nconst x = 1;\nconsole.log(x);\n```',
    ]);
    const executor = createFailingExecutor('ReferenceError: x is not defined');

    const options: SelfDebugExecuteOptions = {
      code: 'console.log(x);',
      task: basicTask,
      agent,
      executor,
    };

    const result = await protocol.execute(options);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.totalIterations).toBeGreaterThan(0);
    }
  });

  it('stops after max iterations', async () => {
    const agent = createMockAgent([
      'Explanation 1',
      '```javascript\nbroken code\n```',
      'Explanation 2',
      '```javascript\nstill broken\n```',
      'Explanation 3',
      '```javascript\nstill broken\n```',
    ]);
    const executor = createPermanentlyFailingExecutor('Error: always fails');

    const options: SelfDebugExecuteOptions = {
      code: 'broken();',
      task: basicTask,
      agent,
      executor,
    };

    const result = await protocol.execute(options);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(false);
      expect(result.value.stopReason).toBe('max_iterations');
      expect(result.value.totalIterations).toBe(3);
    }
  });

  it('tracks errors fixed across iterations', async () => {
    let callCount = 0;
    const executor: CodeExecutor = (_code: string) => {
      callCount++;
      // Initial execution + first iteration's first check = 2 calls with errors
      // Third call (after fix applied) succeeds
      if (callCount <= 2) {
        return Promise.resolve({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'Error 1\nError 2',
          durationMs: 100,
          errors: [
            {
              id: 'e1',
              category: 'type',
              severity: 'error',
              message: 'Error 1',
              rawError: 'Error 1',
            },
            {
              id: 'e2',
              category: 'type',
              severity: 'error',
              message: 'Error 2',
              rawError: 'Error 2',
            },
          ],
        });
      }
      return Promise.resolve({
        success: true,
        exitCode: 0,
        stdout: 'Fixed!',
        stderr: '',
        durationMs: 100,
        errors: [],
      });
    };

    const agent = createMockAgent(['Fix explanation', '```\nfixed code\n```']);

    const result = await protocol.execute({
      code: 'broken',
      task: basicTask,
      agent,
      executor,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.errorsFixed.length).toBeGreaterThan(0);
    }
  });

  it('handles executor errors gracefully', async () => {
    const agent = createMockAgent(['Explanation', '```\nfixed\n```']);
    const executor: CodeExecutor = () => {
      return Promise.reject(new Error('Executor crashed'));
    };

    const result = await protocol.execute({
      code: 'code',
      task: basicTask,
      agent,
      executor,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(false);
    }
  });
});

// =============================================================================
// Cancel Tests
// =============================================================================

describe('cancel', () => {
  it('cancels during execution', async () => {
    const protocol = createTestProtocol({ maxIterations: 10 });

    let execCount = 0;
    const executor: CodeExecutor = () => {
      execCount++;
      if (execCount === 2) {
        protocol.cancel('User requested');
      }
      return Promise.resolve({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'error',
        durationMs: 10,
        errors: [],
      });
    };

    const agent = createMockAgent(Array<string>(20).fill('```\ncode\n```'));

    const result = await protocol.execute({
      code: 'broken',
      task: basicTask,
      agent,
      executor,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stopReason).toBe('cancelled');
    }
  });
});

// =============================================================================
// Error Parsing Tests
// =============================================================================

describe('parseErrors', () => {
  let protocol: SelfDebugProtocol;

  beforeEach(() => {
    protocol = new SelfDebugProtocol();
  });

  it('returns pre-parsed errors if available', () => {
    const errors: ParsedError[] = [
      { id: 'e1', category: 'type', severity: 'error', message: 'Type error', rawError: 'raw' },
    ];

    const result: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      durationMs: 100,
      errors,
    };

    const parsed = protocol.parseErrors(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.message).toBe('Type error');
  });

  it('parses TypeScript errors', () => {
    const result: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'src/index.ts(10,5): error TS2345: Argument of type string is not assignable',
      durationMs: 100,
      errors: [],
    };

    const parsed = protocol.parseErrors(result);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]?.category).toBe('type');
    expect(parsed[0]?.location?.line).toBe(10);
    expect(parsed[0]?.location?.column).toBe(5);
  });

  it('parses ESLint errors', () => {
    const result: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'src/app.js:15:10: error Unexpected token',
      durationMs: 100,
      errors: [],
    };

    const parsed = protocol.parseErrors(result);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]?.location?.line).toBe(15);
    expect(parsed[0]?.location?.column).toBe(10);
  });

  it('parses Go errors', () => {
    const result: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'main.go:25:8: undefined: someFunction',
      durationMs: 100,
      errors: [],
    };

    const parsed = protocol.parseErrors(result);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]?.location?.file).toBe('main.go');
    expect(parsed[0]?.location?.line).toBe(25);
  });

  it('returns empty array for successful execution', () => {
    const result: ExecutionResult = {
      success: true,
      exitCode: 0,
      stdout: 'OK',
      stderr: '',
      durationMs: 100,
      errors: [],
    };

    const parsed = protocol.parseErrors(result);
    expect(parsed).toHaveLength(0);
  });
});

// =============================================================================
// Configuration Tests
// =============================================================================

describe('configuration', () => {
  it('respects maxIterations setting', async () => {
    const protocol = createTestProtocol({ maxIterations: 2 });
    const agent = createMockAgent(Array<string>(10).fill('```\ncode\n```'));
    const executor = createPermanentlyFailingExecutor('error');

    const result = await protocol.execute({
      code: 'broken',
      task: basicTask,
      agent,
      executor,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalIterations).toBe(2);
    }
  });

  it('skips explanations when includeExplanation is false', async () => {
    const protocol = createTestProtocol({ maxIterations: 1, includeExplanation: false });
    const agent = createMockAgent(['```\nfixed\n```']);
    const executor = createPermanentlyFailingExecutor('error');

    const result = await protocol.execute({
      code: 'broken',
      task: basicTask,
      agent,
      executor,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.history[0]?.explanations).toHaveLength(0);
    }
  });
});

// =============================================================================
// History Tracking Tests
// =============================================================================

describe('history tracking', () => {
  it('records iteration details', async () => {
    const protocol = createTestProtocol({ maxIterations: 2 });
    const agent = createMockAgent([
      'Explanation',
      '```\nfixed\n```',
      'Explanation 2',
      '```\nstill broken\n```',
    ]);
    const executor = createPermanentlyFailingExecutor('Test error');

    const result = await protocol.execute({
      code: 'const broken = true;',
      task: basicTask,
      agent,
      executor,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.history.length).toBe(2);
      expect(result.value.history[0]?.iteration).toBe(1);
      expect(result.value.history[1]?.iteration).toBe(2);
      expect(result.value.history[0]?.codeSnapshot).toBeDefined();
      expect(result.value.history[0]?.executionResult).toBeDefined();
    }
  });

  it('tracks proposed and applied fixes', async () => {
    const protocol = createTestProtocol({ maxIterations: 1 });
    const agent = createMockAgent(['Explanation', '```javascript\nconst fixed = true;\n```']);
    const executor = createPermanentlyFailingExecutor('Error');

    const result = await protocol.execute({
      code: 'broken',
      task: basicTask,
      agent,
      executor,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const firstIter = result.value.history[0];
      expect(firstIter?.proposedFixes.length).toBeGreaterThan(0);
      expect(firstIter?.appliedFix).toBeDefined();
    }
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('edge cases', () => {
  it('handles empty code', async () => {
    const protocol = new SelfDebugProtocol();
    const agent = createMockAgent([]);
    const executor = createSuccessExecutor();

    const result = await protocol.execute({
      code: '',
      task: basicTask,
      agent,
      executor,
    });

    expect(result.ok).toBe(true);
  });

  it('handles agent returning empty response', async () => {
    const protocol = createTestProtocol({ maxIterations: 1 });
    const agent = createMockAgent(['', '']);
    const executor = createPermanentlyFailingExecutor('error');

    const result = await protocol.execute({
      code: 'broken',
      task: basicTask,
      agent,
      executor,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(false);
    }
  });

  it('handles multiple errors in output', () => {
    const protocol = new SelfDebugProtocol();
    const result: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: `src/a.ts(1,1): error TS1001: First error
src/b.ts(2,2): error TS1002: Second error
src/c.ts(3,3): error TS1003: Third error`,
      durationMs: 100,
      errors: [],
    };

    const parsed = protocol.parseErrors(result);
    expect(parsed.length).toBe(3);
  });
});
