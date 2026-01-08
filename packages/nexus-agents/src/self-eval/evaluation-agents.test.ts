/**
 * Tests for Evaluation Agents.
 * (Source: Issue #138)
 */

import { describe, it, expect } from 'vitest';
import {
  CodeQualityEvaluator,
  ArchitectureFitEvaluator,
  PracticalValueEvaluator,
  createEvaluators,
  evaluateComponent,
} from './evaluation-agents.js';
import type { ComponentInfo } from './component-scanner.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createComponent(overrides: Partial<ComponentInfo> = {}): ComponentInfo {
  return {
    path: 'test/component.ts',
    name: 'component',
    lines: 100,
    complexity: 10,
    testCoverage: null,
    dependencies: ['./dep1.js', './dep2.js'],
    isTest: false,
    sizeBytes: 2000,
    exportCount: 3,
    ...overrides,
  };
}

// ============================================================================
// CodeQualityEvaluator Tests
// ============================================================================

describe('CodeQualityEvaluator', () => {
  const evaluator = new CodeQualityEvaluator();

  describe('evaluate', () => {
    it('should return retain for healthy component', async () => {
      const component = createComponent({
        complexity: 5,
        lines: 100,
        testCoverage: 80,
      });

      const result = await evaluator.evaluate(component);

      expect(result.recommendation).toBe('retain');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.isRecommendation).toBe(true);
    });

    it('should flag high complexity', async () => {
      const component = createComponent({
        complexity: 30,
      });

      const result = await evaluator.evaluate(component);

      expect(result.concerns.some((c) => c.includes('complexity'))).toBe(true);
      expect(result.metrics.some((m) => m.metric === 'complexity')).toBe(true);
    });

    it('should flag files exceeding line limit', async () => {
      const component = createComponent({
        lines: 500,
      });

      const result = await evaluator.evaluate(component);

      expect(result.concerns.some((c) => c.includes('too long'))).toBe(true);
    });

    it('should flag low test coverage', async () => {
      const component = createComponent({
        testCoverage: 20,
      });

      const result = await evaluator.evaluate(component);

      expect(result.concerns.some((c) => c.includes('coverage'))).toBe(true);
    });

    it('should include all required result fields', async () => {
      const component = createComponent();
      const result = await evaluator.evaluate(component);

      expect(result.component).toBe(component.path);
      expect(result.agent).toBe('code-quality');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.isRecommendation).toBe(true);
      expect(Array.isArray(result.metrics)).toBe(true);
      expect(Array.isArray(result.concerns)).toBe(true);
    });

    it('should cite metrics with source', async () => {
      const component = createComponent();
      const result = await evaluator.evaluate(component);

      for (const metric of result.metrics) {
        expect(metric.source).toBeDefined();
        expect(['scanner', 'coverage_report', 'git_history', 'static_analysis']).toContain(
          metric.source
        );
      }
    });
  });
});

// ============================================================================
// ArchitectureFitEvaluator Tests
// ============================================================================

describe('ArchitectureFitEvaluator', () => {
  const evaluator = new ArchitectureFitEvaluator();

  describe('evaluate', () => {
    it('should return retain for well-structured component', async () => {
      const component = createComponent({
        dependencies: ['./a.js', './b.js'],
        exportCount: 5,
      });

      const result = await evaluator.evaluate(component);

      expect(result.recommendation).toBe('retain');
    });

    it('should flag high coupling', async () => {
      const component = createComponent({
        dependencies: Array.from({ length: 20 }, (_, i) => `./dep${String(i)}.js`),
      });

      const result = await evaluator.evaluate(component);

      expect(result.concerns.some((c) => c.includes('coupling'))).toBe(true);
    });

    it('should flag no exports as potential dead code', async () => {
      const component = createComponent({
        exportCount: 0,
        isTest: false,
      });

      const result = await evaluator.evaluate(component);

      expect(result.concerns.some((c) => c.includes('No exports'))).toBe(true);
    });

    it('should flag large files with many exports', async () => {
      const component = createComponent({
        lines: 400,
        exportCount: 25,
      });

      const result = await evaluator.evaluate(component);

      expect(result.concerns.some((c) => c.includes('splitting'))).toBe(true);
    });

    it('should track dependency types', async () => {
      const component = createComponent({
        dependencies: ['./local.js', 'node:fs', 'external-pkg'],
      });

      const result = await evaluator.evaluate(component);

      expect(result.metrics.some((m) => m.metric === 'relativeDependencies')).toBe(true);
      expect(result.metrics.some((m) => m.metric === 'externalDependencies')).toBe(true);
    });
  });
});

