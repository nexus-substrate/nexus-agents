/**
 * Tests for Workflow Metrics Module
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMetrics,
  validateMetrics,
  metricsPassQualityGates,
  summarizeMetrics,
  formatMetricsReport,
} from './metrics.js';
import type { SelfDevWorkflowResult, SelfDevWorkflowMetrics } from './types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockOutputs(): SelfDevWorkflowResult['outputs'] {
  return {
    analyze: {
      prioritizedIssues: [],
      selectedIssue: {
        number: 1,
        title: 'Test Issue',
        body: 'Test body',
        labels: [],
        priorityScore: 5,
        complexity: 2,
        estimatedEffort: '2h',
        dependencies: [],
        risks: [],
        keywords: [],
        topics: [],
        type: 'enhancement',
      },
      selectionRationale: 'Selected for testing',
      durationMs: 1000,
    },
    research: {
      codebase: { relevantFiles: [], existingPatterns: [], interfaces: [], testPatterns: [] },
      academic: { papers: [] },
      docs: { officialDocs: [], bestPractices: [], relatedGuides: [] },
      history: { relatedIssues: [], relatedPRs: [], previousAttempts: [], relevantCommits: [] },
      synthesizedContext: 'Test context',
      durationMs: 2000,
    },
    plan: {
      trinityResult: {
        success: true,
        finalOutput: 'Mock output',
        iterations: 3,
        totalDurationMs: 5000,
        history: [],
        stopReason: 'verified' as const,
        thinkerOutput: {
          problemAnalysis: 'Test problem',
          approach: 'Test approach',
          considerations: [],
          successCriteria: [],
        },
        workerOutput: {
          implementation: 'Test implementation',
          stepsCompleted: [],
          deviations: [],
          questions: [],
        },
        verifierOutput: {
          verdict: 'pass' as const,
          correctnessCheck: 'Correct',
          qualityCheck: 'Good quality',
          issuesFound: [],
          recommendations: [],
        },
      },
      plan: {
        problemAnalysis: 'Test analysis',
        successCriteria: ['Test passes'],
        files: [],
        interfaces: [],
        dependencies: [],
        testPlan: 'Run tests',
      },
      iterations: 3,
      verified: true,
      durationMs: 5000,
    },
    refine: {
      reflexionResult: {
        rounds: [],
        finalOutput: {},
        totalIterations: 2,
        converged: true,
        terminationReason: 'converged' as const,
        totalDurationMs: 3000,
      },
      refinedPlan: {
        problemAnalysis: 'Refined analysis',
        successCriteria: ['Test passes'],
        files: [],
        interfaces: [],
        dependencies: [],
        testPlan: 'Run tests',
      },
      critiques: [],
      iterations: 2,
      converged: true,
      finalSeverity: 0.5,
      durationMs: 3000,
    },
    vote: {
      votes: [],
      approvalCount: 4,
      rejectCount: 1,
      abstainCount: 0,
      consensus: true,
      vetoExercised: false,
      verdict: 'APPROVED',
      durationMs: 1500,
    },
    review: {
      decision: 'approved',
      timestamp: new Date().toISOString(),
      durationMs: 30000,
    },
    implement: {
      filesCreated: ['file1.ts'],
      filesModified: ['file2.ts'],
      selfRefineIterations: 2,
      selfDebugIterations: 1,
      success: true,
      summary: 'Implementation complete',
      durationMs: 10000,
    },
    verify: {
      checks: [
        { name: 'typecheck', command: 'pnpm typecheck', passed: true, durationMs: 5000 },
        { name: 'test', command: 'pnpm test', passed: true, durationMs: 10000 },
      ],
      allPassed: true,
      coverage: 85,
      durationMs: 15000,
    },
    commit: {
      branch: 'feature/test',
      commitSha: 'abc1234',
      prNumber: 100,
      prUrl: 'https://github.com/test/repo/pull/100',
      status: 'created',
      durationMs: 2000,
    },
  };
}

function createMinimalMetrics(): SelfDevWorkflowMetrics {
  return {
    totalDurationMs: 60000,
    phaseDurations: {
      analyze: 1000,
      research: 2000,
      plan: 5000,
      refine: 3000,
      vote: 1500,
      review: 30000,
      implement: 10000,
      verify: 15000,
      commit: 2000,
    },
    trinityIterations: 3,
    reflexionIterations: 2,
    selfDebugIterations: 1,
    selfRefineIterations: 2,
    finalSeverity: 0.5,
    testCoverage: 85,
    approvalRate: 0.8,
    vetoCount: 0,
    humanReviewTime: 30000,
    humanRevisions: 1,
  };
}

// =============================================================================
// calculateMetrics Tests
// =============================================================================

describe('calculateMetrics', () => {
  it('calculates metrics from outputs', () => {
    const outputs = createMockOutputs();
    const metrics = calculateMetrics(outputs, 60000, 1);

    expect(metrics.totalDurationMs).toBe(60000);
    expect(metrics.trinityIterations).toBe(3);
    expect(metrics.reflexionIterations).toBe(2);
    expect(metrics.selfDebugIterations).toBe(1);
    expect(metrics.selfRefineIterations).toBe(2);
    expect(metrics.finalSeverity).toBe(0.5);
    expect(metrics.testCoverage).toBe(85);
  });

  it('calculates phase durations', () => {
    const outputs = createMockOutputs();
    const metrics = calculateMetrics(outputs, 60000, 1);

    expect(metrics.phaseDurations.analyze).toBe(1000);
    expect(metrics.phaseDurations.research).toBe(2000);
    expect(metrics.phaseDurations.plan).toBe(5000);
    expect(metrics.phaseDurations.refine).toBe(3000);
    expect(metrics.phaseDurations.vote).toBe(1500);
    expect(metrics.phaseDurations.implement).toBe(10000);
    expect(metrics.phaseDurations.verify).toBe(15000);
    expect(metrics.phaseDurations.commit).toBe(2000);
  });

  it('calculates approval rate', () => {
    const outputs = createMockOutputs();
    const metrics = calculateMetrics(outputs, 60000, 1);

    // 4 approvals / 5 total votes = 0.8
    expect(metrics.approvalRate).toBe(0.8);
  });

  it('handles missing outputs gracefully', () => {
    const metrics = calculateMetrics({}, 60000, 0);

    expect(metrics.trinityIterations).toBe(0);
    expect(metrics.reflexionIterations).toBe(0);
    expect(metrics.selfDebugIterations).toBe(0);
    expect(metrics.selfRefineIterations).toBe(0);
    expect(metrics.finalSeverity).toBe(0);
    expect(metrics.testCoverage).toBe(0);
    expect(metrics.approvalRate).toBe(0);
    expect(metrics.vetoCount).toBe(0);
  });

  it('records veto count', () => {
    const outputs = createMockOutputs();
    if (outputs.vote) {
      // Modify to simulate veto
      const vetoed = { ...outputs, vote: { ...outputs.vote, vetoExercised: true } };
      const metrics = calculateMetrics(vetoed, 60000, 1);
      expect(metrics.vetoCount).toBe(1);
    }
  });
});

// =============================================================================
// validateMetrics Tests
// =============================================================================

describe('validateMetrics', () => {
  it('validates passing metrics', () => {
    const metrics = createMinimalMetrics();
    const validation = validateMetrics(metrics);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('warns on long total duration', () => {
    const metrics = createMinimalMetrics();
    const longMetrics = { ...metrics, totalDurationMs: 35 * 60 * 1000 }; // 35 min
    const validation = validateMetrics(longMetrics);

    expect(validation.warnings.length).toBeGreaterThan(0);
    expect(validation.warnings.some((w) => w.includes('Total duration'))).toBe(true);
  });

  it('warns on long phase duration', () => {
    const metrics = createMinimalMetrics();
    const longPhase = {
      ...metrics,
      phaseDurations: { ...metrics.phaseDurations, plan: 10 * 60 * 1000 },
    }; // 10 min
    const validation = validateMetrics(longPhase);

    expect(validation.warnings.some((w) => w.includes('Phase plan'))).toBe(true);
  });

  it('errors on low test coverage', () => {
    const metrics = createMinimalMetrics();
    const lowCoverage = { ...metrics, testCoverage: 50 };
    const validation = validateMetrics(lowCoverage);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('coverage'))).toBe(true);
  });

  it('errors on low approval rate', () => {
    const metrics = createMinimalMetrics();
    const lowApproval = { ...metrics, approvalRate: 0.5 };
    const validation = validateMetrics(lowApproval);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Approval rate'))).toBe(true);
  });

  it('errors on veto exercised', () => {
    const metrics = createMinimalMetrics();
    const vetoed = { ...metrics, vetoCount: 1 };
    const validation = validateMetrics(vetoed);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('veto'))).toBe(true);
  });

  it('warns on high iteration count', () => {
    const metrics = createMinimalMetrics();
    const highIter = {
      ...metrics,
      trinityIterations: 15,
      reflexionIterations: 15,
      selfDebugIterations: 15,
      selfRefineIterations: 15,
    };
    const validation = validateMetrics(highIter);

    expect(validation.warnings.some((w) => w.includes('iteration'))).toBe(true);
  });
});

// =============================================================================
// metricsPassQualityGates Tests
// =============================================================================

describe('metricsPassQualityGates', () => {
  it('returns ok for valid metrics', () => {
    const metrics = createMinimalMetrics();
    const result = metricsPassQualityGates(metrics);

    expect(result.ok).toBe(true);
  });

  it('returns error for invalid metrics', () => {
    const metrics = createMinimalMetrics();
    const invalid = { ...metrics, testCoverage: 50 };
    const result = metricsPassQualityGates(invalid);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('coverage');
    }
  });
});

// =============================================================================
// summarizeMetrics Tests
// =============================================================================

describe('summarizeMetrics', () => {
  it('creates human-readable summary', () => {
    const metrics = createMinimalMetrics();
    const summary = summarizeMetrics(metrics);

    expect(summary.duration).toBeDefined();
    expect(summary.phases).toBeDefined();
    expect(summary.quality).toBeDefined();
    expect(summary.iterations).toBeDefined();
    expect(summary.vote).toBeDefined();
    expect(summary.humanReview).toBeDefined();
  });

  it('formats duration correctly', () => {
    const metrics = createMinimalMetrics();
    const summary = summarizeMetrics(metrics);

    // 60000ms = 1.0min
    expect(summary.duration).toBe('1.0min');
  });

  it('includes coverage in quality', () => {
    const metrics = createMinimalMetrics();
    const summary = summarizeMetrics(metrics);

    expect(summary.quality).toContain('85%');
  });

  it('includes approval rate in vote', () => {
    const metrics = createMinimalMetrics();
    const summary = summarizeMetrics(metrics);

    expect(summary.vote).toContain('80%');
  });

  it('shows VETO indicator when veto exercised', () => {
    const metrics = createMinimalMetrics();
    const vetoed = { ...metrics, vetoCount: 1 };
    const summary = summarizeMetrics(vetoed);

    expect(summary.vote).toContain('VETO');
  });
});

// =============================================================================
// formatMetricsReport Tests
// =============================================================================

describe('formatMetricsReport', () => {
  it('generates formatted report', () => {
    const metrics = createMinimalMetrics();
    const report = formatMetricsReport(metrics);

    expect(report).toContain('Self-Development Workflow Metrics');
    expect(report).toContain('Duration:');
    expect(report).toContain('Quality:');
    expect(report).toContain('Status: ✓ PASSED');
  });

  it('includes warnings in report', () => {
    const metrics = createMinimalMetrics();
    const longDuration = { ...metrics, totalDurationMs: 35 * 60 * 1000 };
    const report = formatMetricsReport(longDuration);

    expect(report).toContain('Warnings:');
    expect(report).toContain('⚠');
  });

  it('includes errors in report', () => {
    const metrics = createMinimalMetrics();
    const invalid = { ...metrics, testCoverage: 50 };
    const report = formatMetricsReport(invalid);

    expect(report).toContain('Errors:');
    expect(report).toContain('✗');
    expect(report).toContain('Status: ✗ FAILED');
  });

  it('shows phases completed', () => {
    const metrics = createMinimalMetrics();
    const report = formatMetricsReport(metrics);

    expect(report).toContain('Phases:');
    expect(report).toContain('analyze:');
  });
});
