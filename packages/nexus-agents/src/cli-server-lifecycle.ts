/**
 * nexus-agents CLI Server - Lifecycle Helpers
 *
 * Helper functions for server lifecycle events and SwarmObserver management.
 * Extracted from cli-server.ts to maintain file size limits.
 *
 * @module cli-server-lifecycle
 * (Source: Issue #339)
 */

import {
  getStdinLifecycleMonitor,
  type StdinLifecycleMonitor,
} from './adapters/stdin-lifecycle.js';
import { EXIT_CODES } from './cli-types.js';
import type { ILogger } from './core/index.js';
import { getTimeProvider } from './core/index.js';
import { getSwarmObserver, SwarmObserver } from './observability/index.js';
import type { EventBusConfig } from './config/index.js';
import {
  initializeEventBusBridge,
  getEventBusStats,
  type EventBusBridgeResult,
} from './mcp/index.js';

/**
 * Options for SwarmObserver initialization.
 * (Source: Issue #493 - Wire observability config to SwarmObserver)
 */
export interface InitializeSwarmObserverOptions {
  /** Maximum events to retain (default: 10000) */
  maxEvents?: number | undefined;
}

/**
 * Initializes the global SwarmObserver for interaction tracing.
 *
 * @param logger - Logger instance
 * @param options - Optional configuration from observability config
 * @returns The initialized SwarmObserver instance
 */
export function initializeSwarmObserver(
  logger: ILogger,
  options?: InitializeSwarmObserverOptions
): SwarmObserver {
  const maxEvents = options?.maxEvents ?? 10000;
  const observer = getSwarmObserver({
    maxEvents,
  });

  logger.info('SwarmObserver initialized for interaction tracing', {
    maxEvents,
    configuredFromYaml: options?.maxEvents !== undefined,
  });

  return observer;
}

/**
 * Initializes the EventBus bridge for agent-to-agent communication visibility.
 * Bridges EventBus events to SwarmObserver for observability in Claude Desktop.
 *
 * @param observer - SwarmObserver instance
 * @param logger - Logger instance
 * @param config - Optional EventBus configuration
 * @returns EventBus bridge result with cleanup function
 *
 * (Source: Issue #307 - EventBus MCP integration)
 */
export function initializeEventBus(
  observer: SwarmObserver,
  logger: ILogger,
  config?: EventBusConfig
): EventBusBridgeResult {
  // Check environment variable for enable/disable override
  const envEnabled = process.env['NEXUS_EVENTBUS_ENABLED'];
  const enabled = envEnabled !== undefined ? envEnabled === 'true' : (config?.enabled ?? true);

  const effectiveConfig: Partial<EventBusConfig> = {
    ...config,
    enabled,
  };

  const result = initializeEventBusBridge(observer, logger, effectiveConfig);

  if (result.initialized) {
    logger.info('EventBus bridge initialized for A2A visibility', {
      subscriptionCount: result.subscriptionCount,
      eventBusEnabled: enabled,
    });
  }

  return result;
}

/**
 * Context for server lifecycle events.
 */
export interface ServerEventContext {
  readonly traceId: string;
  readonly startupSpanId: string;
}

/**
 * Records a server startup event to the SwarmObserver.
 */
export function recordServerStartup(observer: SwarmObserver): ServerEventContext {
  const traceId = SwarmObserver.generateTraceId();
  const startupSpanId = SwarmObserver.generateSpanId();

  observer.recordEvent({
    eventId: `startup-${startupSpanId}`,
    timestamp: getTimeProvider().nowIso(),
    agentId: 'mcp-server',
    eventType: 'task_started',
    traceId,
    spanId: startupSpanId,
    payload: {
      type: 'task',
      phase: 'started',
      taskId: traceId,
      taskDescription: 'MCP server startup',
    },
  });

  return { traceId, startupSpanId };
}

/**
 * Records a server shutdown event to the SwarmObserver.
 */
export function recordServerShutdown(observer: SwarmObserver, context: ServerEventContext): void {
  const shutdownSpanId = SwarmObserver.generateSpanId();

  observer.recordEvent({
    eventId: `shutdown-${shutdownSpanId}`,
    timestamp: getTimeProvider().nowIso(),
    agentId: 'mcp-server',
    eventType: 'task_completed',
    traceId: context.traceId,
    spanId: shutdownSpanId,
    parentSpanId: context.startupSpanId,
    payload: {
      type: 'task',
      phase: 'completed',
      taskId: context.traceId,
      taskDescription: 'MCP server shutdown',
      success: true,
    },
  });
}

/**
 * Logs the final health metrics from the SwarmObserver.
 */
export function logFinalHealthMetrics(observer: SwarmObserver, logger: ILogger): void {
  const healthMetrics = observer.getHealthMetrics();
  logger.info('Final swarm health metrics', {
    activeAgents: healthMetrics.activeAgents,
    totalAgents: healthMetrics.totalAgents,
    totalInteractions: healthMetrics.totalInteractions,
  });
}

/**
 * Logs final EventBus statistics before shutdown.
 */
export function logFinalEventBusStats(logger: ILogger): void {
  const finalStats = getEventBusStats();
  logger.info('Final EventBus statistics', {
    eventsEmitted: finalStats.eventsEmitted,
    activeSubscriptions: finalStats.activeSubscriptions,
    historySize: finalStats.historySize,
    errorCount: finalStats.errorCount,
  });
}

