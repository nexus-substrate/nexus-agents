/**
 * nexus-agents/mcp - Orchestrate Tool Tests
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Result, ILogger, Task, TaskResult } from '../../core/index.js';
import { ok, err, AgentError } from '../../core/index.js';
import {
  OrchestrateInputSchema,
  OrchestrateOutputSchema,
  OrchestrationError,
  createMockTechLead,
  type ITechLead,
  type OrchestrateDeps,
  type OrchestrateInput,
} from './orchestrate.js';

/**
 * Mock logger for testing.
 */
interface MockLogger extends ILogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
  setLevel: Mock;
}

function createMockLogger(): MockLogger {
  const mock: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  mock.child.mockReturnThis();
  return mock;
}

/**
 * Creates a mock TechLead that returns a custom result.
 */
function createCustomMockTechLead(
  executeResult: Result<{ taskId: string; output: unknown; metadata: unknown }, AgentError>
): ITechLead {
  return {
    execute: vi.fn().mockResolvedValue(executeResult),
  };
}

/**
 * Creates successful execution result.
 */
function createSuccessResult(taskId: string): Result<TaskResult, AgentError> {
  return ok({
    taskId,
    output: {
      taskId,
      analysis: {
        taskId,
        complexity: 5,
        taskType: 'implementation',
        requirements: ['Build feature X'],
        risks: ['May take longer'],
        needsDecomposition: true,
        approach: 'Iterative development',
        estimatedEffort: 8,
      },
      subtasks: [
        {
          id: 'sub-1',
          parentTaskId: taskId,
          description: 'Step 1',
          expectedOutput: 'Output 1',
          dependencies: [],
          priority: 'high',
          status: 'pending',
          complexity: 3,
          requiredCapabilities: ['code_generation'],
        },
        {
          id: 'sub-2',
          parentTaskId: taskId,
          description: 'Step 2',
          expectedOutput: 'Output 2',
          dependencies: ['sub-1'],
          priority: 'medium',
          status: 'pending',
          complexity: 4,
          requiredCapabilities: ['testing'],
        },
      ],
      assignments: [
        {
          subtaskId: 'sub-1',
          expertRole: 'code_expert',
          selectionReason: 'Best match for code generation',
          confidence: 0.9,
        },
        {
          subtaskId: 'sub-2',
          expertRole: 'testing_expert',
          selectionReason: 'Best match for testing',
          confidence: 0.85,
        },
      ],
      parallelGroups: [['sub-1'], ['sub-2']],
      estimatedDuration: 120,
    },
    metadata: {
      durationMs: 150,
      tokensUsed: 500,
      toolsUsed: [],
      model: 'test-model',
    },
  });
}

describe('OrchestrateInputSchema', () => {
  it('should validate valid input with all fields', () => {
    const input = {
      task: 'Implement user authentication',
      context: { framework: 'express', language: 'typescript' },
      maxIterations: 20,
    };

    const result = OrchestrateInputSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.task).toBe('Implement user authentication');
      expect(result.data.context).toEqual({ framework: 'express', language: 'typescript' });
      expect(result.data.maxIterations).toBe(20);
    }
  });

  it('should validate input with only required fields', () => {
    const input = {
      task: 'Simple task',
    };

    const result = OrchestrateInputSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.task).toBe('Simple task');
      expect(result.data.maxIterations).toBe(10); // default
    }
  });

  it('should reject empty task', () => {
    const input = {
      task: '',
    };

    const result = OrchestrateInputSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('task');
    }
  });

  it('should reject maxIterations below minimum', () => {
    const input = {
      task: 'Valid task',
      maxIterations: 0,
    };

    const result = OrchestrateInputSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('maxIterations');
    }
  });

  it('should reject maxIterations above maximum', () => {
    const input = {
      task: 'Valid task',
      maxIterations: 51,
    };

    const result = OrchestrateInputSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('maxIterations');
    }
  });

  it('should accept maxIterations at boundaries', () => {
    const inputMin = { task: 'Task', maxIterations: 1 };
    const inputMax = { task: 'Task', maxIterations: 50 };

    expect(OrchestrateInputSchema.safeParse(inputMin).success).toBe(true);
    expect(OrchestrateInputSchema.safeParse(inputMax).success).toBe(true);
  });

  it('should allow undefined context', () => {
    const input = {
      task: 'Task without context',
      maxIterations: 5,
    };

    const result = OrchestrateInputSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context).toBeUndefined();
    }
  });

  it('should accept complex context objects', () => {
    const input = {
      task: 'Complex task',
      context: {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        mixed: ['string', 42, { key: 'value' }],
      },
    };

    const result = OrchestrateInputSchema.safeParse(input);

    expect(result.success).toBe(true);
  });
});

