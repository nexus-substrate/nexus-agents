import { describe, it, expect } from 'vitest';
import {
  evaluateExitTriggers,
  type ExitTriggerConfig,
  type ExitTriggerState,
} from './exit-triggers.js';
import type { WorkerResult } from './worker-dispatcher.js';

function makeResult(status: 'success' | 'error' | 'skipped', errorType?: string): WorkerResult {
  return {
    role: 'code',
    subTask: 'task',
    output: status === 'success' ? 'done' : '',
    status,
    durationMs: 100,
    ...(status === 'error'
      ? { error: 'fail', errorType: errorType as WorkerResult['errorType'] }
      : {}),
  };
}

function makeState(overrides?: Partial<ExitTriggerState>): ExitTriggerState {
  return {
    results: [makeResult('success'), makeResult('success')],
    totalModelCalls: 2,
    maxModelCalls: 6,
    plannedWorkers: 2,
    ...overrides,
  };
}

describe('evaluateExitTriggers', () => {
  it('returns shouldExit=false when no triggers enabled', () => {
    const result = evaluateExitTriggers({}, makeState());
    expect(result.shouldExit).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('exits when all workers complete and trigger enabled', () => {
    const config: ExitTriggerConfig = { allWorkersComplete: true };
    const result = evaluateExitTriggers(config, makeState());
    expect(result.shouldExit).toBe(true);
    expect(result.reasons).toContain('all workers complete');
  });

  it('does not exit when workers still pending', () => {
    const config: ExitTriggerConfig = { allWorkersComplete: true };
    const state = makeState({ plannedWorkers: 5 });
    const result = evaluateExitTriggers(config, state);
    expect(result.shouldExit).toBe(false);
  });

  it('exits when budget exhausted and trigger enabled', () => {
    const config: ExitTriggerConfig = { budgetExhausted: true };
    const state = makeState({ totalModelCalls: 6, maxModelCalls: 6 });
    const result = evaluateExitTriggers(config, state);
    expect(result.shouldExit).toBe(true);
    expect(result.reasons).toContain('budget exhausted');
  });

  it('does not exit when budget remains', () => {
    const config: ExitTriggerConfig = { budgetExhausted: true };
    const state = makeState({ totalModelCalls: 3, maxModelCalls: 6 });
    const result = evaluateExitTriggers(config, state);
    expect(result.shouldExit).toBe(false);
  });

  it('exits when no retriable errors (all rate_limit)', () => {
    const config: ExitTriggerConfig = { noRetriableErrors: true };
    const state = makeState({
      results: [makeResult('error', 'rate_limit'), makeResult('error', 'rate_limit')],
    });
    const result = evaluateExitTriggers(config, state);
    expect(result.shouldExit).toBe(true);
    expect(result.reasons).toContain('no retriable errors');
  });

  it('does not exit when retriable errors exist', () => {
    const config: ExitTriggerConfig = { noRetriableErrors: true };
    const state = makeState({
      results: [makeResult('error', 'logic_error'), makeResult('success')],
    });
    const result = evaluateExitTriggers(config, state);
    expect(result.shouldExit).toBe(false);
  });

  it('exits when no errors at all (nothing to retry)', () => {
    const config: ExitTriggerConfig = { noRetriableErrors: true };
    const state = makeState({ results: [makeResult('success')] });
    const result = evaluateExitTriggers(config, state);
    expect(result.shouldExit).toBe(true);
  });

  // AND semantics: all enabled triggers must be met
  it('requires ALL enabled triggers to be met (AND)', () => {
    const config: ExitTriggerConfig = {
      allWorkersComplete: true,
      budgetExhausted: true,
    };
    // Workers complete but budget not exhausted
    const state = makeState({ totalModelCalls: 2, maxModelCalls: 6 });
    const result = evaluateExitTriggers(config, state);
    expect(result.shouldExit).toBe(false);
    expect(result.reasons).toHaveLength(1); // only allWorkersComplete met
  });

  it('exits when all enabled triggers are met', () => {
    const config: ExitTriggerConfig = {
      allWorkersComplete: true,
      budgetExhausted: true,
    };
    const state = makeState({ totalModelCalls: 6, maxModelCalls: 6 });
    const result = evaluateExitTriggers(config, state);
    expect(result.shouldExit).toBe(true);
    expect(result.reasons).toHaveLength(2);
  });

  it('excludes skipped workers from completion count', () => {
    const config: ExitTriggerConfig = { allWorkersComplete: true };
    const state = makeState({
      results: [makeResult('success'), makeResult('skipped')],
      plannedWorkers: 2,
    });
    // Only 1 non-skipped worker completed, but 2 were planned
    const result = evaluateExitTriggers(config, state);
    expect(result.shouldExit).toBe(false);
  });
});
