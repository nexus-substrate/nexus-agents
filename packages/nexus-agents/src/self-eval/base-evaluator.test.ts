/**
 * Tests for base-evaluator.ts
 *
 * Covers BaseEvaluator: evaluate (success, timeout, error),
 * createResult, and cite helper methods.
 */

import { describe, it, expect, vi } from 'vitest';
import { BaseEvaluator } from './base-evaluator.js';
import type { ComponentInfo } from './component-scanner.js';
import type { EvaluationResult } from './evaluation-agents-types.js';

// ============================================================================
// Concrete test subclass
// ============================================================================

class TestEvaluator extends BaseEvaluator {
  public mockResult: EvaluationResult | null = null;
  public mockError: Error | null = null;
  public mockDelay = 0;

  protected async performEvaluation(component: ComponentInfo): Promise<EvaluationResult> {
    if (this.mockDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.mockDelay));
    }
    if (this.mockError !== null) {
      throw this.mockError;
    }
    if (this.mockResult !== null) {
      return this.mockResult;
    }
    return this.createResult(component, 'retain', 0.9, [], []);
  }

  // Expose protected methods for testing
  public testCreateResult(
    component: ComponentInfo,
    recommendation: 'retain' | 'refactor' | 'review' | 'deprecate',
    confidence: number,
    concerns: string[]
  ): EvaluationResult {
    return this.createResult(component, recommendation, confidence, [], concerns);
  }

  public testCite(
    metric: string,
    value: number | string,
    source: 'scanner' | 'coverage_report' | 'git_history' | 'static_analysis',
    threshold?: number | string
  ): ReturnType<BaseEvaluator['cite']> {
    return this.cite(metric, value, source, threshold);
  }

  public testComputeConfidence(opts: Parameters<BaseEvaluator['computeConfidence']>[0]): number {
    return this.computeConfidence(opts);
  }
}

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeComponent(overrides: Partial<ComponentInfo> = {}) {
  return {
    path: 'src/module.ts',
    lines: 100,
    category: 'implementation',
    exports: [],
    dependencies: [],
    ...overrides,
  } as ComponentInfo;
}

// ============================================================================
// Constructor
// ============================================================================

describe('BaseEvaluator - constructor', () => {
  it('creates with default config', () => {
    const evaluator = new TestEvaluator('code-quality');
    expect(evaluator).toBeInstanceOf(BaseEvaluator);
  });

  it('creates with custom config', () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    };
    const evaluator = new TestEvaluator('architecture-fit', {
      logger: logger as never,
      timeoutMs: 5000,
      thresholds: { maxComplexity: 10 },
    });
    expect(evaluator).toBeInstanceOf(BaseEvaluator);
  });
});

// ============================================================================
// evaluate
// ============================================================================

describe('BaseEvaluator - evaluate', () => {
  it('returns evaluation result on success', async () => {
    const evaluator = new TestEvaluator('code-quality');
    const result = await evaluator.evaluate(makeComponent());
    expect(result.recommendation).toBe('retain');
    expect(result.confidence).toBe(0.9);
    expect(result.component).toBe('src/module.ts');
    expect(result.isRecommendation).toBe(true);
    expect(result.agent).toBe('code-quality');
  });

  it('returns review recommendation on error', async () => {
    const evaluator = new TestEvaluator('code-quality');
    evaluator.mockError = new Error('analysis failed');
    const result = await evaluator.evaluate(makeComponent());
    expect(result.recommendation).toBe('review');
    expect(result.confidence).toBe(0.3);
    expect(result.concerns[0]).toContain('analysis failed');
  });

  it('returns review recommendation on timeout', async () => {
    const evaluator = new TestEvaluator('code-quality', { timeoutMs: 50 });
    evaluator.mockDelay = 200;
    const result = await evaluator.evaluate(makeComponent());
    expect(result.recommendation).toBe('review');
    expect(result.concerns[0]).toContain('timeout');
  }, 10000);

  it('returns custom evaluation result', async () => {
    const evaluator = new TestEvaluator('code-quality');
    evaluator.mockResult = {
      component: 'src/module.ts',
      recommendation: 'refactor',
      confidence: 0.7,
      metrics: [],
      concerns: ['high complexity'],
      isRecommendation: true,
      agent: 'code-quality',
      timestamp: new Date(),
    };
    const result = await evaluator.evaluate(makeComponent());
    expect(result.recommendation).toBe('refactor');
    expect(result.concerns).toContain('high complexity');
  });
});

// ============================================================================
// createResult
// ============================================================================

