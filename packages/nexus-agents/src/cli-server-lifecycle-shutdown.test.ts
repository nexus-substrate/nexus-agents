/**
 * Tests for the bounded graceful-shutdown path shared by the signal handlers
 * and the parent-death (stdin EOF) monitor (#6560).
 *
 * Before #6560, `watchParentProcess` called `process.exit(0)` directly, so a
 * host closing stdin skipped `shutdownAuditLogger`: the audit queue (flushed on
 * a 1 s interval) was dropped and `system.shutdown.begin` was never written.
 *
 * @module cli-server-lifecycle-shutdown.test
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGracefulShutdown, watchParentProcess } from './cli-server-lifecycle.js';
import { shutdownAuditLogger } from './cli-server-audit.js';
import { createAuditLogger, type AuditLogger } from './audit/index.js';
import { EXIT_CODES } from './cli-types.js';
import type { ILogger } from './core/index.js';

/**
 * SHUTDOWN_CLEANUP_TIMEOUT_MS in cli-server-lifecycle.ts (module-private).
 * Pinned here so changing how long an orphaned server may linger is a
 * deliberate, reviewed edit rather than a silent one.
 */
const DEFAULT_SHUTDOWN_BOUND_MS = 12_000;

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as ILogger;
}

/** A monitor double that hands back the registered parent-gone callback. */
function createFakeMonitor(): {
  monitor: NonNullable<Parameters<typeof watchParentProcess>[2]>;
  fireParentGone: () => Promise<void>;
  started: () => boolean;
} {
  let callback: (() => void | Promise<void>) | undefined;
  let isStarted = false;
  return {
    monitor: {
      start: () => {
        isStarted = true;
      },
      onClose: (cb) => {
        callback = cb;
      },
    },
    fireParentGone: async () => {
      if (callback === undefined) throw new Error('no parent-gone callback registered');
      await callback();
    },
    started: () => isStarted,
  };
}

/** Every `action` currently on disk in the audit dir, in file order. */
function readAuditActions(dir: string): string[] {
  const actions: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (line.trim() === '') continue;
      const record = JSON.parse(line) as { action?: unknown };
      if (typeof record.action === 'string') actions.push(record.action);
    }
  }
  return actions;
}

describe('watchParentProcess routes parent death through graceful shutdown (#6560)', () => {
  let auditDir: string;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    auditDir = mkdtempSync(join(tmpdir(), 'nexus-6560-'));
    auditLogger = createAuditLogger(
      {
        logDir: auditDir,
        filePrefix: 'audit',
        maxFileSizeBytes: 10 * 1024 * 1024,
        maxFiles: 10,
        enableHashChain: true,
        enableCompression: false,
        // Far beyond the test's lifetime: only an explicit flush can persist.
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

  it('starts the monitor', () => {
    const fake = createFakeMonitor();
    watchParentProcess(
      createMockLogger(),
      vi.fn(() => Promise.resolve()),
      fake.monitor
    );
    expect(fake.started()).toBe(true);
  });

  it('flushes the audit log (startup + shutdown.begin) BEFORE exiting on stdin end', async () => {
    const logger = createMockLogger();
    auditLogger.logSystemStartupBegin({ auditLogDir: auditDir, packageVersion: '0.0.0-test' });
    auditLogger.logSystemStartup({ mode: 'server', packageVersion: '0.0.0-test' });

    // Snapshot the file at the moment exit is requested: the records must
    // already be durable then, because a real process.exit ends everything.
    let actionsAtExit: string[] | undefined;
    const exit = vi.fn((_code: number) => {
      actionsAtExit = readAuditActions(auditDir);
    });

    const requestShutdown = createGracefulShutdown({
      cleanup: () => shutdownAuditLogger(auditLogger, logger),
      logger,
      exit,
    });
    const fake = createFakeMonitor();
    watchParentProcess(logger, requestShutdown, fake.monitor);

    expect(readAuditActions(auditDir)).toEqual([]);
    await fake.fireParentGone();

    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
    expect(actionsAtExit).toEqual([
      'system.startup.begin',
      'system.startup',
      'system.shutdown.begin',
    ]);
  });

  it('does not exit until the cleanup has settled', async () => {
    const logger = createMockLogger();
    let releaseCleanup!: () => void;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseCleanup = resolve;
        })
    );
    const exit = vi.fn();
    const fake = createFakeMonitor();
    watchParentProcess(logger, createGracefulShutdown({ cleanup, logger, exit }), fake.monitor);

    const fired = fake.fireParentGone();
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();

    releaseCleanup();
    await fired;
    expect(exit).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
  });
});

describe('createGracefulShutdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exits SHUTDOWN_ERROR within the bound when the audit flush hangs', async () => {
    vi.useFakeTimers();
    const logger = createMockLogger();
    // An audit logger whose final flush/close never settles (e.g. a wedged
    // disk, or a lock that is never released).
    const hungAudit = {
      logSystemShutdownBegin: vi.fn(),
      close: vi.fn(() => new Promise<void>(() => undefined)),
    } as unknown as AuditLogger;
    const cleanup = vi.fn(() => shutdownAuditLogger(hungAudit, logger));
    const exit = vi.fn();
    const timeoutMs = 500;

    const done = createGracefulShutdown({ cleanup, logger, exit, timeoutMs })('parent-gone');

    await vi.advanceTimersByTimeAsync(timeoutMs - 1);
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(EXIT_CODES.SHUTDOWN_ERROR);
    expect(logger.error).toHaveBeenCalledWith(
      'Shutdown cleanup timed out; exiting without completing it',
      expect.any(Error)
    );
  });

  it('defaults the bound to 12 s (SHUTDOWN_CLEANUP_TIMEOUT_MS)', async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    const done = createGracefulShutdown({
      cleanup: () => new Promise<void>(() => undefined),
      logger: createMockLogger(),
      exit,
    })('SIGTERM');

    await vi.advanceTimersByTimeAsync(DEFAULT_SHUTDOWN_BOUND_MS - 1);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(exit).toHaveBeenCalledWith(EXIT_CODES.SHUTDOWN_ERROR);
  });

  it('runs the cleanup once when a signal and stdin EOF race', async () => {
    const logger = createMockLogger();
    let releaseCleanup!: () => void;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseCleanup = resolve;
        })
    );
    const exit = vi.fn();
    const requestShutdown = createGracefulShutdown({ cleanup, logger, exit });

    const first = requestShutdown('SIGTERM');
    const second = requestShutdown('parent-gone');
    await second;
    releaseCleanup();
    await first;

    expect(cleanup).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
    expect(logger.debug).toHaveBeenCalledWith('Shutdown already in progress, ignoring signal', {
      signal: 'parent-gone',
    });
  });

  it('exits SHUTDOWN_ERROR when the cleanup rejects', async () => {
    const logger = createMockLogger();
    const exit = vi.fn();
    await createGracefulShutdown({
      cleanup: () => Promise.reject(new Error('cleanup failed')),
      logger,
      exit,
    })('parent-gone');

    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(EXIT_CODES.SHUTDOWN_ERROR);
    expect(logger.error).toHaveBeenCalledWith('Error during shutdown', expect.any(Error));
  });
});
