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
 * #2703 extended the wrapper to ALSO record each mismatch event to a
 * queryable JSONL at `$NEXUS_DATA_DIR/mcp-telemetry/timeout-mismatch-events.jsonl`
 * with a correlation `eventId` shared with the WARN log entry — so the
 * #2631 epic gate ("does client-config mismatch dominate timeouts?") can
 * be answered by joining events against outcomes, not just counted.
 *
 * @module mcp/middleware/tool-wrapper-budget-check.test
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ILogger } from '../../core/index.js';
import {
  MCP_SDK_DEFAULT_REQUEST_TIMEOUT_MS,
  TIMEOUT_MISMATCH_TELEMETRY_REL_PATH,
  toSdkCallbackWithBudgetCheck,
  type TimeoutMismatchEvent,
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

/** Override $NEXUS_DATA_DIR per test so the JSONL writes land in a tmpdir. */
let prevDataDir: string | undefined;
let testDataDir: string;
beforeEach(() => {
  prevDataDir = process.env['NEXUS_DATA_DIR'];
  testDataDir = mkdtempSync(join(tmpdir(), 'nexus-budget-check-'));
  process.env['NEXUS_DATA_DIR'] = testDataDir;
});
afterEach(() => {
  if (prevDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
  else process.env['NEXUS_DATA_DIR'] = prevDataDir;
  rmSync(testDataDir, { recursive: true, force: true });
});

function readEvents(): TimeoutMismatchEvent[] {
  const path = join(testDataDir, TIMEOUT_MISMATCH_TELEMETRY_REL_PATH);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TimeoutMismatchEvent);
}

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
    expect(readEvents()).toHaveLength(0);
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
    expect(readEvents()).toHaveLength(0);
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
    // #2703: the WARN log carries the correlation eventId that the recorded
    // event will share.
    expect(typeof ctx['eventId']).toBe('string');
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

describe('toSdkCallbackWithBudgetCheck #2703 telemetry — correlation-keyed JSONL', () => {
  it('records a success event with eventId matching the WARN log', async () => {
    const logger = makeMockLogger();
    const callback = toSdkCallbackWithBudgetCheck(
      passthroughHandler,
      'consensus_vote',
      600_000,
      logger
    );

    await callback({}, { _meta: {} });

    const events = readEvents();
    expect(events).toHaveLength(1);
    const event = events[0]!;
    const [, logCtx] = logger.warn.mock.calls[0] as [string, Record<string, unknown>];
    // Same eventId in both places — the join key the Epic #2631 gate needs.
    expect(event.eventId).toBe(logCtx['eventId']);
    expect(event.toolName).toBe('consensus_vote');
    expect(event.configuredTimeoutMs).toBe(600_000);
    expect(event.mcpSdkDefaultMs).toBe(MCP_SDK_DEFAULT_REQUEST_TIMEOUT_MS);
    expect(event.outcome).toBe('success');
    expect(event.errorCategory).toBeUndefined();
    expect(event.errorMessage).toBeUndefined();
    expect(typeof event.startedAt).toBe('string');
    expect(typeof event.endedAt).toBe('string');
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records an error event with errorCategory from the post-#2649 envelope', async () => {
    // Handler returns the post-#2649 structured-error shape: isError:true plus
    // the envelope in _meta['nexus-agents/error'].
    const errorHandler = (): Promise<{
      content: Array<{ type: 'text'; text: string }>;
      isError: boolean;
      _meta: Record<string, unknown>;
    }> =>
      Promise.resolve({
        content: [{ type: 'text', text: 'CLI subprocess timed out after 600000ms' }],
        isError: true,
        _meta: {
          'nexus-agents/error': {
            errorCategory: 'timeout',
            isRetryable: true,
            message: 'CLI timeout',
          },
        },
      });
    const logger = makeMockLogger();
    const callback = toSdkCallbackWithBudgetCheck(errorHandler, 'consensus_vote', 600_000, logger);

    await callback({}, { _meta: {} });

    const events = readEvents();
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.outcome).toBe('error');
    expect(event.errorCategory).toBe('timeout');
    expect(event.errorMessage).toContain('timed out after 600000ms');
  });

  it('records an error event when the handler throws', async () => {
    const throwingHandler = (): Promise<never> => {
      throw new Error('handler exploded');
    };
    const logger = makeMockLogger();
    const callback = toSdkCallbackWithBudgetCheck(
      throwingHandler,
      'consensus_vote',
      600_000,
      logger
    );

    await expect(callback({}, { _meta: {} })).rejects.toThrow('handler exploded');

    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.outcome).toBe('error');
    expect(events[0]!.errorMessage).toBe('handler exploded');
    expect(events[0]!.errorCategory).toBeUndefined();
  });

  it('records nothing when no mismatch fires (the non-mismatch path stays silent)', async () => {
    const logger = makeMockLogger();
    const callback = toSdkCallbackWithBudgetCheck(
      passthroughHandler,
      'short_tool',
      MCP_SDK_DEFAULT_REQUEST_TIMEOUT_MS - 1_000,
      logger
    );

    await callback({}, { _meta: {} });

    expect(readEvents()).toHaveLength(0);
  });

  it('eventIds are unique across mismatched calls', async () => {
    const logger = makeMockLogger();
    const callback = toSdkCallbackWithBudgetCheck(
      passthroughHandler,
      'consensus_vote',
      600_000,
      logger
    );

    await callback({}, { _meta: {} });
    await callback({}, { _meta: {} });

    const events = readEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.eventId).not.toBe(events[1]!.eventId);
  });
});
