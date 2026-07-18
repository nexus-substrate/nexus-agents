/**
 * Tests for code-quality-evaluator.ts
 *
 * Covers complexity scoring, file length scoring, test coverage scoring,
 * recommendation thresholds, confidence calculation, and configuration.
 */

import { describe, it, expect } from 'vitest';
import { CodeQualityEvaluator } from './code-quality-evaluator.js';
import type { ComponentInfo } from './component-scanner.js';
import { DEFAULT_THRESHOLDS } from './evaluation-agents-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeComponent(overrides: Partial<ComponentInfo> = {}): ComponentInfo {
  return {
    path: 'src/foo.ts',
    name: 'foo',
    lines: 100,
    complexity: 5,
    testCoverage: null,
    dependencies: [],
    isTest: false,
    sizeBytes: 2000,
    exportCount: 3,
    ...overrides,
  };
}

// ============================================================================
// Healthy component
// ============================================================================

describe('CodeQualityEvaluator - healthy component', () => {
  it('recommends retain for low complexity, short file', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({ complexity: 5, lines: 100 });
    const result = await evaluator.evaluate(component);
    expect(result.recommendation).toBe('retain');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('returns correct component path', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({ path: 'src/bar.ts' });
    const result = await evaluator.evaluate(component);
    expect(result.component).toBe('src/bar.ts');
  });

  it('marks result as recommendation', async () => {
    const evaluator = new CodeQualityEvaluator();
    const result = await evaluator.evaluate(makeComponent());
    expect(result.isRecommendation).toBe(true);
  });

  it('sets agent role to code-quality', async () => {
    const evaluator = new CodeQualityEvaluator();
    const result = await evaluator.evaluate(makeComponent());
    expect(result.agent).toBe('code-quality');
  });

  it('includes timestamp', async () => {
    const evaluator = new CodeQualityEvaluator();
    const result = await evaluator.evaluate(makeComponent());
    expect(result.timestamp).toBeInstanceOf(Date);
  });
});

// ============================================================================
// Complexity evaluation
// ============================================================================

describe('CodeQualityEvaluator - complexity', () => {
  it('flags high complexity with concern', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({
      complexity: DEFAULT_THRESHOLDS.maxComplexity + 5,
    });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('complexity'))).toBe(true);
  });

  it('includes complexity metric citation for high complexity', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({
      complexity: DEFAULT_THRESHOLDS.maxComplexity + 1,
    });
    const result = await evaluator.evaluate(component);
    const complexityMetric = result.metrics.find((m) => m.metric === 'complexity');
    expect(complexityMetric).toBeDefined();
    expect(complexityMetric?.threshold).toBe(DEFAULT_THRESHOLDS.maxComplexity);
  });

  it('includes complexity metric even when within threshold', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({ complexity: 5 });
    const result = await evaluator.evaluate(component);
    const complexityMetric = result.metrics.find((m) => m.metric === 'complexity');
    expect(complexityMetric).toBeDefined();
    expect(complexityMetric?.value).toBe(5);
  });
});

// ============================================================================
// File length evaluation
// ============================================================================

describe('CodeQualityEvaluator - file length', () => {
  it('flags long files with concern', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({
      lines: DEFAULT_THRESHOLDS.maxLines + 100,
    });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('File too long'))).toBe(true);
  });

  it('includes lines metric for long files with threshold', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({
      lines: DEFAULT_THRESHOLDS.maxLines + 1,
    });
    const result = await evaluator.evaluate(component);
    const linesMetric = result.metrics.find((m) => m.metric === 'lines');
    expect(linesMetric).toBeDefined();
    expect(linesMetric?.threshold).toBe(DEFAULT_THRESHOLDS.maxLines);
  });

  it('does not flag files within threshold', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({ lines: 200 });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('File too long'))).toBe(false);
  });
});

// ============================================================================
// Test coverage evaluation
// ============================================================================

describe('CodeQualityEvaluator - test coverage', () => {
  it('flags low test coverage (<50%)', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({ testCoverage: 30 });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('Low test coverage'))).toBe(true);
  });

  it('does not flag adequate test coverage', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({ testCoverage: 80 });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('Low test coverage'))).toBe(false);
  });

  it('includes testCoverage metric when available', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({ testCoverage: 75 });
    const result = await evaluator.evaluate(component);
    const coverageMetric = result.metrics.find((m) => m.metric === 'testCoverage');
    expect(coverageMetric).toBeDefined();
  });

  it('adds isTest metric for test files', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({ isTest: true });
    const result = await evaluator.evaluate(component);
    const testMetric = result.metrics.find((m) => m.metric === 'isTest');
    expect(testMetric).toBeDefined();
    expect(testMetric?.value).toBe('true');
  });

  it('skips coverage concern for null coverage', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({ testCoverage: null });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('test coverage'))).toBe(false);
  });
});

