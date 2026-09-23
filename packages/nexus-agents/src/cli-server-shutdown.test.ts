/**
 * Tests for the server-mode shutdown order (#6573 item 2).
 *
 * Before #6573 the cleanup closed the audit logger first and the MCP server
 * last, so a tool call that finished in between logged into a closed logger and
 * its audit event was dropped ("Attempted to log after close").
 *
 * @module cli-server-shutdown.test
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createShutdownCleanup,
  trackInFlightToolCalls,
  TOOL_CALL_DRAIN_TIMEOUT_MS,
} from './cli-server-shutdown.js';
import { initializeSwarmObserver, recordServerStartup } from './cli-server-lifecycle.js';
import { createAuditLogger, type AuditLogger } from './audit/index.js';
import { connectTransport, createServer } from './mcp/index.js';
import type { ILogger } from './core/index.js';

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as ILogger;
}

interface AuditLine {
  readonly action?: unknown;
  readonly toolName?: unknown;
  readonly metadata?: Record<string, unknown>;
}

function readAuditLines(dir: string): AuditLine[] {
  const lines: AuditLine[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (line.trim() !== '') lines.push(JSON.parse(line) as AuditLine);
    }
  }
  return lines;
}

function newServer(logger: ILogger): McpServer {
  const result = createServer({ name: 'shutdown-order-test', version: '0.0.0', logger });
  if (!result.ok) throw new Error(result.error.message);
  return result.value.server;
}

/**
 * How long the in-flight tool keeps running after its signal aborts. Longer
 * than the rest of the teardown takes, so without the drain the audit logger
 * closes first.
 */
const WIND_DOWN_MS = 200;

/** Resolves when `signal` aborts (the transport closing aborts it). */
function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve();
    else
      signal.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true }
      );
  });
}

describe('createShutdownCleanup order (#6573)', () => {
  let auditDir: string;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    auditDir = mkdtempSync(join(tmpdir(), 'nexus-6573-order-'));
    auditLogger = createAuditLogger(
      {
        logDir: auditDir,
        filePrefix: 'audit',
        maxFileSizeBytes: 10 * 1024 * 1024,
        maxFiles: 10,
        enableHashChain: true,
        enableCompression: false,
        // Far beyond the test's lifetime: only close() can persist.
        flushIntervalMs: 60_000,
        maxQueueDepth: 10_000,
        minSeverity: 'info',
      },
      undefined,
      createMockLogger()
    );
  });

  afterEach(async () => {
    await auditLogger.close();
    rmSync(auditDir, { recursive: true, force: true });
  });

  it('persists the audit event of a tool call still running when shutdown starts', async () => {
    const logger = createMockLogger();
    const server = newServer(logger);
    const inFlightToolCalls = trackInFlightToolCalls(server);

    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    // Finishes only once the server stops (its signal aborts), and then some
    // wind-down later, before auditing — a call that completes in the middle
    // of shutdown, which only the drain waits for.
    server.registerTool('in_flight_tool', { description: 'test' }, async (extra) => {
      markStarted();
      await untilAborted(extra.signal);
      await new Promise((resolve) => setTimeout(resolve, WIND_DOWN_MS));
      auditLogger.logToolInvocation({
        toolName: 'in_flight_tool',
        outcome: 'success',
        actor: { type: 'system', id: 'test' },
      });
      return { content: [{ type: 'text', text: 'done' }] };
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const connected = await connectTransport(server, serverTransport, logger);
    if (!connected.ok) throw new Error(connected.error.message);
    const client = new Client({ name: 'shutdown-order-test', version: '0.0.0' });
    await client.connect(clientTransport);

    const call = client.callTool({ name: 'in_flight_tool', arguments: {} }).catch(() => undefined);
    await started;
    expect(inFlightToolCalls.size()).toBe(1);

    const observer = initializeSwarmObserver(logger);
    const cleanup = createShutdownCleanup({
      eventBusBridge: { initialized: false, subscriptionCount: 0, cleanup: () => undefined },
      observer,
      eventContext: recordServerStartup(observer),
      server,
      serverLogger: logger,
      logger,
      auditLogger,
      inFlightToolCalls,
      // Far above WIND_DOWN_MS, so a loaded CI box cannot make it time out.
      drainTimeoutMs: 10_000,
    });
    await cleanup();
    await call;

    const lines = readAuditLines(auditDir);
    const actions = lines.map((l) => l.action);
    expect(actions).toContain('tool.invoke');
    expect(actions).toContain('system.shutdown.begin');
    // The logger closed last: the tool event is not after the close.
    expect(actions.indexOf('tool.invoke')).toBeLessThan(actions.indexOf('system.shutdown.begin'));
    const begin = lines.find((l) => l.action === 'system.shutdown.begin');
    expect(begin?.metadata?.['toolCallsStillRunning']).toBe(0);
  });
});

describe('trackInFlightToolCalls (#6573)', () => {
  it('drains to 0 immediately when nothing is running (empty case)', async () => {
    const tracker = trackInFlightToolCalls(newServer(createMockLogger()));
    expect(tracker.size()).toBe(0);
    expect(await tracker.drain(TOOL_CALL_DRAIN_TIMEOUT_MS)).toBe(0);
  });

  it('reports the calls still running when the drain bound elapses', async () => {
    const logger = createMockLogger();
    const server = newServer(logger);
    const tracker = trackInFlightToolCalls(server);
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let release!: () => void;
    server.registerTool('stuck_tool', { description: 'test' }, async () => {
      markStarted();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { content: [{ type: 'text', text: 'late' }] };
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const connected = await connectTransport(server, serverTransport, logger);
    if (!connected.ok) throw new Error(connected.error.message);
    const client = new Client({ name: 'drain-test', version: '0.0.0' });
    await client.connect(clientTransport);

    const call = client.callTool({ name: 'stuck_tool', arguments: {} });
    await started;
    expect(await tracker.drain(20)).toBe(1);

    release();
    const result = await call;
    // The wrapper passes the handler's own result through unchanged.
    expect(result.content).toEqual([{ type: 'text', text: 'late' }]);
    expect(await tracker.drain(TOOL_CALL_DRAIN_TIMEOUT_MS)).toBe(0);
    await client.close();
  });
});
