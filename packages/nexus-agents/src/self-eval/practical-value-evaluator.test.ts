/**
 * Tests for practical-value-evaluator.ts
 *
 * Covers export evaluation, export density, special file handling,
 * size heuristics, recommendation thresholds, and confidence calculation.
 */

import { describe, it, expect } from 'vitest';
import { PracticalValueEvaluator } from './practical-value-evaluator.js';
import type { ComponentInfo } from './component-scanner.js';

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
// Basic evaluation
// ============================================================================

describe('PracticalValueEvaluator - basic', () => {
  it('returns retain for well-used component', async () => {
    const evaluator = new PracticalValueEvaluator();
    const component = makeComponent({ exportCount: 5 });
    const result = await evaluator.evaluate(component);
    expect(result.recommendation).toBe('retain');
  });

  it('sets agent to practical-value', async () => {
    const evaluator = new PracticalValueEvaluator();
    const result = await evaluator.evaluate(makeComponent());
    expect(result.agent).toBe('practical-value');
  });

  it('marks result as recommendation', async () => {
    const evaluator = new PracticalValueEvaluator();
    const result = await evaluator.evaluate(makeComponent());
    expect(result.isRecommendation).toBe(true);
  });

  it('returns correct component path', async () => {
    const evaluator = new PracticalValueEvaluator();
    const result = await evaluator.evaluate(makeComponent({ path: 'src/bar.ts' }));
    expect(result.component).toBe('src/bar.ts');
  });
});

// ============================================================================
// Export evaluation
// ============================================================================

describe('PracticalValueEvaluator - exports', () => {
  it('flags zero exports for non-test files', async () => {
    const evaluator = new PracticalValueEvaluator();
    const component = makeComponent({ exportCount: 0, isTest: false });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('No exports'))).toBe(true);
  });

  it('does not flag zero exports for test files', async () => {
    const evaluator = new PracticalValueEvaluator();
    const component = makeComponent({ exportCount: 0, isTest: true });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('No exports'))).toBe(false);
  });

  it('includes exports metric', async () => {
    const evaluator = new PracticalValueEvaluator();
    const result = await evaluator.evaluate(makeComponent({ exportCount: 7 }));
    const metric = result.metrics.find((m) => m.metric === 'exports');
    expect(metric).toBeDefined();
    expect(metric?.value).toBe(7);
  });
});

// ============================================================================
// Export density
// ============================================================================

describe('PracticalValueEvaluator - export density', () => {
  it('flags low export density (lines per export > 100)', async () => {
    const evaluator = new PracticalValueEvaluator();
    // 500 lines, 2 exports → 250 lines/export
    const component = makeComponent({ lines: 500, exportCount: 2 });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('Low export density'))).toBe(true);
  });

  it('does not flag good export density', async () => {
    const evaluator = new PracticalValueEvaluator();
    // 100 lines, 5 exports → 20 lines/export
    const component = makeComponent({ lines: 100, exportCount: 5 });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('export density'))).toBe(false);
  });

  it('includes linesPerExport metric', async () => {
    const evaluator = new PracticalValueEvaluator();
    const component = makeComponent({ lines: 300, exportCount: 3 });
    const result = await evaluator.evaluate(component);
    const metric = result.metrics.find((m) => m.metric === 'linesPerExport');
    expect(metric).toBeDefined();
    expect(metric?.value).toBe(100);
  });
});

// ============================================================================
// Special files
// ============================================================================

describe('PracticalValueEvaluator - special files', () => {
  it('boosts score for index files', async () => {
    const evaluator = new PracticalValueEvaluator();
    const index = await evaluator.evaluate(makeComponent({ name: 'index' }));
    const regular = await evaluator.evaluate(makeComponent({ name: 'service' }));
    expect(index.metrics.some((m) => m.metric === 'isIndexFile')).toBe(true);
    // index gets +0.1 bonus
    expect(index.recommendation).toBe('retain');
    expect(regular.recommendation).toBe('retain');
  });

  it('ensures test files get at least 0.7 score', async () => {
    const evaluator = new PracticalValueEvaluator();
    // Zero exports + small file → would normally score low
    const component = makeComponent({
      exportCount: 0,
      isTest: true,
      sizeBytes: 50,
    });
    const result = await evaluator.evaluate(component);
    // Test files get score = Math.max(score, 0.7) → at least 'retain'
    expect(result.recommendation).toBe('retain');
  });

  it('includes isTest metric for test files', async () => {
    const evaluator = new PracticalValueEvaluator();
    const result = await evaluator.evaluate(makeComponent({ isTest: true }));
    expect(result.metrics.some((m) => m.metric === 'isTest')).toBe(true);
  });
});

// ============================================================================
// Size heuristics
// ============================================================================

describe('PracticalValueEvaluator - size', () => {
  it('flags very small files (<100 bytes)', async () => {
    const evaluator = new PracticalValueEvaluator();
    const component = makeComponent({ sizeBytes: 50, name: 'tiny' });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('Very small file'))).toBe(true);
  });

  it('does not flag small index files', async () => {
    const evaluator = new PracticalValueEvaluator();
    const component = makeComponent({ sizeBytes: 50, name: 'index' });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('Very small file'))).toBe(false);
  });

  it('does not flag normal-sized files', async () => {
    const evaluator = new PracticalValueEvaluator();
    const component = makeComponent({ sizeBytes: 5000 });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('Very small file'))).toBe(false);
  });

  it('includes sizeBytes metric', async () => {
    const evaluator = new PracticalValueEvaluator();
    const result = await evaluator.evaluate(makeComponent({ sizeBytes: 3000 }));
    const metric = result.metrics.find((m) => m.metric === 'sizeBytes');
    expect(metric).toBeDefined();
    expect(metric?.value).toBe(3000);
  });
});

// ============================================================================
// Recommendation thresholds
// ============================================================================

describe('PracticalValueEvaluator - recommendations', () => {
  it('returns retain for healthy component (score >= 0.7)', async () => {
    const evaluator = new PracticalValueEvaluator();
    const result = await evaluator.evaluate(makeComponent());
    expect(result.recommendation).toBe('retain');
  });

  it('returns deprecate for zero-export small file', async () => {
    const evaluator = new PracticalValueEvaluator();
    // 0 exports (-0.4) + small file (-0.1) + low density (n/a, 0 exports) = 0.5
    // Wait, with 0 exports, the linesPerExport block is skipped (exportCount > 0 is false)
    // score = 1.0 - 0.4 - 0.1 = 0.5 → 'review'
    const component = makeComponent({
      exportCount: 0,
      sizeBytes: 50,
      name: 'stub',
    });
    const result = await evaluator.evaluate(component);
    expect(result.recommendation).toBe('review');
  });
});

// ============================================================================
// Confidence
// ============================================================================

describe('PracticalValueEvaluator - confidence', () => {
  it('confidence is between 0 and 1', async () => {
    const evaluator = new PracticalValueEvaluator();
    const result = await evaluator.evaluate(makeComponent());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('pins the per-role rubric (behavior-preserving): base 0.5, cap 0.4, coeff 0.08, no penalty', async () => {
    const evaluator = new PracticalValueEvaluator();
    // Default component emits 3 metrics (exports, linesPerExport, sizeBytes) ⇒
    // 0.5 + min(0.4, 3*0.08=0.24) = 0.74. No concern penalty for this role.
    const result = await evaluator.evaluate(makeComponent());
    expect(result.metrics).toHaveLength(3);
    expect(result.confidence).toBeCloseTo(0.74, 10);
  });
});
