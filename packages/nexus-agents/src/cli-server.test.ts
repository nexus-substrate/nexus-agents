/**
 * Tests for CLI Server - Startup, Shutdown, and Lifecycle Management
 * @module cli-server.test
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import type { ILogger } from './core/index.js';
import type { ModeDetectionResult, ServerMode } from './cli/index.js';
import { EXIT_CODES } from './cli-types.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('./mcp/index.js', () => ({
  createServer: vi.fn(),
  connectTransport: vi.fn(),
  closeServer: vi.fn(),
}));

vi.mock('./workflows/index.js', () => ({
  initializeBuiltInTemplates: vi.fn(() => Promise.resolve(new Map())),
}));

vi.mock('./adapters/auto-adapter.js', () => ({
  createAutoAdapter: vi.fn(() =>
    Promise.resolve({ adapter: {}, source: 'test', name: 'test-adapter' })
  ),
}));

vi.mock('./cli-server-tools.js', () => ({
  registerMcpTools: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('./core/index.js', () => ({
  createLogger: vi.fn(() => createMockLogger()),
}));

// #2502: cli-server now imports cli-server-gateway, which transitively pulls
// in the openai-compat / openai SDK adapter chain. Those need full ./core
// exports (ModelError etc.) — mock the gateway helper directly so this test
// stays focused on cli-server's own surface.
vi.mock('./cli-server-gateway.js', () => ({
  tryWireGatewayAdapter: vi.fn(() => Promise.resolve(undefined)),
  // #4040: cli-server now also imports these from the gateway module.
  tryWireGatewayAdapters: vi.fn(() => Promise.resolve(undefined)),
  resolveDefaultModelAdapter: vi.fn(() => undefined),
}));

vi.mock('./version.js', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./cli/index.js', () => ({
  detectMode: vi.fn(() => createMockDetectionResult()),
}));

vi.mock('./security/sandbox/index.js', () => ({
  initializeSandbox: vi.fn(() =>
    Promise.resolve({ executor: { name: 'none' }, usedFallback: false })
  ),
  getSandboxMode: vi.fn(() => 'none'),
}));

vi.mock('./cli-server-lifecycle.js', () => ({
  initializeSwarmObserver: vi.fn(() => ({
    recordEvent: vi.fn(),
    getHealthMetrics: vi.fn(() => ({
      activeAgents: 0,
      totalAgents: 0,
      totalInteractions: 0,
    })),
  })),
  initializeEventBus: vi.fn(() => ({
    initialized: false,
    subscriptionCount: 0,
    cleanup: vi.fn(),
  })),
  recordServerStartup: vi.fn(() => ({
    traceId: 'trace-1',
    startupSpanId: 'span-1',
  })),
  recordServerShutdown: vi.fn(),
  logFinalHealthMetrics: vi.fn(),
  logFinalEventBusStats: vi.fn(),
}));

vi.mock('./cli-orchestrator.js', () => ({
  startOrchestratorMode: vi.fn(() => Promise.resolve()),
}));

vi.mock('./config/index.js', () => ({
  loadConfig: vi.fn(() => ({
    ok: true,
    value: {
      config: {},
      configPath: null,
      usingDefaults: true,
      warnings: [],
    },
  })),
  validateNexusEnv: vi.fn(),
}));

vi.mock('./cli-server-experts.js', () => ({
  initializeExperts: vi.fn(() => ({ builtInCount: 7, customCount: 0 })),
}));

vi.mock('./cli-server-skills.js', () => ({
  initializeSkillLibrary: vi.fn(() => Promise.resolve({ initialized: false, reason: 'no config' })),
}));

vi.mock('./cli-server-sica.js', () => ({
  initializeSica: vi.fn(() => ({ enabled: false, reason: 'no config' })),
}));

vi.mock('./cli-server-feedback.js', () => ({
  initializeFeedbackIntegration: vi.fn(() => ({
    initialized: false,
    reason: 'test',
  })),
}));

vi.mock('./mcp/tools/tool-memory.js', () => ({
  shutdownToolMemory: vi.fn(),
  configureToolMemory: vi.fn(() => ({ applied: true })),
}));

vi.mock('./cli-server-audit.js', () => ({
  initializeAuditLogger: vi.fn(() => null),
  shutdownAuditLogger: vi.fn(() => Promise.resolve()),
  logSecurityConfig: vi.fn(() => ({ authorize: vi.fn() })),
  getPolicyValues: vi.fn(() => ({ defaultExec: 'safe' })),
}));

// ============================================================================
// Test Helpers
// ============================================================================

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => createMockLogger()),
    setLevel: vi.fn(),
    setFormat: vi.fn(),
    setDestination: vi.fn(),
  };
}

function createMockDetectionResult(overrides?: Partial<ModeDetectionResult>): ModeDetectionResult {
  return {
    mode: 'server',
    source: 'auto',
    reason: 'Default mode',
    detectionTimeMs: 1.23,
    signals: {
      stdinIsTty: false,
      stdoutIsTty: false,
      mcpClientName: undefined,
      isCI: false,
      ciPlatform: undefined,
      isContainer: false,
    },
    ...overrides,
  };
}

// ============================================================================
// setupShutdownHandlers
// ============================================================================

describe('setupShutdownHandlers', () => {
  let mockLogger: ILogger;
  let processOnSpy: MockInstance;
  let processExitSpy: MockInstance;

  beforeEach(() => {
    vi.resetAllMocks();
    mockLogger = createMockLogger();
    processOnSpy = vi.spyOn(process, 'on');
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('registers SIGINT handler', async () => {
    const { setupShutdownHandlers } = await import('./cli-server.js');
    const cleanup = vi.fn(() => Promise.resolve());
    setupShutdownHandlers(cleanup, mockLogger);

    const sigintCalls = processOnSpy.mock.calls.filter((c) => c[0] === 'SIGINT');
    expect(sigintCalls.length).toBe(1);
  });

  it('registers SIGTERM handler', async () => {
    const { setupShutdownHandlers } = await import('./cli-server.js');
    const cleanup = vi.fn(() => Promise.resolve());
    setupShutdownHandlers(cleanup, mockLogger);

    const sigtermCalls = processOnSpy.mock.calls.filter((c) => c[0] === 'SIGTERM');
    expect(sigtermCalls.length).toBe(1);
  });

  it('registers uncaughtException handler', async () => {
    const { setupShutdownHandlers } = await import('./cli-server.js');
    const cleanup = vi.fn(() => Promise.resolve());
    setupShutdownHandlers(cleanup, mockLogger);

    const uncaughtCalls = processOnSpy.mock.calls.filter((c) => c[0] === 'uncaughtException');
    expect(uncaughtCalls.length).toBe(1);
  });

  it('registers unhandledRejection handler', async () => {
    const { setupShutdownHandlers } = await import('./cli-server.js');
    const cleanup = vi.fn(() => Promise.resolve());
    setupShutdownHandlers(cleanup, mockLogger);

    const rejectionCalls = processOnSpy.mock.calls.filter((c) => c[0] === 'unhandledRejection');
    expect(rejectionCalls.length).toBe(1);
  });

  it('calls cleanup and exits SUCCESS on SIGINT', async () => {
    const { setupShutdownHandlers } = await import('./cli-server.js');
    const cleanup = vi.fn(() => Promise.resolve());
    setupShutdownHandlers(cleanup, mockLogger);

    const sigintHandler = processOnSpy.mock.calls.find((c) => c[0] === 'SIGINT')?.[1] as () => void;

    sigintHandler();
    // Wait for async cleanup
    await vi.waitFor(() => {
      expect(cleanup).toHaveBeenCalledOnce();
    });
    expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
  });

  it('exits with SHUTDOWN_ERROR when cleanup throws', async () => {
    const { setupShutdownHandlers } = await import('./cli-server.js');
    const cleanup = vi.fn(() => Promise.reject(new Error('cleanup failed')));
    setupShutdownHandlers(cleanup, mockLogger);

    const sigtermHandler = processOnSpy.mock.calls.find(
      (c) => c[0] === 'SIGTERM'
    )?.[1] as () => void;

    sigtermHandler();
    await vi.waitFor(() => {
      expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODES.SHUTDOWN_ERROR);
    });
  });

  it('ignores duplicate shutdown signals', async () => {
    const { setupShutdownHandlers } = await import('./cli-server.js');
    let resolveCleanup: () => void;
    const cleanupPromise = new Promise<void>((resolve) => {
      resolveCleanup = resolve;
    });
    const cleanup = vi.fn(() => cleanupPromise);
    setupShutdownHandlers(cleanup, mockLogger);

    const sigintHandler = processOnSpy.mock.calls.find((c) => c[0] === 'SIGINT')?.[1] as () => void;

    // Fire twice rapidly
    sigintHandler();
    sigintHandler();

    resolveCleanup!();
    await vi.waitFor(() => {
      expect(cleanup).toHaveBeenCalledOnce();
    });
    expect(mockLogger.debug).toHaveBeenCalledWith('Shutdown already in progress, ignoring signal', {
      signal: 'SIGINT',
    });
  });

  it('exits SERVER_START_FAILED on uncaughtException', async () => {
    const { setupShutdownHandlers } = await import('./cli-server.js');
    const cleanup = vi.fn(() => Promise.resolve());
    setupShutdownHandlers(cleanup, mockLogger);

    const handler = processOnSpy.mock.calls.find((c) => c[0] === 'uncaughtException')?.[1] as (
      err: Error
    ) => void;

    handler(new Error('kaboom'));
    expect(mockLogger.error).toHaveBeenCalledWith('Uncaught exception', expect.any(Error));
    expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODES.SERVER_START_FAILED);
  });

  it('handles non-Error unhandled rejection', async () => {
    const { setupShutdownHandlers } = await import('./cli-server.js');
    const cleanup = vi.fn(() => Promise.resolve());
    setupShutdownHandlers(cleanup, mockLogger);

    const handler = processOnSpy.mock.calls.find((c) => c[0] === 'unhandledRejection')?.[1] as (
      reason: unknown
    ) => void;

    handler('string rejection');
    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled rejection', expect.any(Error));
    expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODES.SERVER_START_FAILED);
  });
});

// ============================================================================
// logStartupInfo
// ============================================================================

describe('logStartupInfo', () => {
  let mockLogger: ILogger;

  beforeEach(() => {
    vi.resetAllMocks();
    mockLogger = createMockLogger();
  });

  it('logs version and mode info', async () => {
    const { logStartupInfo } = await import('./cli-server.js');
    const detection = createMockDetectionResult();

    logStartupInfo(mockLogger, detection, false);

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Starting Nexus Agents',
      expect.objectContaining({
        mode: 'server',
        modeSource: 'auto',
      })
    );
  });

  it('logs detection signals in verbose mode', async () => {
    const { logStartupInfo } = await import('./cli-server.js');
    const detection = createMockDetectionResult({
      signals: {
        stdinIsTty: true,
        stdoutIsTty: true,
        mcpClientName: 'claude-desktop',
        isCI: false,
        ciPlatform: undefined,
        isContainer: false,
      },
    });

    logStartupInfo(mockLogger, detection, true);

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Mode detection signals',
      expect.objectContaining({
        stdinIsTty: true,
        mcpClientName: 'claude-desktop',
      })
    );
  });

  it('does not log signals when not verbose', async () => {
    const { logStartupInfo } = await import('./cli-server.js');
    const detection = createMockDetectionResult();

    logStartupInfo(mockLogger, detection, false);

    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it('formats detection time as fixed-point string', async () => {
    const { logStartupInfo } = await import('./cli-server.js');
    const detection = createMockDetectionResult({
      detectionTimeMs: 3.14159,
    });

    logStartupInfo(mockLogger, detection, false);

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Starting Nexus Agents',
      expect.objectContaining({
        detectionTimeMs: '3.14',
      })
    );
  });
});

// ============================================================================
// validateModeOrExit
// ============================================================================

describe('validateModeOrExit', () => {
  let mockLogger: ILogger;
  let processExitSpy: MockInstance;

  beforeEach(() => {
    vi.resetAllMocks();
    mockLogger = createMockLogger();
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('exits with INVALID_ARGS for mesh mode', async () => {
    const { validateModeOrExit } = await import('./cli-server.js');

    validateModeOrExit(mockLogger, 'mesh');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Mesh mode is not yet implemented')
    );
    expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODES.INVALID_ARGS);
  });

  it('allows server mode without exit', async () => {
    const { validateModeOrExit } = await import('./cli-server.js');

    validateModeOrExit(mockLogger, 'server');

    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('allows orchestrator mode without exit', async () => {
    const { validateModeOrExit } = await import('./cli-server.js');

    validateModeOrExit(mockLogger, 'orchestrator');

    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('only rejects mesh mode among all modes', async () => {
    const { validateModeOrExit } = await import('./cli-server.js');
    const modes: ServerMode[] = ['server', 'orchestrator', 'mesh'];

    for (const mode of modes) {
      processExitSpy.mockClear();
      validateModeOrExit(mockLogger, mode);
    }

    // process.exit called only for 'mesh'
    expect(processExitSpy).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// startServer (integration-level)
// ============================================================================

describe('startServer', () => {
  let processExitSpy: MockInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(process, 'on').mockReturnValue(process);

    // Configure the already-mocked createServer to return success
    const mcpModule = await import('./mcp/index.js');
    vi.mocked(mcpModule.createServer).mockReturnValue({
      ok: true,
      value: {
        // `.server` mirrors the real McpServer's low-level Server handle, which
        // cli-server wires `oninitialized` onto for MCP-roots resolution (#3991).
        server: { connect: vi.fn(), server: {} },
        logger: createMockLogger(),
      },
    } as never);
    vi.mocked(mcpModule.connectTransport).mockReturnValue(
      Promise.resolve({ ok: true, value: undefined }) as never
    );
  });

  it('exits for mesh mode before doing other work', async () => {
    const { startServer } = await import('./cli-server.js');

    await startServer(false, 'mesh');

    expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODES.INVALID_ARGS);
  });

  it('delegates to orchestrator mode when mode is orchestrator', async () => {
    const { startOrchestratorMode } = await import('./cli-orchestrator.js');
    const { startServer } = await import('./cli-server.js');

    await startServer(true, 'orchestrator', true, { verbose: true });

    expect(startOrchestratorMode).toHaveBeenCalledWith({ verbose: true });
  });

  it('provides default orchestrator options when none given', async () => {
    const { startOrchestratorMode } = await import('./cli-orchestrator.js');
    const { startServer } = await import('./cli-server.js');

    await startServer(true, 'orchestrator');

    expect(startOrchestratorMode).toHaveBeenCalledWith({ verbose: true });
  });
});

// ============================================================================
// EXIT_CODES integration
// ============================================================================

describe('EXIT_CODES usage', () => {
  it('SUCCESS is 0', () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
  });

  it('SERVER_START_FAILED is 1', () => {
    expect(EXIT_CODES.SERVER_START_FAILED).toBe(1);
  });

  it('SHUTDOWN_ERROR is 2', () => {
    expect(EXIT_CODES.SHUTDOWN_ERROR).toBe(2);
  });

  it('INVALID_ARGS is 3', () => {
    expect(EXIT_CODES.INVALID_ARGS).toBe(3);
  });
});
