/**
 * Tests for logging.ts
 *
 * Covers createMcpLogger, createToolLogger, logToolStart,
 * logToolSuccess, logToolError, createTimer, and withLogging.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMcpLogger,
  createToolLogger,
  logToolStart,
  logToolSuccess,
  logToolError,
  createTimer,
  withLogging,
} from './logging.js';
import type { ILogger } from '../../core/index.js';

// ============================================================================
// Mock logger helper
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockLogger() {
  const logger: ILogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  } as unknown as ILogger;
  // child returns another mock logger
  (logger.child as ReturnType<typeof vi.fn>).mockReturnValue(logger);
  return logger;
}

// ============================================================================
// createMcpLogger
// ============================================================================

describe('createMcpLogger', () => {
  it('returns a logger instance', () => {
    const logger = createMcpLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('accepts base context', () => {
    const logger = createMcpLogger({ requestId: 'req-1' });
    expect(logger).toBeDefined();
  });
});

// ============================================================================
// createToolLogger
// ============================================================================

describe('createToolLogger', () => {
  it('creates child logger with tool context', () => {
    const parent = makeMockLogger();
    createToolLogger(parent, 'orchestrate');
    expect(parent.child).toHaveBeenCalledWith({ tool: 'orchestrate' });
  });

  it('includes requestId when provided', () => {
    const parent = makeMockLogger();
    createToolLogger(parent, 'orchestrate', 'req-123');
    expect(parent.child).toHaveBeenCalledWith({
      tool: 'orchestrate',
      requestId: 'req-123',
    });
  });

  it('omits requestId when undefined', () => {
    const parent = makeMockLogger();
    createToolLogger(parent, 'orchestrate');
    expect(parent.child).toHaveBeenCalledWith({ tool: 'orchestrate' });
  });
});

// ============================================================================
// logToolStart
// ============================================================================

describe('logToolStart', () => {
  let logger: ILogger;

  beforeEach(() => {
    logger = makeMockLogger();
  });

  it('logs info message', () => {
    logToolStart(logger, 'orchestrate');
    expect(logger.info).toHaveBeenCalledWith('Tool execution started', {
      tool: 'orchestrate',
      hasArgs: false,
      argKeys: [],
    });
  });

  it('includes arg keys when args provided', () => {
    logToolStart(logger, 'orchestrate', { task: 'build', timeout: 5000 });
    expect(logger.info).toHaveBeenCalledWith('Tool execution started', {
      tool: 'orchestrate',
      hasArgs: true,
      argKeys: ['task', 'timeout'],
    });
  });
});

// ============================================================================
// logToolSuccess
// ============================================================================

describe('logToolSuccess', () => {
  it('logs success with duration', () => {
    const logger = makeMockLogger();
    logToolSuccess(logger, 'orchestrate', 150);
    expect(logger.info).toHaveBeenCalledWith('Tool execution completed', {
      tool: 'orchestrate',
      durationMs: 150,
      success: true,
    });
  });

  it('includes result info when provided', () => {
    const logger = makeMockLogger();
    logToolSuccess(logger, 'orchestrate', 150, { resultSize: 42 });
    expect(logger.info).toHaveBeenCalledWith('Tool execution completed', {
      tool: 'orchestrate',
      durationMs: 150,
      success: true,
      resultSize: 42,
    });
  });
});

// ============================================================================
// logToolError
// ============================================================================

describe('logToolError', () => {
  it('logs error with duration', () => {
    const logger = makeMockLogger();
    const err = new Error('timeout');
    logToolError(logger, 'orchestrate', err, 200);
    expect(logger.error).toHaveBeenCalledWith('Tool execution failed', err, {
      tool: 'orchestrate',
      durationMs: 200,
      success: false,
      errorCode: undefined,
    });
  });

  it('extracts error code when present', () => {
    const logger = makeMockLogger();
    const err = Object.assign(new Error('fail'), { code: 'TIMEOUT' });
    logToolError(logger, 'orchestrate', err, 100);
    expect(logger.error).toHaveBeenCalledWith('Tool execution failed', err, {
      tool: 'orchestrate',
      durationMs: 100,
      success: false,
      errorCode: 'TIMEOUT',
    });
  });
});

// ============================================================================
// createTimer
// ============================================================================

describe('createTimer', () => {
  it('returns elapsed time', () => {
    const timer = createTimer();
    const elapsed = timer.elapsed();
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// withLogging
// ============================================================================

describe('withLogging', () => {
  it('wraps handler and returns result', async () => {
    const logger = makeMockLogger();
    const handler = vi.fn<[{ x: number }], Promise<string>>();
    handler.mockImplementation(() => Promise.resolve('result'));

    const wrapped = withLogging('my_tool', handler, logger);
    const result = await wrapped({ x: 1 });

    expect(result).toBe('result');
    expect(handler).toHaveBeenCalledWith({ x: 1 });
  });

  it('logs start and success', async () => {
    const logger = makeMockLogger();
    // child returns the same mock so logToolStart/logToolSuccess call it
    const handler = (): Promise<string> => Promise.resolve('ok');

    const wrapped = withLogging('my_tool', handler, logger);
    await wrapped({});

    // createToolLogger calls child, logToolStart/Success call info
    expect(logger.child).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it('logs error and rethrows on failure', async () => {
    const logger = makeMockLogger();
    const handler = (): Promise<string> => Promise.reject(new Error('boom'));

    const wrapped = withLogging('my_tool', handler, logger);

    await expect(wrapped({})).rejects.toThrow('boom');
    expect(logger.error).toHaveBeenCalled();
  });

  it('wraps non-Error throws', async () => {
    const logger = makeMockLogger();
    const handler = (): Promise<string> => Promise.reject(new Error('string error'));

    const wrapped = withLogging('my_tool', handler, logger);

    await expect(wrapped({})).rejects.toThrow('string error');
  });
});