describe('BaseEvaluator - createResult', () => {
  const evaluator = new TestEvaluator('code-quality');

  it('creates result with all fields', () => {
    const result = evaluator.testCreateResult(makeComponent(), 'deprecate', 0.95, [
      'unused module',
    ]);
    expect(result.recommendation).toBe('deprecate');
    expect(result.confidence).toBe(0.95);
    expect(result.concerns).toEqual(['unused module']);
    expect(result.isRecommendation).toBe(true);
    expect(result.agent).toBe('code-quality');
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('clamps confidence to 0-1 range', () => {
    const high = evaluator.testCreateResult(makeComponent(), 'retain', 1.5, []);
    expect(high.confidence).toBeLessThanOrEqual(1);

    const low = evaluator.testCreateResult(makeComponent(), 'retain', -0.5, []);
    expect(low.confidence).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// cite
// ============================================================================

describe('BaseEvaluator - cite', () => {
  const evaluator = new TestEvaluator('code-quality');

  it('creates metric citation without threshold', () => {
    const citation = evaluator.testCite('complexity', 15, 'static_analysis');
    expect(citation.metric).toBe('complexity');
    expect(citation.value).toBe(15);
    expect(citation.source).toBe('static_analysis');
    expect(citation.threshold).toBeUndefined();
  });

  it('creates metric citation with threshold', () => {
    const citation = evaluator.testCite('lines', 500, 'scanner', 400);
    expect(citation.threshold).toBe(400);
  });

  it('creates citation with string value', () => {
    const citation = evaluator.testCite('category', 'implementation', 'scanner');
    expect(citation.value).toBe('implementation');
  });
});

// ============================================================================
// computeConfidence (shared per-role rubric)
// ============================================================================

describe('BaseEvaluator - computeConfidence', () => {
  const evaluator = new TestEvaluator('code-quality');

  it('no-penalty case: base + uncapped metric bonus', () => {
    // 0.6 + min(0.3, 3 * 0.05) = 0.6 + 0.15 = 0.75
    expect(
      evaluator.testComputeConfidence({
        base: 0.6,
        metricCount: 3,
        metricCap: 0.3,
        metricCoeff: 0.05,
      })
    ).toBeCloseTo(0.75, 10);
  });

  it('metric bonus saturates at the cap', () => {
    // 0.6 + min(0.3, 10 * 0.05=0.5) = 0.6 + 0.3 = 0.9
    expect(
      evaluator.testComputeConfidence({
        base: 0.6,
        metricCount: 10,
        metricCap: 0.3,
        metricCoeff: 0.05,
      })
    ).toBeCloseTo(0.9, 10);
  });

  it('zero metrics returns the base', () => {
    expect(
      evaluator.testComputeConfidence({
        base: 0.5,
        metricCount: 0,
        metricCap: 0.4,
        metricCoeff: 0.08,
      })
    ).toBeCloseTo(0.5, 10);
  });

  it('penalty case: base + capped bonus - capped penalty', () => {
    // 0.5 + min(0.4, 5*0.1=0.5) - min(0.2, 3*0.05=0.15) = 0.5 + 0.4 - 0.15 = 0.75
    expect(
      evaluator.testComputeConfidence({
        base: 0.5,
        metricCount: 5,
        metricCap: 0.4,
        metricCoeff: 0.1,
        concernCount: 3,
        concernCap: 0.2,
        concernCoeff: 0.05,
      })
    ).toBeCloseTo(0.75, 10);
  });

  it('concern penalty saturates at the cap', () => {
    // 0.5 + 0.4 - min(0.2, 10*0.05=0.5) = 0.5 + 0.4 - 0.2 = 0.7
    expect(
      evaluator.testComputeConfidence({
        base: 0.5,
        metricCount: 5,
        metricCap: 0.4,
        metricCoeff: 0.1,
        concernCount: 10,
        concernCap: 0.2,
        concernCoeff: 0.05,
      })
    ).toBeCloseTo(0.7, 10);
  });

  it('omitting concern fields applies no penalty', () => {
    const withoutConcerns = evaluator.testComputeConfidence({
      base: 0.5,
      metricCount: 2,
      metricCap: 0.4,
      metricCoeff: 0.08,
    });
    const withZeroConcernCount = evaluator.testComputeConfidence({
      base: 0.5,
      metricCount: 2,
      metricCap: 0.4,
      metricCoeff: 0.08,
      concernCount: 0,
      concernCap: 0.2,
      concernCoeff: 0.05,
    });
    // 0.5 + min(0.4, 2*0.08=0.16) = 0.66 either way
    expect(withoutConcerns).toBeCloseTo(0.66, 10);
    expect(withZeroConcernCount).toBeCloseTo(0.66, 10);
  });

  it('reproduces each role formula byte-identically', () => {
    // architecture-fit: 10 metrics ⇒ 0.6 + min(0.3, 0.5) = 0.9
    expect(
      evaluator.testComputeConfidence({
        base: 0.6,
        metricCount: 10,
        metricCap: 0.3,
        metricCoeff: 0.05,
      })
    ).toBe(0.6 + Math.min(0.3, 10 * 0.05));
    // practical-value: 2 metrics ⇒ 0.5 + min(0.4, 0.16) = 0.66
    expect(
      evaluator.testComputeConfidence({
        base: 0.5,
        metricCount: 2,
        metricCap: 0.4,
        metricCoeff: 0.08,
      })
    ).toBe(0.5 + Math.min(0.4, 2 * 0.08));
    // code-quality: 5 metrics + 3 concerns ⇒ 0.5 + 0.4 - 0.15 = 0.75
    expect(
      evaluator.testComputeConfidence({
        base: 0.5,
        metricCount: 5,
        metricCap: 0.4,
        metricCoeff: 0.1,
        concernCount: 3,
        concernCap: 0.2,
        concernCoeff: 0.05,
      })
    ).toBe(0.5 + Math.min(0.4, 5 * 0.1) - Math.min(0.2, 3 * 0.05));
  });
});
