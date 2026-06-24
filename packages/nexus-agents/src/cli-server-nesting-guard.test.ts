/**
 * Tests for the nested-MCP-server deadlock guard (#4033).
 *
 * @module cli-server-nesting-guard.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { ILogger } from './core/index.js';
import { exitIfNestedSubprocessServer } from './cli-server-nesting-guard.js';

function makeLogger(): ILogger {
  const logger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
    setLevel: vi.fn(),
  };
  return logger;
}

describe('exitIfNestedSubprocessServer (#4033)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('NEXUS_SUBPROCESS_DEPTH', undefined);
    // Swallow exit so the test process survives; record the call.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is a no-op at the top level (no marker → never exits)', () => {
    const logger = makeLogger();
    exitIfNestedSubprocessServer(logger);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not exit when the marker is explicitly 0', () => {
    vi.stubEnv('NEXUS_SUBPROCESS_DEPTH', '0');
    exitIfNestedSubprocessServer(makeLogger());
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('warns and exits cleanly (code 0) when nested (depth >= 1)', () => {
    vi.stubEnv('NEXUS_SUBPROCESS_DEPTH', '1');
    const logger = makeLogger();
    exitIfNestedSubprocessServer(logger);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.warn).mock.calls[0]?.[0]).toContain('nested nexus-agents MCP server');
  });

  it('ignores junk marker values (treated as top-level)', () => {
    vi.stubEnv('NEXUS_SUBPROCESS_DEPTH', 'not-a-number');
    exitIfNestedSubprocessServer(makeLogger());
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
