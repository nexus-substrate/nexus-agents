/**
 * Tests for the shared NEXUS_BUDGET_ENFORCE run-budget resolver (#3262, #4754).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

import type { ILogger } from '../core/index.js';
import { isBudgetEnforcementEnabled, resolveEnforcedRunBudget } from './run-budget.js';

const ENV = 'NEXUS_BUDGET_ENFORCE';
const original = process.env[ENV];

function makeLogger(): ILogger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger & {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
}

afterEach(() => {
  if (original === undefined) delete process.env['NEXUS_BUDGET_ENFORCE'];
  else process.env[ENV] = original;
});

describe('resolveEnforcedRunBudget', () => {
  it('returns undefined when the flag is off, even with an explicit ceiling', () => {
    delete process.env['NEXUS_BUDGET_ENFORCE'];
    expect(isBudgetEnforcementEnabled()).toBe(false);
    const budget = resolveEnforcedRunBudget({
      estimateText: 'build a thing',
      callCount: 3,
      maxTokens: 500,
      logger: makeLogger(),
    });
    expect(budget).toBeUndefined();
  });

  it('uses the explicit ceiling verbatim when the flag is on', () => {
    process.env[ENV] = 'true';
    const logger = makeLogger();
    const budget = resolveEnforcedRunBudget({
      estimateText: 'build a thing',
      callCount: 3,
      maxTokens: 4321,
      logger,
    });
    expect(budget).toEqual({ maxTokens: 4321 });
    expect(logger.info).toHaveBeenCalled();
  });

  it('scales the estimate by call count when no explicit ceiling is given', () => {
    process.env['NEXUS_BUDGET_ENFORCE'] = '1';
    const one = resolveEnforcedRunBudget({
      estimateText: 'Build a login form with validation and tests',
      callCount: 1,
      logger: makeLogger(),
    });
    const four = resolveEnforcedRunBudget({
      estimateText: 'Build a login form with validation and tests',
      callCount: 4,
      logger: makeLogger(),
    });
    expect(one).toBeDefined();
    expect(four).toBeDefined();
    // ceil() makes the ratio approximate; the ceiling must grow with the count.
    expect(four?.maxTokens ?? 0).toBeGreaterThan((one?.maxTokens ?? 0) * 3);
  });

  it('fails open with a warning when there are zero calls to estimate (empty case)', () => {
    process.env[ENV] = 'true';
    const logger = makeLogger();
    const budget = resolveEnforcedRunBudget({ estimateText: 'x', callCount: 0, logger });
    expect(budget).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
