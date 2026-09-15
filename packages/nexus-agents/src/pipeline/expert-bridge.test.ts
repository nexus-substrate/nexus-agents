/**
 * Tests for expert-bridge workspace and token-usage propagation (#6358, #3396).
 *
 * Router and MCP-config mocks expose the task options sent by executeExpert.
 * Pure reducer tests cover what `ExpertBridgeResult` carries for token usage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeTaskMock } = vi.hoisted(() => ({ executeTaskMock: vi.fn() }));
vi.mock('../cli-adapters/factory.js', () => ({
  createAllAdapters: () => new Map([['claude', {}]]),
}));
vi.mock('../cli-adapters/composite-router.js', () => ({
  createCompositeRouter: () => ({ executeTask: executeTaskMock }),
}));
vi.mock('../cli-adapters/cli-circuit-breaker.js', () => ({
  createCliCircuitBreakerIntegration: () => ({
    getHealthStatus: () => ({ systemHealthy: true, healthyCount: 1, clis: [] }),
  }),
}));
vi.mock('../cli-adapters/child-mcp-config.js', () => ({
  generateMcpConfig: () => Promise.resolve({ configPath: '/tmp/mcp.json', cleanup: vi.fn() }),
}));

import { executeExpert, totalTokensFromUsage, tokenSplitFromUsage } from './expert-bridge.js';

describe('executeExpert workspace (#6358)', () => {
  beforeEach(() => {
    executeTaskMock.mockReset();
    executeTaskMock.mockResolvedValue({ ok: true, value: { text: 'reviewed' } });
  });

  it('forwards the workspace to the router without dropping the MCP config', async () => {
    const result = await executeExpert('architecture', 'review the head', {
      workDir: '/tmp/vote-scratch',
    });

    expect(result.success).toBe(true);
    expect(executeTaskMock).toHaveBeenCalledWith({
      content: expect.stringContaining('review the head'),
      options: { mcpConfigPath: '/tmp/mcp.json', workDir: '/tmp/vote-scratch' },
    });
  });

  it('keeps the existing task options when no workspace is supplied', async () => {
    await executeExpert('architecture', 'review the proposal');

    expect(executeTaskMock).toHaveBeenCalledWith({
      content: expect.stringContaining('review the proposal'),
      options: { mcpConfigPath: '/tmp/mcp.json' },
    });
  });
});

describe('totalTokensFromUsage (#3396)', () => {
  it('returns undefined when no usage was reported', () => {
    // CLI-subprocess paths whose extractUsage() returns null land here — the
    // caller must distinguish "unknown" from a real (never-zero) call.
    expect(totalTokensFromUsage(undefined)).toBeUndefined();
  });

  it('prefers the reported totalTokens when present', () => {
    expect(totalTokensFromUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 160 })).toBe(
      160
    );
  });

  it('falls back to input + output when totalTokens is absent', () => {
    expect(totalTokensFromUsage({ inputTokens: 100, outputTokens: 50 })).toBe(150);
  });

  it('honours a reported totalTokens of 0 (does not fall back)', () => {
    // An explicit 0 total is respected; only a missing total triggers the sum.
    expect(totalTokensFromUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })).toBe(0);
  });

  it('returns undefined when input+output sum to zero (no real signal)', () => {
    expect(totalTokensFromUsage({ inputTokens: 0, outputTokens: 0 })).toBeUndefined();
  });

  it('treats missing input/output fields as zero', () => {
    expect(totalTokensFromUsage({ outputTokens: 42 })).toBe(42);
    expect(totalTokensFromUsage({ inputTokens: 7 })).toBe(7);
  });
});

describe('tokenSplitFromUsage (#3387)', () => {
  it('returns undefined when no usage was reported', () => {
    // No usage → no meaningful model.called event (skip, don't emit zeros).
    expect(tokenSplitFromUsage(undefined)).toBeUndefined();
  });

  it('returns the input/output split when usage is present', () => {
    expect(tokenSplitFromUsage({ inputTokens: 100, outputTokens: 50 })).toEqual({
      tokensIn: 100,
      tokensOut: 50,
    });
  });

  it('ignores totalTokens — the split carries the per-direction counts', () => {
    expect(tokenSplitFromUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 160 })).toEqual({
      tokensIn: 100,
      tokensOut: 50,
    });
  });

  it('treats missing input/output fields as zero within a present record', () => {
    expect(tokenSplitFromUsage({ outputTokens: 42 })).toEqual({ tokensIn: 0, tokensOut: 42 });
    expect(tokenSplitFromUsage({ inputTokens: 7 })).toEqual({ tokensIn: 7, tokensOut: 0 });
  });

  it('returns undefined when both directions sum to zero (no real signal)', () => {
    // Mirrors totalTokensFromUsage: a 0+0 record is not a real call.
    expect(tokenSplitFromUsage({ inputTokens: 0, outputTokens: 0 })).toBeUndefined();
  });

  it('reconciles with totalTokensFromUsage (single source of truth)', () => {
    const usage = { inputTokens: 100, outputTokens: 50 };
    const split = tokenSplitFromUsage(usage);
    expect((split?.tokensIn ?? 0) + (split?.tokensOut ?? 0)).toBe(totalTokensFromUsage(usage));
  });
});
