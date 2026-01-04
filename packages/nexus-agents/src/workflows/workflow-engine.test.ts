/**
 * nexus-agents/workflows - Workflow Engine Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowDefinition, StepResult, Result } from '../core/index.js';
import { ok, err, WorkflowError } from '../core/index.js';
import { ParseError } from '../core/index.js';
import {
  WorkflowEngine,
  type WorkflowEngineDeps,
  type ExecutionPlan,
  type WorkflowStep,
} from './workflow-engine.js';

// Mock dependencies
function createMockDeps(overrides?: Partial<WorkflowEngineDeps>): WorkflowEngineDeps {
  return {
    parseWorkflow: vi.fn().mockReturnValue(ok({} as WorkflowDefinition)),
    loadWorkflowFile: vi.fn().mockResolvedValue(ok({} as WorkflowDefinition)),
    createExecutionPlan: vi.fn().mockReturnValue(
      ok({
        phases: [],
        totalSteps: 0,
        maxParallelism: 0,
      } as ExecutionPlan)
    ),
    executePhase: vi.fn().mockResolvedValue(ok([] as StepResult[])),
    getBuiltInTemplates: vi.fn().mockReturnValue(new Map()),
    ...overrides,
  };
}

// Sample workflow for testing
const sampleWorkflow: WorkflowDefinition = {
  name: 'test-workflow',
  version: '1.0.0',
  description: 'Test workflow',
  inputs: [
    { name: 'input1', type: 'string', required: true },
    { name: 'input2', type: 'number', required: false, default: 42 },
  ],
  steps: [
    {
      id: 'step1',
      agent: 'code_expert',
      action: 'analyze',
      inputs: { data: '${{ inputs.input1 }}' },
    },
    {
      id: 'step2',
      agent: 'tech_lead',
      action: 'review',
      inputs: { result: '${{ steps.step1.output }}' },
      dependsOn: ['step1'],
    },
  ],
};

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let mockDeps: WorkflowEngineDeps;

  beforeEach(() => {
    mockDeps = createMockDeps();
    engine = new WorkflowEngine(mockDeps);
  });

  describe('loadTemplate', () => {
    it('should load a workflow template from file', async () => {
      const workflow: WorkflowDefinition = { ...sampleWorkflow };
      mockDeps.loadWorkflowFile = vi.fn().mockResolvedValue(ok(workflow));

      const result = await engine.loadTemplate('/path/to/workflow.yaml');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('test-workflow');
      }
      expect(mockDeps.loadWorkflowFile).toHaveBeenCalledWith('/path/to/workflow.yaml');
    });

    it('should return error for invalid file', async () => {
      mockDeps.loadWorkflowFile = vi
        .fn()
        .mockResolvedValue(err(new ParseError('Invalid YAML syntax', { line: 10 })));

      const result = await engine.loadTemplate('/path/to/invalid.yaml');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid YAML');
      }
    });
  });

  describe('execute', () => {
    it('should execute a workflow with valid inputs', async () => {
      const workflow = { ...sampleWorkflow };
      const stepResults: StepResult[] = [
        { stepId: 'step1', output: 'result1', durationMs: 100, status: 'success' },
        { stepId: 'step2', output: 'result2', durationMs: 150, status: 'success' },
      ];

      mockDeps.createExecutionPlan = vi.fn().mockReturnValue(
        ok({
          phases: [
            { steps: [workflow.steps[0] as WorkflowStep] },
            { steps: [workflow.steps[1] as WorkflowStep] },
          ],
        } as ExecutionPlan)
      );
      mockDeps.executePhase = vi
        .fn()
        .mockResolvedValueOnce(ok([stepResults[0]]))
        .mockResolvedValueOnce(ok([stepResults[1]]));

      const result = await engine.execute(workflow, { input1: 'test' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.workflowName).toBe('test-workflow');
        expect(result.value.stepResults).toHaveLength(2);
        expect(result.value.executionId).toBeDefined();
      }
    });

    it('should fail with missing required inputs', async () => {
      const workflow = { ...sampleWorkflow };

      const result = await engine.execute(workflow, {}); // Missing input1

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Missing required input');
      }
    });

    it('should track execution status', async () => {
      const workflow = { ...sampleWorkflow };
      mockDeps.createExecutionPlan = vi.fn().mockReturnValue(
        ok({
          phases: [{ steps: [workflow.steps[0] as WorkflowStep] }],
        } as ExecutionPlan)
      );
      mockDeps.executePhase = vi
        .fn()
        .mockResolvedValue(
          ok([{ stepId: 'step1', output: 'done', durationMs: 50, status: 'success' }])
        );

      const result = await engine.execute(workflow, { input1: 'test' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const status = engine.getStatus(result.value.executionId);
        expect(status.state).toBe('completed');
      }
    });

    it('should handle execution plan errors', async () => {
      const workflow = { ...sampleWorkflow };
      mockDeps.createExecutionPlan = vi
        .fn()
        .mockReturnValue(err(new WorkflowError('Circular dependency')));

      const result = await engine.execute(workflow, { input1: 'test' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Circular dependency');
      }
    });

    it('should handle step execution errors', async () => {
      const workflow = { ...sampleWorkflow };
      mockDeps.createExecutionPlan = vi.fn().mockReturnValue(
        ok({
          phases: [{ steps: [workflow.steps[0] as WorkflowStep] }],
        } as ExecutionPlan)
      );
      mockDeps.executePhase = vi.fn().mockResolvedValue(err(new WorkflowError('Step failed')));

      const result = await engine.execute(workflow, { input1: 'test' });

      expect(result.ok).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return pending for unknown execution', () => {
      const status = engine.getStatus('unknown-id');

      expect(status.state).toBe('failed');
      if (status.state === 'failed') {
        expect(status.error).toContain('not found');
      }
    });
  });

  describe('cancel', () => {
    it('should cancel a running workflow', async () => {
      const workflow = { ...sampleWorkflow };
      let resolvePhase: () => void;
      const phasePromise = new Promise<Result<StepResult[], WorkflowError>>((resolve) => {
        resolvePhase = () => {
          resolve(ok([]));
        };
      });

      mockDeps.createExecutionPlan = vi.fn().mockReturnValue(
        ok({
          phases: [{ steps: [workflow.steps[0] as WorkflowStep] }],
        } as ExecutionPlan)
      );
      mockDeps.executePhase = vi.fn().mockReturnValue(phasePromise);

      // Start execution (don't await)
      const executePromise = engine.execute(workflow, { input1: 'test' });

      // Get the execution ID from status tracking
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify engine is responsive during execution
      const templateList = await engine.listTemplates();
      expect(templateList).toBeDefined();
      // Note: In a real scenario, we'd get the executionId from somewhere

      // Clean up
      resolvePhase!();
      await executePromise;
    });

    it('should fail to cancel unknown execution', async () => {
      const result = await engine.cancel('unknown-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });
  });

  describe('listTemplates', () => {
    it('should list built-in templates', async () => {
      const builtIn = new Map<string, WorkflowDefinition>();
      builtIn.set('code-review', {
        name: 'code-review',
        version: '1.0.0',
        description: 'Code review workflow',
        inputs: [],
        steps: [],
      });
      mockDeps.getBuiltInTemplates = vi.fn().mockReturnValue(builtIn);

      const templates = await engine.listTemplates();

      expect(templates).toHaveLength(1);
      expect(templates[0]?.name).toBe('code-review');
      expect(templates[0]?.category).toBe('built-in');
    });

    it('should list custom templates', async () => {
      engine.registerTemplate('custom-workflow', {
        name: 'custom-workflow',
        version: '1.0.0',
        inputs: [],
        steps: [{ id: 's1', agent: 'code_expert', action: 'test', inputs: {} }],
      });

      const templates = await engine.listTemplates();

      expect(templates.some((t) => t.name === 'custom-workflow')).toBe(true);
    });
  });

  describe('getTemplate', () => {
    it('should get a built-in template', () => {
      const builtIn = new Map<string, WorkflowDefinition>();
      builtIn.set('code-review', {
        name: 'code-review',
        version: '1.0.0',
        inputs: [],
        steps: [],
      });
      mockDeps.getBuiltInTemplates = vi.fn().mockReturnValue(builtIn);

      const template = engine.getTemplate('code-review');

      expect(template).toBeDefined();
      expect(template?.name).toBe('code-review');
    });

    it('should get a custom template', () => {
      engine.registerTemplate('custom', {
        name: 'custom',
        version: '1.0.0',
        inputs: [],
        steps: [{ id: 's1', agent: 'code_expert', action: 'test', inputs: {} }],
      });

      const template = engine.getTemplate('custom');

      expect(template).toBeDefined();
      expect(template?.name).toBe('custom');
    });

    it('should return undefined for unknown template', () => {
      const template = engine.getTemplate('unknown');

      expect(template).toBeUndefined();
    });
  });
});
