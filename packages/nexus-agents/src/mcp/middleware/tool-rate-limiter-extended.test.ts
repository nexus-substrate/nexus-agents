/**
 * Tests for ToolRateLimiterFactory
 *
 * (Source: Issue #274 Phase 2 - per-tool rate limits)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ToolRateLimiterFactory,
  createToolRateLimiterFactory,
  getGlobalToolRateLimiterFactory,
  setGlobalToolRateLimiterFactory,
  resetGlobalToolRateLimiterFactory,
} from './tool-rate-limiter.js';
import { DEFAULT_TOOL_RATE_LIMITS } from './../../config/schemas.js';

describe('ToolRateLimiterFactory', () => {
  beforeEach(() => {
    resetGlobalToolRateLimiterFactory();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('construction', () => {
    it('should create with default configuration', () => {
      const factory = new ToolRateLimiterFactory();
      expect(factory.isEnabled()).toBe(true);
    });

    it('should respect enabled=false', () => {
      const factory = new ToolRateLimiterFactory({ enabled: false });
      expect(factory.isEnabled()).toBe(false);
    });

    it('should accept custom per-tool limits', () => {
      const factory = new ToolRateLimiterFactory({
        perTool: {
          orchestrate: { capacity: 5, refillRate: 5, refillIntervalMs: 30000 },
        },
      });

      const limiter = factory.getForTool('orchestrate');
      const state = limiter.getState();
      expect(state.capacity).toBe(5);
    });
  });

  describe('getForTool', () => {
    it('should create limiters with default orchestrate config', () => {
      const factory = new ToolRateLimiterFactory();
      const limiter = factory.getForTool('orchestrate');
      const state = limiter.getState();

      expect(state.capacity).toBe(DEFAULT_TOOL_RATE_LIMITS.orchestrate.capacity);
      expect(state.tokens).toBe(DEFAULT_TOOL_RATE_LIMITS.orchestrate.capacity);
    });

    it('should create limiters with delegate config', () => {
      const factory = new ToolRateLimiterFactory();
      const limiter = factory.getForTool('delegate');
      const state = limiter.getState();

      expect(state.capacity).toBe(DEFAULT_TOOL_RATE_LIMITS.delegate.capacity);
    });

    it('should create limiters with workflow config', () => {
      const factory = new ToolRateLimiterFactory();
      const limiter = factory.getForTool('run_workflow');
      const state = limiter.getState();

      expect(state.capacity).toBe(DEFAULT_TOOL_RATE_LIMITS.workflow.capacity);
    });

    it('should create limiters with expert config', () => {
      const factory = new ToolRateLimiterFactory();
      const limiter = factory.getForTool('create_expert');
      const state = limiter.getState();

      expect(state.capacity).toBe(DEFAULT_TOOL_RATE_LIMITS.expert.capacity);
    });

    it('should reuse existing limiter for same tool', () => {
      const factory = new ToolRateLimiterFactory();
      const limiter1 = factory.getForTool('orchestrate');
      const limiter2 = factory.getForTool('orchestrate');

      expect(limiter1).toBe(limiter2);
    });

    it('should use orchestrate defaults for unknown tools', () => {
      const factory = new ToolRateLimiterFactory();
      const limiter = factory.getForTool('unknown_tool');
      const state = limiter.getState();

      expect(state.capacity).toBe(DEFAULT_TOOL_RATE_LIMITS.orchestrate.capacity);
    });

    it('should respect custom overrides per tool', () => {
      const factory = new ToolRateLimiterFactory({
        perTool: {
          custom_tool: { capacity: 100, refillRate: 50, refillIntervalMs: 10000 },
        },
      });

      const limiter = factory.getForTool('custom_tool');
      const state = limiter.getState();
      expect(state.capacity).toBe(100);
    });
  });

  describe('rate limiting behavior', () => {
    it('should enforce per-tool limits', () => {
      const factory = new ToolRateLimiterFactory({
        perTool: {
          orchestrate: { capacity: 3, refillRate: 1, refillIntervalMs: 60000 },
        },
      });

      const limiter = factory.getForTool('orchestrate');

      // Should allow first 3 requests
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);

      // Should reject 4th request
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should refill tokens over time', () => {
      const factory = new ToolRateLimiterFactory({
        perTool: {
          orchestrate: { capacity: 2, refillRate: 1, refillIntervalMs: 1000 },
        },
      });

      const limiter = factory.getForTool('orchestrate');

      // Exhaust tokens
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);

      // Advance time by 1 second (1 token should be refilled)
      vi.advanceTimersByTime(1000);

      // Should allow one more request
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should have different limits for different tools', () => {
      const factory = new ToolRateLimiterFactory();

      // Orchestrate has capacity 10
      const orchestrateLimiter = factory.getForTool('orchestrate');
      expect(orchestrateLimiter.getState().capacity).toBe(10);

      // Expert has capacity 30
      const expertLimiter = factory.getForTool('create_expert');
      expect(expertLimiter.getState().capacity).toBe(30);

      // Workflow has capacity 5
      const workflowLimiter = factory.getForTool('run_workflow');
      expect(workflowLimiter.getState().capacity).toBe(5);
    });
  });

  describe('getStates', () => {
    it('should return empty object for new factory', () => {
      const factory = new ToolRateLimiterFactory();
      expect(factory.getStates()).toEqual({});
    });

    it('should return states for created limiters', () => {
      const factory = new ToolRateLimiterFactory();
      factory.getForTool('orchestrate');
      factory.getForTool('delegate');

      const states = factory.getStates();
      expect(states).toHaveProperty('orchestrate');
      expect(states).toHaveProperty('delegate');
      expect(states['orchestrate']?.capacity).toBe(10);
      expect(states['delegate']?.capacity).toBe(20);
    });
  });

  describe('resetAll', () => {
    it('should reset all limiters to full capacity', () => {
      const factory = new ToolRateLimiterFactory({
        perTool: {
          orchestrate: { capacity: 3, refillRate: 1, refillIntervalMs: 60000 },
        },
      });

      const limiter = factory.getForTool('orchestrate');

      // Exhaust tokens
      limiter.tryAcquire();
      limiter.tryAcquire();
      limiter.tryAcquire();
      expect(limiter.getState().tokens).toBe(0);

      // Reset
      factory.resetAll();
      expect(limiter.getState().tokens).toBe(3);
    });
  });

  describe('global factory', () => {
    it('should return same instance on repeated calls', () => {
      const factory1 = getGlobalToolRateLimiterFactory();
      const factory2 = getGlobalToolRateLimiterFactory();
      expect(factory1).toBe(factory2);
    });

    it('should allow setting custom global factory', () => {
      const customFactory = new ToolRateLimiterFactory({ enabled: false });
      setGlobalToolRateLimiterFactory(customFactory);

      const globalFactory = getGlobalToolRateLimiterFactory();
      expect(globalFactory.isEnabled()).toBe(false);
    });

    it('should reset global factory on resetGlobalToolRateLimiterFactory', () => {
      const factory1 = getGlobalToolRateLimiterFactory();
      resetGlobalToolRateLimiterFactory();
      const factory2 = getGlobalToolRateLimiterFactory();

      expect(factory1).not.toBe(factory2);
    });
  });

  describe('createToolRateLimiterFactory helper', () => {
    it('should create factory with config', () => {
      const factory = createToolRateLimiterFactory({
        enabled: true,
        perTool: {
          orchestrate: { capacity: 7, refillRate: 7, refillIntervalMs: 60000 },
        },
      });

      const limiter = factory.getForTool('orchestrate');
      expect(limiter.getState().capacity).toBe(7);
    });

    it('should create factory with defaults when no config', () => {
      const factory = createToolRateLimiterFactory();
      expect(factory.isEnabled()).toBe(true);
    });
  });
});
