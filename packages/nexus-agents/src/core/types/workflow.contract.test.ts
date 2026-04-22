/**
 * Contract tests for core/types/workflow.ts (#2157).
 *
 * Locks in the public shape of the Workflow type system. Every
 * orchestration path (graph workflows, aorchestra, run-workflow tool)
 * depends on these types — a rename or field removal would ripple
 * silently at the type level and only surface at runtime in some code
 * paths.
 *
 * What this file verifies:
 *
 * - `ContextBudget` required fields (4 categories, all numbers)
 * - `PartialContextBudget` as a relaxed override type
 * - `InputDefinition` type enum (5 variants) and required fields
 * - `StepResult.status` enum (success | failed | skipped)
 * - `ExecutionStatus` discriminated union — all 5 variants narrow cleanly
 * - `ParseError` class — extends Error, preserves line/column
 *
 * `satisfies` is used where possible so a field rename fails at build
 * time, not at runtime.
 */

import { describe, it, expect } from 'vitest';
import type {
  ContextBudget,
  PartialContextBudget,
  InputDefinition,
  WorkflowStep,
  WorkflowDefinition,
  StepResult,
  WorkflowResult,
  ExecutionStatus,
  WorkflowTemplate,
} from './workflow.js';
import { ParseError } from './workflow.js';

describe('ContextBudget (#2157)', () => {
  it('requires all four allocation categories', () => {
    const budget: ContextBudget = {
      system: 0.15,
      task: 0.2,
      active: 0.5,
      reserved: 0.15,
    };
    expect(budget.system + budget.task + budget.active + budget.reserved).toBeCloseTo(1.0);
  });

  it('PartialContextBudget allows any subset', () => {
    const onlySystem: PartialContextBudget = { system: 0.3 };
    const onlyReserved: PartialContextBudget = { reserved: 0.1 };
    const none: PartialContextBudget = {};
    expect(onlySystem.system).toBe(0.3);
    expect(onlyReserved.reserved).toBe(0.1);
    expect(Object.keys(none)).toEqual([]);
  });
});

describe('InputDefinition (#2157)', () => {
  it('accepts every type-enum variant', () => {
    // If a variant is renamed or removed, the `satisfies` below stops
    // compiling — that's the contract.
    const variants = [
      { name: 's', type: 'string' },
      { name: 'n', type: 'number' },
      { name: 'b', type: 'boolean' },
      { name: 'o', type: 'object' },
      { name: 'a', type: 'array' },
    ] satisfies InputDefinition[];
    expect(variants).toHaveLength(5);
  });

  it('marks required fields required and optional fields optional', () => {
    const minimal: InputDefinition = { name: 'q', type: 'string' };
    const full: InputDefinition = {
      name: 'q',
      type: 'string',
      description: 'Search query',
      required: true,
      default: '',
    };
    expect(minimal.name).toBe('q');
    expect(full.required).toBe(true);
  });
});

describe('WorkflowStep + WorkflowDefinition (#2157)', () => {
  it('accepts a minimal step (id + agent + action + inputs)', () => {
    const step: WorkflowStep = {
      id: 's1',
      agent: 'code_expert',
      action: 'analyze',
      inputs: { file: 'x.ts' },
    };
    expect(step.id).toBe('s1');
    expect(step.agent).toBe('code_expert');
    expect(step.inputs).toEqual({ file: 'x.ts' });
  });

  it('accepts a step with all optional fields populated', () => {
    const step: WorkflowStep = {
      id: 's2',
      agent: 'orchestrator',
      action: 'review',
      inputs: {},
      dependsOn: ['s1'],
      parallel: true,
      retries: 3,
      timeout: 60000,
      condition: 'outputs.s1.status === "success"',
      contextBudget: { reserved: 0.2 },
    };
    expect(step.dependsOn).toEqual(['s1']);
    expect(step.parallel).toBe(true);
    expect(step.contextBudget?.reserved).toBe(0.2);
  });

  it('WorkflowDefinition requires name/version/inputs/steps', () => {
    const def: WorkflowDefinition = {
      name: 'test-workflow',
      version: '1.0.0',
      inputs: [],
      steps: [],
    };
    expect(def.name).toBe('test-workflow');
    expect(def.steps).toEqual([]);
  });
});

