/**
 * Tests for simulation-guard.
 * (Source: Issue #2317, #2319)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTestRunner, warnIfSimulatedOutsideTests, _resetWarned } from './simulation-guard.js';
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

  beforeEach(() => {
    _resetWarned();
  });

  afterEach(() => {
    if (originalVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = originalVitest;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

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

  it('warnIfSimulatedOutsideTests is silent inside vitest', () => {
    process.env.VITEST = 'true';
    const logger = createMockLogger();
    warnIfSimulatedOutsideTests('consensus_vote', logger);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warnIfSimulatedOutsideTests warns once per tool when outside tests', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    const logger = createMockLogger();
    warnIfSimulatedOutsideTests('consensus_vote', logger);
    warnIfSimulatedOutsideTests('consensus_vote', logger);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('simulateVotes=true'));
  });

  it('warnIfSimulatedOutsideTests warns once per distinct tool', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    const logger = createMockLogger();
    warnIfSimulatedOutsideTests('consensus_vote', logger);
    warnIfSimulatedOutsideTests('run_dev_pipeline', logger);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
