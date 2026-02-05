/**
 * Tests for trace-helpers utilities
 *
 * @module core/trace-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { TraceSpan, AggregatedMetrics, LLMMetrics } from './trace-types.js';
import {
  generateTraceId,
  generateSpanId,
  countSpanStatus,
  aggregateByKey,
  aggregateLLMMetrics,
  calculateDuration,
  aggregateSpanMetrics,
  findLatestRunningSpan,
  getSpansToPrune,
  type TokenBucketEntry,
} from './trace-helpers.js';

describe('trace-helpers', () => {
  describe('generateTraceId', () => {
    it('returns UUID format string', () => {
      const id = generateTraceId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateSpanId', () => {
    it('returns UUID format string', () => {
      const id = generateSpanId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSpanId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('countSpanStatus', () => {
    const createMetrics = (): AggregatedMetrics => ({
      totalSpans: 0,
      successfulSpans: 0,
      errorSpans: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      durationMs: 0,
      byModel: {},
      byProvider: {},
    });

    const createSpan = (status: 'running' | 'success' | 'error'): TraceSpan => ({
      context: { traceId: 'trace-1', spanId: 'span-1' },
      name: 'test-span',
      startTime: Date.now(),
      status,
      attributes: {},
    });

    it('increments successfulSpans for success status', () => {
      const metrics = createMetrics();
      countSpanStatus(createSpan('success'), metrics);
      expect(metrics.successfulSpans).toBe(1);
      expect(metrics.errorSpans).toBe(0);
    });

    it('increments errorSpans for error status', () => {
      const metrics = createMetrics();
      countSpanStatus(createSpan('error'), metrics);
      expect(metrics.successfulSpans).toBe(0);
      expect(metrics.errorSpans).toBe(1);
    });

    it('does not increment for running status', () => {
      const metrics = createMetrics();
      countSpanStatus(createSpan('running'), metrics);
      expect(metrics.successfulSpans).toBe(0);
      expect(metrics.errorSpans).toBe(0);
    });

    it('accumulates counts across multiple calls', () => {
      const metrics = createMetrics();
      countSpanStatus(createSpan('success'), metrics);
      countSpanStatus(createSpan('success'), metrics);
      countSpanStatus(createSpan('error'), metrics);
      expect(metrics.successfulSpans).toBe(2);
      expect(metrics.errorSpans).toBe(1);
    });
  });

  describe('aggregateByKey', () => {
    it('creates new entry for unknown key', () => {
      const bucket: Record<string, TokenBucketEntry> = {};
      const llm: LLMMetrics = {
        model: 'claude-3',
        provider: 'anthropic',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      };
      aggregateByKey(bucket, 'claude-3', llm);
      expect(bucket['claude-3']).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });
    });

    it('accumulates into existing entry', () => {
      const bucket: Record<string, TokenBucketEntry> = {
        'claude-3': { inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
      };
      const llm: LLMMetrics = {
        model: 'claude-3',
        provider: 'anthropic',
        inputTokens: 200,
        outputTokens: 100,
        costUsd: 0.02,
      };
      aggregateByKey(bucket, 'claude-3', llm);
      expect(bucket['claude-3']).toEqual({
        inputTokens: 300,
        outputTokens: 150,
        costUsd: 0.03,
      });
    });

    it('handles undefined costUsd', () => {
      const bucket: Record<string, TokenBucketEntry> = {};
      const llm: LLMMetrics = {
        model: 'gpt-4',
        provider: 'openai',
        inputTokens: 100,
        outputTokens: 50,
      };
      aggregateByKey(bucket, 'gpt-4', llm);
      expect(bucket['gpt-4']?.costUsd).toBe(0);
    });

    it('handles multiple different keys', () => {
      const bucket: Record<string, TokenBucketEntry> = {};
      const llm1: LLMMetrics = {
        model: 'claude-3',
        provider: 'anthropic',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      };
      const llm2: LLMMetrics = {
        model: 'gpt-4',
        provider: 'openai',
        inputTokens: 200,
        outputTokens: 100,
        costUsd: 0.05,
      };
      aggregateByKey(bucket, 'claude-3', llm1);
      aggregateByKey(bucket, 'gpt-4', llm2);
      expect(Object.keys(bucket)).toHaveLength(2);
      expect(bucket['claude-3']?.inputTokens).toBe(100);
      expect(bucket['gpt-4']?.inputTokens).toBe(200);
    });
  });

  describe('aggregateLLMMetrics', () => {
    const createMetrics = (): AggregatedMetrics => ({
      totalSpans: 0,
      successfulSpans: 0,
      errorSpans: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      durationMs: 0,
      byModel: {},
      byProvider: {},
    });

    const createSpanWithLLM = (llmMetrics?: LLMMetrics): TraceSpan => ({
      context: { traceId: 'trace-1', spanId: 'span-1' },
      name: 'test-span',
      startTime: Date.now(),
      status: 'success',
      attributes: {},
      ...(llmMetrics !== undefined && { llmMetrics }),
    });

    it('aggregates tokens and cost', () => {
      const metrics = createMetrics();
      const span = createSpanWithLLM({
        model: 'claude-3',
        provider: 'anthropic',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });
      aggregateLLMMetrics(span, metrics);
      expect(metrics.totalInputTokens).toBe(100);
      expect(metrics.totalOutputTokens).toBe(50);
      expect(metrics.totalCostUsd).toBe(0.01);
    });

    it('skips span without llmMetrics', () => {
      const metrics = createMetrics();
      const span = createSpanWithLLM(undefined);
      aggregateLLMMetrics(span, metrics);
      expect(metrics.totalInputTokens).toBe(0);
      expect(metrics.totalOutputTokens).toBe(0);
      expect(metrics.totalCostUsd).toBe(0);
    });

    it('aggregates by model and provider', () => {
      const metrics = createMetrics();
      const span = createSpanWithLLM({
        model: 'claude-3',
        provider: 'anthropic',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });
      aggregateLLMMetrics(span, metrics);
      expect(metrics.byModel['claude-3']).toBeDefined();
      expect(metrics.byProvider['anthropic']).toBeDefined();
    });

    it('accumulates across multiple spans', () => {
      const metrics = createMetrics();
      aggregateLLMMetrics(
        createSpanWithLLM({
          model: 'claude-3',
          provider: 'anthropic',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.01,
        }),
        metrics
      );
      aggregateLLMMetrics(
        createSpanWithLLM({
          model: 'claude-3',
          provider: 'anthropic',
          inputTokens: 200,
          outputTokens: 100,
          costUsd: 0.02,
        }),
        metrics
      );
      expect(metrics.totalInputTokens).toBe(300);
      expect(metrics.totalOutputTokens).toBe(150);
      expect(metrics.totalCostUsd).toBeCloseTo(0.03, 6);
    });
  });

  describe('calculateDuration', () => {
    const createMetrics = (): AggregatedMetrics => ({
      totalSpans: 0,
      successfulSpans: 0,
      errorSpans: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      durationMs: 0,
      byModel: {},
      byProvider: {},
    });

    it('calculates duration from time bounds', () => {
      const metrics = createMetrics();
      calculateDuration(metrics, 1000, 2000);
      expect(metrics.durationMs).toBe(1000);
    });

    it('does not update if minStartTime is Infinity', () => {
      const metrics = createMetrics();
      calculateDuration(metrics, Infinity, 2000);
      expect(metrics.durationMs).toBe(0);
    });

    it('does not update if maxEndTime is 0', () => {
      const metrics = createMetrics();
      calculateDuration(metrics, 1000, 0);
      expect(metrics.durationMs).toBe(0);
    });

    it('handles same start and end time', () => {
      const metrics = createMetrics();
      calculateDuration(metrics, 1000, 1000);
      expect(metrics.durationMs).toBe(0);
    });
  });

  describe('aggregateSpanMetrics', () => {
    const createMetrics = (): AggregatedMetrics => ({
      totalSpans: 0,
      successfulSpans: 0,
      errorSpans: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      durationMs: 0,
      byModel: {},
      byProvider: {},
    });

    const createSpan = (
      options: Partial<TraceSpan> & { startTime: number; endTime?: number }
    ): TraceSpan => ({
      context: { traceId: 'trace-1', spanId: `span-${String(Math.random())}` },
      name: 'test-span',
      status: 'success',
      attributes: {},
      ...options,
    });

    it('returns time bounds', () => {
      const metrics = createMetrics();
      const spans = [
        createSpan({ startTime: 1000, endTime: 2000 }),
        createSpan({ startTime: 500, endTime: 3000 }),
      ];
      const bounds = aggregateSpanMetrics(spans, metrics);
      expect(bounds.minStartTime).toBe(500);
      expect(bounds.maxEndTime).toBe(3000);
    });

    it('handles empty spans array', () => {
      const metrics = createMetrics();
      const bounds = aggregateSpanMetrics([], metrics);
      expect(bounds.minStartTime).toBe(Infinity);
      expect(bounds.maxEndTime).toBe(0);
    });

    it('counts span statuses', () => {
      const metrics = createMetrics();
      const spans = [
        createSpan({ startTime: 1000, status: 'success' }),
        createSpan({ startTime: 1000, status: 'success' }),
        createSpan({ startTime: 1000, status: 'error' }),
      ];
      aggregateSpanMetrics(spans, metrics);
      expect(metrics.successfulSpans).toBe(2);
      expect(metrics.errorSpans).toBe(1);
    });

    it('aggregates LLM metrics from all spans', () => {
      const metrics = createMetrics();
      const spans = [
        createSpan({
          startTime: 1000,
          llmMetrics: {
            model: 'claude-3',
            provider: 'anthropic',
            inputTokens: 100,
            outputTokens: 50,
          },
        }),
        createSpan({
          startTime: 2000,
          llmMetrics: {
            model: 'gpt-4',
            provider: 'openai',
            inputTokens: 200,
            outputTokens: 100,
          },
        }),
      ];
      aggregateSpanMetrics(spans, metrics);
      expect(metrics.totalInputTokens).toBe(300);
      expect(metrics.totalOutputTokens).toBe(150);
    });

    it('handles span without endTime', () => {
      const metrics = createMetrics();
      const spans = [
        createSpan({ startTime: 1000, endTime: 2000 }),
        createSpan({ startTime: 1500, status: 'running' }), // No endTime
      ];
      const bounds = aggregateSpanMetrics(spans, metrics);
      expect(bounds.minStartTime).toBe(1000);
      expect(bounds.maxEndTime).toBe(2000);
    });
  });

  describe('findLatestRunningSpan', () => {
    const createSpan = (startTime: number, status: 'running' | 'success' | 'error'): TraceSpan => ({
      context: { traceId: 'trace-1', spanId: `span-${String(startTime)}` },
      name: 'test-span',
      startTime,
      status,
      attributes: {},
    });

    it('finds latest running span', () => {
      const spans = [
        createSpan(1000, 'running'),
        createSpan(2000, 'running'),
        createSpan(1500, 'running'),
      ];
      const result = findLatestRunningSpan(spans);
      expect(result?.startTime).toBe(2000);
    });

    it('returns undefined for empty array', () => {
      const result = findLatestRunningSpan([]);
      expect(result).toBeUndefined();
    });

    it('returns undefined if no running spans', () => {
      const spans = [createSpan(1000, 'success'), createSpan(2000, 'error')];
      const result = findLatestRunningSpan(spans);
      expect(result).toBeUndefined();
    });

    it('ignores completed spans', () => {
      const spans = [
        createSpan(3000, 'success'), // Higher time but not running
        createSpan(1000, 'running'),
        createSpan(2000, 'error'), // Higher time but not running
      ];
      const result = findLatestRunningSpan(spans);
      expect(result?.startTime).toBe(1000);
    });

    it('works with single running span', () => {
      const spans = [createSpan(1000, 'running')];
      const result = findLatestRunningSpan(spans);
      expect(result?.startTime).toBe(1000);
    });
  });

  describe('getSpansToPrune', () => {
    const createEntry = (
      spanId: string,
      startTime: number,
      status: 'running' | 'success' | 'error'
    ): [string, TraceSpan] => [
      spanId,
      {
        context: { traceId: 'trace-1', spanId },
        name: 'test-span',
        startTime,
        status,
        attributes: {},
      },
    ];

    it('returns oldest completed spans', () => {
      const entries = [
        createEntry('span-1', 1000, 'success'),
        createEntry('span-2', 2000, 'success'),
        createEntry('span-3', 3000, 'success'),
        createEntry('span-4', 4000, 'success'),
      ];
      const toPrune = getSpansToPrune(entries, 0.5); // 50%
      expect(toPrune).toHaveLength(2);
      expect(toPrune).toContain('span-1');
      expect(toPrune).toContain('span-2');
    });

    it('excludes running spans', () => {
      const entries = [
        createEntry('span-1', 1000, 'running'),
        createEntry('span-2', 2000, 'success'),
        createEntry('span-3', 3000, 'success'),
      ];
      const toPrune = getSpansToPrune(entries, 0.5);
      expect(toPrune).not.toContain('span-1');
    });

    it('defaults to 10% prune rate', () => {
      const entries = Array.from({ length: 100 }, (_, i) =>
        createEntry(`span-${String(i)}`, i * 1000, 'success')
      );
      const toPrune = getSpansToPrune(entries);
      expect(toPrune).toHaveLength(10);
    });

    it('returns empty array for empty input', () => {
      const toPrune = getSpansToPrune([]);
      expect(toPrune).toEqual([]);
    });

    it('handles all running spans', () => {
      const entries = [
        createEntry('span-1', 1000, 'running'),
        createEntry('span-2', 2000, 'running'),
      ];
      const toPrune = getSpansToPrune(entries, 0.5);
      expect(toPrune).toEqual([]);
    });

    it('rounds up prune count', () => {
      const entries = [
        createEntry('span-1', 1000, 'success'),
        createEntry('span-2', 2000, 'success'),
        createEntry('span-3', 3000, 'success'),
      ];
      // 3 * 0.1 = 0.3, ceil(0.3) = 1
      const toPrune = getSpansToPrune(entries, 0.1);
      expect(toPrune).toHaveLength(1);
      expect(toPrune[0]).toBe('span-1');
    });
  });
});
