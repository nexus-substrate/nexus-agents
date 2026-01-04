/**
 * @nexus-agents/agents - TestingExpert Helpers
 *
 * Helper functions for the TestingExpert agent including
 * test template generation and heuristic analysis utilities.
 */

import type {
  GeneratedTest,
  CoverageMetrics,
  TestQuality,
  TestingAnalysisResult,
} from './expert-types.js';

// ============================================================================
// Test Template Generation
// ============================================================================

/**
 * Creates a unit test template for function testing.
 */
export function createUnitTestTemplate(framework: string): GeneratedTest {
  const importStatement =
    framework === 'jest'
      ? "import { describe, it, expect } from '@jest/globals';"
      : "import { describe, it, expect } from 'vitest';";

  return {
    name: 'should execute function correctly',
    type: 'unit',
    code: `${importStatement}

describe('FunctionName', () => {
  it('should return expected result for valid input', () => {
    // Arrange
    const input = { /* test data */ };

    // Act
    const result = functionName(input);

    // Assert
    expect(result).toBeDefined();
    // Add specific assertions
  });

  it('should handle edge cases', () => {
    // Test edge cases
  });

  it('should throw error for invalid input', () => {
    expect(() => functionName(null)).toThrow();
  });
});`,
    target: 'Function under test',
    scenarios: ['Valid input', 'Edge cases', 'Error handling'],
  };
}

/**
 * Creates an integration test template for API testing.
 */
export function createIntegrationTestTemplate(framework: string): GeneratedTest {
  return {
    name: 'should handle API request correctly',
    type: 'integration',
    code: `import { describe, it, expect, beforeAll, afterAll } from '${framework}';
import { createServer } from './server';

describe('API Integration', () => {
  let server;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('should return 200 for valid request', async () => {
    const response = await fetch('/api/endpoint', {
      method: 'POST',
      body: JSON.stringify({ data: 'test' }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ success: true });
  });
});`,
    target: 'API endpoint',
    scenarios: ['Valid request', 'Error responses', 'Authentication'],
  };
}

/**
 * Creates a component test template for React components.
 */
export function createComponentTestTemplate(framework: string): GeneratedTest {
  return {
    name: 'should render component correctly',
    type: 'unit',
    code: `import { describe, it, expect } from '${framework}';
import { render, screen } from '@testing-library/react';
import { Component } from './Component';

describe('Component', () => {
  it('should render with default props', () => {
    render(<Component />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    render(<Component />);
    const button = screen.getByRole('button');

    await userEvent.click(button);

    expect(screen.getByText('Clicked')).toBeInTheDocument();
  });
});`,
    target: 'React component',
    scenarios: ['Rendering', 'User interaction', 'State changes'],
  };
}

/**
 * Creates a generic test template for general modules.
 */
export function createGenericTestTemplate(framework: string): GeneratedTest {
  return {
    name: 'should work as expected',
    type: 'unit',
    code: `import { describe, it, expect } from '${framework}';

describe('Module', () => {
  it('should handle basic case', () => {
    // Arrange
    const input = {};

    // Act
    const result = moduleFunction(input);

    // Assert
    expect(result).toBeDefined();
  });
});`,
    target: 'Module under test',
    scenarios: ['Basic functionality'],
  };
}

// ============================================================================
// Heuristic Analysis Helpers
// ============================================================================

/**
 * Creates a heuristic coverage assessment.
 */
export function createHeuristicCoverage(): CoverageMetrics {
  return {
    line: 0,
    branch: 0,
    function: 0,
    statement: 0,
    uncoveredAreas: [
      'Analysis requires actual code coverage data',
      'Run tests with --coverage flag to collect metrics',
    ],
  };
}

/**
 * Assesses test quality using heuristic patterns.
 */
export function assessHeuristicQuality(description: string): TestQuality {
  const desc = description.toLowerCase();
  const issues: string[] = [];

  // Detect common issues from description
  if (desc.includes('flaky') || desc.includes('intermittent')) {
    issues.push('Flaky tests detected - improve test isolation');
  }
  if (desc.includes('slow') || desc.includes('timeout')) {
    issues.push('Slow tests - consider parallelization or mocking');
  }
  if (desc.includes('mock') && desc.includes('too many')) {
    issues.push('Over-mocking may indicate poor design');
  }

  return {
    score: issues.length === 0 ? 70 : Math.max(30, 70 - issues.length * 15),
    isolation: issues.some((i) => i.includes('isolation')) ? 'poor' : 'fair',
    assertionQuality: 'fair',
    issues: issues.length > 0 ? issues : ['Unable to assess without test code'],
  };
}

/**
 * Generates recommendations based on operation type.
 */
export function generateHeuristicRecommendations(
  operationType: TestingAnalysisResult['operationType']
): string[] {
  const base = ['Follow AAA pattern', 'Test behavior, not implementation'];

  switch (operationType) {
    case 'generation':
      return [
        ...base,
        'Start with happy path tests',
        'Add edge case tests',
        'Include error handling tests',
      ];
    case 'coverage_analysis':
      return [
        ...base,
        'Focus on critical paths first',
        'Use coverage as a guide, not a goal',
        'Test boundary conditions',
      ];
    case 'quality_assessment':
      return [
        ...base,
        'Ensure tests are independent',
        'Use meaningful test names',
        'Avoid testing implementation details',
      ];
    default:
      return base;
  }
}

/**
 * Detects testing warnings from description.
 */
export function detectTestingWarnings(description: string): string[] {
  const warnings: string[] = [];
  const desc = description.toLowerCase();

  if (desc.includes('database') || desc.includes('external')) {
    warnings.push('Integration tests with external dependencies need careful setup/teardown');
  }
  if (desc.includes('async') || desc.includes('promise')) {
    warnings.push('Async tests require proper await/assertion handling');
  }
  if (desc.includes('time') || desc.includes('date')) {
    warnings.push('Time-dependent tests may be flaky - consider mocking time');
  }
  if (desc.includes('random')) {
    warnings.push('Random data in tests can cause flakiness - use seeded randomness');
  }

  return warnings;
}

/**
 * Infers operation type from task description.
 */
export function inferOperationType(description: string): TestingAnalysisResult['operationType'] {
  const desc = description.toLowerCase();

  if (desc.includes('coverage') || desc.includes('uncovered')) {
    return 'coverage_analysis';
  }
  if (desc.includes('quality') || desc.includes('assess') || desc.includes('review test')) {
    return 'quality_assessment';
  }
  return 'generation';
}
