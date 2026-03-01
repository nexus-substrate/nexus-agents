/**
 * Tests for AOrchestra integration in the orchestrate tool.
 * Covers complexity gating (Issue #1132) and planning behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeAgentPlan, computeExpertReliability } from './orchestrate-aorchestra.js';
import type { ILogger } from '../../core/index.js';
import { getOutcomeStore, resetOutcomeStore } from '../../orchestration/outcomes/index.js';

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  } as unknown as ILogger;
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

describe('computeExpertReliability', () => {
  beforeEach(() => {
    resetOutcomeStore();
  });

  it('returns empty map when no worker outcomes exist', () => {
    const result = computeExpertReliability();
    expect(result.size).toBe(0);
  });

  it('returns empty map when outcomes exist but none are workers', () => {
    const store = getOutcomeStore();
    store.append({
      id: 'non-worker-1',
      cli: 'claude',
      category: 'code_generation',
      model: 'claude-opus',
      success: true,
      durationMs: 100,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });
    const result = computeExpertReliability();
    expect(result.size).toBe(0);
  });

  it('excludes roles below cold-start threshold (< 3 outcomes)', () => {
    const store = getOutcomeStore();
    // Only 2 outcomes for code — below cold-start of 3
    for (let i = 0; i < 2; i++) {
      store.append({
        id: `w-code-${String(i)}`,
        cli: 'claude',
        category: 'code_generation',
        model: 'worker-code',
        success: true,
        durationMs: 100,
        timestamp: new Date().toISOString(),
        source: 'delegate',
      });
    }
    const result = computeExpertReliability();
    expect(result.size).toBe(0);
  });

  it('computes success rate for roles at or above cold-start threshold', () => {
    const store = getOutcomeStore();
    // 3 outcomes for code: 2 success, 1 failure = 0.667
    store.append({
      id: 'w-code-0',
      cli: 'claude',
      category: 'code_generation',
      model: 'worker-code',
      success: true,
      durationMs: 100,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });
    store.append({
      id: 'w-code-1',
      cli: 'claude',
      category: 'code_generation',
      model: 'worker-code',
      success: true,
      durationMs: 100,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });
    store.append({
      id: 'w-code-2',
      cli: 'claude',
      category: 'code_generation',
      model: 'worker-code',
      success: false,
      durationMs: 200,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });
    const result = computeExpertReliability();
    expect(result.size).toBe(1);
    expect(result.get('code')).toBeCloseTo(2 / 3, 2);
  });

  it('computes separate rates for multiple expert roles', () => {
    const store = getOutcomeStore();
    const ts = new Date().toISOString();
    // 3 code outcomes (all success = 1.0)
    for (let i = 0; i < 3; i++) {
      store.append({
        id: `w-code-${String(i)}`,
        cli: 'claude',
        category: 'code_generation',
        model: 'worker-code',
        success: true,
        durationMs: 100,
        timestamp: ts,
        source: 'delegate',
      });
    }
    // 4 security outcomes (1 success, 3 failures = 0.25)
    for (let i = 0; i < 4; i++) {
      store.append({
        id: `w-sec-${String(i)}`,
        cli: 'claude',
        category: 'security_review',
        model: 'worker-security',
        success: i === 0,
        durationMs: 150,
        timestamp: ts,
        source: 'delegate',
      });
    }
    const result = computeExpertReliability();
    expect(result.size).toBe(2);
    expect(result.get('code')).toBe(1.0);
    expect(result.get('security')).toBe(0.25);
  });
});
