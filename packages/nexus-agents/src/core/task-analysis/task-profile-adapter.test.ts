/**
 * Tests for task-profile-adapter.
 *
 * Covers: taskAnalysisResultToTaskProfile, summarizeTaskProfile,
 * taskAnalysisResultToBanditContext, toExpertTaskAnalysisResult
 */

import { describe, expect, it } from 'vitest';

import type {
  TaskAnalysisResult,
  TaskTypeCategory,
  ComplexityLevel,
  TaskCapabilities,
} from './shared-task-analyzer.js';

import {
  taskAnalysisResultToTaskProfile,
  summarizeTaskProfile,
  taskAnalysisResultToBanditContext,
  toExpertTaskAnalysisResult,
  type TaskProfile,
} from './task-profile-adapter.js';

// ============================================================================
// Test helpers
// ============================================================================

function makeCapabilities(overrides: Partial<TaskCapabilities> = {}): TaskCapabilities {
  return {
    parallelizable: false,
    multimodal: false,
    codeGeneration: false,
    budgetSensitive: false,
    highContext: false,
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<TaskAnalysisResult> = {}): TaskAnalysisResult {
  return {
    reasoningType: 'reasoning',
    reasoningConfidence: 0.8,
    complexity: 'moderate',
    complexityScore: 0.5,
    taskType: 'general',
    taskTypeConfidence: 0.7,
    capabilities: makeCapabilities(),
    estimatedTokens: 1000,
    matchedSignals: [],
    ambiguityScore: 0.5,
    constraints: { scope: [] },
    requiredCapabilities: { tools: ['delegate_to_model'], experts: ['pm_expert'] },
    ...overrides,
  };
}

// ============================================================================
// taskAnalysisResultToTaskProfile
// ============================================================================

describe('taskAnalysisResultToTaskProfile', () => {
  it('converts analysis to TaskProfile with token offset', () => {
    const analysis = makeAnalysis({ estimatedTokens: 2000 });
    const profile = taskAnalysisResultToTaskProfile(analysis);
    // Adds 500 offset for legacy compatibility
    expect(profile.contextRequired).toBe(2500);
  });

  it('converts complexity score to 0-10 scale', () => {
    expect(
      taskAnalysisResultToTaskProfile(makeAnalysis({ complexityScore: 0.0 })).reasoningComplexity
    ).toBe(0);
    expect(
      taskAnalysisResultToTaskProfile(makeAnalysis({ complexityScore: 0.5 })).reasoningComplexity
    ).toBe(5);
    expect(
      taskAnalysisResultToTaskProfile(makeAnalysis({ complexityScore: 1.0 })).reasoningComplexity
    ).toBe(10);
    expect(
      taskAnalysisResultToTaskProfile(makeAnalysis({ complexityScore: 0.37 })).reasoningComplexity
    ).toBe(4);
  });

  it('maps capability flags directly', () => {
    const analysis = makeAnalysis({
      capabilities: makeCapabilities({
        codeGeneration: true,
        multimodal: true,
        parallelizable: true,
        budgetSensitive: true,
      }),
    });
    const profile = taskAnalysisResultToTaskProfile(analysis);
    expect(profile.codeGeneration).toBe(true);
    expect(profile.multimodal).toBe(true);
    expect(profile.parallelizable).toBe(true);
    expect(profile.budgetSensitive).toBe(true);
  });

  it('maps false capability flags', () => {
    const analysis = makeAnalysis({
      capabilities: makeCapabilities({
        codeGeneration: false,
        multimodal: false,
      }),
    });
    const profile = taskAnalysisResultToTaskProfile(analysis);
    expect(profile.codeGeneration).toBe(false);
    expect(profile.multimodal).toBe(false);
  });

  it('maps task type directly', () => {
    const taskTypes: TaskTypeCategory[] = [
      'architecture',
      'code_implementation',
      'code_review',
      'test_generation',
      'documentation',
      'large_codebase',
      'bulk_operations',
      'general',
    ];
    for (const taskType of taskTypes) {
      const profile = taskAnalysisResultToTaskProfile(makeAnalysis({ taskType }));
      expect(profile.taskType).toBe(taskType);
    }
  });

  it('includes detected product type when present', () => {
    const analysis = makeAnalysis({ detectedProductType: 'web-app' as never });
    const profile = taskAnalysisResultToTaskProfile(analysis);
    expect(profile.detectedProductType).toBe('web-app');
  });

  it('omits detected product type when undefined', () => {
    const analysis = makeAnalysis();
    const profile = taskAnalysisResultToTaskProfile(analysis);
    expect(profile.detectedProductType).toBeUndefined();
    expect('detectedProductType' in profile).toBe(false);
  });
});

// ============================================================================
// summarizeTaskProfile
// ============================================================================

describe('summarizeTaskProfile', () => {
  it('returns basic summary for simple profile', () => {
    const profile: TaskProfile = {
      contextRequired: 1500,
      reasoningComplexity: 5,
      codeGeneration: false,
      multimodal: false,
      parallelizable: false,
      budgetSensitive: false,
      taskType: 'general',
    };
    const summary = summarizeTaskProfile(profile);
    expect(summary).toContain('Type: general');
    expect(summary).toContain('Complexity: 5/10');
    expect(summary).toContain('Tokens: ~1500');
    expect(summary).not.toContain('Flags:');
  });

  it('includes flags when capabilities are true', () => {
    const profile: TaskProfile = {
      contextRequired: 2000,
      reasoningComplexity: 8,
      codeGeneration: true,
      multimodal: true,
      parallelizable: true,
      budgetSensitive: true,
      taskType: 'code_implementation',
    };
    const summary = summarizeTaskProfile(profile);
    expect(summary).toContain('Flags: code, multimodal, parallel, budget');
  });

  it('includes product type when present', () => {
    const profile: TaskProfile = {
      contextRequired: 1000,
      reasoningComplexity: 3,
      codeGeneration: false,
      multimodal: false,
      parallelizable: false,
      budgetSensitive: false,
      taskType: 'general',
      detectedProductType: 'cli-tool' as never,
    };
    const summary = summarizeTaskProfile(profile);
    expect(summary).toContain('Product: cli-tool');
  });

  it('omits product suffix when no product type', () => {
    const profile: TaskProfile = {
      contextRequired: 1000,
      reasoningComplexity: 3,
      codeGeneration: false,
      multimodal: false,
      parallelizable: false,
      budgetSensitive: false,
      taskType: 'general',
    };
    const summary = summarizeTaskProfile(profile);
    expect(summary).not.toContain('Product:');
  });
});

// ============================================================================
// taskAnalysisResultToBanditContext
// ============================================================================

describe('taskAnalysisResultToBanditContext', () => {
  it('maps complexity score directly', () => {
    const ctx = taskAnalysisResultToBanditContext(makeAnalysis({ complexityScore: 0.75 }));
    expect(ctx.taskComplexity).toBe(0.75);
  });

  it('normalizes token count to 100K max', () => {
    expect(
      taskAnalysisResultToBanditContext(makeAnalysis({ estimatedTokens: 50_000 }))
        .contextLengthNormalized
    ).toBe(0.5);
    expect(
      taskAnalysisResultToBanditContext(makeAnalysis({ estimatedTokens: 100_000 }))
        .contextLengthNormalized
    ).toBe(1);
    expect(
      taskAnalysisResultToBanditContext(makeAnalysis({ estimatedTokens: 200_000 }))
        .contextLengthNormalized
    ).toBe(1); // capped at 1
  });

  it('sets isCodeTask based on codeGeneration capability', () => {
    expect(
      taskAnalysisResultToBanditContext(
        makeAnalysis({ capabilities: makeCapabilities({ codeGeneration: true }) })
      ).isCodeTask
    ).toBe(1);
    expect(
      taskAnalysisResultToBanditContext(
        makeAnalysis({ capabilities: makeCapabilities({ codeGeneration: false }) })
      ).isCodeTask
    ).toBe(0);
  });

  it('sets isReasoningTask based on reasoning type and complexity', () => {
    // reasoning type -> 1
    expect(
      taskAnalysisResultToBanditContext(makeAnalysis({ reasoningType: 'reasoning' }))
        .isReasoningTask
    ).toBe(1);

    // knowledge type with high complexity -> 0.5
    expect(
      taskAnalysisResultToBanditContext(
        makeAnalysis({ reasoningType: 'knowledge', complexityScore: 0.7 })
      ).isReasoningTask
    ).toBe(0.5);

    // knowledge type with low complexity -> 0
    expect(
      taskAnalysisResultToBanditContext(
        makeAnalysis({ reasoningType: 'knowledge', complexityScore: 0.3 })
      ).isReasoningTask
    ).toBe(0);
  });

  it('uses default budget and time pressure when not provided', () => {
    // #4875: `timePressure` was 0.3 here while every replay path
    // (`warmStart`/`seedPriors`) and `LinUCBStage` used 0.5. Nothing computes
    // a time-pressure signal, so the feature is a constant either way — but
    // two DIFFERENT constants let the bandit use the value as a path
    // indicator. Neutral, matching the replay paths, is the honest default.
    const ctx = taskAnalysisResultToBanditContext(makeAnalysis());
    expect(ctx.budgetUtilization).toBe(0.5);
    expect(ctx.timePressure).toBe(0.5);
  });

  it('uses provided budget and time pressure', () => {
    const ctx = taskAnalysisResultToBanditContext(makeAnalysis(), {
      budgetUtilization: 0.9,
      timePressure: 0.1,
    });
    expect(ctx.budgetUtilization).toBe(0.9);
    expect(ctx.timePressure).toBe(0.1);
  });
});

// ============================================================================
// toExpertTaskAnalysisResult
// ============================================================================

describe('toExpertTaskAnalysisResult', () => {
  describe('domain mapping', () => {
    it('maps code_implementation to code domain', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis({ taskType: 'code_implementation' }));
      expect(result.domain).toBe('code');
    });

    it('maps code_review to code domain', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis({ taskType: 'code_review' }));
      expect(result.domain).toBe('code');
    });

    it('maps architecture to architecture domain', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis({ taskType: 'architecture' }));
      expect(result.domain).toBe('architecture');
    });

    it('maps test_generation to testing domain', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis({ taskType: 'test_generation' }));
      expect(result.domain).toBe('testing');
    });

    it('maps documentation to documentation domain', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis({ taskType: 'documentation' }));
      expect(result.domain).toBe('documentation');
    });

    it('maps bulk_operations to infrastructure domain', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis({ taskType: 'bulk_operations' }));
      expect(result.domain).toBe('infrastructure');
    });

    it('maps general to general domain', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis({ taskType: 'general' }));
      expect(result.domain).toBe('general');
    });
  });

  describe('security domain promotion', () => {
    it('promotes to security domain with strong security signals', () => {
      const result = toExpertTaskAnalysisResult(
        makeAnalysis({
          taskType: 'code_review',
          matchedSignals: ['security:vulnerability', 'security:exploit'],
        })
      );
      // code_review + security signal = 1 for type + 1 for keyword = 2 -> at least 2
      // Plus "vulnerability" and "exploit" = 2 more -> >= 2 total
      expect(result.domain).toBe('security');
    });

    it('does not promote with only one security signal', () => {
      const result = toExpertTaskAnalysisResult(
        makeAnalysis({
          taskType: 'code_implementation',
          matchedSignals: ['general:security'],
        })
      );
      // Only 1 signal, need >= 2
      expect(result.domain).toBe('code');
    });
  });

  describe('complexity mapping', () => {
    const complexityMappings: Array<[ComplexityLevel, string]> = [
      ['simple', 'low'],
      ['moderate', 'medium'],
      ['complex', 'high'],
      ['expert', 'high'],
    ];

    for (const [input, expected] of complexityMappings) {
      it(`maps ${input} to ${expected}`, () => {
        const result = toExpertTaskAnalysisResult(makeAnalysis({ complexity: input }));
        expect(result.complexity).toBe(expected);
      });
    }
  });

  describe('required capabilities', () => {
    it('always includes task_execution', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis());
      expect(result.requiredCapabilities).toContain('task_execution');
    });

    it('includes code_generation when capability is true', () => {
      const result = toExpertTaskAnalysisResult(
        makeAnalysis({ capabilities: makeCapabilities({ codeGeneration: true }) })
      );
      expect(result.requiredCapabilities).toContain('code_generation');
    });

    it('includes research for reasoning type', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis({ reasoningType: 'reasoning' }));
      expect(result.requiredCapabilities).toContain('research');
    });

    it('includes collaboration for complex/expert tasks', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis({ complexity: 'complex' }));
      expect(result.requiredCapabilities).toContain('collaboration');
    });

    it('deduplicates capabilities', () => {
      const result = toExpertTaskAnalysisResult(
        makeAnalysis({
          taskType: 'architecture',
          reasoningType: 'reasoning',
          complexity: 'complex',
        })
      );
      // 'research' appears from both reasoning type and architecture task type
      const researchCount = result.requiredCapabilities.filter((c) => c === 'research').length;
      expect(researchCount).toBe(1);
    });
  });

  describe('keywords extraction', () => {
    it('extracts keywords from matched signals', () => {
      const result = toExpertTaskAnalysisResult(
        makeAnalysis({ matchedSignals: ['type:code_generation', 'complexity:high'] })
      );
      expect(result.keywords).toContain('code_generation');
      expect(result.keywords).toContain('high');
    });

    it('handles signals without colons', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis({ matchedSignals: ['keyword_only'] }));
      expect(result.keywords).toContain('keyword_only');
    });
  });

  describe('estimated effort', () => {
    it('maps complexity score to 1-10 scale', () => {
      expect(
        toExpertTaskAnalysisResult(makeAnalysis({ complexityScore: 0.0 })).estimatedEffort
      ).toBe(1);
      expect(
        toExpertTaskAnalysisResult(makeAnalysis({ complexityScore: 0.5 })).estimatedEffort
      ).toBe(5);
      expect(
        toExpertTaskAnalysisResult(makeAnalysis({ complexityScore: 1.0 })).estimatedEffort
      ).toBe(10);
    });

    it('clamps to minimum of 1', () => {
      const result = toExpertTaskAnalysisResult(makeAnalysis({ complexityScore: 0.0 }));
      expect(result.estimatedEffort).toBeGreaterThanOrEqual(1);
    });
  });

  describe('secondary domains', () => {
    it('detects security as secondary domain', () => {
      const result = toExpertTaskAnalysisResult(
        makeAnalysis({
          taskType: 'code_implementation',
          matchedSignals: ['general:security'],
        })
      );
      expect(result.secondaryDomains).toContain('security');
    });

    it('detects testing as secondary domain', () => {
      const result = toExpertTaskAnalysisResult(
        makeAnalysis({
          taskType: 'code_implementation',
          matchedSignals: ['general:test'],
        })
      );
      expect(result.secondaryDomains).toContain('testing');
    });

    it('detects documentation as secondary domain', () => {
      const result = toExpertTaskAnalysisResult(
        makeAnalysis({
          taskType: 'code_implementation',
          matchedSignals: ['general:doc'],
        })
      );
      expect(result.secondaryDomains).toContain('documentation');
    });

    it('detects architecture as secondary via design signal', () => {
      const result = toExpertTaskAnalysisResult(
        makeAnalysis({
          taskType: 'code_implementation',
          matchedSignals: ['general:design'],
        })
      );
      expect(result.secondaryDomains).toContain('architecture');
    });

    it('adds base domain as secondary when security is primary', () => {
      const result = toExpertTaskAnalysisResult(
        makeAnalysis({
          taskType: 'code_review',
          matchedSignals: ['security:vulnerability', 'security:exploit'],
        })
      );
      if (result.domain === 'security') {
        expect(result.secondaryDomains).toContain('code');
      }
    });
  });

  describe('confidence', () => {
    it('uses max of taskTypeConfidence and reasoningConfidence', () => {
      const result = toExpertTaskAnalysisResult(
        makeAnalysis({ taskTypeConfidence: 0.6, reasoningConfidence: 0.9 })
      );
      expect(result.confidence).toBe(0.9);

      const result2 = toExpertTaskAnalysisResult(
        makeAnalysis({ taskTypeConfidence: 0.95, reasoningConfidence: 0.4 })
      );
      expect(result2.confidence).toBe(0.95);
    });
  });
});
