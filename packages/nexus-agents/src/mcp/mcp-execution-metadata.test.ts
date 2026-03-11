/**
 * MCP Execution Metadata & Heartbeat Tests
 *
 * Verifies that the heartbeat progress notification mechanism works correctly
 * and that AsyncLocalStorage context threading functions properly.
 *
 * Finding: SDK v1.27.1 enforces that taskSupport != 'forbidden' requires
 * registerToolTask(), not registerTool(). Simple metadata annotation is NOT
 * sufficient — full ToolTaskHandler implementation is required (Layer 2).
 *
 * @module mcp/mcp-execution-metadata.test
 * (Source: Issue #1297 — Fix heartbeat/execution metadata wiring)
 */
import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// SDK Constraint Verification
// ============================================================================

describe('MCP SDK task support constraints', () => {
  it('SDK registerTool does NOT accept execution in config', async () => {
    // The registerTool() config type does not include 'execution'.
    // Setting execution.taskSupport on the returned RegisteredTool
    // causes: "Tool has taskSupport 'optional' but was not registered
    // with registerToolTask" at call time.
    // This confirms Layer 2 (registerToolTask) is required for async.
    const { createServer } = await import('./server.js');
    const serverResult = createServer();
    expect(serverResult.ok).toBe(true);
    // Verify the SDK experimental tasks API exists
    if (serverResult.ok) {
      const { server } = serverResult.value;
      expect(server.experimental).toBeDefined();
      expect(server.experimental.tasks).toBeDefined();
      expect(typeof server.experimental.tasks.registerToolTask).toBe('function');
    }
  });

  it('InMemoryTaskStore is available in SDK', async () => {
    const { InMemoryTaskStore } = await import('@modelcontextprotocol/sdk/experimental/tasks');
    expect(InMemoryTaskStore).toBeDefined();
    const store = new InMemoryTaskStore();
    expect(typeof store.createTask).toBe('function');
    expect(typeof store.getTask).toBe('function');
    expect(typeof store.storeTaskResult).toBe('function');
    store.cleanup();
  });
});

// ============================================================================
// Heartbeat Mechanism Verification
// ============================================================================

describe('heartbeat progress notification mechanism', () => {
  it('withProgressHeartbeat executes operation and returns result', async () => {
    const { withProgressHeartbeat, NOOP_NOTIFIER } = await import('./mcp-notifier.js');
    const result = await withProgressHeartbeat(
      'test_tool',
      NOOP_NOTIFIER,
      () => Promise.resolve('test-result'),
      100
    );
    expect(result).toBe('test-result');
  });

  it('withProgressHeartbeat propagates errors', async () => {
    const { withProgressHeartbeat, NOOP_NOTIFIER } = await import('./mcp-notifier.js');
    await expect(
      withProgressHeartbeat(
        'test_tool',
        NOOP_NOTIFIER,
        () => Promise.reject(new Error('test-error')),
        100
      )
    ).rejects.toThrow('test-error');
  });

  it('withProgressHeartbeat sends heartbeat notifications', async () => {
    vi.useFakeTimers();
    try {
      const { withProgressHeartbeat } = await import('./mcp-notifier.js');
      const debugCalls: Array<Record<string, unknown>> = [];
      const mockNotifier = {
        info: vi.fn(),
        debug: vi.fn((_logger: string, data: Record<string, unknown>) => {
          debugCalls.push(data);
        }),
        warn: vi.fn(),
      };

      // Start operation that resolves after 250ms — heartbeat fires at 100ms
      const promise = withProgressHeartbeat(
        'test_tool',
        mockNotifier,
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve('done');
            }, 250);
          }),
        100
      );

      // Advance past first heartbeat (100ms) and operation completion (250ms)
      await vi.advanceTimersByTimeAsync(300);
      await promise;

      expect(debugCalls.length).toBeGreaterThanOrEqual(1);
      expect(debugCalls[0]).toHaveProperty('event', 'heartbeat');
      expect(debugCalls[0]).toHaveProperty('beatCount', 1);
      expect(debugCalls[0]).toHaveProperty('hasProgressToken', false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('toSdkCallback threads progressToken into AsyncLocalStorage', async () => {
    const { toSdkCallback } = await import('./middleware/tool-wrapper.js');
    const { progressContextStorage } = await import('./mcp-notifier.js');

    let capturedToken: string | number | undefined;

    const handler = toSdkCallback(() => {
      const store = progressContextStorage.getStore();
      capturedToken = store?.progressToken;
      return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
    });

    const extra = {
      _meta: { progressToken: 'test-token-123' },
      sendNotification: (): Promise<void> => Promise.resolve(),
    };

    await handler({}, extra);
    expect(capturedToken).toBe('test-token-123');
  });

  it('toSdkCallback handles missing progressToken gracefully', async () => {
    const { toSdkCallback } = await import('./middleware/tool-wrapper.js');
    const { progressContextStorage } = await import('./mcp-notifier.js');

    let storeWasUndefined = false;

    const handler = toSdkCallback(() => {
      storeWasUndefined = progressContextStorage.getStore() === undefined;
      return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
    });

    await handler({}, {});
    expect(storeWasUndefined).toBe(true);
  });

  it('withProgressHeartbeat sends real progress when token is available', async () => {
    vi.useFakeTimers();
    try {
      const { withProgressHeartbeat, progressContextStorage } = await import('./mcp-notifier.js');
      const mockNotifier = { info: vi.fn(), debug: vi.fn(), warn: vi.fn() };

      const notifications: Array<{ progress: number }> = [];
      const progressCtx = {
        progressToken: 'real-token',
        sendNotification: (progress: number): void => {
          notifications.push({ progress });
        },
      };

      // Run within progress context to simulate real MCP request
      const promise = progressContextStorage.run(progressCtx, () =>
        withProgressHeartbeat(
          'test_tool',
          mockNotifier,
          () =>
            new Promise((resolve) => {
              setTimeout(() => {
                resolve('ok');
              }, 250);
            }),
          100
        )
      );

      // Advance past first heartbeat (100ms) and operation completion (250ms)
      await vi.advanceTimersByTimeAsync(300);
      await promise;

      // Should have sent real progress notifications
      expect(notifications.length).toBeGreaterThanOrEqual(1);
      expect(notifications[0]?.progress).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('abortSignalStorage is threaded by toSdkCallback', async () => {
    const { toSdkCallback } = await import('./middleware/tool-wrapper.js');
    const { abortSignalStorage } = await import('./mcp-notifier.js');

    let capturedSignal: AbortSignal | undefined;

    const handler = toSdkCallback(() => {
      capturedSignal = abortSignalStorage.getStore();
      return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
    });

    const controller = new AbortController();
    const extra = { signal: controller.signal };

    await handler({}, extra);
    expect(capturedSignal).toBe(controller.signal);
  });
});
