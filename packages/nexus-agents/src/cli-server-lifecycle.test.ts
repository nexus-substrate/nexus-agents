/**
 * Tests for CLI Server Lifecycle Helpers
 *
 * @module cli-server-lifecycle.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeSwarmObserver,
  initializeEventBus,
  recordServerStartup,
  recordServerShutdown,
  logFinalHealthMetrics,
  logFinalEventBusStats,
  type InitializeSwarmObserverOptions,
  type ServerEventContext,
} from './cli-server-lifecycle.js';
import type { ILogger } from './core/index.js';
import type { SwarmObserver } from './observability/index.js';
import type { EventBusConfig } from './config/index.js';
import type { EventBusBridgeResult } from './mcp/index.js';

// Mock dependencies
vi.mock('./core/index.js', async () => {
  const actual = await vi.importActual<typeof import('./core/index.js')>('./core/index.js');
  return {
    ...actual,
    getTimeProvider: vi.fn(() => ({
      nowIso: () => '2026-02-07T12:00:00.000Z',
    })),
  };
});

vi.mock('./observability/index.js', () => ({
  getSwarmObserver: vi.fn(),
  SwarmObserver: {
    generateTraceId: vi.fn(() => 'trace-123'),
    generateSpanId: vi.fn(() => 'span-456'),
  },
}));

vi.mock('./mcp/index.js', () => ({
  initializeEventBusBridge: vi.fn(),
  getEventBusStats: vi.fn(),
}));

import { getSwarmObserver, SwarmObserver as SwarmObserverMock } from './observability/index.js';
import { initializeEventBusBridge, getEventBusStats } from './mcp/index.js';

describe('initializeSwarmObserver', () => {
  let mockLogger: ILogger;
  let mockObserver: SwarmObserver;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as ILogger;

    mockObserver = {} as SwarmObserver;
    vi.mocked(getSwarmObserver).mockReturnValue(mockObserver);
  });

  it('uses default maxEvents of 10000', () => {
    initializeSwarmObserver(mockLogger);

    expect(getSwarmObserver).toHaveBeenCalledWith({ maxEvents: 10000 });
    expect(mockLogger.info).toHaveBeenCalledWith(
      'SwarmObserver initialized for interaction tracing',
      { maxEvents: 10000, configuredFromYaml: false }
    );
  });

  it('uses custom maxEvents from options', () => {
    const options: InitializeSwarmObserverOptions = { maxEvents: 5000 };

    initializeSwarmObserver(mockLogger, options);

    expect(getSwarmObserver).toHaveBeenCalledWith({ maxEvents: 5000 });
    expect(mockLogger.info).toHaveBeenCalledWith(
      'SwarmObserver initialized for interaction tracing',
      { maxEvents: 5000, configuredFromYaml: true }
    );
  });

  it('returns the SwarmObserver instance', () => {
    const result = initializeSwarmObserver(mockLogger);
    expect(result).toBe(mockObserver);
  });
});

describe('initializeEventBus', () => {
  let mockLogger: ILogger;
  let mockObserver: SwarmObserver;
  let mockResult: EventBusBridgeResult;
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env['NEXUS_EVENTBUS_ENABLED'];
    delete process.env['NEXUS_EVENTBUS_ENABLED'];

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as ILogger;

    mockObserver = {} as SwarmObserver;
    mockResult = { initialized: true, subscriptionCount: 3, cleanup: vi.fn() };

    vi.mocked(initializeEventBusBridge).mockReturnValue(mockResult);
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env['NEXUS_EVENTBUS_ENABLED'] = savedEnv;
    } else {
      delete process.env['NEXUS_EVENTBUS_ENABLED'];
    }
  });

  it('enables EventBus by default', () => {
    initializeEventBus(mockObserver, mockLogger);

    expect(initializeEventBusBridge).toHaveBeenCalledWith(mockObserver, mockLogger, {
      enabled: true,
    });
  });

  it('respects config.enabled when provided', () => {
    const config = { enabled: false } as EventBusConfig;

    initializeEventBus(mockObserver, mockLogger, config);

    expect(initializeEventBusBridge).toHaveBeenCalledWith(mockObserver, mockLogger, {
      enabled: false,
    });
  });

  it('env override takes precedence over config', () => {
    process.env['NEXUS_EVENTBUS_ENABLED'] = 'false';
    const config = { enabled: true } as EventBusConfig;

    initializeEventBus(mockObserver, mockLogger, config);

    expect(initializeEventBusBridge).toHaveBeenCalledWith(mockObserver, mockLogger, {
      enabled: false,
    });
  });

  it('logs subscription count when initialized', () => {
    initializeEventBus(mockObserver, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith('EventBus bridge initialized for A2A visibility', {
      subscriptionCount: 3,
      eventBusEnabled: true,
    });
  });

  it('returns bridge result', () => {
    const result = initializeEventBus(mockObserver, mockLogger);
    expect(result).toBe(mockResult);
  });
});

describe('recordServerStartup', () => {
  let mockObserver: SwarmObserver;

  beforeEach(() => {
    mockObserver = {
      recordEvent: vi.fn(),
    } as unknown as SwarmObserver;
  });

  it('returns valid trace and span IDs', () => {
    const context = recordServerStartup(mockObserver);

    expect(context).toEqual({
      traceId: 'trace-123',
      startupSpanId: 'span-456',
    });
  });

  it('records task_started event with correct payload', () => {
    recordServerStartup(mockObserver);

    expect(mockObserver.recordEvent).toHaveBeenCalledWith({
      eventId: 'startup-span-456',
      timestamp: '2026-02-07T12:00:00.000Z',
      agentId: 'mcp-server',
      eventType: 'task_started',
      traceId: 'trace-123',
      spanId: 'span-456',
      payload: {
        type: 'task',
        phase: 'started',
        taskId: 'trace-123',
        taskDescription: 'MCP server startup',
      },
    });
  });
});

describe('recordServerShutdown', () => {
  let mockObserver: SwarmObserver;
  let context: ServerEventContext;

  beforeEach(() => {
    mockObserver = {
      recordEvent: vi.fn(),
    } as unknown as SwarmObserver;

    context = { traceId: 'trace-123', startupSpanId: 'span-456' };
    vi.mocked(SwarmObserverMock.generateSpanId).mockReturnValue('span-789');
  });

  it('links to startup context via traceId', () => {
    recordServerShutdown(mockObserver, context);

    const call = vi.mocked(mockObserver.recordEvent).mock.calls[0]?.[0];
    expect(call?.traceId).toBe('trace-123');
  });

  it('links to startup context via parentSpanId', () => {
    recordServerShutdown(mockObserver, context);

    const call = vi.mocked(mockObserver.recordEvent).mock.calls[0]?.[0];
    expect(call?.parentSpanId).toBe('span-456');
  });

  it('records task_completed event with success', () => {
    recordServerShutdown(mockObserver, context);

    expect(mockObserver.recordEvent).toHaveBeenCalledWith({
      eventId: 'shutdown-span-789',
      timestamp: '2026-02-07T12:00:00.000Z',
      agentId: 'mcp-server',
      eventType: 'task_completed',
      traceId: 'trace-123',
      spanId: 'span-789',
      parentSpanId: 'span-456',
      payload: {
        type: 'task',
        phase: 'completed',
        taskId: 'trace-123',
        taskDescription: 'MCP server shutdown',
        success: true,
      },
    });
  });
});

describe('logFinalHealthMetrics', () => {
  let mockLogger: ILogger;
  let mockObserver: SwarmObserver;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as ILogger;

    mockObserver = {
      getHealthMetrics: vi.fn(() => ({
        activeAgents: 5,
        totalAgents: 10,
        totalInteractions: 42,
      })),
    } as unknown as SwarmObserver;
  });

  it('reads and logs health metrics', () => {
    logFinalHealthMetrics(mockObserver, mockLogger);

    expect(mockObserver.getHealthMetrics).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('Final swarm health metrics', {
      activeAgents: 5,
      totalAgents: 10,
      totalInteractions: 42,
    });
  });
});

describe('logFinalEventBusStats', () => {
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as ILogger;

    vi.mocked(getEventBusStats).mockReturnValue({
      eventsEmitted: 100,
      activeSubscriptions: 3,
      historySize: 50,
      errorCount: 2,
    });
  });

  it('reads and logs EventBus stats', () => {
    logFinalEventBusStats(mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith('Final EventBus statistics', {
      eventsEmitted: 100,
      activeSubscriptions: 3,
      historySize: 50,
      errorCount: 2,
    });
  });
});
