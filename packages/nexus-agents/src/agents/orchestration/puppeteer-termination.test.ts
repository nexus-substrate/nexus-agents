/**
 * `determineTerminationReason` must be able to name every condition
 * `shouldTerminate` stops on (#5792).
 *
 * It could not. `shouldTerminate` halts the loop on
 * `state.metadata.totalCost >= config.maxCostBudget`, but the reason function
 * had no branch for it and `PuppeteerTerminationReason` had no member, so a
 * budget stop fell through every check and landed on a trailing
 * `return 'max_steps'` — while `state.step` was nowhere near `maxSteps`. The
 * result contradicted itself, and `completeExecution` forwarded the wrong
 * reason to `emitCompleted` and to the learning pipeline, which was therefore
 * trained on "hit the step ceiling" for runs that hit the wallet.
 *
 * The two functions are a pair: these tests drive them together on the same
 * state, so a condition added to one without the other fails here.
 */
import { describe, it, expect } from 'vitest';

import { shouldTerminate, determineTerminationReason } from './puppeteer-termination.js';
import type { TerminationContext } from './puppeteer-termination.js';
import { DEFAULT_PUPPETEER_CONFIG } from './puppeteer-config-types.js';
import type {
  PuppeteerConfig,
  PuppeteerState,
  PuppeteerStepResult,
  PuppeteerTerminationReason,
} from './puppeteer-types.js';
import { TerminationReasonSchema } from './puppeteer-schemas.js';
import type { Task } from '../../core/index.js';

const TASK: Task = {
  id: 'task-1',
  description: 'Do the thing',
  context: { source: 'test', metadata: {} },
} as Task;

function makeContext(
  overrides: Partial<PuppeteerConfig> = {},
  cancelled = false
): TerminationContext {
  return {
    config: { ...DEFAULT_PUPPETEER_CONFIG, ...overrides },
    cancelled,
  };
}

function makeState(step: number, totalCost: number): PuppeteerState {
  return {
    step,
    task: TASK,
    agentOutputs: [],
    context: '',
    sessionId: 'session-1',
    metadata: {
      progress: 0.2,
      totalCost,
      totalTokens: 1000,
      elapsedMs: 1000,
      startedAt: new Date(0).toISOString(),
    },
  };
}

const NO_TRAJECTORY: readonly PuppeteerStepResult[] = [];
const NOW = Date.now();

describe('a run halted by the cost budget says so', () => {
  // maxSteps 50 and a large timeout: nothing else can be blamed for the stop.
  const context = makeContext({ maxSteps: 50, timeoutMs: 60 * 60 * 1000, maxCostBudget: 1.0 });
  const overBudget = makeState(6, 1.5);

  it('stops the loop', () => {
    expect(shouldTerminate(context, overBudget, NO_TRAJECTORY, NOW)).toBe(true);
  });

  it('reports budget_exceeded, not max_steps', () => {
    expect(determineTerminationReason(context, overBudget, NO_TRAJECTORY, NOW)).toBe(
      'budget_exceeded'
    );
  });

  it('does not claim the step ceiling it never reached', () => {
    // The self-contradiction this fixes: reason 'max_steps' at step 6 of 50.
    const reason = determineTerminationReason(context, overBudget, NO_TRAJECTORY, NOW);
    expect(reason).not.toBe('max_steps');
    expect(overBudget.step).toBeLessThan(context.config.maxSteps);
  });
});

describe('the other stop conditions keep their own names', () => {
  it('reports max_steps when the step ceiling really is reached', () => {
    // The pair that stops the budget assertions from passing vacuously: if
    // every stop reported budget_exceeded, this would fail.
    const context = makeContext({ maxSteps: 10, timeoutMs: 60 * 60 * 1000 });
    const state = makeState(10, 0);
    expect(shouldTerminate(context, state, NO_TRAJECTORY, NOW)).toBe(true);
    expect(determineTerminationReason(context, state, NO_TRAJECTORY, NOW)).toBe('max_steps');
  });

  it('reports timeout when the wall clock is exhausted', () => {
    const context = makeContext({ maxSteps: 50, timeoutMs: 1 });
    const state = makeState(2, 0);
    const longAgo = NOW - 60_000;
    expect(shouldTerminate(context, state, NO_TRAJECTORY, longAgo)).toBe(true);
    expect(determineTerminationReason(context, state, NO_TRAJECTORY, longAgo)).toBe('timeout');
  });

  it('reports cancelled first, whatever else is true', () => {
    const context = makeContext({ maxSteps: 50, timeoutMs: 60 * 60 * 1000 }, true);
    expect(determineTerminationReason(context, makeState(6, 1.5), NO_TRAJECTORY, NOW)).toBe(
      'cancelled'
    );
  });
});

describe('the union and its zod mirror are one vocabulary', () => {
  it('accepts every reason the union declares', () => {
    // Two spellings of one list, checked by nothing: the union gained
    // `budget_exceeded` and the schema would have kept rejecting it, so a
    // persisted result carrying the new reason would fail to parse. The
    // compiler cannot see this; only an assertion can.
    const declared: PuppeteerTerminationReason[] = [
      'task_complete',
      'max_steps',
      'timeout',
      'error',
      'cancelled',
      'convergence',
      'budget_exceeded',
      'unknown',
    ];
    expect([...TerminationReasonSchema.options].sort()).toEqual([...declared].sort());
    for (const reason of declared) {
      expect(TerminationReasonSchema.safeParse(reason).success).toBe(true);
    }
  });

  it('rejects a reason neither side declares', () => {
    // Keeps the assertion above from passing against a schema that accepts
    // anything.
    expect(TerminationReasonSchema.safeParse('wallet_empty').success).toBe(false);
  });
});

describe('a stop no guard explains is named unknown', () => {
  it('does not borrow max_steps for an unexplained stop', () => {
    // Nothing here has tripped: 2 of 50 steps, no timeout, under budget. The
    // old trailing `return 'max_steps'` produced a confident wrong answer for
    // exactly this input; the loop should not have stopped, and if it did, the
    // record must say it cannot explain why.
    const context = makeContext({ maxSteps: 50, timeoutMs: 60 * 60 * 1000, maxCostBudget: 10 });
    const state = makeState(2, 0.5);

    expect(shouldTerminate(context, state, NO_TRAJECTORY, NOW)).toBe(false);
    expect(determineTerminationReason(context, state, NO_TRAJECTORY, NOW)).toBe('unknown');
  });

  it('still prefers a step result that named its own reason', () => {
    const context = makeContext({ maxSteps: 50, timeoutMs: 60 * 60 * 1000, maxCostBudget: 10 });
    const trajectory = [{ terminationReason: 'task_complete' } as PuppeteerStepResult];
    expect(determineTerminationReason(context, makeState(2, 0.5), trajectory, NOW)).toBe(
      'task_complete'
    );
  });
});
