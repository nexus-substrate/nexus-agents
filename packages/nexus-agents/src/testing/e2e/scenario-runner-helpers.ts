/**
 * nexus-agents/testing/e2e - Scenario Runner Helpers
 *
 * Pure helper functions for scenario runner operations.
 * Extracted to keep scenario-runner.ts under 400 lines.
 *
 * @module testing/e2e/scenario-runner-helpers
 */

import type { StepResult, WorkflowDefinition } from '../../core/index.js';
import type { ScenarioFixture, StepExpectation, StepValidation } from './types.js';

/**
 * Type guard for checking if a value is a Record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse raw expectation data into typed StepExpectation array.
 */
export function parseExpectations(raw: unknown): StepExpectation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const obj = item as Record<string, unknown>;
    const status = obj.status;
    const outputPattern = obj.outputPattern;
    const maxDurationMs = obj.maxDurationMs;
    const requiredFields = obj.requiredFields;

    const expectation: StepExpectation = {
      stepId: obj.stepId as string,
      status: typeof status === 'string' ? (status as 'success' | 'failed' | 'skipped') : 'success',
    };
    if (typeof outputPattern === 'string') {
      (expectation as { outputPattern?: string }).outputPattern = outputPattern;
    }
    if (typeof maxDurationMs === 'number') {
      (expectation as { maxDurationMs?: number }).maxDurationMs = maxDurationMs;
    }
    if (Array.isArray(requiredFields)) {
      (expectation as { requiredFields?: readonly string[] }).requiredFields =
        requiredFields as string[];
    }
    return expectation;
  });
}

/**
 * Schema for scenario fixture YAML files.
 */
export const ScenarioFixtureSchema = {
  parse(data: unknown): ScenarioFixture {
    const obj = data as Record<string, unknown>;
    if (typeof obj.id !== 'string') throw new Error('Missing id');
    if (typeof obj.name !== 'string') throw new Error('Missing name');
    if (typeof obj.workflow !== 'string') throw new Error('Missing workflow');

    const description = obj.description;
    const inputs = obj.inputs;
    const timeoutMs = obj.timeoutMs;
    const tags = obj.tags;
    const classification = obj.classification;

    return {
      id: obj.id,
      name: obj.name,
      description: typeof description === 'string' ? description : '',
      workflow: obj.workflow,
      inputs: isRecord(inputs) ? inputs : {},
      expectedOutputs: parseExpectations(obj.expectedOutputs),
      timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : 60000,
      tags: Array.isArray(tags) ? (tags as string[]) : [],
      classification:
        typeof classification === 'string'
          ? (classification as 'public' | 'internal' | 'sensitive')
          : 'internal',
    };
  },
};

/**
 * Check if step status matches expectation.
 */
export function checkStatus(
  actual: StepResult,
  expected: StepExpectation,
  failures: string[]
): void {
  if (actual.status !== expected.status) {
    failures.push(`Expected status ${expected.status}, got ${actual.status}`);
  }
}

/**
 * Check if step duration is within limits.
 */
export function checkDuration(
  actual: StepResult,
  expected: StepExpectation,
  failures: string[]
): void {
  if (expected.maxDurationMs !== undefined && actual.durationMs > expected.maxDurationMs) {
    const actualStr = String(actual.durationMs);
    const maxStr = String(expected.maxDurationMs);
    failures.push(`Duration ${actualStr}ms exceeded max ${maxStr}ms`);
  }
}

/**
 * Check if output matches expected pattern.
 */
export function checkOutputPattern(
  actual: StepResult,
  expected: StepExpectation,
  failures: string[]
): void {
  if (expected.outputPattern !== undefined) {
    const output =
      typeof actual.output === 'string' ? actual.output : JSON.stringify(actual.output);
    const pattern = new RegExp(expected.outputPattern);
    if (!pattern.test(output)) {
      failures.push(`Output did not match pattern ${expected.outputPattern}`);
    }
  }
}

/**
 * Check if all required fields are present in output.
 */
export function checkRequiredFields(
  actual: StepResult,
  expected: StepExpectation,
  failures: string[]
): void {
  if (expected.requiredFields === undefined || expected.requiredFields.length === 0) {
    return;
  }
  try {
    const parsed: unknown =
      typeof actual.output === 'string' ? JSON.parse(actual.output) : actual.output;
    if (!isRecord(parsed)) {
      failures.push('Output is not a valid object for field checking');
      return;
    }
    for (const field of expected.requiredFields) {
      if (!(field in parsed)) {
        failures.push(`Missing required field: ${field}`);
      }
    }
  } catch {
    failures.push('Output is not valid JSON for field checking');
  }
}

/**
 * Validate a single step result against its expectation.
 */
export function validateSingleResult(
  results: Map<string, StepResult>,
  expected: StepExpectation
): StepValidation {
  const actual = results.get(expected.stepId);
  const failures: string[] = [];

  if (!actual) {
    failures.push(`Step ${expected.stepId} not executed`);
    return { stepId: expected.stepId, passed: false, actual, expected, failures };
  }

  checkStatus(actual, expected, failures);
  checkDuration(actual, expected, failures);
  checkOutputPattern(actual, expected, failures);
  checkRequiredFields(actual, expected, failures);

  return { stepId: expected.stepId, passed: failures.length === 0, actual, expected, failures };
}

/**
 * Check for circular dependencies in workflow steps.
 */
export function checkCircularDependencies(workflow: WorkflowDefinition): string[] {
  const errors: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const stepMap = new Map<string, WorkflowDefinition['steps'][number]>();
  for (const step of workflow.steps) {
    stepMap.set(step.id, step);
  }

  const visit = (stepId: string, path: string[]): boolean => {
    if (visiting.has(stepId)) {
      errors.push(`Circular dependency detected: ${[...path, stepId].join(' -> ')}`);
      return false;
    }
    if (visited.has(stepId)) return true;

    visiting.add(stepId);
    const step = stepMap.get(stepId);

    if (step?.dependsOn) {
      for (const dep of step.dependsOn) {
        if (!visit(dep, [...path, stepId])) {
          return false;
        }
      }
    }

    visiting.delete(stepId);
    visited.add(stepId);
    return true;
  };

  for (const step of workflow.steps) {
    visit(step.id, []);
  }

  return errors;
}
