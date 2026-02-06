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
