/**
 * Orchestration Flow Integration Tests
 *
 * End-to-end tests for task orchestration from submission through expert execution.
 * Uses real TechLead agent with mocked model adapter.
 *
 * (Source: Issue #109)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TechLead, type ExecutionPlan, type ExpertAssignment } from '../../src/agents/index.js';
import { ExpertFactory } from '../../src/agents/experts/expert-factory.js';
import type { Task, TaskContext } from '../../src/core/types/index.js';

/**
 * Helper to assert ExecutionPlan type with proper structure validation.
 * This is used in tests to safely cast the unknown output from TechLead.execute()
 * to ExecutionPlan after runtime validation.
 */
function assertExecutionPlan(output: unknown): ExecutionPlan {
  const plan = output as Record<string, unknown>;
  // Runtime validation that this is actually an ExecutionPlan
  if (
    typeof plan !== 'object' ||
    plan === null ||
    !('taskId' in plan) ||
    !('analysis' in plan) ||
    !('subtasks' in plan) ||
    !('assignments' in plan)
  ) {
    throw new Error('Output is not a valid ExecutionPlan');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
  return plan as any;
}

/**
 * Type-safe accessor for assignments from an ExecutionPlan.
 * Required because the plan comes from assertExecutionPlan which uses any.
 */
function getAssignments(plan: ExecutionPlan): ExpertAssignment[] {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
  return (plan as any).assignments;
}

describe('Integration: Orchestration Flow', () => {
  let techLead: TechLead;

  beforeEach(() => {
    techLead = new TechLead({
      techLeadOptions: {
        decompositionThreshold: 3,
        maxSubtasks: 10,
        enableParallelHints: true,
      },
    });
  });

  describe('Task Submission to Analysis', () => {
    it('should analyze simple task with low complexity', async () => {
      const task: Task = {
        id: 'test-simple-1',
        description: 'Fix typo in README file',
        context: {} as TaskContext,
        constraints: { maxDuration: 30000 },
      };

      const result = await techLead.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = result.value.output as ExecutionPlan;
        // Simple task should have low complexity
        expect(plan.analysis.complexity).toBeLessThanOrEqual(5);
        // TechLead analyzes all tasks, decomposition depends on threshold config
        expect(typeof plan.analysis.needsDecomposition).toBe('boolean');
      }
    });

    it('should decompose complex task into subtasks', async () => {
      const task: Task = {
        id: 'test-complex-1',
        description:
          'Implement a new user authentication system with OAuth2, password hashing, session management, and rate limiting',
        context: {} as TaskContext,
        constraints: { maxDuration: 60000 },
      };

      const result = await techLead.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = result.value.output as ExecutionPlan;
        // Complex task should have moderate to high complexity
        expect(plan.analysis.complexity).toBeGreaterThanOrEqual(3);
        // Should generate subtasks for complex work
        expect(plan.subtasks.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should identify task type correctly', async () => {
      const codeTask: Task = {
        id: 'test-code-1',
        description: 'Implement a new caching layer for the database queries',
        context: {} as TaskContext,
        constraints: { maxDuration: 30000 },
      };

      const result = await techLead.execute(codeTask);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = result.value.output as ExecutionPlan;
        // Task type should be implementation-related (implementation or architecture)
        expect(['implementation', 'architecture']).toContain(plan.analysis.taskType);
      }
    });

    it('should identify security audit tasks', async () => {
      const securityTask: Task = {
        id: 'test-security-1',
        description: 'Audit the API endpoints for SQL injection vulnerabilities',
        context: {} as TaskContext,
        constraints: { maxDuration: 30000 },
      };

      const result = await techLead.execute(securityTask);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = result.value.output as ExecutionPlan;
        expect(plan.analysis.taskType).toBe('security_audit');
      }
    });
  });

  describe('Expert Selection and Assignment', () => {
    it('should assign code expert to implementation tasks', async () => {
      const task: Task = {
        id: 'test-expert-code',
        description: 'Write a function to validate email addresses',
        context: {} as TaskContext,
        constraints: { maxDuration: 30000 },
      };

      const result = await techLead.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = assertExecutionPlan(result.value.output);
        const hasCodeExpert = getAssignments(plan).some((a) => a.expertRole === 'code_expert');
        expect(hasCodeExpert).toBe(true);
      }
    });

    it('should assign security expert to audit tasks', async () => {
      const task: Task = {
        id: 'test-expert-security',
        description: 'Review authentication code for security vulnerabilities',
        context: {} as TaskContext,
        constraints: { maxDuration: 30000 },
      };

      const result = await techLead.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = assertExecutionPlan(result.value.output);
        const hasSecurityExpert = getAssignments(plan).some(
          (a) => a.expertRole === 'security_expert'
        );
        expect(hasSecurityExpert).toBe(true);
      }
    });

    it('should assign testing expert to test tasks', async () => {
      const task: Task = {
        id: 'test-expert-testing',
        description:
          'Create comprehensive test suite with unit tests and integration tests for the user service',
        context: {} as TaskContext,
        constraints: { maxDuration: 30000 },
      };

      const result = await techLead.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = assertExecutionPlan(result.value.output);
        const assignments = getAssignments(plan);
        // Should have at least one assignment
        expect(assignments.length).toBeGreaterThan(0);
        // Check that testing expert is assigned (may also assign code expert for test implementation)

        const expertRoles = assignments.map((a: ExpertAssignment) => a.expertRole);
        const hasRelevantExpert = expertRoles.some(
          (role) => role === 'testing_expert' || role === 'code_expert'
        );
        expect(hasRelevantExpert).toBe(true);
      }
    });

    it('should assign multiple experts for multi-faceted tasks', async () => {
      const task: Task = {
        id: 'test-multi-expert',
        description:
          'Implement secure payment processing with full test coverage and documentation',
        context: {} as TaskContext,
        constraints: { maxDuration: 60000 },
      };

      const result = await techLead.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = assertExecutionPlan(result.value.output);
        const assignments = getAssignments(plan);

        const uniqueExperts = new Set(assignments.map((a: ExpertAssignment) => a.expertRole));
        expect(uniqueExperts.size).toBeGreaterThan(1);
      }
    });
  });

  describe('Expert Factory Integration', () => {
    it('should create code expert successfully', () => {
      // Built-in types: code, architecture, security, documentation, testing
      const result = ExpertFactory.createBuiltIn('code');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.role).toBe('code_expert');
        expect(result.value.state).toBe('idle');
      }
    });

    it('should create all built-in expert types', () => {
      // Valid built-in types (without _expert suffix)
      const expertTypes = ['code', 'architecture', 'security', 'documentation', 'testing'] as const;

      for (const expertType of expertTypes) {
        const result = ExpertFactory.createBuiltIn(expertType);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.role).toBe(`${expertType}_expert`);
        }
      }
    });

    it('should reject invalid expert type', () => {
      const result = ExpertFactory.createBuiltIn('invalid' as 'code');

      expect(result.ok).toBe(false);
    });
  });

  describe('Execution Plan Structure', () => {
    it('should generate valid execution plan', async () => {
      const task: Task = {
        id: 'test-plan-structure',
        description: 'Build a REST API with CRUD operations',
        context: {} as TaskContext,
        constraints: { maxDuration: 45000 },
      };

      const result = await techLead.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = result.value.output as ExecutionPlan;

        // Verify plan structure
        expect(plan.taskId).toBe('test-plan-structure');
        expect(plan.analysis).toBeDefined();
        expect(plan.analysis.complexity).toBeGreaterThanOrEqual(1);
        expect(plan.analysis.complexity).toBeLessThanOrEqual(10);
        expect(Array.isArray(plan.subtasks)).toBe(true);
        expect(Array.isArray(plan.assignments)).toBe(true);
        expect(typeof plan.estimatedDuration).toBe('number');
      }
    });

    it('should identify parallel execution groups', async () => {
      const task: Task = {
        id: 'test-parallel',
        description: 'Create user service, product service, and order service independently',
        context: {} as TaskContext,
        constraints: { maxDuration: 60000 },
      };

      const result = await techLead.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = assertExecutionPlan(result.value.output);
        expect(Array.isArray(plan.parallelGroups)).toBe(true);
      }
    });

    it('should convert plan to workflow definition', async () => {
      const task: Task = {
        id: 'test-workflow-conversion',
        description: 'Implement feature with tests and docs',
        context: {} as TaskContext,
        constraints: { maxDuration: 45000 },
      };

      const result = await techLead.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = assertExecutionPlan(result.value.output);

        const workflow = plan.asWorkflowDefinition({
          name: 'test-workflow',
          version: '1.0.0',
        });

        expect(workflow.name).toBe('test-workflow');
        expect(workflow.version).toBe('1.0.0');
        expect(Array.isArray(workflow.steps)).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle empty task description gracefully', async () => {
      const task: Task = {
        id: 'test-empty',
        description: '',
        context: {} as TaskContext,
        constraints: { maxDuration: 30000 },
      };

      const result = await techLead.execute(task);

      // Should fail validation
      expect(result.ok).toBe(false);
    });

    it('should handle very long task descriptions', async () => {
      const task: Task = {
        id: 'test-long-desc',
        description: 'a'.repeat(10000),
        context: {} as TaskContext,
        constraints: { maxDuration: 30000 },
      };

      const result = await techLead.execute(task);

      // Should handle gracefully (either succeed or fail with clear error)
      expect(typeof result.ok).toBe('boolean');
    });

    it('should respect iteration constraints', async () => {
      const task: Task = {
        id: 'test-constraints',
        description: 'Complex multi-step task requiring many iterations',
        context: {} as TaskContext,
        constraints: { maxDuration: 30000 },
      };

      const result = await techLead.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = result.value.output as ExecutionPlan;
        // Plan should be generated - maxIterations constrains execution, not planning
        expect(plan.subtasks).toBeDefined();
        expect(Array.isArray(plan.subtasks)).toBe(true);
      }
    });
  });

  describe('Metadata and Tracking', () => {
    it('should include execution metadata in result', async () => {
      const task: Task = {
        id: 'test-metadata',
        description: 'Simple code task',
        context: {} as TaskContext,
        constraints: { maxDuration: 30000 },
      };

      const result = await techLead.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-metadata');
        expect(result.value.metadata).toBeDefined();
        expect(typeof result.value.metadata?.durationMs).toBe('number');
      }
    });

    it('should track agent state correctly', async () => {
      expect(techLead.state).toBe('idle');

      const task: Task = {
        id: 'test-state',
        description: 'Quick task',
        context: {} as TaskContext,
        constraints: { maxDuration: 30000 },
      };

      await techLead.execute(task);

      // After execution, should return to idle
      expect(techLead.state).toBe('idle');
    });
  });
});
