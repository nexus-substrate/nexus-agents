/**
 * Tests for tool-rate-limiter.ts
 *
 * Covers ToolRateLimiterFactory: constructor, getForTool, isEnabled,
 * getStates, resetAll, and createToolRateLimiterFactory factory.
 */

import { describe, it, expect, vi } from 'vitest';
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

  it('allows every request and reports unlimited capacity when disabled', () => {
    const factory = createToolRateLimiterFactory({ enabled: false });
    const limiter = factory.getForTool('orchestrate');

    const acquisitions = Array.from({ length: 11 }, () => limiter.tryAcquire());

    expect(acquisitions).toEqual(Array.from({ length: 11 }, () => true));
    expect(factory.isEnabled()).toBe(false);
    expect(factory.getStates()['orchestrate']).toEqual({
      tokens: Number.POSITIVE_INFINITY,
      capacity: Number.POSITIVE_INFINITY,
      nextTokenMs: 0,
    });
  });

  it('rejects the eleventh consecutive request when enabled', () => {
    const factory = createToolRateLimiterFactory({ enabled: true });
    const limiter = factory.getForTool('orchestrate');

    const acquisitions = Array.from({ length: 11 }, () => limiter.tryAcquire());

    expect(acquisitions.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => true));
    expect(acquisitions[10]).toBe(false);
    expect(factory.isEnabled()).toBe(true);
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
// ToolRateLimiterFactory - fallback validation (#899)
// ============================================================================

describe('ToolRateLimiterFactory - fallback validation', () => {
  it('warns when orchestrate fallback is missing from config', () => {
    const mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      setLevel: vi.fn(),
    };

    // Provide perTool that replaces ALL defaults (overriding spread)
    // but omit 'orchestrate' by replacing it with undefined-free keys only
    new ToolRateLimiterFactory({
      perTool: {
        delegate: { capacity: 10, refillRate: 10, refillIntervalMs: 60000 },
      },
      logger: mockLogger,
    });

    // orchestrate still exists from DEFAULT_TOOL_RATE_LIMITS spread
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('uses DEFAULT_TOOL_RATE_LIMITS.orchestrate as final fallback for unknown tools', () => {
    const factory = createToolRateLimiterFactory();
    const limiter = factory.getForTool('totally_unknown_tool');
    // Fallback is orchestrate: capacity 10
    expect(limiter.getState().capacity).toBe(10);
  });

  it('logs debug when unknown tool falls back to default limits', () => {
    const mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      setLevel: vi.fn(),
    };

    const factory = new ToolRateLimiterFactory({ logger: mockLogger });
    factory.getForTool('unrecognized_tool');

    // Should have debug log about fallback (in addition to init + creation logs)
    const debugCalls = mockLogger.debug.mock.calls;
    const fallbackLog = debugCalls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('No category match')
    );
    expect(fallbackLog).toBeDefined();
  });

  it('does not log fallback for tools with direct category mapping', () => {
    const mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      setLevel: vi.fn(),
    };

    const factory = new ToolRateLimiterFactory({ logger: mockLogger });
    factory.getForTool('orchestrate');

    const debugCalls = mockLogger.debug.mock.calls;
    const fallbackLog = debugCalls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('No category match')
    );
    expect(fallbackLog).toBeUndefined();
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
