/**
 * Tests for architecture-fit-evaluator.ts
 *
 * Covers dependency evaluation, dependency categorization,
 * export evaluation, node protocol imports, and recommendation scoring.
 */

import { describe, it, expect } from 'vitest';
import { ArchitectureFitEvaluator } from './architecture-fit-evaluator.js';
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
// Basic evaluation
// ============================================================================

describe('ArchitectureFitEvaluator - basic', () => {
  it('returns retain for well-structured component', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({
      dependencies: ['./utils.js', './types.js'],
      exportCount: 5,
    });
    const result = await evaluator.evaluate(component);
    expect(result.recommendation).toBe('retain');
  });

  it('returns correct component path', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({ path: 'src/service.ts' });
    const result = await evaluator.evaluate(component);
    expect(result.component).toBe('src/service.ts');
  });

  it('sets agent to architecture-fit', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const result = await evaluator.evaluate(makeComponent());
    expect(result.agent).toBe('architecture-fit');
  });

  it('marks result as recommendation', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const result = await evaluator.evaluate(makeComponent());
    expect(result.isRecommendation).toBe(true);
  });
});

// ============================================================================
// Dependency evaluation
// ============================================================================

describe('ArchitectureFitEvaluator - dependencies', () => {
  it('flags high dependency count', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const deps = Array.from(
      { length: DEFAULT_THRESHOLDS.maxDependencies + 5 },
      (_, i) => `./dep${String(i)}.js`
    );
    const component = makeComponent({ dependencies: deps });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('High coupling'))).toBe(true);
  });

  it('does not flag normal dependency count', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({
      dependencies: ['./a.js', './b.js', './c.js'],
    });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('coupling'))).toBe(false);
  });

  it('includes dependency count metric', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({
      dependencies: ['./a.js', './b.js'],
    });
    const result = await evaluator.evaluate(component);
    const depMetric = result.metrics.find((m) => m.metric === 'dependencies');
    expect(depMetric).toBeDefined();
    expect(depMetric?.value).toBe(2);
  });
});

// ============================================================================
// Dependency categorization
// ============================================================================

describe('ArchitectureFitEvaluator - dependency categorization', () => {
  it('categorizes relative dependencies', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({
      dependencies: ['./utils.js', '../core/types.js', 'zod'],
    });
    const result = await evaluator.evaluate(component);
    const relMetric = result.metrics.find((m) => m.metric === 'relativeDependencies');
    expect(relMetric).toBeDefined();
    expect(relMetric?.value).toBe(2);
  });

  it('categorizes external dependencies', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({
      dependencies: ['./utils.js', 'zod', 'vitest'],
    });
    const result = await evaluator.evaluate(component);
    const extMetric = result.metrics.find((m) => m.metric === 'externalDependencies');
    expect(extMetric).toBeDefined();
    expect(extMetric?.value).toBe(2);
  });
});

// ============================================================================
// Export evaluation
// ============================================================================

describe('ArchitectureFitEvaluator - exports', () => {
  it('flags zero exports for non-test file', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({ exportCount: 0, isTest: false });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('No exports'))).toBe(true);
  });

  it('does not flag zero exports for test files', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({ exportCount: 0, isTest: true });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('No exports'))).toBe(false);
  });

  it('flags large file with many exports', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({ exportCount: 25, lines: 400 });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('many exports'))).toBe(true);
  });

  it('does not flag many exports in small files', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({ exportCount: 25, lines: 200 });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('many exports'))).toBe(false);
  });

  it('includes exports metric', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({ exportCount: 8 });
    const result = await evaluator.evaluate(component);
    const expMetric = result.metrics.find((m) => m.metric === 'exports');
    expect(expMetric).toBeDefined();
    expect(expMetric?.value).toBe(8);
  });
});

// ============================================================================
// Node protocol imports
// ============================================================================

