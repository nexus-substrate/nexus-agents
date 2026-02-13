/**
 * tool-metrics — Unit Tests (Issue #1022)
 *
 * Tests for MCP tool usage metrics recorder and middleware.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordToolMetric,
  getToolMetrics,
  getToolStats,
  clearToolMetrics,
  createMetricsMiddleware,
} from './tool-metrics.js';
import type { MiddlewareContext, ToolResult } from './middleware-chain.js';

function createMockContext(toolName: string): MiddlewareContext {
  return {
    requestContext: {
      requestId: 'test-req-1',
      toolName,
      timestamp: new Date().toISOString(),
      caller: { source: 'stdio' },
      trustTier: '1',
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
  } as unknown as MiddlewareContext;
}

function successResult(): ToolResult {
  return { content: [{ type: 'text', text: 'ok' }] };
}

function errorResult(): ToolResult {
  return { content: [{ type: 'text', text: 'err' }], isError: true };
}

describe('tool-metrics', () => {
  beforeEach(() => {
    clearToolMetrics();
  });

  describe('recordToolMetric', () => {
    it('records and retrieves a metric', () => {
      recordToolMetric({
        toolName: 'delegate_to_model',
        durationMs: 150,
        success: true,
        timestamp: '2026-01-01T00:00:00Z',
      });
      const metrics = getToolMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]?.toolName).toBe('delegate_to_model');
    });

    it('enforces maximum entries via FIFO eviction', () => {
      for (let i = 0; i < 5100; i++) {
        recordToolMetric({
          toolName: `tool_${String(i)}`,
          durationMs: 1,
          success: true,
          timestamp: '2026-01-01T00:00:00Z',
        });
      }
      expect(getToolMetrics().length).toBeLessThanOrEqual(5000);
    });
  });

  describe('getToolStats', () => {
    it('returns empty array when no metrics', () => {
      expect(getToolStats()).toHaveLength(0);
    });

    it('aggregates metrics by tool name', () => {
      recordToolMetric({
        toolName: 'orchestrate',
        durationMs: 100,
        success: true,
        timestamp: '2026-01-01T00:00:00Z',
      });
      recordToolMetric({
        toolName: 'orchestrate',
        durationMs: 200,
        success: false,
        timestamp: '2026-01-01T00:00:01Z',
      });
      recordToolMetric({
        toolName: 'consensus_vote',
        durationMs: 50,
        success: true,
        timestamp: '2026-01-01T00:00:02Z',
      });

      const stats = getToolStats();
      expect(stats).toHaveLength(2);

      const orchStats = stats.find((s) => s.toolName === 'orchestrate');
      expect(orchStats).toBeDefined();
      expect(orchStats?.totalCalls).toBe(2);
      expect(orchStats?.successRate).toBe(0.5);
      expect(orchStats?.avgDurationMs).toBe(150);
      expect(orchStats?.errorCount).toBe(1);

      const voteStats = stats.find((s) => s.toolName === 'consensus_vote');
      expect(voteStats?.totalCalls).toBe(1);
      expect(voteStats?.successRate).toBe(1);
    });

    it('sorts by total calls descending', () => {
      for (let i = 0; i < 5; i++) {
        recordToolMetric({
          toolName: 'frequent',
          durationMs: 10,
          success: true,
          timestamp: '2026-01-01T00:00:00Z',
        });
      }
      recordToolMetric({
        toolName: 'rare',
        durationMs: 10,
        success: true,
        timestamp: '2026-01-01T00:00:00Z',
      });

      const stats = getToolStats();
      expect(stats[0]?.toolName).toBe('frequent');
      expect(stats[1]?.toolName).toBe('rare');
    });
  });

  describe('clearToolMetrics', () => {
    it('removes all recorded metrics', () => {
      recordToolMetric({
        toolName: 'test',
        durationMs: 1,
        success: true,
        timestamp: '2026-01-01T00:00:00Z',
      });
      expect(getToolMetrics()).toHaveLength(1);
      clearToolMetrics();
      expect(getToolMetrics()).toHaveLength(0);
    });
  });

  describe('createMetricsMiddleware', () => {
    it('records success on successful tool execution', async () => {
      const middleware = createMetricsMiddleware();
      const ctx = createMockContext('delegate_to_model');
      const next = vi.fn().mockResolvedValue(successResult());

      await middleware({}, ctx, next);

      const metrics = getToolMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]?.toolName).toBe('delegate_to_model');
      expect(metrics[0]?.success).toBe(true);
      expect(metrics[0]?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('records failure on error tool result', async () => {
      const middleware = createMetricsMiddleware();
      const ctx = createMockContext('execute_spec');
      const next = vi.fn().mockResolvedValue(errorResult());

      await middleware({}, ctx, next);

      const metrics = getToolMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]?.success).toBe(false);
    });

    it('records failure on thrown error', async () => {
      const middleware = createMetricsMiddleware();
      const ctx = createMockContext('orchestrate');
      const next = vi.fn().mockRejectedValue(new Error('timeout'));

      await expect(middleware({}, ctx, next)).rejects.toThrow('timeout');

      const metrics = getToolMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]?.success).toBe(false);
    });

    it('passes through the tool result unchanged', async () => {
      const middleware = createMetricsMiddleware();
      const ctx = createMockContext('list_experts');
      const expected = successResult();
      const next = vi.fn().mockResolvedValue(expected);

      const result = await middleware({}, ctx, next);
      expect(result).toEqual(expected);
    });
  });
});
