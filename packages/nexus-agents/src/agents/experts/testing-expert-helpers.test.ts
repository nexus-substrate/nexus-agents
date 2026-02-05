/**
 * Tests for Testing Expert Helpers
 * @module agents/experts/testing-expert-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  createUnitTestTemplate,
  createIntegrationTestTemplate,
  createComponentTestTemplate,
  createGenericTestTemplate,
  createHeuristicCoverage,
  assessHeuristicQuality,
  generateHeuristicRecommendations,
  detectTestingWarnings,
  inferOperationType,
} from './testing-expert-helpers.js';

// ============================================================================
// Test Template Generation
// ============================================================================

describe('createUnitTestTemplate', () => {
  it('generates vitest import for vitest framework', () => {
    const template = createUnitTestTemplate('vitest');
    expect(template.type).toBe('unit');
    expect(template.code).toContain("from 'vitest'");
    expect(template.scenarios.length).toBeGreaterThan(0);
  });

  it('generates jest import for jest framework', () => {
    const template = createUnitTestTemplate('jest');
    expect(template.code).toContain("from '@jest/globals'");
  });

  it('includes AAA pattern', () => {
    const template = createUnitTestTemplate('vitest');
    expect(template.code).toContain('Arrange');
    expect(template.code).toContain('Act');
    expect(template.code).toContain('Assert');
  });
});

describe('createIntegrationTestTemplate', () => {
  it('generates integration test', () => {
    const template = createIntegrationTestTemplate('vitest');
    expect(template.type).toBe('integration');
    expect(template.code).toContain('beforeAll');
    expect(template.code).toContain('afterAll');
    expect(template.code).toContain('200');
  });
});

describe('createComponentTestTemplate', () => {
  it('generates component test', () => {
    const template = createComponentTestTemplate('vitest');
    expect(template.type).toBe('unit');
    expect(template.code).toContain('@testing-library/react');
    expect(template.code).toContain('render');
  });
});

describe('createGenericTestTemplate', () => {
  it('generates generic test', () => {
    const template = createGenericTestTemplate('vitest');
    expect(template.type).toBe('unit');
    expect(template.target).toBe('Module under test');
    expect(template.scenarios).toContain('Basic functionality');
  });
});

// ============================================================================
// Heuristic Analysis Helpers
// ============================================================================

describe('createHeuristicCoverage', () => {
  it('returns zero coverage metrics', () => {
    const coverage = createHeuristicCoverage();
    expect(coverage.line).toBe(0);
    expect(coverage.branch).toBe(0);
    expect(coverage.function).toBe(0);
    expect(coverage.statement).toBe(0);
    expect(coverage.uncoveredAreas!.length).toBeGreaterThan(0);
  });
});

describe('assessHeuristicQuality', () => {
  it('returns score of 70 for clean description', () => {
    const quality = assessHeuristicQuality('simple unit tests for the module');
    expect(quality.score).toBe(70);
  });

  it('detects flaky tests', () => {
    const quality = assessHeuristicQuality('tests are flaky in CI');
    expect(quality.score).toBeLessThan(70);
    expect(quality.issues.some((i) => i.includes('Flaky'))).toBe(true);
    expect(quality.isolation).toBe('poor');
  });

  it('detects slow tests', () => {
    const quality = assessHeuristicQuality('tests are slow with timeout issues');
    expect(quality.issues.some((i) => i.includes('Slow'))).toBe(true);
  });

  it('detects over-mocking', () => {
    const quality = assessHeuristicQuality('too many mock objects needed');
    expect(quality.issues.some((i) => i.includes('Over-mocking'))).toBe(true);
  });

  it('handles multiple issues', () => {
    const quality = assessHeuristicQuality('flaky and slow tests with too many mock');
    expect(quality.score).toBeLessThan(55);
  });

  it('does not go below 30', () => {
    const quality = assessHeuristicQuality('flaky slow timeout too many mock intermittent');
    expect(quality.score).toBeGreaterThanOrEqual(30);
  });
});

describe('generateHeuristicRecommendations', () => {
  it('includes base recommendations', () => {
    const recs = generateHeuristicRecommendations('generation');
    expect(recs).toContain('Follow AAA pattern');
    expect(recs).toContain('Test behavior, not implementation');
  });

  it('adds generation-specific recs', () => {
    const recs = generateHeuristicRecommendations('generation');
    expect(recs).toContain('Start with happy path tests');
    expect(recs).toContain('Add edge case tests');
  });

  it('adds coverage_analysis-specific recs', () => {
    const recs = generateHeuristicRecommendations('coverage_analysis');
    expect(recs).toContain('Focus on critical paths first');
  });

  it('adds quality_assessment-specific recs', () => {
    const recs = generateHeuristicRecommendations('quality_assessment');
    expect(recs).toContain('Ensure tests are independent');
  });
});

describe('detectTestingWarnings', () => {
  it('warns about database tests', () => {
    const warnings = detectTestingWarnings('test against database');
    expect(warnings.some((w) => w.includes('external dependencies'))).toBe(true);
  });

  it('warns about async tests', () => {
    const warnings = detectTestingWarnings('async operations with promises');
    expect(warnings.some((w) => w.includes('Async'))).toBe(true);
  });

  it('warns about time-dependent tests', () => {
    const warnings = detectTestingWarnings('test with date and time');
    expect(warnings.some((w) => w.includes('Time-dependent'))).toBe(true);
  });

  it('warns about random data', () => {
    const warnings = detectTestingWarnings('random test data generation');
    expect(warnings.some((w) => w.includes('Random'))).toBe(true);
  });

  it('returns empty for simple description', () => {
    expect(detectTestingWarnings('simple unit test')).toEqual([]);
  });
});

describe('inferOperationType', () => {
  it('infers coverage_analysis', () => {
    expect(inferOperationType('analyze test coverage')).toBe('coverage_analysis');
  });

  it('infers quality_assessment', () => {
    expect(inferOperationType('assess test quality')).toBe('quality_assessment');
    expect(inferOperationType('review test suite')).toBe('quality_assessment');
  });

  it('defaults to generation', () => {
    expect(inferOperationType('write tests for the module')).toBe('generation');
  });
});