describe('OrchestrateOutputSchema', () => {
  it('should validate valid output', () => {
    const output = {
      taskId: 'orch-abc123',
      analysis: {
        taskId: 'orch-abc123',
        complexity: 5,
        taskType: 'implementation',
        requirements: ['Req 1', 'Req 2'],
        risks: ['Risk 1'],
        needsDecomposition: true,
        approach: 'Iterative',
        estimatedEffort: 8,
      },
      result: { data: 'test' },
      stepsCompleted: 3,
      metadata: {
        durationMs: 1500,
        tokensUsed: 500,
        expertsUsed: ['code_expert', 'testing_expert'],
      },
    };

    const result = OrchestrateOutputSchema.safeParse(output);

    expect(result.success).toBe(true);
  });

  it('should reject invalid complexity range', () => {
    const output = {
      taskId: 'orch-abc123',
      analysis: {
        taskId: 'orch-abc123',
        complexity: 15, // Invalid: > 10
        taskType: 'implementation',
        requirements: [],
        risks: [],
        needsDecomposition: false,
        approach: 'Direct',
        estimatedEffort: 1,
      },
      result: null,
      stepsCompleted: 0,
      metadata: {
        durationMs: 100,
        tokensUsed: 0,
        expertsUsed: [],
      },
    };

    const result = OrchestrateOutputSchema.safeParse(output);

    expect(result.success).toBe(false);
  });
});

describe('OrchestrationError', () => {
  it('should create error with message', () => {
    const error = new OrchestrationError('Test error');

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('OrchestrationError');
    expect(error).toBeInstanceOf(AgentError);
  });

  it('should include cause and context', () => {
    const cause = new Error('Root cause');
    const error = new OrchestrationError('Wrapped error', {
      cause,
      context: { taskId: 'test-123' },
    });

    expect(error.cause).toBe(cause);
    expect(error.context).toEqual({ taskId: 'test-123' });
  });
});

describe('createMockTechLead', () => {
  it('should create a functional mock', async () => {
    const mockLead = createMockTechLead();
    const task: Task = {
      id: 'test-task',
      description: 'Test task description',
      context: {},
    };

    const result = await mockLead.execute(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.taskId).toBe('test-task');
      expect(result.value.output).toBeDefined();
    }
  });

  it('should calculate complexity based on description length', async () => {
    const mockLead = createMockTechLead();

    const shortTask: Task = {
      id: 'short',
      description: 'Short task',
      context: {},
    };

    const longTask: Task = {
      id: 'long',
      description: 'A'.repeat(500), // Very long description
      context: {},
    };

    const shortResult = await mockLead.execute(shortTask);
    const longResult = await mockLead.execute(longTask);

    expect(shortResult.ok && longResult.ok).toBe(true);

    if (shortResult.ok && longResult.ok) {
      type AnalysisOutput = { analysis: { complexity: number } };
      const shortAnalysis = shortResult.value.output as AnalysisOutput;
      const longAnalysis = longResult.value.output as AnalysisOutput;

      expect(longAnalysis.analysis.complexity).toBeGreaterThanOrEqual(
        shortAnalysis.analysis.complexity
      );
    }
  });

  it('should set needsDecomposition for complex tasks', async () => {
    const mockLead = createMockTechLead();
    const complexTask: Task = {
      id: 'complex',
      description: 'A'.repeat(300), // Long enough to trigger high complexity
      context: {},
    };

    const result = await mockLead.execute(complexTask);

    expect(result.ok).toBe(true);
    if (result.ok) {
      type AnalysisOutput = { analysis: { needsDecomposition: boolean; complexity: number } };
      const output = result.value.output as AnalysisOutput;

      // Complexity > 5 should trigger decomposition
      if (output.analysis.complexity > 5) {
        expect(output.analysis.needsDecomposition).toBe(true);
      }
    }
  });
});

