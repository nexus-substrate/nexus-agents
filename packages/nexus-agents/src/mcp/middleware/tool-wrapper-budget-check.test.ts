/**
 * Tests for `toSdkCallbackWithBudgetCheck` (audit on #2619 / #2631).
 *
 * The WARN fires when a long-running tool is invoked without `progressToken`
 * in the request's `_meta`. That mismatch means the MCP client will kill the
 * request at its default ~60s timeout regardless of what the server-side
 * timeout config says. These tests pin the three cases the matcher has to
 * cover: short-budget tool (no warn), long-budget with progressToken (no
 * warn), long-budget without progressToken (warn).
 *
 * @module mcp/middleware/tool-wrapper-budget-check.test
 */

import { describe, expect, it, vi } from 'vitest';

import type { ILogger } from '../../core/index.js';
import {
  MCP_SDK_DEFAULT_REQUEST_TIMEOUT_MS,
  toSdkCallbackWithBudgetCheck,
} from './tool-wrapper.js';

function makeMockLogger(): ILogger & { warn: ReturnType<typeof vi.fn> } {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger & { warn: ReturnType<typeof vi.fn> };
}

const passthroughHandler = (): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> => Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });

describe('toSdkCallbackWithBudgetCheck (#2619 / #2631 audit)', () => {
  it('does not warn when configured budget fits within MCP SDK default', async () => {
    const logger = makeMockLogger();
    const callback = toSdkCallbackWithBudgetCheck(
      passthroughHandler,
      'short_tool',
      MCP_SDK_DEFAULT_REQUEST_TIMEOUT_MS - 1_000,
      logger
    );

    // No progressToken — but the budget fits, so the mismatch doesn't apply.
    await callback({}, { _meta: {} });

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not warn when client sent a progressToken (long budget OK)', async () => {
    const logger = makeMockLogger();
    const callback = toSdkCallbackWithBudgetCheck(passthroughHandler, 'long_tool', 600_000, logger);

    // The MCP SDK only sets _meta.progressToken when the caller passed
    // `onprogress`. Pair it with sendNotification so extractProgressContext
    // returns a non-undefined context.
    await callback(
      {},
      {
        _meta: { progressToken: 42 },
        sendNotification: () => Promise.resolve(),
      }
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns when configured budget exceeds MCP SDK default AND no progressToken', async () => {
    // This is the #2619 reporter's failure mode: server-side budget is 10
    // minutes for consensus_vote, but the client request times out at 60s
    // because no progressToken was sent.
    const logger = makeMockLogger();
    const callback = toSdkCallbackWithBudgetCheck(
      passthroughHandler,
      'consensus_vote',
      600_000,
      logger
    );

    await callback({}, { _meta: {} });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [message, ctx] = logger.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain('budget exceeds client default');
    expect(ctx['tool']).toBe('consensus_vote');
    expect(ctx['configuredTimeoutMs']).toBe(600_000);
    expect(ctx['mcpSdkDefaultMs']).toBe(MCP_SDK_DEFAULT_REQUEST_TIMEOUT_MS);
  });

  it('still invokes the underlying handler even when warning fires', async () => {
    const logger = makeMockLogger();
    const handler = vi.fn(passthroughHandler);
    const callback = toSdkCallbackWithBudgetCheck(handler, 'long_tool', 600_000, logger);

    const result = await callback({ key: 'value' }, { _meta: {} });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ key: 'value' });
    expect(result.content[0]?.text).toBe('ok');
  });
});
