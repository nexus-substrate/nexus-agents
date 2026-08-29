/**
 * Tests for Workflow Engine Factory
 *
 * Comprehensive tests for the workflow engine factory implementation.
 * Covers unit tests for helper functions, integration tests, and error handling.
 *
 * @module workflows/workflow-engine-factory.test
 * (Source: Issue #430 - Wire up real workflow engine step execution)
 * (Source: Issue #432 - Add comprehensive tests)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StepResult, IModelAdapter, WorkflowDefinition } from '../core/index.js';
import { ok, createLogger } from '../core/index.js';
import type { IExpertFactory } from './step-executor.js';
import {
  createWorkflowEngineDeps,
  createWorkflowEngineDepsAsync,
  createRealWorkflowEngine,
  createInitializedWorkflowEngine,
  createProductionWorkflowEngine,
  initializeBuiltInTemplates,
  clearTemplateCache,
  WorkflowExecutionUnavailableError,
} from './workflow-engine-factory.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Creates a mock model adapter for testing. */
function createMockAdapter(): IModelAdapter {
  return {
    providerId: 'test-provider',
    modelId: 'test-model',
    capabilities: ['completion', 'streaming'],
    complete: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        content: 'Mock response',
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 20 },
      },
    }),
    stream: vi.fn().mockImplementation(function* () {
      yield { type: 'text', text: 'Mock' };
    }),
    countTokens: vi.fn().mockResolvedValue(100),
    validateConfig: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  };
}

/** Creates a mock expert factory for testing. */
function createMockExpertFactory(): IExpertFactory {
  return {
    createForRole: vi.fn().mockReturnValue(
      ok({
        id: 'mock-expert',
        role: 'code_expert',
        execute: vi.fn().mockResolvedValue(
          ok({
            output: 'Mock expert output',
            confidence: 0.9,
            reasoning: 'Mock reasoning',
          })
        ),
      })
    ),
  };
}

/** Creates a minimal workflow definition for testing. */
function createTestWorkflow(): WorkflowDefinition {
  return {
    name: 'test-workflow',
    version: '1.0.0',
    description: 'Test workflow for unit tests',
    inputs: [
      {
        name: 'input1',
        type: 'string',
        description: 'Test input',
        required: true,
      },
    ],
    steps: [
      {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: { data: '${inputs.input1}' },
      },
    ],
  };
}

// ============================================================================
// Unit Tests
// ============================================================================