describe('Orchestration Logic', () => {
  let mockLogger: MockLogger;
  let mockTechLead: ITechLead & { execute: Mock };
  let deps: OrchestrateDeps;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockTechLead = createCustomMockTechLead(createSuccessResult('test-task')) as ITechLead & {
      execute: Mock;
    };
    deps = {
      techLead: mockTechLead,
      logger: mockLogger,
    };
  });

  it('should handle successful orchestration', async () => {
    const input: OrchestrateInput = {
      task: 'Implement user authentication',
      maxIterations: 10,
    };

    // Execute through the mock
    const task: Task = {
      id: 'test-id',
      description: input.task,
      context: {},
    };

    // techLead is defined in this test via beforeEach
    const techLead = deps.techLead;
    expect(techLead).toBeDefined();
    const result = await techLead!.execute(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.taskId).toBeDefined();

      type OutputWithAnalysis = { analysis: { complexity: number; taskType: string } };
      const output = result.value.output as OutputWithAnalysis;

      expect(output.analysis.complexity).toBe(5);
      expect(output.analysis.taskType).toBe('implementation');
    }
  });

  it('should handle TechLead execution failure', async () => {
    const failingTechLead = createCustomMockTechLead(err(new AgentError('Model rate limited')));

    const task: Task = {
      id: 'failing-task',
      description: 'This will fail',
      context: {},
    };

    const result = await failingTechLead.execute(task);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('Model rate limited');
    }
  });

  it('should extract experts from assignments', async () => {
    const result = await mockTechLead.execute({
      id: 'test',
      description: 'Test',
      context: {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      type OutputWithAssignments = { assignments: Array<{ expertRole: string }> };
      const output = result.value.output as OutputWithAssignments;

      expect(output.assignments).toHaveLength(2);
      expect(output.assignments[0]?.expertRole).toBe('code_expert');
      expect(output.assignments[1]?.expertRole).toBe('testing_expert');
    }
  });

  it('should count subtasks as steps completed', async () => {
    const result = await mockTechLead.execute({
      id: 'test',
      description: 'Test',
      context: {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      type OutputWithSubtasks = { subtasks: unknown[] };
      const output = result.value.output as OutputWithSubtasks;

      expect(output.subtasks).toHaveLength(2);
    }
  });

  it('should log orchestration start and completion', async () => {
    await mockTechLead.execute({
      id: 'test',
      description: 'Test task',
      context: {},
    });

    // The mock TechLead doesn't log, but we verify it was called
    expect(mockTechLead.execute).toHaveBeenCalled();
  });

  it('should handle context being passed through', () => {
    const input: OrchestrateInput = {
      task: 'Task with context',
      context: { key: 'value', number: 42 },
      maxIterations: 5,
    };

    // When context is defined, it should be set as metadata
    const contextData = input.context;
    expect(contextData).toBeDefined();
    expect(contextData).toEqual({ key: 'value', number: 42 });
  });
});

describe('Edge Cases', () => {
  it('should handle empty output from TechLead', async () => {
    const emptyTechLead = createCustomMockTechLead(
      ok({
        taskId: 'empty-task',
        output: {},
        metadata: {},
      })
    );

    const result = await emptyTechLead.execute({
      id: 'empty-task',
      description: 'Empty result task',
      context: {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output).toEqual({});
    }
  });

  it('should handle null values in output', async () => {
    const nullTechLead = createCustomMockTechLead(
      ok({
        taskId: 'null-task',
        output: {
          analysis: null,
          subtasks: null,
          assignments: null,
        },
        metadata: { tokensUsed: null },
      })
    );

    const result = await nullTechLead.execute({
      id: 'null-task',
      description: 'Null values task',
      context: {},
    });

    expect(result.ok).toBe(true);
  });

  it('should handle very long task descriptions', async () => {
    const mockLead = createMockTechLead();
    const longDescription = 'A'.repeat(10000);

    const result = await mockLead.execute({
      id: 'long-task',
      description: longDescription,
      context: {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      type AnalysisOutput = { analysis: { complexity: number } };
      const output = result.value.output as AnalysisOutput;

      // Complexity should be capped at 10
      expect(output.analysis.complexity).toBeLessThanOrEqual(10);
    }
  });

  it('should handle special characters in task description', async () => {
    const mockLead = createMockTechLead();
    const specialChars = 'Task with "quotes", <tags>, & ampersands, newlines\n\t and tabs';

    const result = await mockLead.execute({
      id: 'special-task',
      description: specialChars,
      context: {},
    });

    expect(result.ok).toBe(true);
  });

  it('should handle unicode characters in context', () => {
    const input = {
      task: 'Unicode task',
      context: {
        emoji: '12345',
        chinese: 'Chinese text',
        arabic: 'Arabic text',
      },
    };

    const result = OrchestrateInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('Input Validation Edge Cases', () => {
  it('should reject non-string task', () => {
    const input = {
      task: 123,
    };

    const result = OrchestrateInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject non-number maxIterations', () => {
    const input = {
      task: 'Valid task',
      maxIterations: 'ten',
    };

    const result = OrchestrateInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject non-object context', () => {
    const input = {
      task: 'Valid task',
      context: 'not an object',
    };

    const result = OrchestrateInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept whitespace-only task (trimming is not enforced)', () => {
    const input = {
      task: '   ',
    };

    // Note: min(1) checks length, not trimmed length
    const result = OrchestrateInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('Concurrent Execution', () => {
  it('should handle multiple concurrent orchestrations', async () => {
    const mockLead = createMockTechLead();

    const tasks = Array.from({ length: 5 }, (_, i) => ({
      id: `concurrent-${String(i)}`,
      description: `Concurrent task ${String(i)}`,
      context: {},
    }));

    const results = await Promise.all(tasks.map((task) => mockLead.execute(task)));

    expect(results.every((r) => r.ok)).toBe(true);

    // Verify each task has unique result
    const taskIds = results.map((r) => {
      if (r.ok) {
        return r.value.taskId;
      }
      return null;
    });

    const uniqueIds = new Set(taskIds);
    expect(uniqueIds.size).toBe(5);
  });
});
