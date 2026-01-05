/**
 * nexus-agents/agents - Plan Converter Tests
 *
 * Tests for the plan-to-workflow conversion functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  convertPlanToWorkflow,
  makeConvertible,
  isConvertible,
  PlanConversionOptionsSchema,
  type PlanConversionOptions,
  type ExecutionPlanData,
} from './plan-converter.js';
import type { TaskAnalysis, SubTask, ExpertAssignment } from './tech-lead-types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockAnalysis(overrides?: Partial<TaskAnalysis>): TaskAnalysis {
  return {
    taskId: 'test-task-1',
    complexity: 5,
    taskType: 'implementation',
    requirements: ['TypeScript', 'Unit tests'],
    risks: ['Time constraints'],
    needsDecomposition: true,
    approach: 'Iterative development with TDD',
    estimatedEffort: 8,
    ...overrides,
  };
}

function createMockSubtask(id: string, overrides?: Partial<SubTask>): SubTask {
  return {
    id,
    parentTaskId: 'test-task-1',
    description: `Subtask ${id} description`,
    expectedOutput: `Output for ${id}`,
    dependencies: [],
    priority: 'medium',
    status: 'pending',
    complexity: 3,
    requiredCapabilities: ['task_execution'],
    ...overrides,
  };
}

function createMockAssignment(subtaskId: string): ExpertAssignment {
  return {
    subtaskId,
    expertRole: 'code_expert',
    selectionReason: 'Best match for coding tasks',
    confidence: 0.85,
  };
}

function createMockExecutionPlan(overrides?: {
  subtasks?: SubTask[];
  assignments?: ExpertAssignment[];
  parallelGroups?: string[][];
}): ExecutionPlanData {
  const subtasks = overrides?.subtasks ?? [
    createMockSubtask('subtask-1'),
    createMockSubtask('subtask-2', { dependencies: ['subtask-1'] }),
    createMockSubtask('subtask-3', { dependencies: ['subtask-1'] }),
  ];

  const assignments = overrides?.assignments ?? subtasks.map((st) => createMockAssignment(st.id));

  return {
    taskId: 'test-task-1',
    analysis: createMockAnalysis(),
    subtasks,
    assignments,
    parallelGroups: overrides?.parallelGroups ?? [['subtask-2', 'subtask-3']],
    estimatedDuration: 30000,
  };
}

// ============================================================================
// Tests: PlanConversionOptionsSchema
// ============================================================================

describe('PlanConversionOptionsSchema', () => {
  it('should accept valid options', () => {
    const options: PlanConversionOptions = {
      name: 'my-workflow',
      version: '1.0.0',
      description: 'Test workflow',
      includeAnalysis: true,
      defaultStepTimeout: 60000,
      defaultRetries: 3,
    };

    const result = PlanConversionOptionsSchema.safeParse(options);
    expect(result.success).toBe(true);
  });

  it('should accept empty options', () => {
    const result = PlanConversionOptionsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject invalid version format', () => {
    const options = { version: 'not-semver' };
    const result = PlanConversionOptionsSchema.safeParse(options);
    expect(result.success).toBe(false);
  });

  it('should accept valid semver versions', () => {
    const versions = ['1.0.0', '2.1.3', '1.0.0-beta.1', '1.0.0+build.123'];

    for (const version of versions) {
      const result = PlanConversionOptionsSchema.safeParse({ version });
      expect(result.success).toBe(true);
    }
  });

  it('should reject name that is too long', () => {
    const options = { name: 'a'.repeat(101) };
    const result = PlanConversionOptionsSchema.safeParse(options);
    expect(result.success).toBe(false);
  });

  it('should reject negative retries', () => {
    const options = { defaultRetries: -1 };
    const result = PlanConversionOptionsSchema.safeParse(options);
    expect(result.success).toBe(false);
  });

  it('should reject retries exceeding maximum', () => {
    const options = { defaultRetries: 11 };
    const result = PlanConversionOptionsSchema.safeParse(options);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Tests: convertPlanToWorkflow
// ============================================================================

describe('convertPlanToWorkflow', () => {
  let mockPlan: ExecutionPlanData;

  beforeEach(() => {
    mockPlan = createMockExecutionPlan();
  });

  describe('basic conversion', () => {
    it('should convert a plan to a valid workflow definition', () => {
      const workflow = convertPlanToWorkflow(mockPlan);

      expect(workflow.name).toBe('test-task-1');
      expect(workflow.version).toBe('1.0.0');
      expect(workflow.steps).toHaveLength(3);
      expect(workflow.inputs).toEqual([]);
    });

    it('should use custom name when provided', () => {
      const workflow = convertPlanToWorkflow(mockPlan, { name: 'custom-workflow' });

      expect(workflow.name).toBe('custom-workflow');
    });

    it('should use custom version when provided', () => {
      const workflow = convertPlanToWorkflow(mockPlan, { version: '2.0.0' });

      expect(workflow.version).toBe('2.0.0');
    });

    it('should add description when provided', () => {
      const workflow = convertPlanToWorkflow(mockPlan, {
        description: 'Custom description',
      });

      expect(workflow.description).toBe('Custom description');
    });
  });

  describe('step conversion', () => {
    it('should convert subtasks to workflow steps', () => {
      const workflow = convertPlanToWorkflow(mockPlan);

      expect(workflow.steps[0]?.id).toBe('subtask-1');
      expect(workflow.steps[1]?.id).toBe('subtask-2');
      expect(workflow.steps[2]?.id).toBe('subtask-3');
    });

    it('should preserve dependencies as dependsOn', () => {
      const workflow = convertPlanToWorkflow(mockPlan);

      expect(workflow.steps[0]?.dependsOn).toBeUndefined();
      expect(workflow.steps[1]?.dependsOn).toEqual(['subtask-1']);
      expect(workflow.steps[2]?.dependsOn).toEqual(['subtask-1']);
    });

    it('should use subtask description as action', () => {
      const workflow = convertPlanToWorkflow(mockPlan);

      expect(workflow.steps[0]?.action).toBe('Subtask subtask-1 description');
    });

    it('should assign correct agent roles from assignments', () => {
      const workflow = convertPlanToWorkflow(mockPlan);

      expect(workflow.steps[0]?.agent).toBe('code_expert');
    });

    it('should use subtask assignedRole when no assignment exists', () => {
      const subtasks = [createMockSubtask('st-1', { assignedRole: 'security_expert' })];
      const plan = createMockExecutionPlan({ subtasks, assignments: [] });

      const workflow = convertPlanToWorkflow(plan);

      expect(workflow.steps[0]?.agent).toBe('security_expert');
    });

    it('should default to code_expert when no role is specified', () => {
      const subtasks = [createMockSubtask('st-1')];
      const plan = createMockExecutionPlan({ subtasks, assignments: [] });

      const workflow = convertPlanToWorkflow(plan);

      expect(workflow.steps[0]?.agent).toBe('code_expert');
    });
  });

  describe('parallel groups', () => {
    it('should mark steps as parallel when in parallel groups', () => {
      const workflow = convertPlanToWorkflow(mockPlan);

      // subtask-1 is not in a parallel group
      expect(workflow.steps[0]?.parallel).toBeUndefined();
      // subtask-2 and subtask-3 are in the same parallel group
      expect(workflow.steps[1]?.parallel).toBe(true);
      expect(workflow.steps[2]?.parallel).toBe(true);
    });

    it('should not mark steps as parallel if alone in group', () => {
      const plan = createMockExecutionPlan({
        parallelGroups: [['subtask-1']],
      });

      const workflow = convertPlanToWorkflow(plan);

      expect(workflow.steps[0]?.parallel).toBeUndefined();
    });
  });

  describe('timeout handling', () => {
    it('should set workflow timeout based on estimated duration', () => {
      const workflow = convertPlanToWorkflow(mockPlan);

      // 30000 * 1.5 = 45000
      expect(workflow.timeout).toBe(45000);
    });

    it('should apply default step timeout when provided', () => {
      const workflow = convertPlanToWorkflow(mockPlan, {
        defaultStepTimeout: 10000,
      });

      for (const step of workflow.steps) {
        expect(step.timeout).toBe(10000);
      }
    });
  });

  describe('retry handling', () => {
    it('should apply default retries when provided', () => {
      const workflow = convertPlanToWorkflow(mockPlan, {
        defaultRetries: 3,
      });

      for (const step of workflow.steps) {
        expect(step.retries).toBe(3);
      }
    });

    it('should not add retries when not specified', () => {
      const workflow = convertPlanToWorkflow(mockPlan);

      for (const step of workflow.steps) {
        expect(step.retries).toBeUndefined();
      }
    });
  });

  describe('analysis inclusion', () => {
    it('should include analysis info when includeAnalysis is true', () => {
      const workflow = convertPlanToWorkflow(mockPlan, {
        includeAnalysis: true,
      });

      expect(workflow.description).toContain('Generated from TechLead analysis');
      expect(workflow.description).toContain('Task type: implementation');
      expect(workflow.description).toContain('Complexity: 5/10');
    });

    it('should combine custom description with analysis info', () => {
      const workflow = convertPlanToWorkflow(mockPlan, {
        description: 'My workflow',
        includeAnalysis: true,
      });

      expect(workflow.description).toContain('My workflow');
      expect(workflow.description).toContain('Generated from TechLead analysis');
    });
  });

  describe('input definitions', () => {
    it('should include provided input definitions', () => {
      const inputs = [
        { name: 'target_branch', type: 'string' as const, required: true },
        { name: 'run_tests', type: 'boolean' as const, default: true },
      ];

      const workflow = convertPlanToWorkflow(mockPlan, { inputs });

      expect(workflow.inputs).toEqual(inputs);
    });
  });

  describe('empty subtasks', () => {
    it('should create a default step when no subtasks exist', () => {
      const plan = createMockExecutionPlan({ subtasks: [] });

      const workflow = convertPlanToWorkflow(plan);

      expect(workflow.steps).toHaveLength(1);
      expect(workflow.steps[0]?.id).toBe('main-task');
      expect(workflow.steps[0]?.action).toBe('Iterative development with TDD');
    });

    it('should use primary assignment role for default step', () => {
      const assignments = [
        {
          subtaskId: 'test',
          expertRole: 'security_expert' as const,
          selectionReason: 'Security focus',
          confidence: 0.9,
        },
      ];
      const plan = createMockExecutionPlan({ subtasks: [], assignments });

      const workflow = convertPlanToWorkflow(plan);

      expect(workflow.steps[0]?.agent).toBe('security_expert');
    });
  });

  describe('step validation', () => {
    it('should throw error for invalid dependency references', () => {
      const subtasks = [createMockSubtask('st-1', { dependencies: ['nonexistent'] })];
      const plan = createMockExecutionPlan({ subtasks });

      expect(() => convertPlanToWorkflow(plan)).toThrow('depends on unknown step');
    });
  });

  describe('options validation', () => {
    it('should throw error for invalid options', () => {
      const invalidOptions = { version: 'invalid' } as PlanConversionOptions;

      expect(() => convertPlanToWorkflow(mockPlan, invalidOptions)).toThrow(
        'Invalid conversion options'
      );
    });
  });
});

// ============================================================================
// Tests: makeConvertible
// ============================================================================

describe('makeConvertible', () => {
  it('should add asWorkflowDefinition method to plan', () => {
    const plan = createMockExecutionPlan();
    const convertible = makeConvertible(plan);

    expect(typeof convertible.asWorkflowDefinition).toBe('function');
  });

  it('should preserve original plan properties', () => {
    const plan = createMockExecutionPlan();
    const convertible = makeConvertible(plan);

    expect(convertible.taskId).toBe(plan.taskId);
    expect(convertible.analysis).toBe(plan.analysis);
    expect(convertible.subtasks).toBe(plan.subtasks);
    expect(convertible.assignments).toBe(plan.assignments);
    expect(convertible.parallelGroups).toBe(plan.parallelGroups);
    expect(convertible.estimatedDuration).toBe(plan.estimatedDuration);
  });

  it('should convert to valid workflow when method is called', () => {
    const plan = createMockExecutionPlan();
    const convertible = makeConvertible(plan);

    const workflow = convertible.asWorkflowDefinition({ name: 'test-workflow' });

    expect(workflow.name).toBe('test-workflow');
    expect(workflow.steps).toHaveLength(3);
  });
});

// ============================================================================
// Tests: isConvertible
// ============================================================================

describe('isConvertible', () => {
  it('should return true for convertible plans', () => {
    const plan = createMockExecutionPlan();
    const convertible = makeConvertible(plan);

    expect(isConvertible(convertible)).toBe(true);
  });

  it('should return false for non-convertible plans', () => {
    const plan = createMockExecutionPlan();

    expect(isConvertible(plan)).toBe(false);
  });
});

// ============================================================================
// Tests: Workflow Validity
// ============================================================================

describe('generated workflow validity', () => {
  it('should produce a workflow that matches WorkflowDefinition structure', () => {
    const plan = createMockExecutionPlan();
    const workflow = convertPlanToWorkflow(plan);

    // Verify all required fields are present
    expect(typeof workflow.name).toBe('string');
    expect(typeof workflow.version).toBe('string');
    expect(Array.isArray(workflow.inputs)).toBe(true);
    expect(Array.isArray(workflow.steps)).toBe(true);

    // Verify each step has required fields
    for (const step of workflow.steps) {
      expect(typeof step.id).toBe('string');
      expect(typeof step.agent).toBe('string');
      expect(typeof step.action).toBe('string');
      expect(typeof step.inputs).toBe('object');
    }
  });

  it('should produce valid semver version', () => {
    const plan = createMockExecutionPlan();
    const workflow = convertPlanToWorkflow(plan);

    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
    expect(workflow.version).toMatch(semverRegex);
  });

  it('should produce valid step IDs', () => {
    const plan = createMockExecutionPlan();
    const workflow = convertPlanToWorkflow(plan);

    const idRegex = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
    for (const step of workflow.steps) {
      expect(step.id).toMatch(idRegex);
    }
  });
});

// ============================================================================
// Tests: Integration with TechLead pattern
// ============================================================================

describe('TechLead integration pattern', () => {
  it('should support the documented usage pattern', () => {
    // Simulate TechLead output - use makeConvertible to add the method
    const planData = createMockExecutionPlan();
    const plan = makeConvertible(planData);

    // Use the conversion method as documented
    const workflow = plan.asWorkflowDefinition({
      name: 'code-review-workflow',
      version: '1.0.0',
      description: 'Automated code review process',
    });

    expect(workflow.name).toBe('code-review-workflow');
    expect(workflow.version).toBe('1.0.0');
    expect(workflow.description).toBe('Automated code review process');
    expect(workflow.steps.length).toBeGreaterThan(0);
  });
});