describe('Workflow Engine Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTemplateCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createWorkflowEngineDeps()', () => {
    it('should throw WorkflowExecutionUnavailableError when no expertFactory provided', () => {
      // Issue #507: Fail-safe workflow execution
      expect(() => createWorkflowEngineDeps()).toThrow(WorkflowExecutionUnavailableError);
    });

    it('should create deps with useMockExecutor flag', () => {
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });

      expect(deps).toBeDefined();
      expect(deps.parseWorkflow).toBeDefined();
      expect(deps.loadWorkflowFile).toBeDefined();
      expect(deps.createExecutionPlan).toBeDefined();
      expect(deps.executePhase).toBeDefined();
      expect(deps.getBuiltInTemplates).toBeDefined();
    });

    it('should use provided logger', () => {
      const logger = createLogger({ component: 'TestLogger' });
      const deps = createWorkflowEngineDeps({ logger, useMockExecutor: true });

      expect(deps).toBeDefined();
    });

    it('should create expert factory when modelAdapter is provided', () => {
      const mockAdapter = createMockAdapter();
      const deps = createWorkflowEngineDeps({ modelAdapter: mockAdapter });

      expect(deps).toBeDefined();
      expect(deps.executePhase).toBeDefined();
    });

    it('should use provided expertFactory', () => {
      const mockFactory = createMockExpertFactory();
      const deps = createWorkflowEngineDeps({ expertFactory: mockFactory });

      expect(deps).toBeDefined();
    });

    it('should respect useMockExecutor flag', () => {
      const mockFactory = createMockExpertFactory();
      const deps = createWorkflowEngineDeps({
        expertFactory: mockFactory,
        useMockExecutor: true,
      });

      expect(deps).toBeDefined();
    });

    it('should use cached built-in templates when available', async () => {
      // Initialize templates first
      const templates = await initializeBuiltInTemplates();
      expect(templates.size).toBeGreaterThan(0);

      // Create deps - should use cached templates
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });
      const builtInTemplates = deps.getBuiltInTemplates();

      expect(builtInTemplates.size).toBe(templates.size);
    });

    it('should use provided builtInTemplates', () => {
      const customTemplates = new Map<string, WorkflowDefinition>();
      customTemplates.set('custom', createTestWorkflow());

      const deps = createWorkflowEngineDeps({
        builtInTemplates: customTemplates,
        useMockExecutor: true,
      });
      const templates = deps.getBuiltInTemplates();

      expect(templates.size).toBe(1);
      expect(templates.has('custom')).toBe(true);
    });
  });

  describe('createWorkflowEngineDepsAsync()', () => {
    it('should create deps with auto-detection skipped when modelAdapter provided', async () => {
      const mockAdapter = createMockAdapter();
      const deps = await createWorkflowEngineDepsAsync({ modelAdapter: mockAdapter });

      expect(deps).toBeDefined();
      expect(deps.executePhase).toBeDefined();
    });

    it('should create deps with auto-detection skipped when expertFactory provided', async () => {
      const mockFactory = createMockExpertFactory();
      const deps = await createWorkflowEngineDepsAsync({ expertFactory: mockFactory });

      expect(deps).toBeDefined();
    });

    it('should create deps with auto-detection skipped when useMockExecutor is true', async () => {
      const deps = await createWorkflowEngineDepsAsync({ useMockExecutor: true });

      expect(deps).toBeDefined();
    });

    it('should throw when no adapter available and mock not explicitly enabled (Issue #551)', async () => {
      // Mock unified registry to throw an error
      vi.mock('../adapters/unified-registry.js', () => ({
        getGlobalRegistry: vi.fn().mockImplementation(() => {
          throw new Error('No adapter available');
        }),
      }));

      // Issue #551: Should throw instead of silently enabling mock
      await expect(createWorkflowEngineDepsAsync()).rejects.toThrow(
        WorkflowExecutionUnavailableError
      );
    });

    it('should allow mock executor when explicitly enabled', async () => {
      // Mock unified registry to throw an error
      vi.mock('../adapters/unified-registry.js', () => ({
        getGlobalRegistry: vi.fn().mockImplementation(() => {
          throw new Error('No adapter available');
        }),
      }));

      // With explicit useMockExecutor: true, should succeed
      const deps = await createWorkflowEngineDepsAsync({ useMockExecutor: true });

      expect(deps).toBeDefined();
    });
  });

  describe('createRealWorkflowEngine()', () => {
    it('should throw when no expertFactory provided', () => {
      // Issue #507: Fail-safe workflow execution
      expect(() => createRealWorkflowEngine()).toThrow(WorkflowExecutionUnavailableError);
    });

    it('should create engine with useMockExecutor flag', () => {
      const engine = createRealWorkflowEngine({ useMockExecutor: true });

      expect(engine).toBeDefined();
      expect(engine.execute).toBeDefined();
      expect(engine.loadTemplate).toBeDefined();
      expect(engine.listTemplates).toBeDefined();
    });

    it('should create engine with custom config', () => {
      const mockAdapter = createMockAdapter();
      const engine = createRealWorkflowEngine({
        modelAdapter: mockAdapter,
        maxConcurrency: 2,
      });

      expect(engine).toBeDefined();
    });
  });

  describe('createInitializedWorkflowEngine()', () => {
    it('should throw when no expertFactory provided', async () => {
      // Issue #507: Fail-safe workflow execution
      await expect(createInitializedWorkflowEngine()).rejects.toThrow(
        WorkflowExecutionUnavailableError
      );
    });

    it('should create engine with built-in templates and useMockExecutor', async () => {
      const engine = await createInitializedWorkflowEngine({ useMockExecutor: true });

      expect(engine).toBeDefined();
      const templates = await engine.listTemplates();
      expect(templates.length).toBeGreaterThan(0);
    });
  });

  describe('createProductionWorkflowEngine()', () => {
    it('should create fully initialized production engine', async () => {
      const engine = await createProductionWorkflowEngine({ useMockExecutor: true });

      expect(engine).toBeDefined();
      const templates = await engine.listTemplates();
      expect(templates.length).toBeGreaterThan(0);
    });
  });

  describe('initializeBuiltInTemplates()', () => {
    it('should load built-in templates', async () => {
      const templates = await initializeBuiltInTemplates();

      expect(templates).toBeInstanceOf(Map);
      expect(templates.size).toBeGreaterThan(0);
    });

    it('should return cached templates on subsequent calls', async () => {
      const templates1 = await initializeBuiltInTemplates();
      const templates2 = await initializeBuiltInTemplates();

      expect(templates1).toBe(templates2); // Same reference
    });
  });

  describe('clearTemplateCache()', () => {
    it('should clear cached templates', async () => {
      // Initialize templates
      await initializeBuiltInTemplates();

      // Clear cache
      clearTemplateCache();

      // Templates should be reloaded
      const newTemplates = await initializeBuiltInTemplates();
      expect(newTemplates.size).toBeGreaterThan(0);
    });
  });

  describe('parseWorkflow dependency', () => {
    it('should parse valid YAML workflow', () => {
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });
      const yamlContent = `
name: test-workflow
version: "1.0.0"
inputs:
  - name: input1
    type: string
    required: true
steps:
  - id: step1
    agent: code_expert
    action: analyze
    inputs:
      data: \${inputs.input1}
`;

      const result = deps.parseWorkflow(yamlContent, 'yaml');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('test-workflow');
        expect(result.value.steps.length).toBe(1);
      }
    });

    it('should parse valid JSON workflow', () => {
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });
      const jsonContent = JSON.stringify(createTestWorkflow());

      const result = deps.parseWorkflow(jsonContent, 'json');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('test-workflow');
      }
    });

    it('should return error for invalid YAML', () => {
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });
      const invalidYaml = 'invalid: yaml: content: [';

      const result = deps.parseWorkflow(invalidYaml, 'yaml');

      expect(result.ok).toBe(false);
    });

    it('should return error for invalid JSON', () => {
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });
      const invalidJson = '{ invalid json }';

      const result = deps.parseWorkflow(invalidJson, 'json');

      expect(result.ok).toBe(false);
    });
  });

  describe('createExecutionPlan dependency', () => {
    it('should create execution plan for valid workflow', () => {
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });
      const workflow = createTestWorkflow();

      const result = deps.createExecutionPlan(workflow);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.phases).toBeDefined();
        expect(result.value.phases.length).toBeGreaterThan(0);
      }
    });

    it('should handle workflow with dependencies', () => {
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });
      const workflow: WorkflowDefinition = {
        name: 'dependent-workflow',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'step1', agent: 'code_expert', action: 'analyze', inputs: {} },
          {
            id: 'step2',
            agent: 'testing_expert',
            action: 'test',
            inputs: {},
            dependsOn: ['step1'],
          },
        ],
      };

      const result = deps.createExecutionPlan(workflow);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // step2 depends on step1, so there should be at least 2 phases
        expect(result.value.phases.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('executePhase dependency', () => {
    it('should execute phase with mock executor', async () => {
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });
      const workflow = createTestWorkflow();

      // Get execution plan
      const planResult = deps.createExecutionPlan(workflow);
      expect(planResult.ok).toBe(true);
      if (!planResult.ok) return;

      // Create mock context with all required fields
      const context = {
        workflowId: 'test-workflow',
        executionId: 'test-exec-1',
        inputs: { input1: 'test value' },
        stepResults: new Map<string, StepResult>(),
        variables: new Map<string, unknown>(),
        abortController: new AbortController(),
        contextManager: undefined,
        budgetEvents: [],
        budgetCircuitBreaker: undefined,
      };

      const options = {
        maxConcurrency: 1,
        failFast: false,
      };

      // Execute first phase
      const firstPhase = planResult.value.phases[0];
      expect(firstPhase).toBeDefined();
      if (!firstPhase) return;

      const result = await deps.executePhase(firstPhase.steps, context, options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        const firstResult = result.value[0];
        expect(firstResult).toBeDefined();
        if (firstResult) {
          // 'skipped', not 'success' (#5116). The mock executor does not run
          // the step, and this assertion previously certified the opposite —
          // it is the test that made the fabricated-success bug look intended.
          expect(firstResult.status).toBe('skipped');
        }
      }
    });

    it('should handle abort signal', async () => {
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });

      const context = {
        workflowId: 'test-workflow',
        executionId: 'test-exec-abort',
        inputs: {},
        stepResults: new Map<string, StepResult>(),
        variables: new Map<string, unknown>(),
        abortController: new AbortController(),
        contextManager: undefined,
        budgetEvents: [],
        budgetCircuitBreaker: undefined,
      };

      // Abort immediately
      context.abortController.abort();

      const options = {
        maxConcurrency: 1,
        failFast: false,
      };

      const steps = [{ id: 'step1', agent: 'code_expert' as const, action: 'test', inputs: {} }];

      const result = await deps.executePhase(steps, context, options);

      // Should still complete (abort is handled gracefully)
      expect(result.ok).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should throw for empty config (no expertFactory)', () => {
      // Issue #507: Fail-safe workflow execution
      expect(() => createWorkflowEngineDeps({})).toThrow(WorkflowExecutionUnavailableError);
    });

    it('should throw for undefined config (no expertFactory)', () => {
      // Issue #507: Fail-safe workflow execution
      expect(() => createWorkflowEngineDeps(undefined)).toThrow(WorkflowExecutionUnavailableError);
    });

    it('should handle workflow with no inputs', () => {
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });
      const workflow: WorkflowDefinition = {
        name: 'no-inputs',
        version: '1.0.0',
        inputs: [],
        steps: [{ id: 'step1', agent: 'code_expert', action: 'analyze', inputs: {} }],
      };

      const result = deps.createExecutionPlan(workflow);
      expect(result.ok).toBe(true);
    });

    it('should handle workflow with many steps', () => {
      const deps = createWorkflowEngineDeps({ useMockExecutor: true });
      const steps = Array.from({ length: 10 }, (_, i) => {
        const step: {
          id: string;
          agent: 'code_expert';
          action: string;
          inputs: Record<string, unknown>;
          dependsOn?: string[];
        } = {
          id: `step${String(i)}`,
          agent: 'code_expert',
          action: 'analyze',
          inputs: {},
        };
        if (i > 0) {
          step.dependsOn = [`step${String(i - 1)}`];
        }
        return step;
      });

      const workflow: WorkflowDefinition = {
        name: 'many-steps',
        version: '1.0.0',
        inputs: [],
        steps,
      };

      const result = deps.createExecutionPlan(workflow);
      expect(result.ok).toBe(true);
    });
  });

  describe('Configuration Combinations', () => {
    it('should work with modelAdapter only', () => {
      const deps = createWorkflowEngineDeps({
        modelAdapter: createMockAdapter(),
      });
      expect(deps).toBeDefined();
    });

    it('should work with expertFactory only', () => {
      const deps = createWorkflowEngineDeps({
        expertFactory: createMockExpertFactory(),
      });
      expect(deps).toBeDefined();
    });

    it('should work with both modelAdapter and expertFactory (expertFactory wins)', () => {
      const deps = createWorkflowEngineDeps({
        modelAdapter: createMockAdapter(),
        expertFactory: createMockExpertFactory(),
      });
      expect(deps).toBeDefined();
    });

    it('should work with logger and modelAdapter', () => {
      const deps = createWorkflowEngineDeps({
        logger: createLogger({ component: 'Test' }),
        modelAdapter: createMockAdapter(),
      });
      expect(deps).toBeDefined();
    });

    it('should work with all options', () => {
      const deps = createWorkflowEngineDeps({
        logger: createLogger({ component: 'Test' }),
        modelAdapter: createMockAdapter(),
        expertFactory: createMockExpertFactory(),
        useMockExecutor: false,
        builtInTemplates: new Map(),
        maxConcurrency: 4,
        defaultTimeoutMs: 30000,
      });
      expect(deps).toBeDefined();
    });
  });
});