describe('StepResult.status enum (#2157)', () => {
  it('accepts success, failed, and skipped', () => {
    const results = [
      { stepId: 'a', output: 1, durationMs: 10, status: 'success' },
      { stepId: 'b', output: null, durationMs: 5, status: 'failed', error: 'boom' },
      { stepId: 'c', output: null, durationMs: 0, status: 'skipped' },
    ] satisfies StepResult[];
    const statuses = results.map((r) => r.status);
    expect(statuses).toEqual(['success', 'failed', 'skipped']);
  });

  it('WorkflowResult shape', () => {
    const result: WorkflowResult = {
      executionId: 'exec-1',
      workflowName: 'wf',
      stepResults: [],
      output: { final: true },
      totalDurationMs: 100,
    };
    expect(result.executionId).toBe('exec-1');
    expect(result.output).toEqual({ final: true });
  });
});

describe('ExecutionStatus discriminated union (#2157)', () => {
  it('accepts pending variant with no extra fields', () => {
    const s: ExecutionStatus = { state: 'pending' };
    expect(s.state).toBe('pending');
  });

  it('accepts running variant with currentStep + progress', () => {
    const s: ExecutionStatus = { state: 'running', currentStep: 's1', progress: 0.5 };
    if (s.state === 'running') {
      expect(s.currentStep).toBe('s1');
      expect(s.progress).toBe(0.5);
    }
  });

  it('accepts completed variant with a result', () => {
    const result: WorkflowResult = {
      executionId: 'e',
      workflowName: 'wf',
      stepResults: [],
      output: null,
      totalDurationMs: 1,
    };
    const s: ExecutionStatus = { state: 'completed', result };
    if (s.state === 'completed') {
      expect(s.result.executionId).toBe('e');
    }
  });

  it('accepts failed variant with error (failedStep optional)', () => {
    const withStep: ExecutionStatus = {
      state: 'failed',
      error: 'boom',
      failedStep: 's2',
    };
    const withoutStep: ExecutionStatus = { state: 'failed', error: 'other' };
    expect(withStep).toBeDefined();
    expect(withoutStep).toBeDefined();
  });

  it('accepts cancelled variant with cancelledAt timestamp', () => {
    const s: ExecutionStatus = { state: 'cancelled', cancelledAt: '2026-04-22T12:00:00Z' };
    if (s.state === 'cancelled') {
      expect(s.cancelledAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  it('narrows cleanly on discriminant across all five variants', () => {
    const states: ExecutionStatus[] = [
      { state: 'pending' },
      { state: 'running', currentStep: 's', progress: 0 },
      {
        state: 'completed',
        result: {
          executionId: 'e',
          workflowName: 'w',
          stepResults: [],
          output: 0,
          totalDurationMs: 0,
        },
      },
      { state: 'failed', error: 'x' },
      { state: 'cancelled', cancelledAt: '2026-01-01' },
    ];
    const seen = new Set<string>();
    for (const s of states) {
      switch (s.state) {
        case 'pending':
          seen.add('p');
          break;
        case 'running':
          seen.add(`r:${s.currentStep}`);
          break;
        case 'completed':
          seen.add(`c:${s.result.executionId}`);
          break;
        case 'failed':
          seen.add(`f:${s.error}`);
          break;
        case 'cancelled':
          seen.add(`x:${s.cancelledAt}`);
          break;
      }
    }
    expect(seen.size).toBe(5);
  });
});

describe('WorkflowTemplate (#2157)', () => {
  it('requires name, version, path (description and category optional)', () => {
    const tpl: WorkflowTemplate = {
      name: 'code-review',
      version: '1',
      path: '/x/y.yaml',
    };
    expect(tpl.name).toBe('code-review');
  });
});

describe('ParseError class (#2157)', () => {
  it('extends Error with name "ParseError"', () => {
    const err = new ParseError('bad yaml');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ParseError);
    expect(err.name).toBe('ParseError');
  });

  it('preserves message', () => {
    const err = new ParseError('unexpected token');
    expect(err.message).toBe('unexpected token');
  });

  it('records line/column when provided', () => {
    const err = new ParseError('expected colon', { line: 5, column: 12 });
    expect(err.line).toBe(5);
    expect(err.column).toBe(12);
  });

  it('leaves line/column undefined when options omitted', () => {
    const err = new ParseError('x');
    expect(err.line).toBeUndefined();
    expect(err.column).toBeUndefined();
  });

  it('allows partial options (line only / column only)', () => {
    const lineOnly = new ParseError('x', { line: 1 });
    const colOnly = new ParseError('x', { column: 2 });
    expect(lineOnly.column).toBeUndefined();
    expect(colOnly.line).toBeUndefined();
  });
});