describe('ArchitectureFitEvaluator - node protocol imports', () => {
  it('detects node: protocol imports', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({
      dependencies: ['node:path', 'node:fs', './utils.js'],
    });
    const result = await evaluator.evaluate(component);
    const nodeMetric = result.metrics.find((m) => m.metric === 'nodeProtocolImports');
    expect(nodeMetric).toBeDefined();
    expect(nodeMetric?.value).toBe(2);
  });

  it('omits node protocol metric when no node imports', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({
      dependencies: ['./utils.js', 'zod'],
    });
    const result = await evaluator.evaluate(component);
    const nodeMetric = result.metrics.find((m) => m.metric === 'nodeProtocolImports');
    expect(nodeMetric).toBeUndefined();
  });
});

// ============================================================================
// Recommendation thresholds
// ============================================================================

describe('ArchitectureFitEvaluator - recommendations', () => {
  it('returns retain for clean component (score >= 0.75)', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const component = makeComponent({ exportCount: 3, dependencies: ['./a.js'] });
    const result = await evaluator.evaluate(component);
    expect(result.recommendation).toBe('retain');
  });

  it('returns review for coupling + large surface area (score 0.5-0.75)', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    // High deps (-0.25) + large file with many exports (-0.2) → score 0.55
    const deps = Array.from(
      { length: DEFAULT_THRESHOLDS.maxDependencies + 1 },
      (_, i) => `./dep${String(i)}.js`
    );
    const component = makeComponent({ dependencies: deps, exportCount: 25, lines: 400 });
    const result = await evaluator.evaluate(component);
    expect(result.recommendation).toBe('review');
  });

  it('returns refactor for zero exports + high coupling (score ~0.45)', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const deps = Array.from(
      { length: DEFAULT_THRESHOLDS.maxDependencies + 1 },
      (_, i) => `./dep${String(i)}.js`
    );
    const component = makeComponent({ dependencies: deps, exportCount: 0 });
    const result = await evaluator.evaluate(component);
    // -0.25 (deps) + -0.3 (no exports) = 0.45
    expect(result.recommendation).toBe('refactor');
  });
});

// ============================================================================
// Confidence
// ============================================================================

describe('ArchitectureFitEvaluator - confidence', () => {
  it('confidence is between 0 and 1', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    const result = await evaluator.evaluate(makeComponent());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('more metrics increase confidence', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    // Component with node: imports gets extra metric
    const withNode = await evaluator.evaluate(
      makeComponent({ dependencies: ['node:fs', './a.js'] })
    );
    const withoutNode = await evaluator.evaluate(makeComponent({ dependencies: ['./a.js'] }));
    expect(withNode.confidence).toBeGreaterThanOrEqual(withoutNode.confidence);
  });

  it('pins the per-role rubric (behavior-preserving): base 0.6, cap 0.3, coeff 0.05', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    // Default component emits 4 metrics (dependencies, relativeDependencies,
    // externalDependencies, exports) ⇒ 0.6 + min(0.3, 4*0.05=0.2) = 0.8
    const result = await evaluator.evaluate(makeComponent());
    expect(result.metrics).toHaveLength(4);
    expect(result.confidence).toBeCloseTo(0.8, 10);
  });

  it('pins metric-bonus saturation at the +0.3 cap', async () => {
    const evaluator = new ArchitectureFitEvaluator();
    // node: import (+1) and maxDependencies breach (+1) push to 6 metrics ⇒
    // 0.6 + min(0.3, 6*0.05=0.3) = 0.9
    const result = await evaluator.evaluate(
      makeComponent({
        dependencies: [
          'node:fs',
          './a.js',
          './b.js',
          './c.js',
          './d.js',
          './e.js',
          './f.js',
          './g.js',
          './h.js',
          './i.js',
          './j.js',
          './k.js',
          './l.js',
          './m.js',
          './n.js',
          './o.js',
        ],
      })
    );
    expect(result.metrics).toHaveLength(6);
    expect(result.confidence).toBeCloseTo(0.9, 10);
  });
});

// ============================================================================
// Custom configuration
// ============================================================================

describe('ArchitectureFitEvaluator - custom config', () => {
  it('respects custom dependency threshold', async () => {
    const evaluator = new ArchitectureFitEvaluator({
      thresholds: { maxDependencies: 2 },
    });
    const component = makeComponent({
      dependencies: ['./a.js', './b.js', './c.js'],
    });
    const result = await evaluator.evaluate(component);
    expect(result.concerns.some((c) => c.includes('High coupling'))).toBe(true);
  });
});
