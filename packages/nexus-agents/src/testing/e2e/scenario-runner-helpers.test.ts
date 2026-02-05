/**
 * Tests for Scenario Runner Helpers
 * @module testing/e2e/scenario-runner-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { StepResult, WorkflowDefinition } from '../../core/index.js';
import type { StepExpectation } from './types.js';
import {
  parseExpectations,
  ScenarioFixtureSchema,
  checkStatus,
  checkDuration,
  checkOutputPattern,
  checkRequiredFields,
  validateSingleResult,
  checkCircularDependencies,
} from './scenario-runner-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeStepResult(overrides: Partial<StepResult> = {}): StepResult {
  return {
    status: 'success',
    output: 'result data',
    durationMs: 100,
    ...overrides,
  } as StepResult;
}

function makeExpectation(overrides: Partial<StepExpectation> = {}): StepExpectation {
  return {
    stepId: 'step-1',
    status: 'success',
    ...overrides,
  };
}

// ============================================================================
// parseExpectations
// ============================================================================

describe('parseExpectations', () => {
  it('returns empty for non-array', () => {
    expect(parseExpectations(null)).toEqual([]);
    expect(parseExpectations('string')).toEqual([]);
  });

  it('parses array of expectations', () => {
    const raw = [{ stepId: 'step-1', status: 'success' }];
    const result = parseExpectations(raw);
    expect(result).toHaveLength(1);
    expect(result[0]!.stepId).toBe('step-1');
  });

  it('includes optional fields', () => {
    const raw = [
      {
        stepId: 'step-1',
        outputPattern: 'test.*',
        maxDurationMs: 5000,
        requiredFields: ['id', 'name'],
      },
    ];
    const result = parseExpectations(raw);
    expect((result[0] as Record<string, unknown>).outputPattern).toBe('test.*');
    expect((result[0] as Record<string, unknown>).maxDurationMs).toBe(5000);
  });

  it('defaults status to success', () => {
    const raw = [{ stepId: 'step-1' }];
    const result = parseExpectations(raw);
    expect(result[0]!.status).toBe('success');
  });
});

// ============================================================================
// ScenarioFixtureSchema
// ============================================================================

describe('ScenarioFixtureSchema', () => {
  it('parses valid fixture', () => {
    const data = {
      id: 'test-1',
      name: 'Test Scenario',
      workflow: 'test-workflow',
      description: 'A test',
      inputs: { key: 'value' },
      timeoutMs: 30000,
    };
    const fixture = ScenarioFixtureSchema.parse(data);
    expect(fixture.id).toBe('test-1');
    expect(fixture.name).toBe('Test Scenario');
    expect(fixture.timeoutMs).toBe(30000);
  });

  it('throws for missing id', () => {
    expect(() => ScenarioFixtureSchema.parse({ name: 'Test', workflow: 'wf' })).toThrow('id');
  });

  it('throws for missing name', () => {
    expect(() => ScenarioFixtureSchema.parse({ id: 'test', workflow: 'wf' })).toThrow('name');
  });

  it('throws for missing workflow', () => {
    expect(() => ScenarioFixtureSchema.parse({ id: 'test', name: 'Test' })).toThrow('workflow');
  });

  it('defaults timeoutMs to 60000', () => {
    const fixture = ScenarioFixtureSchema.parse({
      id: 'test',
      name: 'Test',
      workflow: 'wf',
    });
    expect(fixture.timeoutMs).toBe(60000);
  });

  it('defaults classification to internal', () => {
    const fixture = ScenarioFixtureSchema.parse({
      id: 'test',
      name: 'Test',
      workflow: 'wf',
    });
    expect(fixture.classification).toBe('internal');
  });
});

// ============================================================================
// checkStatus
// ============================================================================

describe('checkStatus', () => {
  it('passes when status matches', () => {
    const failures: string[] = [];
    checkStatus(
      makeStepResult({ status: 'success' }),
      makeExpectation({ status: 'success' }),
      failures
    );
    expect(failures).toEqual([]);
  });

  it('fails when status differs', () => {
    const failures: string[] = [];
    checkStatus(
      makeStepResult({ status: 'error' as 'success' }),
      makeExpectation({ status: 'success' }),
      failures
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('status');
  });
});

// ============================================================================
// checkDuration
// ============================================================================

describe('checkDuration', () => {
  it('passes when within limit', () => {
    const failures: string[] = [];
    checkDuration(
      makeStepResult({ durationMs: 100 }),
      makeExpectation({ maxDurationMs: 200 } as StepExpectation),
      failures
    );
    expect(failures).toEqual([]);
  });

  it('fails when exceeded', () => {
    const failures: string[] = [];
    checkDuration(
      makeStepResult({ durationMs: 300 }),
      makeExpectation({ maxDurationMs: 200 } as StepExpectation),
      failures
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('Duration');
  });

  it('skips when no maxDurationMs', () => {
    const failures: string[] = [];
    checkDuration(makeStepResult({ durationMs: 99999 }), makeExpectation(), failures);
    expect(failures).toEqual([]);
  });
});

// ============================================================================
// checkOutputPattern
// ============================================================================

describe('checkOutputPattern', () => {
  it('passes when pattern matches', () => {
    const failures: string[] = [];
    checkOutputPattern(
      makeStepResult({ output: 'hello world' }),
      makeExpectation({ outputPattern: 'hello.*' } as StepExpectation),
      failures
    );
    expect(failures).toEqual([]);
  });

  it('fails when pattern does not match', () => {
    const failures: string[] = [];
    checkOutputPattern(
      makeStepResult({ output: 'goodbye' }),
      makeExpectation({ outputPattern: '^hello$' } as StepExpectation),
      failures
    );
    expect(failures).toHaveLength(1);
  });

  it('skips when no outputPattern', () => {
    const failures: string[] = [];
    checkOutputPattern(makeStepResult(), makeExpectation(), failures);
    expect(failures).toEqual([]);
  });

  it('handles non-string output', () => {
    const failures: string[] = [];
    checkOutputPattern(
      makeStepResult({ output: { key: 'value' } }),
      makeExpectation({ outputPattern: 'key' } as StepExpectation),
      failures
    );
    expect(failures).toEqual([]);
  });
});

// ============================================================================
// checkRequiredFields
// ============================================================================

describe('checkRequiredFields', () => {
  it('passes when all fields present', () => {
    const failures: string[] = [];
    checkRequiredFields(
      makeStepResult({ output: { id: 1, name: 'test' } }),
      makeExpectation({ requiredFields: ['id', 'name'] } as StepExpectation),
      failures
    );
    expect(failures).toEqual([]);
  });

  it('fails when field missing', () => {
    const failures: string[] = [];
    checkRequiredFields(
      makeStepResult({ output: { id: 1 } }),
      makeExpectation({ requiredFields: ['id', 'name'] } as StepExpectation),
      failures
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('name');
  });

  it('skips when no requiredFields', () => {
    const failures: string[] = [];
    checkRequiredFields(makeStepResult(), makeExpectation(), failures);
    expect(failures).toEqual([]);
  });
});

// ============================================================================
// validateSingleResult
// ============================================================================

describe('validateSingleResult', () => {
  it('passes for matching result', () => {
    const results = new Map<string, StepResult>();
    results.set('step-1', makeStepResult());
    const validation = validateSingleResult(results, makeExpectation());
    expect(validation.passed).toBe(true);
    expect(validation.failures).toEqual([]);
  });

  it('fails for missing step', () => {
    const validation = validateSingleResult(new Map(), makeExpectation());
    expect(validation.passed).toBe(false);
    expect(validation.failures[0]).toContain('not executed');
  });
});

// ============================================================================
// checkCircularDependencies
// ============================================================================

describe('checkCircularDependencies', () => {
  it('returns empty for no dependencies', () => {
    const workflow = {
      steps: [{ id: 'a', agent: 'x', action: 'y', inputs: {} }],
    } as WorkflowDefinition;
    expect(checkCircularDependencies(workflow)).toEqual([]);
  });

  it('returns empty for valid DAG', () => {
    const workflow = {
      steps: [
        { id: 'a', agent: 'x', action: 'y', inputs: {} },
        { id: 'b', agent: 'x', action: 'y', inputs: {}, dependsOn: ['a'] },
      ],
    } as WorkflowDefinition;
    expect(checkCircularDependencies(workflow)).toEqual([]);
  });

  it('detects circular dependency', () => {
    const workflow = {
      steps: [
        { id: 'a', agent: 'x', action: 'y', inputs: {}, dependsOn: ['b'] },
        { id: 'b', agent: 'x', action: 'y', inputs: {}, dependsOn: ['a'] },
      ],
    } as WorkflowDefinition;
    const errors = checkCircularDependencies(workflow);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Circular');
  });
});
