/**
 * Tests for budget-enforcement.ts
 *
 * Covers resolveStepBudget and copyBudgetEvents pure helper functions.
 */

import { describe, it, expect } from 'vitest';
import type { ContextBudget } from '../core/index.js';
import type { WorkflowStep } from './workflow-types.js';
import {
  resolveStepBudget,
  copyBudgetEvents,
  type BudgetEnforcementConfig,
  type BudgetEnforcementEvent,
} from './budget-enforcement.js';

// ============================================================================
// Helpers
// ============================================================================

const ENGINE_BUDGET: ContextBudget = {
  system: 1000,
  task: 2000,
  active: 3000,
  reserved: 500,
};

const WORKFLOW_BUDGET: ContextBudget = {
  system: 800,
  task: 1500,
  active: 2500,
  reserved: 400,
};

function makeConfig(overrides: Partial<BudgetEnforcementConfig> = {}): BudgetEnforcementConfig {
  return {
    engineDefaultBudget: ENGINE_BUDGET,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as BudgetEnforcementConfig['logger'],
    ...overrides,
  };
}

function makeStep(id: string, contextBudget?: Partial<ContextBudget>): WorkflowStep {
  return {
    id,
    action: `action-${id}`,
    agent: 'test-agent',
    contextBudget,
  } as unknown as WorkflowStep;
}

// ============================================================================
// resolveStepBudget
// ============================================================================

describe('resolveStepBudget', () => {
  it('returns engine default when no overrides', () => {
    const config = makeConfig();
    const result = resolveStepBudget(makeStep('s1'), config);
    expect(result.budget).toEqual(ENGINE_BUDGET);
    expect(result.source).toBe('engine');
  });

  it('returns workflow budget when available', () => {
    const config = makeConfig({ workflowDefaultBudget: WORKFLOW_BUDGET });
    const result = resolveStepBudget(makeStep('s1'), config);
    expect(result.budget).toEqual(WORKFLOW_BUDGET);
    expect(result.source).toBe('workflow');
  });

  it('returns step override merged with workflow budget', () => {
    const config = makeConfig({ workflowDefaultBudget: WORKFLOW_BUDGET });
    const step = makeStep('s1', { system: 500 });
    const result = resolveStepBudget(step, config);
    expect(result.source).toBe('step');
    expect(result.budget.system).toBe(500); // step override
    expect(result.budget.task).toBe(WORKFLOW_BUDGET.task); // workflow default
    expect(result.budget.active).toBe(WORKFLOW_BUDGET.active);
    expect(result.budget.reserved).toBe(WORKFLOW_BUDGET.reserved);
  });

  it('returns step override merged with engine budget when no workflow budget', () => {
    const config = makeConfig();
    const step = makeStep('s1', { task: 999 });
    const result = resolveStepBudget(step, config);
    expect(result.source).toBe('step');
    expect(result.budget.task).toBe(999); // step override
    expect(result.budget.system).toBe(ENGINE_BUDGET.system); // engine default
  });

  it('merges all step budget fields', () => {
    const config = makeConfig();
    const step = makeStep('s1', {
      system: 100,
      task: 200,
      active: 300,
      reserved: 50,
    });
    const result = resolveStepBudget(step, config);
    expect(result.budget).toEqual({
      system: 100,
      task: 200,
      active: 300,
      reserved: 50,
    });
  });

  it('uses engine defaults for missing step budget fields', () => {
    const config = makeConfig();
    const step = makeStep('s1', { system: 100 }); // Only system overridden
    const result = resolveStepBudget(step, config);
    expect(result.budget.system).toBe(100);
    expect(result.budget.task).toBe(ENGINE_BUDGET.task);
    expect(result.budget.active).toBe(ENGINE_BUDGET.active);
    expect(result.budget.reserved).toBe(ENGINE_BUDGET.reserved);
  });
});

// ============================================================================
// copyBudgetEvents
// ============================================================================

describe('copyBudgetEvents', () => {
  it('returns a copy of the events array', () => {
    const events: BudgetEnforcementEvent[] = [
      {
        timestamp: 1000,
        stepId: 's1',
        budget: ENGINE_BUDGET,
        source: 'engine',
      },
    ];
    const copy = copyBudgetEvents(events);
    expect(copy).toEqual(events);
    expect(copy).not.toBe(events); // Different array reference
  });

  it('returns empty array for empty input', () => {
    const copy = copyBudgetEvents([]);
    expect(copy).toEqual([]);
  });

  it('mutations to copy do not affect original', () => {
    const events: BudgetEnforcementEvent[] = [
      {
        timestamp: 1000,
        stepId: 's1',
        budget: ENGINE_BUDGET,
        source: 'engine',
      },
    ];
    const copy = copyBudgetEvents(events);
    copy.push({
      timestamp: 2000,
      stepId: 's2',
      budget: ENGINE_BUDGET,
      source: 'workflow',
    });
    expect(events).toHaveLength(1);
    expect(copy).toHaveLength(2);
  });
});
