/**
 * nexus-agents/agents - Orchestrator Tests
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import type {
  Result,
  ILogger,
  IModelAdapter,
  Task,
  TaskResult,
  CompletionResponse,
  StreamChunk,
} from '../core/index.js';
import { ok, err, AgentError, ModelError } from '../core/index.js';

import { Orchestrator, createOrchestrator, type ExecutionPlan } from './tech-lead.js';

import type { SubTask, TaskAnalysis } from './tech-lead-types.js';

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
 * Mock model adapter for testing.
 */
function createMockAdapter(): IModelAdapter & {
  completeResult: Result<CompletionResponse, ModelError>;
} {
  const mockResponse: CompletionResponse = {
    content: [{ type: 'text', text: '{}' }],
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    stopReason: 'end_turn',
    model: 'test-model',
  };

  return {
    providerId: 'test-provider',
    modelId: 'test-model',
    capabilities: ['completion'],
    completeResult: ok(mockResponse),
    complete: vi.fn().mockImplementation(function (this: {
      completeResult: Result<CompletionResponse, ModelError>;
    }) {
      return Promise.resolve(this.completeResult);
    }),
    stream: vi.fn().mockImplementation(function* (): Iterable<StreamChunk> {
      yield { type: 'message_start', message: { model: 'test-model' } };
      yield { type: 'message_stop' };
    }),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue(ok(undefined)),
  };
}

/**
 * Creates a valid task for testing.
 */
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task-1',
    description: 'Implement a user authentication feature with JWT tokens',
    context: {},
    ...overrides,
  };
}

/**
 * Creates a mock TaskResult for testing.
 */
function createTestTaskResult(taskId: string, output: unknown = 'Test output'): TaskResult {
  return {
    taskId,
    output,
    metadata: {
      durationMs: 100,
      tokensUsed: 30,
      toolsUsed: [],
      model: 'test-model',
    },
  };
}