// ============================================================================
// PracticalValueEvaluator Tests
// ============================================================================

describe('PracticalValueEvaluator', () => {
  const evaluator = new PracticalValueEvaluator();

  describe('evaluate', () => {
    it('should return retain for valuable component', async () => {
      const component = createComponent({
        exportCount: 5,
        lines: 200,
      });

      const result = await evaluator.evaluate(component);

      expect(result.recommendation).toBe('retain');
    });

    it('should flag components with no exports', async () => {
      const component = createComponent({
        exportCount: 0,
        isTest: false,
      });

      const result = await evaluator.evaluate(component);

      expect(result.concerns.some((c) => c.includes('not be used'))).toBe(true);
    });

    it('should value test files', async () => {
      const component = createComponent({
        isTest: true,
        exportCount: 0,
      });

      const result = await evaluator.evaluate(component);

      // Test files should not be deprecated even with no exports
      expect(result.recommendation).not.toBe('deprecate');
    });

    it('should value index files', async () => {
      const component = createComponent({
        name: 'index',
      });

      const result = await evaluator.evaluate(component);

      expect(result.metrics.some((m) => m.metric === 'isIndexFile')).toBe(true);
    });

    it('should flag low export density', async () => {
      const component = createComponent({
        lines: 500,
        exportCount: 2,
      });

      const result = await evaluator.evaluate(component);

      expect(result.metrics.some((m) => m.metric === 'linesPerExport')).toBe(true);
    });

    it('should flag very small files', async () => {
      const component = createComponent({
        sizeBytes: 50,
        name: 'tiny',
      });

      const result = await evaluator.evaluate(component);

      expect(result.concerns.some((c) => c.includes('small'))).toBe(true);
    });
  });
});

// ============================================================================
// Factory and Integration Tests
// ============================================================================

describe('createEvaluators', () => {
  it('should create all three evaluators', () => {
    const evaluators = createEvaluators();

    expect(evaluators.codeQuality).toBeInstanceOf(CodeQualityEvaluator);
    expect(evaluators.architectureFit).toBeInstanceOf(ArchitectureFitEvaluator);
    expect(evaluators.practicalValue).toBeInstanceOf(PracticalValueEvaluator);
  });

  it('should accept custom config', () => {
    const evaluators = createEvaluators({
      timeoutMs: 5000,
      thresholds: { maxComplexity: 30 },
    });

    expect(evaluators.codeQuality).toBeDefined();
  });
});

describe('evaluateComponent', () => {
  it('should run all evaluators and return results', async () => {
    const component = createComponent();

    const results = await evaluateComponent(component);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.agent).sort()).toEqual([
      'architecture-fit',
      'code-quality',
      'practical-value',
    ]);
  });

  it('should return consistent result structure', async () => {
    const component = createComponent();
    const results = await evaluateComponent(component);

    for (const result of results) {
      expect(result.isRecommendation).toBe(true);
      expect(result.component).toBe(component.path);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(['retain', 'refactor', 'review', 'deprecate']).toContain(result.recommendation);
    }
  });

  it('should run evaluations in parallel', async () => {
    const component = createComponent();
    const startTime = Date.now();

    await evaluateComponent(component);

    const duration = Date.now() - startTime;
    // All three should complete quickly since they're parallel
    expect(duration).toBeLessThan(1000);
  });
});

// ============================================================================
// Result Validation Tests
// ============================================================================

describe('EvaluationResult validation', () => {
  it('should always have isRecommendation=true per AI/ML approval', async () => {
    const component = createComponent();
    const results = await evaluateComponent(component);

    for (const result of results) {
      expect(result.isRecommendation).toBe(true);
    }
  });

  it('should always cite metrics per AI/ML approval', async () => {
    const component = createComponent();
    const results = await evaluateComponent(component);

    for (const result of results) {
      expect(result.metrics.length).toBeGreaterThan(0);
    }
  });

  it('should bound confidence between 0 and 1', async () => {
    // Test with extreme values
    const extremeComponent = createComponent({
      complexity: 100,
      lines: 1000,
      exportCount: 0,
      dependencies: Array.from({ length: 50 }, (_, i) => `./d${String(i)}.js`),
    });

    const results = await evaluateComponent(extremeComponent);

    for (const result of results) {
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});