/**
 * Upper bound on the graceful-shutdown cleanup before the process exits
 * anyway (#6560).
 *
 * Why 12 s: the slowest step the cleanup is expected to finish is the audit
 * logger's final flush. Once that flush appends under the cross-process audit
 * lock (#6546/#6559), a contended flush may legitimately wait the lock's 10 s
 * acquisition timeout (`utils/file-lock.ts`) before it fails loudly; 2 s on top
 * covers the append itself and the remaining in-process teardown. Anything
 * longer is a hang, and a hung cleanup must not keep an orphaned server alive —
 * not lingering is the whole point of {@link watchParentProcess}.
 */
const SHUTDOWN_CLEANUP_TIMEOUT_MS = 12_000;

/** Options for {@link createGracefulShutdown}. */
interface GracefulShutdownOptions {
  /** Teardown to run once (flushes and closes the audit logger, etc.). */
  readonly cleanup: () => Promise<void>;
  readonly logger: ILogger;
  /** Process exit seam. Default: `process.exit`. */
  readonly exit?: ((code: number) => void) | undefined;
  /** Cleanup bound in ms. Default: {@link SHUTDOWN_CLEANUP_TIMEOUT_MS}. */
  readonly timeoutMs?: number | undefined;
}

/** Requests shutdown; `reason` names the trigger (a signal, or parent death). */
export type ShutdownRequest = (reason: string) => Promise<void>;

/**
 * Builds the single shutdown entry point shared by SIGINT/SIGTERM and parent
 * death (#6560). The first request runs `cleanup`, bounded by `timeoutMs`, then
 * exits: SUCCESS when it completed, SHUTDOWN_ERROR when it threw or timed out.
 * Later requests — a signal racing stdin EOF — are ignored, so the cleanup
 * (and the audit `system.shutdown.begin` it writes) runs exactly once.
 */
export function createGracefulShutdown(options: GracefulShutdownOptions): ShutdownRequest {
  const { cleanup, logger } = options;
  const exit = options.exit ?? ((code: number): void => process.exit(code));
  const timeoutMs = options.timeoutMs ?? SHUTDOWN_CLEANUP_TIMEOUT_MS;
  let isShuttingDown = false;

  return async (reason: string): Promise<void> => {
    if (isShuttingDown) {
      logger.debug('Shutdown already in progress, ignoring signal', { signal: reason });
      return;
    }
    isShuttingDown = true;
    logger.info('Received shutdown signal', { signal: reason });

    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      // Deliberately NOT unref'd: this timer is what guarantees the exit when
      // the cleanup is stuck on something that holds no handle of its own.
      timer = setTimeout(() => {
        resolve('timeout');
      }, timeoutMs);
    });

    try {
      const outcome = await Promise.race([cleanup().then(() => 'done' as const), timedOut]);
      if (outcome === 'timeout') {
        logger.error(
          'Shutdown cleanup timed out; exiting without completing it',
          new Error(`shutdown cleanup exceeded ${String(timeoutMs)}ms (trigger: ${reason})`)
        );
        exit(EXIT_CODES.SHUTDOWN_ERROR);
        return;
      }
      logger.info('Shutdown complete');
      exit(EXIT_CODES.SUCCESS);
    } catch (error) {
      logger.error(
        'Error during shutdown',
        error instanceof Error ? error : new Error(String(error))
      );
      exit(EXIT_CODES.SHUTDOWN_ERROR);
    } finally {
      clearTimeout(timer);
    }
  };
}

/** The part of the stdin lifecycle monitor {@link watchParentProcess} uses. */
type ParentProcessMonitor = Pick<StdinLifecycleMonitor, 'start' | 'onClose'>;

/**
 * Shuts the server down when the parent closes stdin or dies (Issue #810).
 *
 * A stdio MCP server whose parent dies keeps running as a zombie holding the
 * pipe open; the monitor turns that into an exit. Since #6560 the exit goes
 * through `requestShutdown` — the same bounded cleanup SIGINT/SIGTERM use — so
 * the audit log is flushed and `system.shutdown.begin` written before exit.
 */
export function watchParentProcess(
  logger: ILogger,
  requestShutdown: ShutdownRequest,
  monitor: ParentProcessMonitor = getStdinLifecycleMonitor()
): void {
  monitor.start();
  monitor.onClose(() => {
    logger.warn('Parent process closed stdin, shutting down');
    return requestShutdown('parent-gone');
  });
}

/** The part of `process.stderr` {@link routeStderrEpipeToShutdown} listens on. */
type ErrorEventSource = Pick<NodeJS.EventEmitter, 'on'>;

function isEpipe(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'EPIPE'
  );
}

/**
 * Makes an EPIPE on stderr a shutdown request instead of a crash (#6573).
 *
 * The server logs to stderr, usually a pipe to the host. When the host dies the
 * pipe loses its reader, and the next log write — typically the "parent
 * process closed stdin" warning at the start of shutdown — fails with EPIPE.
 * With no `'error'` listener on the stream, that became an `uncaughtException`
 * whose handler exited before the audit flush ran, so `system.shutdown.begin`
 * was never written. A lost stderr reader is evidence the host is gone, so the
 * error requests the same bounded, run-once shutdown as parent death (a no-op
 * when that shutdown is already running). Any other stderr error is rethrown
 * and stays fatal.
 */
export function routeStderrEpipeToShutdown(
  requestShutdown: ShutdownRequest,
  stream: ErrorEventSource = process.stderr
): void {
  stream.on('error', (error: unknown) => {
    if (!isEpipe(error)) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    // Nothing is logged here: stderr is the stream that just failed.
    requestShutdown('stderr-closed').catch(() => {
      process.exit(EXIT_CODES.SHUTDOWN_ERROR);
    });
  });
}