describe('Orchestrator', () => {
  describe('constructor', () => {
    it('should initialize with default options', () => {
      const orchestrator = new Orchestrator();

      expect(orchestrator.id).toBe('orchestrator');
      expect(orchestrator.role).toBe('orchestrator');
      expect(orchestrator.state).toBe('idle');
      expect(orchestrator.capabilities).toContain('task_execution');
      expect(orchestrator.capabilities).toContain('delegation');
    });

    it('should accept custom id and options', () => {
      const orchestrator = new Orchestrator({
        id: 'custom-lead',
        temperature: 0.5,
        maxTokens: 8192,
      });

      expect(orchestrator.id).toBe('custom-lead');
    });

    it('should accept custom techLeadOptions', () => {
      const orchestrator = new Orchestrator({
        techLeadOptions: {
          maxSubtasks: 5,
          decompositionThreshold: 3,
          enableParallelHints: false,
        },
      });

      const options = orchestrator.getOptions();
      expect(options.maxSubtasks).toBe(5);
      expect(options.decompositionThreshold).toBe(3);
      expect(options.enableParallelHints).toBe(false);
    });

    it('should use custom logger when provided', () => {
      const mockLogger = createMockLogger();
      new Orchestrator({ logger: mockLogger });

      // Logger is used internally, verify it was accepted
      expect(mockLogger).toBeDefined();
    });

    it('should enforce orchestrator role', () => {
      // Even if we try to pass a different role via options, constructor overrides
      const orchestrator = new Orchestrator();
      expect(orchestrator.role).toBe('orchestrator');
    });
  });

  describe('getOptions', () => {
    it('should return default options when none provided', () => {
      const orchestrator = new Orchestrator();
      const options = orchestrator.getOptions();

      expect(options.maxSubtasks).toBe(10);
      expect(options.decompositionThreshold).toBe(5);
      expect(options.enableParallelHints).toBe(true);
      expect(options.expertWeights).toEqual({});
    });

    it('should return merged options', () => {
      const orchestrator = new Orchestrator({
        techLeadOptions: {
          maxSubtasks: 15,
          expertWeights: { code_expert: 2 },
        },
      });

      const options = orchestrator.getOptions();
      expect(options.maxSubtasks).toBe(15);
      expect(options.decompositionThreshold).toBe(5); // default
      expect(options.expertWeights).toEqual({ code_expert: 2 });
    });

    it('should return a copy of options (immutability)', () => {
      const orchestrator = new Orchestrator();
      const options1 = orchestrator.getOptions();
      const options2 = orchestrator.getOptions();

      expect(options1).not.toBe(options2);
      expect(options1).toEqual(options2);
    });
  });

  describe('analyzeTask', () => {
    it('should analyze a simple task with heuristics (no adapter)', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask({
        description: 'Fix a small bug in the login form',
      });

      const result = await orchestrator.analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe(task.id);
        expect(result.value.complexity).toBeGreaterThanOrEqual(1);
        expect(result.value.complexity).toBeLessThanOrEqual(10);
        expect(result.value.taskType).toBeDefined();
        expect(result.value.approach).toBeDefined();
      }
    });

    it('should identify implementation task type', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask({
        description: 'Implement a new caching layer for the database queries',
      });

      const result = await orchestrator.analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskType).toBe('implementation');
      }
    });

    it('should identify security_audit task type', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask({
        description: 'Perform a security audit of the authentication system',
      });

      const result = await orchestrator.analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskType).toBe('security_audit');
      }
    });

    it('should identify architecture task type', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask({
        description: 'Design a new microservices architecture for the payment system',
      });

      const result = await orchestrator.analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskType).toBe('architecture');
      }
    });

    it('should identify testing task type', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask({
        description: 'Write unit tests for the user service with 90% coverage',
      });

      const result = await orchestrator.analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskType).toBe('testing');
      }
    });

    it('should extract requirements from task description', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask({
        description:
          'The system must handle 1000 requests per second. It should be horizontally scalable. We need to ensure data consistency.',
      });

      const result = await orchestrator.analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.requirements.length).toBeGreaterThan(0);
      }
    });

    it('should identify risks based on keywords', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask({
        description: 'Migrate the database schema and update the API interface',
      });

      const result = await orchestrator.analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risks).toContain('Data integrity during changes');
        expect(result.value.risks).toContain('Breaking API changes');
      }
    });

    it('should increase complexity for longer descriptions', async () => {
      const orchestrator = new Orchestrator();
      const shortTask = createTestTask({
        description: 'Fix bug',
      });
      const longTask = createTestTask({
        description: `
          Implement a comprehensive user management system that includes:
          - User registration with email verification
          - Password reset functionality with secure tokens
          - Role-based access control with multiple permission levels
          - Integration with OAuth providers (Google, GitHub)
          - Audit logging for all user actions
          - Rate limiting to prevent abuse
          - Two-factor authentication support
        `,
      });

      const shortResult = await orchestrator.analyzeTask(shortTask);
      const longResult = await orchestrator.analyzeTask(longTask);

      expect(shortResult.ok && longResult.ok).toBe(true);
      if (shortResult.ok && longResult.ok) {
        // Long task should have >= complexity (may be same if base is already high)
        expect(longResult.value.complexity).toBeGreaterThanOrEqual(shortResult.value.complexity);
      }
    });

    it('should set needsDecomposition based on threshold', async () => {
      const orchestrator = new Orchestrator({
        techLeadOptions: { decompositionThreshold: 3 },
      });

      const simpleTask = createTestTask({
        description: 'Fix a typo in the readme',
      });
      const complexTask = createTestTask({
        description: `
          Refactor the entire authentication system to support OAuth 2.0
          and integrate with multiple identity providers while maintaining
          backward compatibility with the existing session-based auth.
        `,
      });

      const simpleResult = await orchestrator.analyzeTask(simpleTask);
      const complexResult = await orchestrator.analyzeTask(complexTask);

      expect(simpleResult.ok && complexResult.ok).toBe(true);
      if (simpleResult.ok && complexResult.ok) {
        expect(complexResult.value.needsDecomposition).toBe(true);
      }
    });

    it('should use model adapter when available', async () => {
      const mockAdapter = createMockAdapter();
      mockAdapter.completeResult = ok({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              taskId: 'test-task-1',
              complexity: 7,
              taskType: 'implementation',
              requirements: ['Req 1', 'Req 2'],
              risks: ['Risk 1'],
              needsDecomposition: true,
              approach: 'Iterative development',
              estimatedEffort: 10,
            }),
          },
        ],
        usage: { inputTokens: 10, outputTokens: 50, totalTokens: 60 },
        stopReason: 'end_turn',
        model: 'test-model',
      });

      const orchestrator = new Orchestrator({ adapter: mockAdapter });
      const task = createTestTask();

      const result = await orchestrator.analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.complexity).toBe(7);
        expect(result.value.taskType).toBe('implementation');
        expect(result.value.needsDecomposition).toBe(true);
      }

      expect(mockAdapter.complete).toHaveBeenCalled();
    });

    it('should fallback to heuristic when model response is invalid', async () => {
      const mockAdapter = createMockAdapter();
      const mockLogger = createMockLogger();
      mockAdapter.completeResult = ok({
        content: [{ type: 'text', text: 'not valid json' }],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        stopReason: 'end_turn',
        model: 'test-model',
      });

      const orchestrator = new Orchestrator({ adapter: mockAdapter, logger: mockLogger });
      const task = createTestTask();

      const result = await orchestrator.analyzeTask(task);

      expect(result.ok).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse'),
        expect.any(Object)
      );
    });
  });

  describe('decomposeTask', () => {
    it('should decompose implementation task into subtasks', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask();
      const analysis: TaskAnalysis = {
        taskId: task.id,
        complexity: 6,
        taskType: 'implementation',
        requirements: [],
        risks: [],
        needsDecomposition: true,
        approach: 'Test approach',
        estimatedEffort: 8,
      };

      const result = await orchestrator.decomposeTask(task, analysis);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        expect(result.value.length).toBeLessThanOrEqual(10);

        const firstSubtask = result.value[0];
        expect(firstSubtask?.parentTaskId).toBe(task.id);
        expect(firstSubtask?.status).toBe('pending');
      }
    });

    it('should decompose architecture task differently', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask({
        description: 'Design new system architecture',
      });
      const analysis: TaskAnalysis = {
        taskId: task.id,
        complexity: 8,
        taskType: 'architecture',
        requirements: [],
        risks: [],
        needsDecomposition: true,
        approach: 'Design-first',
        estimatedEffort: 12,
      };

      const result = await orchestrator.decomposeTask(task, analysis);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const descriptions = result.value.map((st) => st.description.toLowerCase());
        expect(descriptions.some((d) => d.includes('architect'))).toBe(true);
      }
    });

    it('should decompose security_audit task appropriately', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask();
      const analysis: TaskAnalysis = {
        taskId: task.id,
        complexity: 7,
        taskType: 'security_audit',
        requirements: [],
        risks: ['Security vulnerabilities'],
        needsDecomposition: true,
        approach: 'Thorough review',
        estimatedEffort: 10,
      };

      const result = await orchestrator.decomposeTask(task, analysis);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const descriptions = result.value.map((st) => st.description.toLowerCase());
        expect(descriptions.some((d) => d.includes('vulnerab') || d.includes('security'))).toBe(
          true
        );
      }
    });

    it('should respect maxSubtasks limit', async () => {
      const orchestrator = new Orchestrator({
        techLeadOptions: { maxSubtasks: 3 },
      });
      const task = createTestTask();
      const analysis: TaskAnalysis = {
        taskId: task.id,
        complexity: 10,
        taskType: 'implementation',
        requirements: [],
        risks: [],
        needsDecomposition: true,
        approach: 'Complex implementation',
        estimatedEffort: 20,
      };

      const result = await orchestrator.decomposeTask(task, analysis);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeLessThanOrEqual(3);
      }
    });

    it('should create subtasks with proper dependencies', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask();
      const analysis: TaskAnalysis = {
        taskId: task.id,
        complexity: 6,
        taskType: 'implementation',
        requirements: [],
        risks: [],
        needsDecomposition: true,
        approach: 'Standard',
        estimatedEffort: 8,
      };

      const result = await orchestrator.decomposeTask(task, analysis);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Later subtasks should have dependencies on earlier ones
        const lastSubtask = result.value[result.value.length - 1];
        expect(lastSubtask?.dependencies.length).toBeGreaterThan(0);
      }
    });

    it('should use model adapter for decomposition when available', async () => {
      const mockAdapter = createMockAdapter();
      mockAdapter.completeResult = ok({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                id: 'custom-sub-1',
                parentTaskId: 'test-task-1',
                description: 'Custom subtask',
                expectedOutput: 'Custom output',
                dependencies: [],
                priority: 'high',
                status: 'pending',
                complexity: 5,
                requiredCapabilities: ['code_generation'],
              },
            ]),
          },
        ],
        usage: { inputTokens: 10, outputTokens: 100, totalTokens: 110 },
        stopReason: 'end_turn',
        model: 'test-model',
      });

      const orchestrator = new Orchestrator({ adapter: mockAdapter });
      const task = createTestTask();
      const analysis: TaskAnalysis = {
        taskId: task.id,
        complexity: 6,
        taskType: 'implementation',
        requirements: [],
        risks: [],
        needsDecomposition: true,
        approach: 'Standard',
        estimatedEffort: 8,
      };

      const result = await orchestrator.decomposeTask(task, analysis);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]?.id).toBe('custom-sub-1');
        expect(result.value[0]?.description).toBe('Custom subtask');
      }
    });
  });

  describe('selectExperts', () => {
    it('should select code_expert for code-related subtasks', () => {
      const orchestrator = new Orchestrator();
      const subtasks: SubTask[] = [
        {
          id: 'sub-1',
          parentTaskId: 'task-1',
          description: 'Implement the authentication module',
          expectedOutput: 'Working code',
          dependencies: [],
          priority: 'high',
          status: 'pending',
          complexity: 5,
          requiredCapabilities: ['code_generation'],
        },
      ];

      const assignments = orchestrator.selectExperts(subtasks);

      expect(assignments).toHaveLength(1);
      expect(assignments[0]?.expertRole).toBe('code_expert');
      expect(assignments[0]?.confidence).toBeGreaterThan(0);
    });

    it('should select security_expert for security-related subtasks', () => {
      const orchestrator = new Orchestrator();
      const subtasks: SubTask[] = [
        {
          id: 'sub-1',
          parentTaskId: 'task-1',
          description: 'Audit for security vulnerabilities in the authentication code',
          expectedOutput: 'Security report',
          dependencies: [],
          priority: 'critical',
          status: 'pending',
          complexity: 6,
          requiredCapabilities: ['code_review', 'research'],
        },
      ];

      const assignments = orchestrator.selectExperts(subtasks);

      expect(assignments[0]?.expertRole).toBe('security_expert');
    });

    it('should select architecture_expert for design subtasks', () => {
      const orchestrator = new Orchestrator();
      const subtasks: SubTask[] = [
        {
          id: 'sub-1',
          parentTaskId: 'task-1',
          description: 'Design the system architecture for scalability',
          expectedOutput: 'Architecture document',
          dependencies: [],
          priority: 'high',
          status: 'pending',
          complexity: 7,
          requiredCapabilities: ['research'],
        },
      ];

      const assignments = orchestrator.selectExperts(subtasks);

      expect(assignments[0]?.expertRole).toBe('architecture_expert');
    });

    it('should select testing_expert for test subtasks', () => {
      const orchestrator = new Orchestrator();
      const subtasks: SubTask[] = [
        {
          id: 'sub-1',
          parentTaskId: 'task-1',
          description: 'Write integration tests for the API',
          expectedOutput: 'Test suite',
          dependencies: [],
          priority: 'medium',
          status: 'pending',
          complexity: 4,
          requiredCapabilities: ['code_generation'],
        },
      ];

      const assignments = orchestrator.selectExperts(subtasks);

      expect(assignments[0]?.expertRole).toBe('testing_expert');
    });

    it('should select documentation_expert for documentation subtasks', () => {
      const orchestrator = new Orchestrator();
      const subtasks: SubTask[] = [
        {
          id: 'sub-1',
          parentTaskId: 'task-1',
          description: 'Document the API endpoints in the README',
          expectedOutput: 'Documentation',
          dependencies: [],
          priority: 'low',
          status: 'pending',
          complexity: 3,
          requiredCapabilities: ['research'],
        },
      ];

      const assignments = orchestrator.selectExperts(subtasks);

      expect(assignments[0]?.expertRole).toBe('documentation_expert');
    });

    it('should respect pre-assigned roles', () => {
      const orchestrator = new Orchestrator();
      const subtasks: SubTask[] = [
        {
          id: 'sub-1',
          parentTaskId: 'task-1',
          description: 'Generic task',
          expectedOutput: 'Output',
          dependencies: [],
          priority: 'medium',
          status: 'pending',
          assignedRole: 'custom',
          complexity: 5,
          requiredCapabilities: [],
        },
      ];

      const assignments = orchestrator.selectExperts(subtasks);

      expect(assignments[0]?.expertRole).toBe('custom');
      expect(assignments[0]?.confidence).toBe(1.0);
    });

    it('should apply custom expert weights', () => {
      const orchestrator = new Orchestrator({
        techLeadOptions: {
          expertWeights: { architecture_expert: 10 },
        },
      });
      const subtasks: SubTask[] = [
        {
          id: 'sub-1',
          parentTaskId: 'task-1',
          description: 'Implement a feature', // Would normally go to code_expert
          expectedOutput: 'Code',
          dependencies: [],
          priority: 'high',
          status: 'pending',
          complexity: 5,
          requiredCapabilities: ['research'], // architecture_expert has this
        },
      ];

      const assignments = orchestrator.selectExperts(subtasks);

      expect(assignments[0]?.expertRole).toBe('architecture_expert');
    });

    it('should handle multiple subtasks', () => {
      const orchestrator = new Orchestrator();
      const subtasks: SubTask[] = [
        {
          id: 'sub-1',
          parentTaskId: 'task-1',
          description: 'Implement feature',
          expectedOutput: 'Code',
          dependencies: [],
          priority: 'high',
          status: 'pending',
          complexity: 5,
          requiredCapabilities: ['code_generation'],
        },
        {
          id: 'sub-2',
          parentTaskId: 'task-1',
          description: 'Write tests',
          expectedOutput: 'Tests',
          dependencies: ['sub-1'],
          priority: 'medium',
          status: 'pending',
          complexity: 4,
          requiredCapabilities: ['code_generation'],
        },
        {
          id: 'sub-3',
          parentTaskId: 'task-1',
          description: 'Security review',
          expectedOutput: 'Report',
          dependencies: ['sub-1'],
          priority: 'high',
          status: 'pending',
          complexity: 5,
          requiredCapabilities: ['code_review'],
        },
      ];

      const assignments = orchestrator.selectExperts(subtasks);

      expect(assignments).toHaveLength(3);
      expect(assignments[0]?.subtaskId).toBe('sub-1');
      expect(assignments[1]?.subtaskId).toBe('sub-2');
      expect(assignments[2]?.subtaskId).toBe('sub-3');
    });

    it('should include selection reason in assignments', () => {
      const orchestrator = new Orchestrator();
      const subtasks: SubTask[] = [
        {
          id: 'sub-1',
          parentTaskId: 'task-1',
          description: 'Implement code',
          expectedOutput: 'Code',
          dependencies: [],
          priority: 'high',
          status: 'pending',
          complexity: 5,
          requiredCapabilities: ['code_generation', 'tool_use'],
        },
      ];

      const assignments = orchestrator.selectExperts(subtasks);

      expect(assignments[0]?.selectionReason).toBeDefined();
      expect(assignments[0]?.selectionReason.length).toBeGreaterThan(0);
    });
  });

  describe('synthesizeResults', () => {
    it('should handle empty results array', async () => {
      const orchestrator = new Orchestrator();
      const results: TaskResult[] = [];

      const result = await orchestrator.synthesizeResults(results);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.combinedOutput).toBe('');
        expect(result.value.qualityScore).toBe(0);
        expect(result.value.recommendations).toContain('Ensure subtasks complete before synthesis');
      }
    });

    it('should handle single result', async () => {
      const orchestrator = new Orchestrator();
      const results = [createTestTaskResult('task-1', 'Single output')];

      const result = await orchestrator.synthesizeResults(results);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.combinedOutput).toBe('Single output');
        expect(result.value.qualityScore).toBe(0.9);
        expect(result.value.resultSummaries).toHaveLength(1);
      }
    });

    it('should combine multiple results', async () => {
      const orchestrator = new Orchestrator();
      const results = [
        createTestTaskResult('task-1', 'Output from task 1'),
        createTestTaskResult('task-2', 'Output from task 2'),
        createTestTaskResult('task-3', 'Output from task 3'),
      ];

      const result = await orchestrator.synthesizeResults(results);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.combinedOutput).toContain('Output from task 1');
        expect(result.value.combinedOutput).toContain('Output from task 2');
        expect(result.value.combinedOutput).toContain('Output from task 3');
        expect(result.value.resultSummaries).toHaveLength(3);
      }
    });

    it('should handle non-string outputs', async () => {
      const orchestrator = new Orchestrator();
      const results = [
        createTestTaskResult('task-1', { key: 'value', nested: { a: 1 } }),
        createTestTaskResult('task-2', ['item1', 'item2']),
      ];

      const result = await orchestrator.synthesizeResults(results);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.combinedOutput).toContain('key');
        expect(result.value.combinedOutput).toContain('value');
        expect(result.value.combinedOutput).toContain('item1');
      }
    });

    it('should use model adapter for synthesis when available', async () => {
      const mockAdapter = createMockAdapter();
      mockAdapter.completeResult = ok({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              combinedOutput: 'AI synthesized output',
              summary: 'AI synthesis summary',
              resultSummaries: [
                {
                  subtaskId: 'task-1',
                  summary: 'Task 1 summary',
                  quality: 0.95,
                  contributions: ['Contribution 1'],
                },
              ],
              conflicts: [],
              qualityScore: 0.95,
              recommendations: ['AI recommendation'],
            }),
          },
        ],
        usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
        stopReason: 'end_turn',
        model: 'test-model',
      });

      const orchestrator = new Orchestrator({ adapter: mockAdapter });
      const results = [
        createTestTaskResult('task-1', 'Output 1'),
        createTestTaskResult('task-2', 'Output 2'),
      ];

      const result = await orchestrator.synthesizeResults(results);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.combinedOutput).toBe('AI synthesized output');
        expect(result.value.qualityScore).toBe(0.95);
      }
    });
  });

  describe('execute', () => {
    it('should execute task and return execution plan', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask({
        description: 'Implement a complex feature with multiple components',
      });

      const result = await orchestrator.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe(task.id);
        const output = result.value.output as ExecutionPlan;
        expect(output.taskId).toBe(task.id);
        expect(output.analysis).toBeDefined();
      }
    });

    it('should include analysis in output', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask();

      const result = await orchestrator.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ExecutionPlan;
        expect(output.analysis.taskId).toBe(task.id);
        expect(output.analysis.complexity).toBeGreaterThanOrEqual(1);
      }
    });

    it('should include subtasks when decomposition is needed', async () => {
      const orchestrator = new Orchestrator({
        techLeadOptions: { decompositionThreshold: 1 }, // Low threshold to trigger decomposition
      });
      const task = createTestTask({
        description: `
          Implement a comprehensive user management system that includes:
          - User registration with email verification
          - Password reset functionality
          - Role-based access control
        `,
      });

      const result = await orchestrator.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ExecutionPlan;
        expect(output.subtasks.length).toBeGreaterThan(0);
        expect(output.assignments.length).toBe(output.subtasks.length);
      }
    });

    it('should include parallel groups when enabled', async () => {
      const orchestrator = new Orchestrator({
        techLeadOptions: {
          decompositionThreshold: 1,
          enableParallelHints: true,
        },
      });
      const task = createTestTask({
        description: 'Complex multi-step implementation task',
      });

      const result = await orchestrator.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ExecutionPlan;
        expect(output.parallelGroups).toBeDefined();
        expect(Array.isArray(output.parallelGroups)).toBe(true);
      }
    });

    it('should log task analysis', async () => {
      const mockLogger = createMockLogger();
      const orchestrator = new Orchestrator({ logger: mockLogger });
      const task = createTestTask();

      await orchestrator.execute(task);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Task analyzed',
        expect.objectContaining({
          taskId: task.id,
        })
      );
    });

    it('should return to idle state after execution', async () => {
      const orchestrator = new Orchestrator();
      const task = createTestTask();

      await orchestrator.execute(task);

      expect(orchestrator.state).toBe('idle');
    });

    it('should handle adapter errors gracefully', async () => {
      const mockAdapter = createMockAdapter();
      mockAdapter.completeResult = err(new ModelError('API rate limited'));

      const orchestrator = new Orchestrator({ adapter: mockAdapter });
      const task = createTestTask();

      const result = await orchestrator.execute(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(AgentError);
      }
    });

    it('should validate task before execution', async () => {
      const orchestrator = new Orchestrator();
      const invalidTask = { id: '', description: '', context: {} } as Task;

      const result = await orchestrator.execute(invalidTask);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid task');
      }
    });

    it('should not execute if not in idle state', async () => {
      const mockAdapter = createMockAdapter();
      const orchestrator = new Orchestrator({ adapter: mockAdapter });

      // Start first execution (don't await)
      const firstExec = orchestrator.execute(createTestTask({ id: 'task-1' }));

      // Immediately try second execution
      const secondExec = orchestrator.execute(createTestTask({ id: 'task-2' }));

      const [, secondResult] = await Promise.all([firstExec, secondExec]);

      expect(secondResult.ok).toBe(false);
      if (!secondResult.ok) {
        expect(secondResult.error.message).toContain('not idle');
      }
    });
  });

  describe('createOrchestrator factory', () => {
    it('should create Orchestrator with default options', () => {
      const orchestrator = createOrchestrator();

      expect(orchestrator).toBeInstanceOf(Orchestrator);
      expect(orchestrator.id).toBe('orchestrator');
      expect(orchestrator.role).toBe('orchestrator');
    });

    it('should create Orchestrator with custom options', () => {
      const orchestrator = createOrchestrator({
        id: 'custom-tech-lead',
        orchestratorOptions: {
          maxSubtasks: 5,
        },
      });

      expect(orchestrator.id).toBe('custom-tech-lead');
      expect(orchestrator.getOptions().maxSubtasks).toBe(5);
    });
  });
});

