/**
 * Tests for Gateway Middleware
 * @module mcp/gateway/gateway-middleware.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GatewayToolResult, GatewayLogEntry } from './gateway-middleware.js';
import { createGateway, type GatewayConfig } from './gateway-middleware.js';
import { RequestTier } from './tier-classifier.js';

// ============================================================================
// Test Helpers
// ============================================================================

function successResult(text = 'ok'): GatewayToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(text = 'fail'): GatewayToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

// ============================================================================
// createGateway
// ============================================================================

describe('createGateway', () => {
  it('returns a gateway instance', () => {
    const gw = createGateway();
    expect(gw.enabled).toBe(true);
    expect(typeof gw.wrapTool).toBe('function');
  });

  it('defaults to enabled', () => {
    expect(createGateway().enabled).toBe(true);
    expect(createGateway({}).enabled).toBe(true);
  });

  it('can be disabled', () => {
    const gw = createGateway({ enabled: false });
    expect(gw.enabled).toBe(false);
  });
});

// ============================================================================
// wrapTool — disabled gateway
// ============================================================================

describe('wrapTool (disabled)', () => {
  it('returns the original handler unchanged', () => {
    const gw = createGateway({ enabled: false });
    const handler = vi.fn().mockResolvedValue(successResult());
    const wrapped = gw.wrapTool('test_tool', handler);
    expect(wrapped).toBe(handler);
  });
});

// ============================================================================
// wrapTool — enabled gateway
// ============================================================================

describe('wrapTool (enabled)', () => {
  let logger: ReturnType<typeof createMockLogger>;
  let config: GatewayConfig;

  beforeEach(() => {
    logger = createMockLogger();
    config = { logger: logger as never };
  });

  it('calls the underlying handler', async () => {
    const gw = createGateway(config);
    const handler = vi.fn().mockResolvedValue(successResult());
    const wrapped = gw.wrapTool('list_experts', handler);

    await wrapped({ format: 'full' });

    expect(handler).toHaveBeenCalledWith({ format: 'full' });
  });

  it('returns the handler result', async () => {
    const gw = createGateway(config);
    const expected = successResult('hello');
    const wrapped = gw.wrapTool('list_experts', vi.fn().mockResolvedValue(expected));

    const result = await wrapped({});
    expect(result).toBe(expected);
  });

  it('logs dispatch at debug level', async () => {
    const gw = createGateway(config);
    const wrapped = gw.wrapTool('list_experts', vi.fn().mockResolvedValue(successResult()));

    await wrapped({});

    expect(logger.debug).toHaveBeenCalledWith(
      'Gateway dispatch',
      expect.objectContaining({ tool: 'list_experts', tier: RequestTier.DIRECT })
    );
  });

  it('logs successful completion at info level', async () => {
    const gw = createGateway(config);
    const wrapped = gw.wrapTool('list_experts', vi.fn().mockResolvedValue(successResult()));

    await wrapped({});

    expect(logger.info).toHaveBeenCalledWith(
      'Gateway completed',
      expect.objectContaining({
        tool: 'list_experts',
        tier: RequestTier.DIRECT,
        tierName: 'DIRECT',
        success: true,
      })
    );
  });

  it('logs error results at warn level', async () => {
    const gw = createGateway(config);
    const wrapped = gw.wrapTool('list_experts', vi.fn().mockResolvedValue(errorResult()));

    await wrapped({});

    expect(logger.warn).toHaveBeenCalledWith(
      'Gateway completed with error',
      expect.objectContaining({ success: false })
    );
  });

  it('logs thrown errors at error level', async () => {
    const gw = createGateway(config);
    const err = new Error('boom');
    const wrapped = gw.wrapTool('list_experts', vi.fn().mockRejectedValue(err));

    await expect(wrapped({})).rejects.toThrow('boom');

    expect(logger.error).toHaveBeenCalledWith(
      'Gateway handler threw',
      err,
      expect.objectContaining({ success: false })
    );
  });

  it('re-throws handler errors', async () => {
    const gw = createGateway(config);
    const wrapped = gw.wrapTool('list_experts', vi.fn().mockRejectedValue(new Error('fail')));

    await expect(wrapped({})).rejects.toThrow('fail');
  });

  it('includes duration in log entry', async () => {
    const gw = createGateway(config);
    const wrapped = gw.wrapTool('list_experts', vi.fn().mockResolvedValue(successResult()));

    await wrapped({});

    const logCall = logger.info.mock.calls[0] as [string, GatewayLogEntry];
    expect(logCall[1].durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Tier classification integration
// ============================================================================

describe('tier classification', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it('classifies Tier 1 tools as DIRECT', async () => {
    const gw = createGateway({ logger: logger as never });
    const wrapped = gw.wrapTool('memory_query', vi.fn().mockResolvedValue(successResult()));

    await wrapped({ query: 'test' });

    expect(logger.debug).toHaveBeenCalledWith(
      'Gateway dispatch',
      expect.objectContaining({ tier: RequestTier.DIRECT, tierName: 'DIRECT' })
    );
  });

  it('classifies Tier 2 tools as ANALYZED', async () => {
    const gw = createGateway({ logger: logger as never });
    const wrapped = gw.wrapTool('delegate_to_model', vi.fn().mockResolvedValue(successResult()));

    await wrapped({ task: 'write hello world' });

    expect(logger.debug).toHaveBeenCalledWith(
      'Gateway dispatch',
      expect.objectContaining({ tier: RequestTier.ANALYZED, tierName: 'ANALYZED' })
    );
  });

  it('classifies Tier 3 tools as ORCHESTRATED', async () => {
    const gw = createGateway({ logger: logger as never });
    const wrapped = gw.wrapTool('orchestrate', vi.fn().mockResolvedValue(successResult()));

    await wrapped({ task: 'build a feature' });

    expect(logger.debug).toHaveBeenCalledWith(
      'Gateway dispatch',
      expect.objectContaining({ tier: RequestTier.ORCHESTRATED, tierName: 'ORCHESTRATED' })
    );
  });

  it('promotes security tasks to Tier 3', async () => {
    const gw = createGateway({ logger: logger as never });
    const wrapped = gw.wrapTool('delegate_to_model', vi.fn().mockResolvedValue(successResult()));

    await wrapped({ task: 'audit for security vulnerabilities' });

    expect(logger.debug).toHaveBeenCalledWith(
      'Gateway dispatch',
      expect.objectContaining({ tier: RequestTier.ORCHESTRATED })
    );
  });
});

// ============================================================================
// Tier overrides
// ============================================================================

describe('tier overrides', () => {
  it('respects tier override config', async () => {
    const logger = createMockLogger();
    const gw = createGateway({
      logger: logger as never,
      tierOverrides: { delegate_to_model: RequestTier.ORCHESTRATED },
    });
    const wrapped = gw.wrapTool('delegate_to_model', vi.fn().mockResolvedValue(successResult()));

    await wrapped({ task: 'simple task' });

    expect(logger.debug).toHaveBeenCalledWith(
      'Gateway dispatch',
      expect.objectContaining({ tier: RequestTier.ORCHESTRATED })
    );
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('edge cases', () => {
  it('handles null args gracefully', async () => {
    const logger = createMockLogger();
    const gw = createGateway({ logger: logger as never });
    const wrapped = gw.wrapTool('list_experts', vi.fn().mockResolvedValue(successResult()));

    await wrapped(null);

    expect(logger.info).toHaveBeenCalledWith(
      'Gateway completed',
      expect.objectContaining({ success: true })
    );
  });

  it('handles non-object args gracefully', async () => {
    const logger = createMockLogger();
    const gw = createGateway({ logger: logger as never });
    const wrapped = gw.wrapTool('list_experts', vi.fn().mockResolvedValue(successResult()));

    await wrapped('not an object');

    expect(logger.info).toHaveBeenCalledWith(
      'Gateway completed',
      expect.objectContaining({ success: true })
    );
  });

  it('handles unknown tool names', async () => {
    const logger = createMockLogger();
    const gw = createGateway({ logger: logger as never });
    const wrapped = gw.wrapTool('unknown_tool', vi.fn().mockResolvedValue(successResult()));

    await wrapped({});

    // Unknown tools default to ANALYZED tier
    expect(logger.debug).toHaveBeenCalledWith(
      'Gateway dispatch',
      expect.objectContaining({ tier: RequestTier.ANALYZED })
    );
  });
});
