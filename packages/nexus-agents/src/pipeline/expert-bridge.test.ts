/**
 * Tests for expert-bridge workspace and token-usage propagation (#6358, #3396).
 *
 * Router and MCP-config mocks expose the task options sent by executeExpert.
 * Pure reducer tests cover what `ExpertBridgeResult` carries for token usage.
 */
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

import { GatewayRediscovery, setGatewayRediscovery } from '../adapters/gateway-rediscovery.js';
import type { ILogger, IModelAdapter } from '../core/index.js';

const { executeTaskMock, createAllAdaptersMock, servedByBuild } = vi.hoisted(() => ({
  executeTaskMock: vi.fn(),
  createAllAdaptersMock: vi.fn(() => new Map([['claude', {}]])),
  servedByBuild: [] as number[],
}));
vi.mock('../cli-adapters/factory.js', () => ({
  createAllAdapters: createAllAdaptersMock,
}));
vi.mock('../cli-adapters/composite-router.js', () => ({
  createCompositeRouter: () => {
    // Tag each built router so a test can tell which build served a call.
    const build = createAllAdaptersMock.mock.calls.length;
    return {
      executeTask: (task: unknown, ...execution: unknown[]): unknown => {
        servedByBuild.push(build);
        return executeTaskMock(task, ...execution);
      },
    };
  },
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

describe('executeExpert access mode validation (#6768)', () => {
  beforeEach(() => {
    executeTaskMock.mockReset();
    executeTaskMock.mockResolvedValue({ ok: true, value: { text: 'reviewed' } });
  });

  it('throws on a misspelled mode instead of running with default access and MCP', async () => {
    const options = { accessMode: 'read-only' } as unknown as Parameters<typeof executeExpert>[2];

    await expect(executeExpert('qa', 'review it', options)).rejects.toThrow(
      /unknown accessMode "read-only"; expected one of default, read-only-analysis/
    );
    expect(executeTaskMock).not.toHaveBeenCalled();
  });

  it('accepts the read-only mode and drops the MCP config', async () => {
    await executeExpert('qa', 'review it', { accessMode: 'read-only-analysis' });

    expect(executeTaskMock).toHaveBeenCalledWith({
      content: expect.stringContaining('review it'),
      accessMode: 'read-only-analysis',
    });
  });

  it('accepts an explicit default mode and keeps the MCP config', async () => {
    await executeExpert('code', 'implement it', { accessMode: 'default' });

    expect(executeTaskMock).toHaveBeenCalledWith({
      content: expect.stringContaining('implement it'),
      options: { mcpConfigPath: '/tmp/mcp.json' },
      accessMode: 'default',
    });
  });
});

describe('executeExpert abort signal (#6736)', () => {
  beforeEach(() => {
    executeTaskMock.mockReset();
  });

  it('hands the signal to the routed call', async () => {
    executeTaskMock.mockResolvedValue({ ok: true, value: { text: 'done' } });
    const signal = new AbortController().signal;

    await executeExpert('code', 'implement it', { signal });

    expect(executeTaskMock).toHaveBeenCalledWith(expect.anything(), { signal });
  });

  it('does not retry a rate-limited call once the signal has fired', async () => {
    const controller = new AbortController();
    executeTaskMock.mockImplementation(() => {
      controller.abort();
      return Promise.resolve({ ok: false, error: { message: 'rate limit exceeded (429)' } });
    });

    const result = await executeExpert('code', 'implement it', { signal: controller.signal });

    expect(result.success).toBe(false);
    expect(executeTaskMock).toHaveBeenCalledTimes(1);
  });
});

describe('executeExpert served gateway arm (#6624)', () => {
  beforeEach(() => {
    executeTaskMock.mockReset();
  });

  it('carries the gateway arm that served the model', async () => {
    executeTaskMock.mockResolvedValue({
      ok: true,
      value: {
        text: 'done',
        model: 'acme/claude-like-1',
        routedCli: 'claude',
        gatewayArm: 'api:custom-openai',
      },
    });
    const result = await executeExpert('code', 'write it');
    expect(result.model).toBe('acme/claude-like-1');
    expect(result.gatewayArm).toBe('api:custom-openai');
  });

  it('carries no gateway arm when the response names none', async () => {
    executeTaskMock.mockResolvedValue({
      ok: true,
      value: { text: 'done', model: 'claude-opus', routedCli: 'claude' },
    });
    const result = await executeExpert('code', 'write it');
    expect('gatewayArm' in result).toBe(false);
  });
});

describe('executeExpert routed marker (#6521)', () => {
  beforeEach(() => {
    executeTaskMock.mockReset();
  });

  it('tags a result the router names an arm for as routed', async () => {
    executeTaskMock.mockResolvedValue({
      ok: true,
      value: { text: 'done', model: 'claude-opus', routedCli: 'claude' },
    });
    const result = await executeExpert('code', 'write it');
    expect(result.success).toBe(true);
    expect(result.routedBy).toBe('composite-router');
  });

  it('attributes the routed CLI when the adapter reports no model', async () => {
    // CLI subprocess adapters return no `model`; before #6521 the bridge then
    // had no cli and the pipeline dropped the routed outcome entirely.
    executeTaskMock.mockResolvedValue({ ok: true, value: { text: 'done', routedCli: 'codex' } });
    const result = await executeExpert('code', 'write it');
    expect(result.cli).toBe('codex');
    expect(result.routedBy).toBe('composite-router');
  });

  it('attributes the routed arm, not the model string, when they disagree (#6521 I3)', async () => {
    // An api:custom-openai arm shows as the opencode slot while serving a GPT
    // model, which the registry maps to codex. The arm that ran is authoritative.
    executeTaskMock.mockResolvedValue({
      ok: true,
      value: { text: 'done', model: 'gpt-5.5', routedCli: 'opencode', routedDurationMs: 40 },
    });
    const result = await executeExpert('code', 'write it');
    expect(result.cli).toBe('opencode');
    expect(result.routedDurationMs).toBe(40);
  });

  it('derives the CLI from the model, untagged, when no routed arm is reported', async () => {
    executeTaskMock.mockResolvedValue({ ok: true, value: { text: 'done', model: 'gemini-3-pro' } });
    const result = await executeExpert('code', 'write it');
    expect(result.cli).toBe('gemini');
    // Nothing shows the router picked this CLI, so the row is not routed.
    expect(result.routedBy).toBeUndefined();
  });

  it('attributes a routed FAILURE to the arm that ran (#6521 I1)', async () => {
    executeTaskMock.mockResolvedValue({
      ok: false,
      error: { message: 'adapter crashed', routedCli: 'codex', routedDurationMs: 25 },
    });
    const result = await executeExpert('code', 'write it');
    expect(result.success).toBe(false);
    expect(result.cli).toBe('codex');
    expect(result.routedBy).toBe('composite-router');
    expect(result.routedDurationMs).toBe(25);
  });

  it('does not tag a failure where routing chose no arm', async () => {
    // CompositeRoutingError: routing failed before any arm ran.
    executeTaskMock.mockResolvedValue({ ok: false, error: { message: 'boom' } });
    const result = await executeExpert('code', 'write it');
    expect(result.success).toBe(false);
    expect(result.routedBy).toBeUndefined();
    expect(result.cli).toBeUndefined();
  });
});

describe('executeExpert router after a late gateway discovery (#6667)', () => {
  const logger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
    child: (): ILogger => logger,
  };

  function armRediscovery(discover: () => Promise<readonly IModelAdapter[] | undefined>): void {
    setGatewayRediscovery(
      new GatewayRediscovery({ target: [], discover, logger, minIntervalMs: 0, lastAttemptAt: 0 })
    );
  }

  beforeEach(() => {
    executeTaskMock.mockReset();
    executeTaskMock.mockResolvedValue({ ok: true, value: { text: 'done' } });
    setGatewayRediscovery(undefined);
  });

  afterEach(() => {
    setGatewayRediscovery(undefined);
  });

  it('keeps one router across calls when no gateway re-discovery is armed', async () => {
    await executeExpert('code', 'warm the cache');
    const builds = createAllAdaptersMock.mock.calls.length;

    await executeExpert('code', 'again');
    await executeExpert('code', 'and again');

    expect(createAllAdaptersMock.mock.calls.length).toBe(builds);
  });

  it('rebuilds the cached router once a late discovery lands, and serves from the new one', async () => {
    await executeExpert('code', 'built while the gateway is down');
    const staleBuild = createAllAdaptersMock.mock.calls.length;
    const discover = vi.fn(() => Promise.resolve([{} as IModelAdapter]));
    armRediscovery(discover);
    servedByBuild.length = 0;

    await executeExpert('code', 'after the gateway came up');
    await executeExpert('code', 'and once more');

    // The expert stage itself triggered discovery; nothing else ran it.
    expect(discover).toHaveBeenCalledTimes(1);
    // Rebuilt exactly once, and both calls ran on the rebuilt router.
    expect(createAllAdaptersMock.mock.calls.length).toBe(staleBuild + 1);
    expect(servedByBuild).toEqual([staleBuild + 1, staleBuild + 1]);
  });

  it('keeps the cached router when re-discovery finds no gateway', async () => {
    await executeExpert('code', 'warm the cache');
    const builds = createAllAdaptersMock.mock.calls.length;
    const discover = vi.fn(() => Promise.resolve(undefined));
    armRediscovery(discover);

    await executeExpert('code', 'gateway still down');

    expect(discover).toHaveBeenCalledTimes(1);
    expect(createAllAdaptersMock.mock.calls.length).toBe(builds);
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
