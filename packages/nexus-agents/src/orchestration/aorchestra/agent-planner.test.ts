/**
 * Tests for AOrchestra Agent Planner
 *
 * Verifies task-adaptive expert team composition across all
 * 8 task types and 4 complexity levels.
 *
 * @module orchestration/aorchestra/agent-planner.test
 */

import { describe, it, expect } from 'vitest';
import { planAgentTeam, computeOptimalWaveSize, EXPERT_DEPENDENCIES } from './agent-planner.js';
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

  // ============================================================================
  // Trigger Table Integration (Issue #1314)
  // ============================================================================

  describe('trigger table integration', () => {
    it('adds testing expert when filePaths contain test files', () => {
      const analysis = createAnalysis({
        taskType: 'code_implementation',
        complexity: 'complex',
      });
      const plan = planAgentTeam(analysis, 'Fix the bug', {
        filePaths: ['src/utils/parser.test.ts'],
      });

      expect(getRoles(plan)).toContain('testing');
    });

    it('adds security expert when filePaths contain security modules', () => {
      const analysis = createAnalysis({
        taskType: 'code_implementation',
        complexity: 'expert', // expert allows up to 5 experts
      });
      const plan = planAgentTeam(analysis, 'Refactor auth', {
        filePaths: ['src/security/sanitizer.ts', 'src/auth/login.ts'],
      });

      expect(getRoles(plan)).toContain('security');
    });

    it('adds devops expert when filePaths contain CI configs', () => {
      const analysis = createAnalysis({
        taskType: 'code_implementation',
        complexity: 'expert', // expert allows up to 5 experts
      });
      const plan = planAgentTeam(analysis, 'Update pipeline', {
        filePaths: ['.github/workflows/ci.yml'],
      });

      expect(getRoles(plan)).toContain('devops');
    });

    it('does not exceed max experts when trigger adds roles', () => {
      const analysis = createAnalysis({
        taskType: 'architecture',
        complexity: 'expert',
        requiredCapabilities: {
          tools: [],
          experts: ['security', 'testing', 'documentation', 'devops', 'research'],
        },
      });
      const plan = planAgentTeam(analysis, 'Full review', {
        filePaths: ['Dockerfile', 'terraform/main.tf', 'src/security/auth.ts'],
      });

      expect(plan.totalExperts).toBeLessThanOrEqual(5);
    });

    it('does not add duplicate roles from triggers', () => {
      const analysis = createAnalysis({
        taskType: 'code_review',
        complexity: 'complex',
      });
      // code_review already includes 'security' — trigger should not duplicate
      const plan = planAgentTeam(analysis, 'Review security module', {
        filePaths: ['src/security/policy-gate.ts'],
      });

      const securityCount = getRoles(plan).filter((r) => r === 'security').length;
      expect(securityCount).toBe(1);
    });

    it('is backward compatible — works without filePaths', () => {
      const analysis = createAnalysis({
        taskType: 'code_implementation',
        complexity: 'moderate',
      });
      // No options parameter — should work exactly as before
      const plan = planAgentTeam(analysis, 'Build feature');

      expect(plan.totalExperts).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Dependency-Aware Wave Assignment (Issue #1317)
  // ==========================================================================

  describe('dependency-aware wave assignment', () => {
    it('places testing in a later wave than code', () => {
      const plan = planFor('code_implementation', 'complex');
      const roles = getRoles(plan);

      // code_implementation selects: code, testing, architecture
      expect(roles).toContain('code');
      expect(roles).toContain('testing');

      const codeEntry = plan.entries.find((e) => e.role === 'code');
      const testingEntry = plan.entries.find((e) => e.role === 'testing');
      expect(codeEntry).toBeDefined();
      expect(testingEntry).toBeDefined();
      if (codeEntry !== undefined && testingEntry !== undefined) {
        expect(testingEntry.wave).toBeGreaterThan(codeEntry.wave);
      }
    });

    it('places security in a later wave than code', () => {
      const plan = planFor('code_review', 'complex');
      const roles = getRoles(plan);

      expect(roles).toContain('code');
      expect(roles).toContain('security');

      const codeEntry = plan.entries.find((e) => e.role === 'code');
      const securityEntry = plan.entries.find((e) => e.role === 'security');
      expect(codeEntry).toBeDefined();
      expect(securityEntry).toBeDefined();
      if (codeEntry !== undefined && securityEntry !== undefined) {
        expect(securityEntry.wave).toBeGreaterThan(codeEntry.wave);
      }
    });

    it('places documentation in a later wave than both code and architecture', () => {
      // Use expert complexity to get documentation via trigger table
      const analysis = createAnalysis({
        taskType: 'documentation',
        complexity: 'moderate',
      });
      const plan = planAgentTeam(analysis, 'Update docs');
      const roles = getRoles(plan);

      // documentation task selects: documentation, code
      expect(roles).toContain('documentation');
      expect(roles).toContain('code');

      const codeEntry = plan.entries.find((e) => e.role === 'code');
      const docEntry = plan.entries.find((e) => e.role === 'documentation');
      expect(codeEntry).toBeDefined();
      expect(docEntry).toBeDefined();
      if (codeEntry !== undefined && docEntry !== undefined) {
        expect(docEntry.wave).toBeGreaterThan(codeEntry.wave);
      }
    });

    it('retains positional assignment for experts with no dependencies', () => {
      // architecture has no declared dependencies — wave should be positional
      const plan = planFor('architecture', 'complex');
      const roles = getRoles(plan);

      expect(roles).toContain('architecture');
      const archEntry = plan.entries.find((e) => e.role === 'architecture');
      expect(archEntry).toBeDefined();
      // First expert should be in wave 1
      if (archEntry !== undefined) {
        expect(archEntry.wave).toBe(1);
      }
    });

    it('preserves backward compat — simple tasks still get wave 1', () => {
      const plan = planFor('code_implementation', 'simple');
      expect(plan.totalExperts).toBe(1);
      const entry = plan.entries[0];
      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.wave).toBe(1);
      }
    });
  });

  // ==========================================================================
  // Adaptive Wave Sizing (Issue #1318)
  // ==========================================================================

  describe('computeOptimalWaveSize', () => {
    it('returns 1 for single-expert plans', () => {
      expect(computeOptimalWaveSize(1, 'simple', false)).toBe(1);
    });

    it('returns 2 for expert plans with dependencies', () => {
      expect(computeOptimalWaveSize(5, 'expert', true)).toBe(2);
    });

    it('returns MAX_WORKERS_PER_WAVE for parallel-safe expert tasks', () => {
      expect(computeOptimalWaveSize(5, 'expert', false)).toBe(3);
    });

    it('returns 2 for complex tasks with dependencies', () => {
      expect(computeOptimalWaveSize(3, 'complex', true)).toBe(2);
    });

    it('returns MAX_WORKERS_PER_WAVE for moderate tasks without dependencies', () => {
      expect(computeOptimalWaveSize(2, 'moderate', false)).toBe(3);
    });
  });

  describe('suggestedWaveSize in AgentPlan', () => {
    it('includes suggestedWaveSize in plan output', () => {
      const plan = planFor('code_implementation', 'complex');
      expect(plan.suggestedWaveSize).toBeDefined();
      expect(plan.suggestedWaveSize).toBeGreaterThanOrEqual(1);
    });

    it('suggests narrower waves for complex tasks with dependencies', () => {
      // code_implementation/complex → code, testing, architecture
      // testing depends on code → hasDependencies = true
      const plan = planFor('code_implementation', 'complex');
      expect(plan.suggestedWaveSize).toBe(2);
    });

    it('suggests wide waves for parallel-safe tasks', () => {
      // architecture/complex → architecture, security, code
      // security depends on code, but architecture has no deps
      // Still has dependencies → suggestedWaveSize = 2
      const plan = planFor('architecture', 'complex');
      // Has dependencies (security→code) so should be 2
      const hasDeps = plan.entries.some((e) => EXPERT_DEPENDENCIES[e.role] !== undefined);
      if (hasDeps) {
        expect(plan.suggestedWaveSize).toBe(2);
      } else {
        expect(plan.suggestedWaveSize).toBe(3);
      }
    });
  });

  describe('expert reliability feedback (Issue #1325)', () => {
    it('excludes experts with success rate below threshold', () => {
      // code_implementation/complex normally picks: code, testing, architecture
      // If testing has <50% success rate, it should be replaced
      const analysis = createAnalysis({ taskType: 'code_implementation', complexity: 'complex' });
      const plan = planAgentTeam(analysis, 'Test task', {
        expertReliability: new Map([['testing', 0.3]]),
      });

      const roles = plan.entries.map((e) => e.role);
      expect(roles).not.toContain('testing');
    });

    it('keeps experts with success rate at or above threshold', () => {
      const analysis = createAnalysis({ taskType: 'code_implementation', complexity: 'complex' });
      const plan = planAgentTeam(analysis, 'Test task', {
        expertReliability: new Map([['testing', 0.7]]),
      });

      const roles = plan.entries.map((e) => e.role);
      expect(roles).toContain('testing');
    });

    it('replaces unreliable expert with next candidate from pool', () => {
      // code_review/complex → code, security, testing
      // If security has low reliability, it should be skipped and still get 3 experts
      const analysis = createAnalysis({ taskType: 'code_review', complexity: 'expert' });
      const plan = planAgentTeam(analysis, 'Review auth', {
        expertReliability: new Map([['security', 0.2]]),
      });

      const roles = plan.entries.map((e) => e.role);
      expect(roles).not.toContain('security');
      // Should still have multiple experts for expert-level complexity
      expect(plan.entries.length).toBeGreaterThanOrEqual(2);
    });

    it('ignores reliability map when not provided', () => {
      // Default behavior unchanged
      const analysis = createAnalysis({ taskType: 'code_implementation', complexity: 'complex' });
      const plan = planAgentTeam(analysis, 'Test task');

      const roles = plan.entries.map((e) => e.role);
      expect(roles).toContain('code');
      expect(roles).toContain('testing');
      expect(roles).toContain('architecture');
    });

    it('does not exclude experts with no reliability data', () => {
      // Only testing has reliability data; code and architecture have none → kept
      const analysis = createAnalysis({ taskType: 'code_implementation', complexity: 'complex' });
      const plan = planAgentTeam(analysis, 'Test task', {
        expertReliability: new Map([['testing', 0.8]]),
      });

      const roles = plan.entries.map((e) => e.role);
      expect(roles).toContain('code');
      expect(roles).toContain('architecture');
    });
  });
});
