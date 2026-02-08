/**
 * Tests for Mock CLI Adapter
 *
 * Verifies configurable responses, latency simulation, failure injection,
 * and request tracking for test assertions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MockCliAdapter,
  createTestAdapter,
  createFailingAdapter,
  createSlowAdapter,
} from './mock-adapter.js';
import type { CliTask } from '../../cli-adapters/types.js';

describe('MockCliAdapter', () => {
  let adapter: MockCliAdapter;

  beforeEach(() => {
    adapter = new MockCliAdapter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with default config', () => {
      expect(adapter.name).toBe('claude');
      expect(adapter.transport).toBe('subprocess');
    });

    it('should create adapter with custom name', () => {
      const geminiAdapter = new MockCliAdapter({ name: 'gemini' });
      expect(geminiAdapter.name).toBe('gemini');
    });

    it('should create adapter with custom config', () => {
      const customAdapter = new MockCliAdapter({
        name: 'codex',
        defaultResponse: 'Custom response',
        defaultLatencyMs: 100,
        failureRate: 0.5,
      });

      expect(customAdapter.name).toBe('codex');
    });

    it('should support all CLI names', () => {
      const claudeAdapter = new MockCliAdapter({ name: 'claude' });
      const geminiAdapter = new MockCliAdapter({ name: 'gemini' });
      const codexAdapter = new MockCliAdapter({ name: 'codex' });

      expect(claudeAdapter.name).toBe('claude');
      expect(geminiAdapter.name).toBe('gemini');
      expect(codexAdapter.name).toBe('codex');
    });
  });

  describe('execute()', () => {
    it('should return default response', async () => {
      const customAdapter = new MockCliAdapter({
        defaultResponse: 'Default test response',
      });

      const result = await customAdapter.execute({ content: 'test prompt' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Default test response');
      }
    });

    it('should record all calls', async () => {
      const task: CliTask = { content: 'first task' };
      const task2: CliTask = { content: 'second task' };

      await adapter.execute(task);
      await adapter.execute(task2);

      const calls = adapter.getCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0]?.task.content).toBe('first task');
      expect(calls[1]?.task.content).toBe('second task');
    });

    it('should record options with calls', async () => {
      const task: CliTask = { content: 'test' };
      const options = { timeoutMs: 5000, maxRetries: 3 };

      await adapter.execute(task, options);

      const lastCall = adapter.getLastCall();
      expect(lastCall?.options).toEqual(options);
    });

    it('should record timestamp with calls', async () => {
      const before = new Date();
      await adapter.execute({ content: 'test' });
      const after = new Date();

      const lastCall = adapter.getLastCall();
      expect(lastCall?.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lastCall?.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should return specific response for task content', async () => {
      adapter.addResponse('specific task', 'Specific response');

      const result = await adapter.execute({ content: 'specific task' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Specific response');
      }
    });

    it('should return specific response for session ID', async () => {
      adapter.addResponse('session-123', 'Session response');

      const result = await adapter.execute({
        content: 'any content',
        sessionId: 'session-123',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Session response');
      }
    });

    it('should include duration in response', async () => {
      const result = await adapter.execute({ content: 'test' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.durationMs).toBeDefined();
        expect(typeof result.value.durationMs).toBe('number');
      }
    });

    it('should include model in response', async () => {
      const result = await adapter.execute({ content: 'test' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.model).toBe('claude-opus');
      }
    });

    it('should include usage in response', async () => {
      const result = await adapter.execute({ content: 'test' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage).toBeDefined();
        expect(result.value.usage?.inputTokens).toBeTypeOf('number');
        expect(result.value.usage?.outputTokens).toBeTypeOf('number');
      }
    });
  });

  describe('setNextResponse()', () => {
    it('should return queued string response', async () => {
      adapter.setNextResponse('Queued response');

      const result = await adapter.execute({ content: 'test' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Queued response');
      }
    });

    it('should return queued error response', async () => {
      adapter.setNextResponse(new Error('Queued error'));

      const result = await adapter.execute({ content: 'test' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Queued error');
        expect(result.error.code).toBe('EXECUTION_ERROR');
      }
    });

    it('should queue multiple responses in order', async () => {
      adapter.setNextResponse('First');
      adapter.setNextResponse('Second');
      adapter.setNextResponse(new Error('Third'));

      const result1 = await adapter.execute({ content: 'test' });
      const result2 = await adapter.execute({ content: 'test' });
      const result3 = await adapter.execute({ content: 'test' });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result3.ok).toBe(false);

      if (result1.ok) expect(result1.value.text).toBe('First');
      if (result2.ok) expect(result2.value.text).toBe('Second');
      if (!result3.ok) expect(result3.error.message).toBe('Third');
    });

    it('should fall back to default after queue is exhausted', async () => {
      const customAdapter = new MockCliAdapter({
        defaultResponse: 'Default',
      });
      customAdapter.setNextResponse('Queued');

      await customAdapter.execute({ content: 'test' }); // Queued
      const result = await customAdapter.execute({ content: 'test' }); // Default

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Default');
      }
    });
  });

  describe('setNextResponses()', () => {
    it('should queue multiple responses at once', async () => {
      adapter.setNextResponses(['First', 'Second', new Error('Third')]);

      const results = await Promise.all([
        adapter.execute({ content: 'test' }),
        adapter.execute({ content: 'test' }),
        adapter.execute({ content: 'test' }),
      ]);

      expect(results[0].ok).toBe(true);
      expect(results[1].ok).toBe(true);
      expect(results[2].ok).toBe(false);
    });
  });

  describe('failure simulation', () => {
    it('should always fail with failureRate 1.0', async () => {
      const failingAdapter = new MockCliAdapter({
        failureRate: 1.0,
      });

      const result = await failingAdapter.execute({ content: 'test' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Simulated failure');
      }
    });

    it('should never fail with failureRate 0', async () => {
      const reliableAdapter = new MockCliAdapter({
        failureRate: 0,
      });

      // Run multiple times to verify
      for (let i = 0; i < 10; i++) {
        const result = await reliableAdapter.execute({ content: 'test' });
        expect(result.ok).toBe(true);
      }
    });

    it('should track consecutive failures', async () => {
      const failingAdapter = new MockCliAdapter({
        failureRate: 1.0,
      });

      await failingAdapter.execute({ content: 'test' });
      await failingAdapter.execute({ content: 'test' });
      await failingAdapter.execute({ content: 'test' });

      expect(failingAdapter.getConsecutiveFailures()).toBe(3);
    });

    it('should reset consecutive failures on success', async () => {
      adapter.setNextResponse(new Error('fail'));
      adapter.setNextResponse(new Error('fail'));
      adapter.setNextResponse('success');

      await adapter.execute({ content: 'test' });
      await adapter.execute({ content: 'test' });
      expect(adapter.getConsecutiveFailures()).toBe(2);

      await adapter.execute({ content: 'test' });
      expect(adapter.getConsecutiveFailures()).toBe(0);
    });

    it('should have retryable false for EXECUTION_ERROR', async () => {
      adapter.setNextResponse(new Error('fail'));

      const result = await adapter.execute({ content: 'test' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.retryable).toBe(false);
      }
    });
  });

  describe('latency simulation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should simulate latency', async () => {
      const slowAdapter = new MockCliAdapter({
        defaultLatencyMs: 100,
      });

      const executePromise = slowAdapter.execute({ content: 'test' });

      // Advance timer
      await vi.advanceTimersByTimeAsync(100);

      const result = await executePromise;
      expect(result.ok).toBe(true);
    });

    it('should respect task timeout for latency cap', async () => {
      const slowAdapter = new MockCliAdapter({
        defaultLatencyMs: 1000,
      });

      const executePromise = slowAdapter.execute({
        content: 'test',
        timeoutMs: 100,
      });

      // Advance timer by task timeout
      await vi.advanceTimersByTimeAsync(100);

      const result = await executePromise;
      expect(result.ok).toBe(true);
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy status by default', async () => {
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.version).toBe('2.0.76');
      expect(health.versionStatus).toBe('supported');
      expect(health.lastChecked).toBeInstanceOf(Date);
    });

    it('should reflect setHealthy state', async () => {
      adapter.setHealthy(false);

      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toBe('Mock unhealthy state');
    });

    it('should reflect setVersion', async () => {
      adapter.setVersion('3.0.0');

      const health = await adapter.healthCheck();

      expect(health.version).toBe('3.0.0');
    });
  });

  describe('getCapacity()', () => {
    it('should return full capacity', async () => {
      const capacity = await adapter.getCapacity();

      expect(capacity.remainingTokens).toBe(Number.MAX_SAFE_INTEGER);
      expect(capacity.remainingRequests).toBe(Number.MAX_SAFE_INTEGER);
      expect(capacity.exhausted).toBe(false);
      expect(capacity.utilizationPercent).toBe(0);
    });
  });

  describe('getVersion()', () => {
    it('should return mock version', async () => {
      const version = await adapter.getVersion();
      expect(version).toBe('2.0.76');
    });

    it('should return updated version after setVersion', async () => {
      adapter.setVersion('5.0.0');

      const version = await adapter.getVersion();
      expect(version).toBe('5.0.0');
    });
  });

  describe('getModelInfo()', () => {
    it('should return claude model info by default', () => {
      const info = adapter.getModelInfo();

      expect(info.id).toBe('claude-opus');
      expect(info.name).toBe('Claude Opus 4.5');
      expect(info.contextWindow).toBe(200_000);
    });

    it('should return gemini model info', () => {
      const geminiAdapter = new MockCliAdapter({ name: 'gemini' });

      const info = geminiAdapter.getModelInfo();

      expect(info.id).toBe('gemini-3-pro');
      expect(info.name).toBe('Gemini 3 Pro (Preview)');
      expect(info.contextWindow).toBe(1_000_000);
    });

    it('should return codex model info', () => {
      const codexAdapter = new MockCliAdapter({ name: 'codex' });

      const info = codexAdapter.getModelInfo();

      expect(info.id).toBe('codex-5.3');
      expect(info.name).toBe('GPT-5.3-Codex');
      expect(info.contextWindow).toBe(400_000);
    });
  });

  describe('capabilities', () => {
    it('should return capabilities matching CLI name', () => {
      const claudeCaps = new MockCliAdapter({ name: 'claude' }).capabilities;
      const geminiCaps = new MockCliAdapter({ name: 'gemini' }).capabilities;

      expect(claudeCaps.reasoning).toBe(10);
      expect(claudeCaps.contextWindow).toBe(200_000);
      expect(geminiCaps.contextWindow).toBe(1_000_000);
    });
  });

  describe('initialize() and dispose()', () => {
    it('should track initialization state', async () => {
      expect(adapter.isInitialized()).toBe(false);

      await adapter.initialize();
      expect(adapter.isInitialized()).toBe(true);

      await adapter.dispose();
      expect(adapter.isInitialized()).toBe(false);
    });
  });

  describe('reset()', () => {
    it('should clear all recorded calls', async () => {
      await adapter.execute({ content: 'test1' });
      await adapter.execute({ content: 'test2' });
      expect(adapter.getCalls()).toHaveLength(2);

      adapter.reset();

      expect(adapter.getCalls()).toHaveLength(0);
    });

    it('should clear queued responses', async () => {
      adapter.setNextResponse('Queued');
      adapter.reset();

      const result = await adapter.execute({ content: 'test' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Mock response'); // Default
      }
    });

    it('should reset consecutive failures', async () => {
      adapter.setNextResponse(new Error('fail'));
      await adapter.execute({ content: 'test' });
      expect(adapter.getConsecutiveFailures()).toBe(1);

      adapter.reset();

      expect(adapter.getConsecutiveFailures()).toBe(0);
    });
  });

  describe('response mapping', () => {
    it('should add and use response mapping', async () => {
      adapter.addResponse('key1', 'Response 1');
      adapter.addResponse('key2', 'Response 2');

      const result1 = await adapter.execute({ content: 'key1' });
      const result2 = await adapter.execute({ content: 'key2' });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok) expect(result1.value.text).toBe('Response 1');
      if (result2.ok) expect(result2.value.text).toBe('Response 2');
    });

    it('should remove response mapping', async () => {
      adapter.addResponse('key1', 'Response 1');
      adapter.removeResponse('key1');

      const result = await adapter.execute({ content: 'key1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Mock response'); // Default
      }
    });
  });

  describe('getCallCount()', () => {
    it('should return correct call count', async () => {
      expect(adapter.getCallCount()).toBe(0);

      await adapter.execute({ content: 'test1' });
      expect(adapter.getCallCount()).toBe(1);

      await adapter.execute({ content: 'test2' });
      await adapter.execute({ content: 'test3' });
      expect(adapter.getCallCount()).toBe(3);
    });
  });

  describe('getLastCall()', () => {
    it('should return undefined when no calls', () => {
      expect(adapter.getLastCall()).toBeUndefined();
    });

    it('should return the most recent call', async () => {
      await adapter.execute({ content: 'first' });
      await adapter.execute({ content: 'second' });
      await adapter.execute({ content: 'third' });

      const lastCall = adapter.getLastCall();
      expect(lastCall?.task.content).toBe('third');
    });
  });
});

describe('createTestAdapter', () => {
  it('should create adapter with defaults', () => {
    const adapter = createTestAdapter();

    expect(adapter.name).toBe('claude');
  });

  it('should create adapter with custom name', () => {
    const adapter = createTestAdapter('gemini');

    expect(adapter.name).toBe('gemini');
  });

  it('should create adapter with custom response', async () => {
    const adapter = createTestAdapter('claude', 'Custom test response');

    const result = await adapter.execute({ content: 'test' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe('Custom test response');
    }
  });

  it('should have zero latency', async () => {
    vi.useFakeTimers();
    const adapter = createTestAdapter();

    const executePromise = adapter.execute({ content: 'test' });
    // No timer advance needed
    const result = await executePromise;

    expect(result.ok).toBe(true);
    vi.useRealTimers();
  });
});

describe('createFailingAdapter', () => {
  it('should create adapter that always fails', async () => {
    const adapter = createFailingAdapter();

    const result = await adapter.execute({ content: 'test' });

    expect(result.ok).toBe(false);
  });

  it('should create adapter with specified name', async () => {
    const adapter = createFailingAdapter('codex');

    expect(adapter.name).toBe('codex');

    const result = await adapter.execute({ content: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cli).toBe('codex');
    }
  });

  it('should increment consecutive failures', async () => {
    const adapter = createFailingAdapter();

    await adapter.execute({ content: 'test' });
    await adapter.execute({ content: 'test' });
    await adapter.execute({ content: 'test' });

    expect(adapter.getConsecutiveFailures()).toBe(3);
  });
});

describe('createSlowAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create adapter with specified latency', async () => {
    const adapter = createSlowAdapter('claude', 500);

    const executePromise = adapter.execute({ content: 'test' });
    await vi.advanceTimersByTimeAsync(500);
    const result = await executePromise;

    expect(result.ok).toBe(true);
  });

  it('should create adapter with specified name', () => {
    const adapter = createSlowAdapter('gemini', 100);

    expect(adapter.name).toBe('gemini');
  });

  it('should return slow response text', async () => {
    const adapter = createSlowAdapter('claude', 100);

    const executePromise = adapter.execute({ content: 'test' });
    await vi.advanceTimersByTimeAsync(100);
    const result = await executePromise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe('Slow response');
    }
  });
});

describe('circuit breaker testing', () => {
  it('should support testing circuit breaker open state', async () => {
    const adapter = createFailingAdapter();

    // Simulate failures to trigger circuit breaker
    for (let i = 0; i < 5; i++) {
      await adapter.execute({ content: `test ${String(i)}` });
    }

    expect(adapter.getConsecutiveFailures()).toBe(5);
    // Circuit breaker logic would check this count
  });

  it('should support testing circuit breaker half-open state', async () => {
    const adapter = createFailingAdapter();

    // Fail multiple times
    for (let i = 0; i < 3; i++) {
      await adapter.execute({ content: 'fail' });
    }

    // Then allow recovery by queuing a success
    adapter.setNextResponse('recovery');

    const result = await adapter.execute({ content: 'test' });
    expect(result.ok).toBe(true);
    expect(adapter.getConsecutiveFailures()).toBe(0);
  });

  it('should track calls for verification in circuit breaker tests', async () => {
    const adapter = createTestAdapter();

    await adapter.execute({ content: 'first call' });
    await adapter.execute({ content: 'second call' });

    const calls = adapter.getCalls();
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.task.content)).toEqual(['first call', 'second call']);
  });
});
