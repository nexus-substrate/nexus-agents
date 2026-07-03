/**
 * Tests for simulation-guard.
 * (Source: Issue #2317, #2319; fail-closed rework #4170)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTestRunner, checkSimulationAllowed, _resetWarned } from './simulation-guard.js';
import type { ILogger } from '../../core/index.js';

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;
}

describe('simulation-guard', () => {
  const originalVitest = process.env.VITEST;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowSimulate = process.env.NEXUS_ALLOW_SIMULATE;

  beforeEach(() => {
    _resetWarned();
  });

  afterEach(() => {
    if (originalVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = originalVitest;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalAllowSimulate === undefined) delete process.env.NEXUS_ALLOW_SIMULATE;
    else process.env.NEXUS_ALLOW_SIMULATE = originalAllowSimulate;
  });

  /** Simulate a non-test-runner process (no VITEST, production NODE_ENV). */
  function leaveTestRunnerEnv(): void {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    delete process.env.NEXUS_ALLOW_SIMULATE;
  }

  it('isTestRunner returns true when VITEST=true', () => {
    process.env.VITEST = 'true';
    expect(isTestRunner()).toBe(true);
  });

  it('isTestRunner returns true when NODE_ENV=test', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'test';
    expect(isTestRunner()).toBe(true);
  });

  it('isTestRunner returns false outside test runners', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    expect(isTestRunner()).toBe(false);
  });

  it('allows silently (optedIn=false) inside a test runner', () => {
    process.env.VITEST = 'true';
    const logger = createMockLogger();
    const result = checkSimulationAllowed('consensus_vote', logger);
    expect(result).toEqual({ allowed: true, optedIn: false });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('DENIES outside a test runner without the opt-in (fail closed, #4170)', () => {
    leaveTestRunnerEnv();
    const logger = createMockLogger();
    const result = checkSimulationAllowed('consensus_vote', logger);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      // The reason must name the opt-in env var so callers know the escape hatch.
      expect(result.reason).toContain('NEXUS_ALLOW_SIMULATE');
      expect(result.reason).toContain('consensus_vote');
    }
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('never throws on denial — returns a structured result (#4170 architect condition)', () => {
    leaveTestRunnerEnv();
    const logger = createMockLogger();
    expect(() => checkSimulationAllowed('run_pipeline', logger)).not.toThrow();
  });

  it('allows with optedIn=true when NEXUS_ALLOW_SIMULATE=1, logging the RANDOM warning', () => {
    leaveTestRunnerEnv();
    process.env.NEXUS_ALLOW_SIMULATE = '1';
    const logger = createMockLogger();
    const result = checkSimulationAllowed('consensus_vote', logger);
    expect(result).toEqual({ allowed: true, optedIn: true });
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('RANDOM'));
  });

  it('opt-in warning is one-shot per tool', () => {
    leaveTestRunnerEnv();
    process.env.NEXUS_ALLOW_SIMULATE = '1';
    const logger = createMockLogger();
    checkSimulationAllowed('consensus_vote', logger);
    checkSimulationAllowed('consensus_vote', logger);
    expect(logger.warn).toHaveBeenCalledOnce();
    checkSimulationAllowed('run_dev_pipeline', logger);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('rejects non-"1" opt-in values (strict match)', () => {
    leaveTestRunnerEnv();
    process.env.NEXUS_ALLOW_SIMULATE = 'true';
    const logger = createMockLogger();
    expect(checkSimulationAllowed('consensus_vote', logger).allowed).toBe(false);
  });
});
