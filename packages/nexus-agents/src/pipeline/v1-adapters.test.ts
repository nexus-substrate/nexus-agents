/**
 * V1↔V2 adapter function tests (Issue #909, E1-3)
 *
 * Verifies round-trip conversion: V1 → V2 → response.
 */
import { describe, it, expect } from 'vitest';

import { analysisToTaskContract, taskContractToToolResponse } from './v1-adapters.js';
import { TaskContractSchema } from './task-contract.js';

import type { TaskAnalysisResult } from '../core/task-analysis/shared-task-analyzer.js';
import type {
  TaskConstraints,
  RequiredCapabilities,
} from '../core/task-analysis/task-analysis-advocate.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeAnalysisResult(): TaskAnalysisResult {
  return {
    reasoningType: 'factual',
    reasoningConfidence: 0.85,
    complexity: 'moderate',
    complexityScore: 0.6,
    taskType: 'code_implementation',
    taskTypeConfidence: 0.9,
    capabilities: {
      needsCodeGeneration: true,
      needsAnalysis: false,
      needsResearch: false,
      needsMultiStep: false,
    },
    estimatedTokens: 5000,
    matchedSignals: ['implement', 'function'],
    ambiguityScore: 0.2,
    constraints: {
      scope: ['src/auth/'],
    } as TaskConstraints,
    requiredCapabilities: {
      tools: ['create_expert'],
      experts: ['code_expert'],
    } as RequiredCapabilities,
  };
}

// ============================================================================
// analysisToTaskContract Tests
// ============================================================================

describe('analysisToTaskContract', () => {
  it('converts TaskAnalysisResult to valid TaskContract', () => {
    const analysis = makeAnalysisResult();
    const contract = analysisToTaskContract('Implement auth middleware', analysis);

    expect(contract.description).toBe('Implement auth middleware');
    expect(contract.status).toBe('intake');
    expect(contract.analysis.complexity).toBe('moderate');
    expect(contract.analysis.taskType).toBe('code_implementation');
    expect(contract.analysis.ambiguityScore).toBe(0.2);
    expect(contract.artifacts).toEqual([]);
    expect(contract.id).toBeTruthy();
    expect(contract.createdAt).toBeGreaterThan(0);
    expect(contract.updatedAt).toBeGreaterThan(0);
  });

  it('produces schema-valid output', () => {
    const analysis = makeAnalysisResult();
    const contract = analysisToTaskContract('task', analysis);
    const result = TaskContractSchema.safeParse(contract);
    expect(result.success).toBe(true);
  });

  it('preserves constraints from analysis', () => {
    const analysis = makeAnalysisResult();
    const contract = analysisToTaskContract('task', analysis);
    expect(contract.constraints.scope).toEqual(['src/auth/']);
  });

  it('preserves requiredCapabilities', () => {
    const analysis = makeAnalysisResult();
    const contract = analysisToTaskContract('task', analysis);
    expect(contract.requiredCapabilities.tools).toEqual(['create_expert']);
    expect(contract.requiredCapabilities.experts).toEqual(['code_expert']);
  });

  it('handles missing optional fields', () => {
    const analysis: TaskAnalysisResult = {
      reasoningType: 'factual',
      reasoningConfidence: 0.5,
      complexity: 'simple',
      complexityScore: 0.2,
      taskType: 'general',
      taskTypeConfidence: 0.7,
      capabilities: {
        needsCodeGeneration: false,
        needsAnalysis: false,
        needsResearch: false,
        needsMultiStep: false,
      },
      estimatedTokens: 1000,
      matchedSignals: [],
      ambiguityScore: 0,
      constraints: { scope: [] } as TaskConstraints,
      requiredCapabilities: {
        tools: [],
        experts: [],
      } as RequiredCapabilities,
    };
    const contract = analysisToTaskContract('simple task', analysis);
    const result = TaskContractSchema.safeParse(contract);
    expect(result.success).toBe(true);
  });

  it('generates unique IDs', () => {
    const analysis = makeAnalysisResult();
    const c1 = analysisToTaskContract('task 1', analysis);
    const c2 = analysisToTaskContract('task 2', analysis);
    expect(c1.id).not.toBe(c2.id);
  });
});

// ============================================================================
// taskContractToToolResponse Tests
// ============================================================================

describe('taskContractToToolResponse', () => {
  it('converts completed TaskContract to tool response', () => {
    const analysis = makeAnalysisResult();
    const contract = {
      ...analysisToTaskContract('task', analysis),
      status: 'done' as const,
      completedAt: Date.now(),
    };
    const response = taskContractToToolResponse(contract);

    expect(response.taskId).toBe(contract.id);
    expect(response.status).toBe('done');
    expect(response.description).toBe('task');
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('includes error for failed tasks', () => {
    const analysis = makeAnalysisResult();
    const contract = {
      ...analysisToTaskContract('task', analysis),
      status: 'failed' as const,
      error: 'Timeout exceeded',
      completedAt: Date.now(),
    };
    const response = taskContractToToolResponse(contract);

    expect(response.status).toBe('failed');
    expect(response.error).toBe('Timeout exceeded');
  });

  it('includes artifacts in response', () => {
    const analysis = makeAnalysisResult();
    const contract = {
      ...analysisToTaskContract('task', analysis),
      status: 'done' as const,
      artifacts: [{ id: 'art-1', type: 'code' as const }],
    };
    const response = taskContractToToolResponse(contract);

    expect(response.artifacts).toHaveLength(1);
    expect(response.artifacts[0].id).toBe('art-1');
  });
});