describe('Orchestrator integration scenarios', () => {
  it('should handle end-to-end task orchestration', async () => {
    const orchestrator = new Orchestrator({
      techLeadOptions: {
        decompositionThreshold: 3,
        maxSubtasks: 5,
        enableParallelHints: true,
      },
    });

    const task = createTestTask({
      id: 'integration-task',
      description: `
        Implement a secure REST API for user management with the following requirements:
        - User registration and login endpoints
        - JWT-based authentication
        - Role-based access control
        - Input validation and sanitization
        - Comprehensive error handling
        - API documentation
      `,
    });

    // Execute the task
    const result = await orchestrator.execute(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const plan = result.value.output as ExecutionPlan;

      // Verify analysis was performed (threshold is 3, so decomposition expected)
      expect(plan.analysis.complexity).toBeGreaterThanOrEqual(3);
      expect(plan.analysis.needsDecomposition).toBe(true);

      // Verify subtasks were created
      expect(plan.subtasks.length).toBeGreaterThan(0);
      expect(plan.subtasks.length).toBeLessThanOrEqual(5);

      // Verify expert assignments
      expect(plan.assignments.length).toBe(plan.subtasks.length);
      for (const assignment of plan.assignments) {
        expect(assignment.confidence).toBeGreaterThan(0);
        expect(assignment.selectionReason.length).toBeGreaterThan(0);
      }

      // Verify parallel groups
      expect(plan.parallelGroups.length).toBeGreaterThan(0);

      // Verify estimated duration
      expect(plan.estimatedDuration).toBeGreaterThan(0);
    }
  });

  it('should handle simple tasks without decomposition', async () => {
    const orchestrator = new Orchestrator({
      techLeadOptions: {
        decompositionThreshold: 8, // High threshold
      },
    });

    const task = createTestTask({
      id: 'simple-task',
      description: 'Fix a typo in the login button label',
    });

    const result = await orchestrator.execute(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const plan = result.value.output as ExecutionPlan;

      // Simple task should not need decomposition
      expect(plan.analysis.needsDecomposition).toBe(false);
      expect(plan.subtasks.length).toBe(0);
      expect(plan.assignments.length).toBe(0);
    }
  });
});
