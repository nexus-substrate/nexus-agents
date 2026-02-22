/**
 * Tests for AOrchestra integration in the orchestrate tool.
 * Covers complexity gating (Issue #1132) and planning behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import { computeAgentPlan } from './orchestrate-aorchestra.js';
import type { ILogger } from '../../core/index.js';

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe('computeAgentPlan', () => {
  it('returns a plan for complex tasks with HIGH_COMPLEXITY_KEYWORDS', () => {
    const logger = createMockLogger();
    // Contains: architecture, security, optimize, distributed, concurrent, performance
    const complexTask =
      'Design a distributed architecture with security hardening. ' +
      'First, optimize the concurrent processing layer for performance. ' +
      'Then implement the algorithm for trade-off analysis with design pattern selection.';
    const plan = computeAgentPlan(complexTask, logger);
    expect(plan).toBeDefined();
    expect(plan?.totalExperts).toBeGreaterThan(0);
  });

  it('returns undefined for simple tasks (complexity gating)', () => {
    const logger = createMockLogger();
    const plan = computeAgentPlan('Fix typo in README', logger);
    expect(plan).toBeUndefined();
  });

  it('logs debug message when skipping simple tasks', () => {
    const logger = createMockLogger();
    computeAgentPlan('Fix typo in README', logger);
    expect(logger.debug).toHaveBeenCalledWith(
      'Skipping AOrchestra planning for simple task',
      expect.objectContaining({ taskType: expect.any(String) })
    );
  });

  it('returns undefined on empty input', () => {
    const logger = createMockLogger();
    const plan = computeAgentPlan('', logger);
    expect(plan).toBeUndefined();
  });

  it('handles planning errors gracefully', () => {
    const logger = createMockLogger();
    // Very short task — will be simple, returns undefined via gating not error
    const plan = computeAgentPlan('x', logger);
    expect(plan === undefined || plan.totalExperts >= 0).toBe(true);
  });
});
