/**
 * Tests for Token Budget Helpers
 * @module context/token-budget-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { BudgetWarning, TokenBudgetConfig } from './token-budget-types.js';
import { TokenBudgetError } from './token-budget-types.js';
import type { ILogger } from '../core/index.js';
import type {
  WarningThresholds,
  BudgetState,
  HardModeParams,
  WarnModeParams,
} from './token-budget-helpers.js';
import {
  generateBudgetWarning,
  logBudgetWarning,
  collectBudgetWarnings,
  createHardModeResult,
  logWarnModeExceeded,
} from './token-budget-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeThresholds(overrides: Partial<WarningThresholds> = {}): WarningThresholds {
  return {
    criticalThreshold: 90,
    warningThreshold: 75,
    ...overrides,
  };
}

function makeMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as ILogger;
}

function makeConfig(): Required<TokenBudgetConfig> {
  return {
    maxTokensPerTask: 100000,
    maxTokensPerSession: 1000000,
    emaAlpha: 0.3,
    warningThreshold: 75,
    criticalThreshold: 90,
    enforcementMode: 'warn',
  };
}

// ============================================================================
// generateBudgetWarning
// ============================================================================

describe('generateBudgetWarning', () => {
  it('returns undefined for low utilization', () => {
    expect(generateBudgetWarning(30, 300, 1000, 'task', makeThresholds())).toBeUndefined();
  });

  it('returns info for 50-74% utilization', () => {
    const warning = generateBudgetWarning(55, 550, 1000, 'task', makeThresholds());
    expect(warning).toBeDefined();
    expect(warning!.level).toBe('info');
    expect(warning!.scope).toBe('task');
  });

  it('returns warning for 75-89% utilization', () => {
    const warning = generateBudgetWarning(80, 800, 1000, 'session', makeThresholds());
    expect(warning).toBeDefined();
    expect(warning!.level).toBe('warning');
    expect(warning!.scope).toBe('session');
  });

  it('returns critical for 90%+ utilization', () => {
    const warning = generateBudgetWarning(95, 950, 1000, 'task', makeThresholds());
    expect(warning).toBeDefined();
    expect(warning!.level).toBe('critical');
  });

  it('includes remaining tokens in message', () => {
    const warning = generateBudgetWarning(80, 800, 1000, 'task', makeThresholds());
    expect(warning!.message).toContain('200');
    expect(warning!.message).toContain('Task');
  });

  it('clamps remaining to 0 when over budget', () => {
    const warning = generateBudgetWarning(110, 1100, 1000, 'task', makeThresholds());
    expect(warning!.message).toContain('0 tokens remaining');
  });

  it('returns correct usage data', () => {
    const warning = generateBudgetWarning(80, 800, 1000, 'task', makeThresholds());
    expect(warning!.usagePercent).toBe(80);
    expect(warning!.tokensUsed).toBe(800);
    expect(warning!.budgetLimit).toBe(1000);
  });
});

// ============================================================================
// logBudgetWarning
// ============================================================================

describe('logBudgetWarning', () => {
  it('logs critical as warn', () => {
    const logger = makeMockLogger();
    const warning: BudgetWarning = {
      level: 'critical',
      message: 'critical warning',
      usagePercent: 95,
      tokensUsed: 950,
      budgetLimit: 1000,
      scope: 'task',
    };
    logBudgetWarning(warning, logger);
    expect(logger.warn).toHaveBeenCalledWith('critical warning', expect.any(Object));
  });

  it('logs warning as warn', () => {
    const logger = makeMockLogger();
    const warning: BudgetWarning = {
      level: 'warning',
      message: 'warning msg',
      usagePercent: 80,
      tokensUsed: 800,
      budgetLimit: 1000,
      scope: 'session',
    };
    logBudgetWarning(warning, logger);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('logs info as info', () => {
    const logger = makeMockLogger();
    const warning: BudgetWarning = {
      level: 'info',
      message: 'info msg',
      usagePercent: 55,
      tokensUsed: 550,
      budgetLimit: 1000,
      scope: 'task',
    };
    logBudgetWarning(warning, logger);
    expect(logger.info).toHaveBeenCalledWith('info msg', expect.any(Object));
  });
});

// ============================================================================
// collectBudgetWarnings
// ============================================================================

describe('collectBudgetWarnings', () => {
  it('returns empty for low utilization', () => {
    const state: BudgetState = { sessionTokensUsed: 100, taskTokensUsed: 100 };
    const warnings = collectBudgetWarnings(100, state, makeConfig());
    expect(warnings).toEqual([]);
  });

  it('returns session warning for high session utilization', () => {
    const state: BudgetState = { sessionTokensUsed: 800000, taskTokensUsed: 0 };
    const warnings = collectBudgetWarnings(100000, state, makeConfig());
    const sessionWarning = warnings.find((w) => w.scope === 'session');
    expect(sessionWarning).toBeDefined();
    expect(sessionWarning!.level).toBe('critical');
  });

  it('returns task warning for high task utilization', () => {
    const state: BudgetState = { sessionTokensUsed: 0, taskTokensUsed: 80000 };
    const warnings = collectBudgetWarnings(15000, state, makeConfig());
    const taskWarning = warnings.find((w) => w.scope === 'task');
    expect(taskWarning).toBeDefined();
    expect(taskWarning!.level).toBe('critical');
  });

  it('can return both session and task warnings', () => {
    const state: BudgetState = { sessionTokensUsed: 800000, taskTokensUsed: 80000 };
    const warnings = collectBudgetWarnings(100000, state, makeConfig());
    expect(warnings.some((w) => w.scope === 'session')).toBe(true);
    expect(warnings.some((w) => w.scope === 'task')).toBe(true);
  });
});

// ============================================================================
// createHardModeResult
// ============================================================================

describe('createHardModeResult', () => {
  it('creates result for session exceeded', () => {
    const params: HardModeParams = {
      estimatedTokens: 50000,
      exceedsSession: true,
      remainingSessionBudget: 10000,
      remainingTaskBudget: 50000,
      warnings: [],
      sessionTokensUsed: 990000,
      taskTokensUsed: 50000,
      maxTokensPerSession: 1000000,
      maxTokensPerTask: 100000,
    };
    const result = createHardModeResult(params);
    expect(result.allowed).toBe(false);
    expect(result.error).toBeInstanceOf(TokenBudgetError);
    expect(result.error.message).toContain('session');
  });

  it('creates result for task exceeded', () => {
    const params: HardModeParams = {
      estimatedTokens: 20000,
      exceedsSession: false,
      remainingSessionBudget: 500000,
      remainingTaskBudget: 5000,
      warnings: [],
      sessionTokensUsed: 500000,
      taskTokensUsed: 95000,
      maxTokensPerSession: 1000000,
      maxTokensPerTask: 100000,
    };
    const result = createHardModeResult(params);
    expect(result.allowed).toBe(false);
    expect(result.error.message).toContain('task');
  });

  it('preserves warnings', () => {
    const warning: BudgetWarning = {
      level: 'warning',
      message: 'test',
      usagePercent: 80,
      tokensUsed: 800,
      budgetLimit: 1000,
      scope: 'task',
    };
    const params: HardModeParams = {
      estimatedTokens: 50000,
      exceedsSession: true,
      remainingSessionBudget: 0,
      remainingTaskBudget: 0,
      warnings: [warning],
      sessionTokensUsed: 990000,
      taskTokensUsed: 95000,
      maxTokensPerSession: 1000000,
      maxTokensPerTask: 100000,
    };
    const result = createHardModeResult(params);
    expect(result.warnings).toHaveLength(1);
  });
});

// ============================================================================
// logWarnModeExceeded
// ============================================================================

describe('logWarnModeExceeded', () => {
  it('logs warning with params', () => {
    const logger = makeMockLogger();
    const params: WarnModeParams = {
      exceedsSession: true,
      exceedsTask: false,
      estimatedTokens: 50000,
      sessionUsed: 990000,
      taskUsed: 50000,
    };
    logWarnModeExceeded(params, logger);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('warn mode'),
      expect.objectContaining({ exceedsSession: true })
    );
  });
});
