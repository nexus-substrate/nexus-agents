/**
 * Tests for AOrchestra Agent Planner
 *
 * Verifies task-adaptive expert team composition across all
 * 8 task types and 4 complexity levels.
 *
 * @module orchestration/aorchestra/agent-planner.test
 */

import { describe, it, expect } from 'vitest';
import { planAgentTeam } from './agent-planner.js';
import type { TaskAnalysisResult } from '../../core/task-analysis/shared-task-analyzer.js';
import type { AgentPlan } from './agent-planner.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createAnalysis(overrides: Partial<TaskAnalysisResult> = {}): TaskAnalysisResult {
  return {
    reasoningType: 'reasoning',
    reasoningConfidence: 0.8,
    complexity: 'moderate',
    complexityScore: 0.5,
    taskType: 'code_implementation',
    taskTypeConfidence: 0.9,
    capabilities: {
      parallelizable: false,
      multimodal: false,
      codeGeneration: true,
      budgetSensitive: false,
      highContext: false,
    },
    estimatedTokens: 5000,
    matchedSignals: [],
    ambiguityScore: 0.1,
    constraints: { scope: [] },
    requiredCapabilities: { tools: [], experts: [] },
    ...overrides,
  };
}

function planFor(
  taskType: TaskAnalysisResult['taskType'],
  complexity: TaskAnalysisResult['complexity'],
  extras: Partial<TaskAnalysisResult> = {}
): AgentPlan {
  const analysis = createAnalysis({ taskType, complexity, ...extras });
  return planAgentTeam(analysis, 'Test task description');
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getRoles(plan: AgentPlan) {
  return plan.entries.map((e) => e.role);
}

// ============================================================================
// Task Type Mapping
// ============================================================================

describe('AgentPlanner', () => {
  describe('task type → expert selection', () => {
    it('selects architecture + security for architecture tasks', () => {
      const plan = planFor('architecture', 'moderate');
      const roles = getRoles(plan);

      expect(roles).toContain('architecture');
      expect(roles).toContain('security');
    });

    it('selects code + testing for code_implementation tasks', () => {
      const plan = planFor('code_implementation', 'moderate');
      const roles = getRoles(plan);

      expect(roles).toContain('code');
      expect(roles).toContain('testing');
    });

    it('selects code + security for code_review tasks', () => {
      const plan = planFor('code_review', 'moderate');
      const roles = getRoles(plan);

      expect(roles).toContain('code');
      expect(roles).toContain('security');
    });

    it('selects testing + code for test_generation tasks', () => {
      const plan = planFor('test_generation', 'moderate');
      const roles = getRoles(plan);

      expect(roles).toContain('testing');
      expect(roles).toContain('code');
    });

    it('selects documentation for documentation tasks', () => {
      const plan = planFor('documentation', 'moderate');
      const roles = getRoles(plan);

      expect(roles).toContain('documentation');
    });

    it('selects architecture + code for large_codebase tasks', () => {
      const plan = planFor('large_codebase', 'moderate');
      const roles = getRoles(plan);

      expect(roles).toContain('architecture');
      expect(roles).toContain('code');
    });

    it('selects devops + code for bulk_operations tasks', () => {
      const plan = planFor('bulk_operations', 'moderate');
      const roles = getRoles(plan);

      expect(roles).toContain('devops');
      expect(roles).toContain('code');
    });

    it('selects code for general tasks', () => {
      const plan = planFor('general', 'moderate');
      const roles = getRoles(plan);

      expect(roles).toContain('code');
    });
  });

  // ============================================================================
  // Complexity Scaling
  // ============================================================================

  describe('complexity → expert count', () => {
    it('limits simple tasks to 1 expert', () => {
      const plan = planFor('code_implementation', 'simple');

      expect(plan.totalExperts).toBe(1);
      expect(plan.entries).toHaveLength(1);
    });

    it('limits moderate tasks to 2 experts', () => {
      const plan = planFor('code_implementation', 'moderate');

      expect(plan.totalExperts).toBeLessThanOrEqual(2);
    });

    it('limits complex tasks to 3 experts', () => {
      const plan = planFor('architecture', 'complex');

      expect(plan.totalExperts).toBeLessThanOrEqual(3);
    });

    it('allows expert-level tasks up to 5 experts', () => {
      const plan = planFor('architecture', 'expert', {
        requiredCapabilities: {
          tools: [],
          experts: ['testing', 'devops', 'documentation'],
        },
      });

      expect(plan.totalExperts).toBeLessThanOrEqual(5);
      expect(plan.totalExperts).toBeGreaterThanOrEqual(3);
    });
  });

  // ============================================================================
  // Required Capabilities
  // ============================================================================

  describe('required capabilities enrichment', () => {
    it('adds security expert when hinted in capabilities', () => {
      const plan = planFor('code_implementation', 'expert', {
        requiredCapabilities: {
          tools: [],
          experts: ['security_review'],
        },
      });

      expect(getRoles(plan)).toContain('security');
    });

    it('adds testing expert when hinted in capabilities', () => {
      const plan = planFor('documentation', 'complex', {
        requiredCapabilities: {
          tools: [],
          experts: ['test_coverage'],
        },
      });

      expect(getRoles(plan)).toContain('testing');
    });

    it('does not duplicate already-selected experts', () => {
      const plan = planFor('code_implementation', 'complex', {
        requiredCapabilities: {
          tools: [],
          experts: ['code_implementation'],
        },
      });

      const codeCount = getRoles(plan).filter((r) => r === 'code').length;
      expect(codeCount).toBe(1);
    });

    it('adds security expert for expert-level complexity', () => {
      const plan = planFor('documentation', 'expert');

      // Expert-level adds security automatically
      expect(getRoles(plan)).toContain('security');
    });
  });

  // ============================================================================
  // Sub-task Generation
  // ============================================================================

  describe('sub-task generation', () => {
    it('generates sub-task descriptions with task context', () => {
      const analysis = createAnalysis({ taskType: 'code_implementation' });
      const plan = planAgentTeam(analysis, 'Add OAuth2 authentication');

      for (const entry of plan.entries) {
        expect(entry.subTask).toContain('Add OAuth2 authentication');
      }
    });

    it('truncates long task descriptions to 200 chars', () => {
      const longTask = 'x'.repeat(300);
      const analysis = createAnalysis();
      const plan = planAgentTeam(analysis, longTask);

      for (const entry of plan.entries) {
        expect(entry.subTask.length).toBeLessThan(300);
      }
    });

    it('assigns ascending priority numbers', () => {
      const plan = planFor('architecture', 'complex');

      for (let i = 0; i < plan.entries.length; i++) {
        const entry = plan.entries[i];
        if (entry === undefined) throw new Error('Missing entry');
        expect(entry.priority).toBe(i + 1);
      }
    });

    it('includes reasoning for each entry', () => {
      const plan = planFor('code_implementation', 'moderate');

      for (const entry of plan.entries) {
        expect(entry.reasoning).toBeTruthy();
        expect(entry.reasoning).toContain(entry.role);
      }
    });
  });

  // ============================================================================
  // Plan Metadata
  // ============================================================================

  describe('plan metadata', () => {
    it('includes task type in plan', () => {
      const plan = planFor('architecture', 'moderate');

      expect(plan.taskType).toBe('architecture');
    });

    it('includes complexity in plan', () => {
      const plan = planFor('code_implementation', 'complex');

      expect(plan.complexity).toBe('complex');
    });

    it('includes reasoning summary', () => {
      const plan = planFor('code_review', 'moderate');

      expect(plan.reasoning).toContain('code_review');
      expect(plan.reasoning).toContain('moderate');
    });

    it('notes high ambiguity in reasoning', () => {
      const plan = planFor('general', 'simple', {
        ambiguityScore: 0.8,
      });

      expect(plan.reasoning).toContain('ambiguity');
    });

    it('does not note low ambiguity', () => {
      const plan = planFor('general', 'simple', {
        ambiguityScore: 0.2,
      });

      expect(plan.reasoning).not.toContain('ambiguity');
    });
  });

  // ============================================================================
  // Policy Constraints
  // ============================================================================

  describe('policy constraints', () => {
    it('never exceeds 5 experts regardless of inputs', () => {
      const plan = planFor('architecture', 'expert', {
        requiredCapabilities: {
          tools: [],
          experts: ['security', 'testing', 'documentation', 'devops', 'research', 'pm', 'ux'],
        },
      });

      expect(plan.totalExperts).toBeLessThanOrEqual(5);
    });

    it('returns at least 1 expert for any task', () => {
      const plan = planFor('general', 'simple');

      expect(plan.totalExperts).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // Capability Hint Mapping
  // ============================================================================

  describe('capability hint mapping', () => {
    const cases: Array<{ hint: string; expectedRole: string }> = [
      { hint: 'security_audit', expectedRole: 'security' },
      { hint: 'test_coverage', expectedRole: 'testing' },
      { hint: 'documentation_update', expectedRole: 'documentation' },
      { hint: 'architecture_review', expectedRole: 'architecture' },
      { hint: 'devops_pipeline', expectedRole: 'devops' },
      { hint: 'deployment', expectedRole: 'devops' },
      { hint: 'infrastructure', expectedRole: 'infrastructure' },
      { hint: 'research_analysis', expectedRole: 'research' },
      { hint: 'code_generation', expectedRole: 'code' },
      { hint: 'implement_feature', expectedRole: 'code' },
      { hint: 'product_management', expectedRole: 'pm' },
      { hint: 'ux_design', expectedRole: 'ux' },
    ];

    for (const { hint, expectedRole } of cases) {
      it(`maps "${hint}" to ${expectedRole}`, () => {
        const plan = planFor('general', 'expert', {
          requiredCapabilities: {
            tools: [],
            experts: [hint],
          },
        });

        expect(getRoles(plan)).toContain(expectedRole);
      });
    }
  });
});