// ============================================================================
// Recommendation thresholds
// ============================================================================

describe('CodeQualityEvaluator - recommendations', () => {
  it('returns retain for perfect component (score >= 0.8)', async () => {
    const evaluator = new CodeQualityEvaluator();
    const component = makeComponent({ complexity: 5, lines: 100, testCoverage: 90 });
    const result = await evaluator.evaluate(component);
    expect(result.recommendation).toBe('retain');
  });

  it('returns review for moderate issues (score 0.5-0.8)', async () => {
    const evaluator = new CodeQualityEvaluator();
    // High complexity (-0.3) brings score to 0.7
    const component = makeComponent({
      complexity: DEFAULT_THRESHOLDS.maxComplexity + 5,
      lines: 100,
    });
    const result = await evaluator.evaluate(component);
    expect(result.recommendation).toBe('review');
  });

  it('returns refactor for multiple issues (score 0.3-0.5)', async () => {
    const evaluator = new CodeQualityEvaluator();
    // High complexity (-0.3) + long file (-0.25) brings score to 0.45
    const component = makeComponent({
      complexity: DEFAULT_THRESHOLDS.maxComplexity + 5,
      lines: DEFAULT_THRESHOLDS.maxLines + 100,
    });
    const result = await evaluator.evaluate(component);
    expect(result.recommendation).toBe('refactor');
  });

  it('returns deprecate for many issues (score < 0.3)', async () => {
    const evaluator = new CodeQualityEvaluator();
    // High complexity (-0.3) + long file (-0.25) + low coverage (-0.2) = 0.25
    const component = makeComponent({
      complexity: DEFAULT_THRESHOLDS.maxComplexity + 5,
      lines: DEFAULT_THRESHOLDS.maxLines + 100,
      testCoverage: 20,
    });
    const result = await evaluator.evaluate(component);
    expect(result.recommendation).toBe('deprecate');
  });
});

// ============================================================================
// Confidence calculation
// ============================================================================

describe('CodeQualityEvaluator - confidence', () => {
  it('confidence is between 0 and 1', async () => {
    const evaluator = new CodeQualityEvaluator();
    const result = await evaluator.evaluate(makeComponent());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('more metrics increase confidence', async () => {
    const evaluator = new CodeQualityEvaluator();
    // With testCoverage: adds extra metric
    const withCoverage = await evaluator.evaluate(makeComponent({ testCoverage: 80 }));
    const withoutCoverage = await evaluator.evaluate(makeComponent({ testCoverage: null }));
    expect(withCoverage.confidence).toBeGreaterThanOrEqual(withoutCoverage.confidence);
  });

  it('pins the per-role rubric (behavior-preserving): base 0.5, cap 0.4, coeff 0.1, no concerns', async () => {
    const evaluator = new CodeQualityEvaluator();
    // Healthy default: 2 metrics (complexity, lines), 0 concerns ⇒
    // 0.5 + min(0.4, 2*0.1=0.2) - 0 = 0.7
    const result = await evaluator.evaluate(makeComponent());
    expect(result.metrics).toHaveLength(2);
    expect(result.concerns).toHaveLength(0);
    expect(result.confidence).toBeCloseTo(0.7, 10);
  });

  it('pins the concern penalty path (the only role that penalizes)', async () => {
    const evaluator = new CodeQualityEvaluator();
    // complexity 25 (>20), lines 500 (>400), coverage 30 (<50):
    // 3 metrics + 3 concerns ⇒ 0.5 + min(0.4, 3*0.1=0.3) - min(0.2, 3*0.05=0.15) = 0.65
    const result = await evaluator.evaluate(
      makeComponent({ complexity: 25, lines: 500, testCoverage: 30 })
    );
    expect(result.metrics).toHaveLength(3);
    expect(result.concerns).toHaveLength(3);
    expect(result.confidence).toBeCloseTo(0.65, 10);
  });
});

// ============================================================================
// Custom configuration
// ============================================================================

describe('CodeQualityEvaluator - custom config', () => {
  it('respects custom complexity threshold', async () => {
    const evaluator = new CodeQualityEvaluator({
      thresholds: { maxComplexity: 3 },
    });
    const component = makeComponent({ complexity: 5 });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('complexity'))).toBe(true);
  });

  it('respects custom line threshold', async () => {
    const evaluator = new CodeQualityEvaluator({
      thresholds: { maxLines: 50 },
    });
    const component = makeComponent({ lines: 100 });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('File too long'))).toBe(true);
  });
});
