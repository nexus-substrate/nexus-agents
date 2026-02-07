/**
 * Tests for Failure Analyzer.
 *
 * (Source: Issue #852 — Phase 4 of AI Software Factory Epic #843)
 */

import { describe, it, expect } from 'vitest';
import { analyzeFailures } from './failure-analyzer.js';
import type { SpecExecutionResult } from './spec-executor-types.js';
import type { ScenarioResult } from './scenario-validator-types.js';
import type { TaskDag } from './spec-decomposer-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeDag(): TaskDag {
  return {
    nodes: [
      {
        id: 'code-0',
        description: 'Build it',
        type: 'code',
        complexity: 'simple',
        capabilities: [],
        dependsOn: [],
      },
    ],
    edges: [],
    roots: ['code-0'],
    totalComplexity: 'simple',
    specTitle: 'Test',
  };
}

function makeValidation(overrides?: Partial<ScenarioResult>): ScenarioResult {
  return {
    satisfaction: 1,
    totalCriteria: 2,
    metCount: 2,
    criteria: [
      { criterion: 'A works', met: true, matchedResults: ['[code] A works'] },
      { criterion: 'B works', met: true, matchedResults: ['[code] B works'] },
    ],
    allMet: true,
    ...overrides,
  };
}

function makeResult(overrides?: Partial<SpecExecutionResult>): SpecExecutionResult {
  return {
    dag: makeDag(),
    outputs: ['[code] A works', '[code] B works'],
    validation: makeValidation(),
    durationMs: 100,
    ...overrides,
  };
}

// ============================================================================
// Success Cases
// ============================================================================

describe('analyzeFailures', () => {
  it('returns passed=true when all criteria met', () => {
    const result = analyzeFailures(makeResult());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.passed).toBe(true);
    expect(result.value.failures).toHaveLength(0);
    expect(result.value.suggestions).toHaveLength(0);
  });

  it('detects missing implementation failures', () => {
    const result = analyzeFailures(
      makeResult({
        outputs: ['[code] A works'],
        validation: makeValidation({
          satisfaction: 0.5,
          metCount: 1,
          allMet: false,
          criteria: [
            { criterion: 'A works', met: true, matchedResults: ['[code] A works'] },
            { criterion: 'B works', met: false, matchedResults: [] },
          ],
        }),
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.passed).toBe(false);
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]?.type).toBe('missing_implementation');
  });

  it('detects no_output when results are empty', () => {
    const result = analyzeFailures(
      makeResult({
        outputs: [],
        validation: makeValidation({
          satisfaction: 0,
          metCount: 0,
          allMet: false,
          criteria: [{ criterion: 'A works', met: false, matchedResults: [] }],
        }),
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.failures[0]?.type).toBe('no_output');
  });

  it('generates improvement suggestions for failures', () => {
    const result = analyzeFailures(
      makeResult({
        validation: makeValidation({
          satisfaction: 0,
          metCount: 0,
          allMet: false,
          criteria: [
            { criterion: 'Login works', met: false, matchedResults: [] },
            { criterion: 'Logout works', met: false, matchedResults: [] },
          ],
        }),
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.suggestions.length).toBe(2);
    expect(result.value.suggestions[0]?.targetCriterion).toBe('Login works');
  });

  it('assigns higher priority to criteria with zero matches', () => {
    const result = analyzeFailures(
      makeResult({
        validation: makeValidation({
          satisfaction: 0,
          metCount: 0,
          allMet: false,
          criteria: [{ criterion: 'Must work', met: false, matchedResults: [] }],
        }),
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.suggestions[0]?.priority).toBe(1);
  });

  it('preserves satisfaction score', () => {
    const result = analyzeFailures(
      makeResult({
        validation: makeValidation({ satisfaction: 0.75 }),
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.satisfaction).toBe(0.75);
  });
});
