/**
 * Tests for tool-rate-limiter.ts
 *
 * Covers ToolRateLimiterFactory: constructor, getForTool, isEnabled,
 * getStates, resetAll, and createToolRateLimiterFactory factory.
 */

import { describe, it, expect } from 'vitest';
import {
  ToolRateLimiterFactory,
  createToolRateLimiterFactory,
  getGlobalToolRateLimiterFactory,
  resetGlobalToolRateLimiterFactory,
} from './tool-rate-limiter.js';

// ============================================================================
// createToolRateLimiterFactory
// ============================================================================

describe('createToolRateLimiterFactory', () => {
  it('creates a factory instance', () => {
    const factory = createToolRateLimiterFactory();
    expect(factory).toBeInstanceOf(ToolRateLimiterFactory);
  });

  it('creates enabled factory by default', () => {
    const factory = createToolRateLimiterFactory();
    expect(factory.isEnabled()).toBe(true);
  });

  it('can create disabled factory', () => {
    const factory = createToolRateLimiterFactory({ enabled: false });
    expect(factory.isEnabled()).toBe(false);
  });
});

// ============================================================================
// ToolRateLimiterFactory - getForTool
// ============================================================================

describe('ToolRateLimiterFactory - getForTool', () => {
  it('returns a rate limiter for known tools', () => {
    const factory = createToolRateLimiterFactory();
    const limiter = factory.getForTool('orchestrate');
    expect(limiter).toBeDefined();
    expect(limiter.getState().capacity).toBeGreaterThan(0);
  });

  it('returns a rate limiter for unknown tools', () => {
    const factory = createToolRateLimiterFactory();
    const limiter = factory.getForTool('some_unknown_tool');
    expect(limiter).toBeDefined();
  });

  it('returns same limiter for same tool name', () => {
    const factory = createToolRateLimiterFactory();
    const limiter1 = factory.getForTool('orchestrate');
    const limiter2 = factory.getForTool('orchestrate');
    expect(limiter1).toBe(limiter2);
  });

  it('returns different limiters for different tools', () => {
    const factory = createToolRateLimiterFactory();
    const limiter1 = factory.getForTool('orchestrate');
    const limiter2 = factory.getForTool('delegate_to_model');
    expect(limiter1).not.toBe(limiter2);
  });

  it('respects custom per-tool overrides', () => {
    const factory = createToolRateLimiterFactory({
      perTool: {
        orchestrate: { capacity: 3, refillRate: 1, refillIntervalMs: 1000 },
      },
    });
    const limiter = factory.getForTool('orchestrate');
    expect(limiter.getState().capacity).toBe(3);
  });
});

// ============================================================================
// ToolRateLimiterFactory - getStates
// ============================================================================

describe('ToolRateLimiterFactory - getStates', () => {
  it('returns empty states initially', () => {
    const factory = createToolRateLimiterFactory();
    expect(factory.getStates()).toEqual({});
  });

  it('returns states after tools are accessed', () => {
    const factory = createToolRateLimiterFactory();
    factory.getForTool('orchestrate');
    factory.getForTool('delegate_to_model');
    const states = factory.getStates();
    expect(states['orchestrate']).toBeDefined();
    expect(states['delegate_to_model']).toBeDefined();
  });
});

// ============================================================================
// ToolRateLimiterFactory - resetAll
// ============================================================================

describe('ToolRateLimiterFactory - resetAll', () => {
  it('resets all limiters to full capacity', () => {
    const factory = createToolRateLimiterFactory();
    const limiter = factory.getForTool('orchestrate');
    // Consume a token
    limiter.tryAcquire();
    const beforeReset = limiter.getState().tokens;
    factory.resetAll();
    const afterReset = limiter.getState().tokens;
    expect(afterReset).toBeGreaterThanOrEqual(beforeReset);
  });
});

// ============================================================================
// Global factory
// ============================================================================

describe('global factory', () => {
  it('returns a factory instance', () => {
    resetGlobalToolRateLimiterFactory();
    const factory = getGlobalToolRateLimiterFactory();
    expect(factory).toBeInstanceOf(ToolRateLimiterFactory);
  });

  it('returns same instance on repeated calls', () => {
    resetGlobalToolRateLimiterFactory();
    const f1 = getGlobalToolRateLimiterFactory();
    const f2 = getGlobalToolRateLimiterFactory();
    expect(f1).toBe(f2);
  });

  it('returns new instance after reset', () => {
    resetGlobalToolRateLimiterFactory();
    const f1 = getGlobalToolRateLimiterFactory();
    resetGlobalToolRateLimiterFactory();
    const f2 = getGlobalToolRateLimiterFactory();
    expect(f1).not.toBe(f2);
  });
});
