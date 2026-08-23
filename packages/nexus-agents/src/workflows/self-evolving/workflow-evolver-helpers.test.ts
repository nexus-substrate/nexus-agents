/**
 * Tests for Workflow Evolver Helpers
 * @module workflows/self-evolving/workflow-evolver-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowStep } from '../../core/index.js';
import type { WorkflowVersion, WorkflowMutation } from './sew-types.js';
import {
  areWorkflowsCompatible,
  calculateEvolutionStats,
  buildVersionHistory,
} from './workflow-evolver-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step-1',
    agent: 'code_expert',
    action: 'analyze',
    inputs: {},
    ...overrides,
  };
}

function makeVersion(overrides: Partial<WorkflowVersion> = {}): WorkflowVersion {
  return {
    id: 'v1',
    version: '1.0.0',
    workflow: {
      id: 'wf-1',
      name: 'Test Workflow',
      version: '1.0.0',
      steps: [makeStep()],
    },
    fitnessScore: 0.8,
    metrics: {
      successRate: 0.8,
      avgLatencyMs: 100,
      errorRate: 0.1,
      throughput: 10,
      resourceUtilization: 0.5,
    },
    parentVersion: null,
    appliedMutations: [],
    createdAt: Date.now(),
    isActive: true,
    ...overrides,
  } as WorkflowVersion;
}

// ============================================================================
// areWorkflowsCompatible
// ============================================================================

describe('areWorkflowsCompatible', () => {
  it('returns true for identical step structures', () => {
    const steps = [makeStep({ id: 'a' }), makeStep({ id: 'b' })];
    expect(areWorkflowsCompatible(steps, steps)).toBe(true);
  });

  it('returns false for different lengths', () => {
    expect(areWorkflowsCompatible([makeStep()], [makeStep(), makeStep()])).toBe(false);
  });

  it('returns false for different step IDs', () => {
    const steps1 = [makeStep({ id: 'a' })];
    const steps2 = [makeStep({ id: 'b' })];
    expect(areWorkflowsCompatible(steps1, steps2)).toBe(false);
  });

  // Previously asserted `true` — that assertion pinned the vacuous pass: two
  // zero-step parents share no genes, so "compatible for crossover" was a
  // verdict reached by having nothing to compare (#4585).
  it('returns false for empty arrays — no genes to exchange (#4585)', () => {
    expect(areWorkflowsCompatible([], [])).toBe(false);
  });
});

// ============================================================================
// calculateEvolutionStats
// ============================================================================

describe('calculateEvolutionStats', () => {
  it('returns zeros for empty versions', () => {
    const stats = calculateEvolutionStats([], null, new Map());
    expect(stats.totalVersions).toBe(0);
    expect(stats.bestFitness).toBe(0);
    expect(stats.avgFitness).toBe(0);
    expect(stats.totalOutcomes).toBe(0);
  });

  it('computes best and average fitness', () => {
    const versions = [makeVersion({ fitnessScore: 0.9 }), makeVersion({ fitnessScore: 0.7 })];
    const stats = calculateEvolutionStats(versions, 'v1', new Map());
    expect(stats.totalVersions).toBe(2);
    expect(stats.bestFitness).toBe(0.9);
    expect(stats.avgFitness).toBeCloseTo(0.8);
    expect(stats.activeVersion).toBe('v1');
  });

  it('counts total outcomes', () => {
    const outcomes = new Map<string, readonly { success: boolean }[]>();
    outcomes.set('v1', [{ success: true }, { success: false }]);
    outcomes.set('v2', [{ success: true }]);
    const stats = calculateEvolutionStats([], null, outcomes);
    expect(stats.totalOutcomes).toBe(3);
  });

  it('ignores zero fitness versions in average', () => {
    const versions = [makeVersion({ fitnessScore: 0 }), makeVersion({ fitnessScore: 0.6 })];
    const stats = calculateEvolutionStats(versions, null, new Map());
    expect(stats.avgFitness).toBeCloseTo(0.6);
    expect(stats.bestFitness).toBe(0.6);
  });
});

// ============================================================================
// buildVersionHistory
// ============================================================================

describe('buildVersionHistory', () => {
  it('builds history for single version', () => {
    const versions = new Map<string, WorkflowVersion>();
    versions.set('v1', makeVersion({ id: 'v1', version: '1.0.0', parentVersion: null }));
    const describe = (_m: WorkflowMutation): string => 'mutation';
    const history = buildVersionHistory('v1', versions, describe);
    expect(history).toHaveLength(1);
    expect(history[0]).toContain('1.0.0');
  });

  it('traces parent chain', () => {
    const versions = new Map<string, WorkflowVersion>();
    versions.set('v1', makeVersion({ id: 'v1', version: '1.0.0', parentVersion: null }));
    versions.set(
      'v2',
      makeVersion({
        id: 'v2',
        version: '1.0.1',
        parentVersion: 'v1',
        appliedMutations: [
          {
            type: 'timeout_adjustment',
            stepId: 's1',
            originalValue: 100,
            newValue: 200,
            factor: 2,
          },
        ],
      })
    );
    const describeMutation = (m: WorkflowMutation): string =>
      'stepId' in m ? `${m.type} on ${m.stepId}` : m.type;
    const history = buildVersionHistory('v2', versions, describeMutation);
    expect(history).toHaveLength(2);
    expect(history[0]).toContain('1.0.0');
    expect(history[1]).toContain('1.0.1');
  });

  it('returns empty for missing version', () => {
    const history = buildVersionHistory('missing', new Map(), () => '');
    expect(history).toEqual([]);
  });
});
