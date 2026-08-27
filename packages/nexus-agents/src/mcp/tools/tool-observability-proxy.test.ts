/**
 * Tests for tool-observability-proxy.
 * (Source: Issue #1186)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createToolObservabilityProxy,
  resetInvocationCounter,
} from './tool-observability-proxy.js';
import { EventBus } from '../../pipeline/event-bus.js';
import type { PipelineEvent, IEventBus } from '../../pipeline/event-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Minimal McpServer mock with registerTool method. */
function createMockServer(): {
  registered: Map<
    string,
    { config: unknown; cb: (args: unknown, extra: unknown) => Promise<unknown> }
  >;
  registerTool: (
    name: string,
    config: unknown,
    cb: (args: unknown, extra: unknown) => Promise<unknown>
  ) => void;
} {
  const registered = new Map<
    string,
    { config: unknown; cb: (args: unknown, extra: unknown) => Promise<unknown> }
  >();
  return {
    registered,
    registerTool(
      name: string,
      config: unknown,
      cb: (args: unknown, extra: unknown) => Promise<unknown>
    ): void {
      registered.set(name, { config, cb });
    },
  };
}

/** Creates a mock tool handler that resolves with a value. */
function mockHandler(value: unknown = {}): () => Promise<unknown> {
  return () => Promise.resolve(value);
}

/** Creates a mock tool handler that rejects with an error. */
function failingHandler(message: string): () => Promise<never> {
  return () => Promise.reject(new Error(message));
}

// ============================================================================
// Tests
// ============================================================================

describe('createToolObservabilityProxy', () => {
  let eventBus: IEventBus;
  let events: PipelineEvent[];

  beforeEach(() => {
    resetInvocationCounter();
    eventBus = new EventBus();
    events = [];
    eventBus.subscribe({}, (e) => events.push(e));
  });

  it('emits tool.invoked and tool.completed on successful call (#1186)', async () => {
    const mock = createMockServer();
    const proxy = createToolObservabilityProxy(mock as never, eventBus);

    proxy.registerTool(
      'test_tool',
      {},
      mockHandler({ content: [{ type: 'text', text: 'ok' }] }) as never
    );

    const entry = mock.registered.get('test_tool');
    expect(entry).toBeDefined();

    await entry!.cb({}, {});

    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('tool.invoked');
    expect(events[1]?.type).toBe('tool.completed');

    const invoked = events[0] as PipelineEvent & { type: 'tool.invoked' };
    expect(invoked.toolName).toBe('test_tool');
    expect(invoked.invocationId).toBe('tool-1');

    const completed = events[1] as PipelineEvent & { type: 'tool.completed' };
    expect(completed.toolName).toBe('test_tool');
    expect(completed.success).toBe(true);
    expect(completed.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('emits tool.completed with error info on failure (#1186)', async () => {
    const mock = createMockServer();
    const proxy = createToolObservabilityProxy(mock as never, eventBus);

    proxy.registerTool('failing_tool', {}, failingHandler('test failure'));

    const entry = mock.registered.get('failing_tool');
    expect(entry).toBeDefined();

    await expect(entry!.cb({}, {})).rejects.toThrow('test failure');

    expect(events).toHaveLength(2);
    const completed = events[1] as PipelineEvent & { type: 'tool.completed' };
    expect(completed.success).toBe(false);
    expect(completed.errorMessage).toBe('test failure');
  });

  it('reports a returned error envelope as a failure, not a success', async () => {
    // Nexus tools signal failure by RETURNING `{ isError: true }` from
    // `toolStructuredError` — they do not throw. The proxy read only the
    // `catch`, so every EventBus consumer saw a 100% tool success rate and a
    // validation failure was indistinguishable from a working call. The
    // sibling middleware already gets this right: tool-metrics.ts records
    // `success: result.isError !== true`.
    const mock = createMockServer();
    const proxy = createToolObservabilityProxy(mock as never, eventBus);

    proxy.registerTool(
      'erroring_tool',
      {},
      mockHandler({
        content: [{ type: 'text', text: 'Validation error: bad input' }],
        isError: true,
      }) as never
    );

    await mock.registered.get('erroring_tool')!.cb({}, {});

    const completed = events[1] as PipelineEvent & { type: 'tool.completed' };
    expect(completed.type).toBe('tool.completed');
    expect(completed.success).toBe(false);
  });

  it('increments invocation IDs across tools (#1186)', async () => {
    const mock = createMockServer();
    const proxy = createToolObservabilityProxy(mock as never, eventBus);

    proxy.registerTool('tool_a', {}, mockHandler() as never);
    proxy.registerTool('tool_b', {}, mockHandler() as never);

    await mock.registered.get('tool_a')!.cb({}, {});
    await mock.registered.get('tool_b')!.cb({}, {});

    const invokedEvents = events.filter((e) => e.type === 'tool.invoked');
    expect(invokedEvents).toHaveLength(2);
    expect((invokedEvents[0] as PipelineEvent & { invocationId: string }).invocationId).toBe(
      'tool-1'
    );
    expect((invokedEvents[1] as PipelineEvent & { invocationId: string }).invocationId).toBe(
      'tool-2'
    );
  });

  it('preserves tool config through proxy (#1186)', () => {
    const mock = createMockServer();
    const proxy = createToolObservabilityProxy(mock as never, eventBus);

    const config = { title: 'My Tool', description: 'Does stuff' };
    proxy.registerTool('configured_tool', config, mockHandler() as never);

    const entry = mock.registered.get('configured_tool');
    expect(entry).toBeDefined();
    expect(entry!.config).toEqual(config);
  });

  it('passes through non-registerTool properties (#1186)', () => {
    const mock = createMockServer();
    const proxy = createToolObservabilityProxy(mock as never, eventBus);

    // Access a property that isn't registerTool
    expect((proxy as unknown as { registered: unknown }).registered).toBe(mock.registered);
  });
});
