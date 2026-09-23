/**
 * Server-mode shutdown teardown (#6573).
 *
 * The order is the point of this module: stop accepting requests, let the tool
 * calls already running finish, run the rest of the teardown, and close the
 * audit logger LAST. Closing the audit logger first (the order before #6573)
 * dropped the audit event of every tool call that finished during shutdown —
 * the logger rejects writes after `close()` with "Attempted to log after close".
 *
 * @module cli-server-shutdown
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { closeServer, type EventBusBridgeResult } from './mcp/index.js';
import type { ILogger } from './core/index.js';
import {
  SwarmObserver,
  shutdownSwarmHealthSignals,
  shutdownFailoverSignals,
} from './observability/index.js';
import {
  recordServerShutdown,
  logFinalHealthMetrics,
  logFinalEventBusStats,
  type ServerEventContext,
} from './cli-server-lifecycle.js';
import { shutdownToolMemory } from './mcp/tools/tool-memory.js';
import { shutdownExpertBridge } from './pipeline/expert-bridge.js';
import { shutdownPipelineEventBridge } from './pipeline/event-bus-bridge.js';
import { shutdownTuneStage } from './pipeline/tune-stage.js';
import { shutdownImprovementReviewScheduler } from './mcp/tools/improvement-review-scheduler.js';
import { shutdownAuditLogger } from './cli-server-audit.js';
import type { AuditLogger } from './audit/index.js';

/**
 * How long shutdown waits for running tool calls before closing the audit
 * logger anyway.
 *
 * It spends part of the 12 s cleanup bound (`SHUTDOWN_CLEANUP_TIMEOUT_MS` in
 * `cli-server-lifecycle.ts`), which is sized for a contended final audit flush
 * (10 s lock wait + 2 s). Waiting longer here would let one slow tool call push
 * the flush past that bound and lose `system.shutdown.begin` as well. Closing
 * the transport aborts each handler's `extra.signal`, so a handler that honours
 * it returns well inside this window; one that does not is counted on the
 * shutdown record instead of waited for.
 */
export const TOOL_CALL_DRAIN_TIMEOUT_MS = 1_000;

/** Tool calls that have started and not yet settled. */
export interface InFlightToolCalls {
  /** Number of tool calls currently running. */
  readonly size: () => number;
  /**
   * Waits until every running tool call settles or `timeoutMs` elapses, and
   * resolves to the number still running then (0 = fully drained).
   */
  readonly drain: (timeoutMs: number) => Promise<number>;
}

/**
 * Wraps every tool callback registered on `server` from now on so shutdown can
 * wait for running calls (#6573). Call it before any tool is registered: a
 * callback registered earlier is not tracked.
 *
 * Covers `registerTool` callbacks. Task-based tools (`registerToolTask`) and
 * async jobs return before their work finishes, so they are not drained here.
 */
export function trackInFlightToolCalls(server: McpServer): InFlightToolCalls {
  const running = new Set<Promise<unknown>>();
  const register = server.registerTool.bind(server);

  const wrap = (callback: unknown): unknown => {
    if (typeof callback !== 'function') return callback;
    return (...args: unknown[]): Promise<unknown> => {
      const call = Promise.resolve().then((): unknown => Reflect.apply(callback, undefined, args));
      const settled = call.then(
        () => undefined,
        () => undefined
      );
      running.add(settled);
      void settled.finally(() => running.delete(settled));
      return call;
    };
  };

  const tracked = (name: string, config: unknown, callback: unknown): unknown =>
    Reflect.apply(register, server, [name, config, wrap(callback)]);
  server.registerTool = tracked as McpServer['registerTool'];

  return {
    size: () => running.size,
    drain: async (timeoutMs: number): Promise<number> => {
      if (running.size === 0) return 0;
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      });
      try {
        await Promise.race([Promise.all([...running]), timedOut]);
      } finally {
        clearTimeout(timer);
      }
      return running.size;
    },
  };
}

/** Options for {@link createShutdownCleanup}. */
export interface ShutdownCleanupOptions {
  readonly eventBusBridge: EventBusBridgeResult;
  readonly observer: SwarmObserver;
  readonly eventContext: ServerEventContext;
  readonly server: McpServer;
  readonly serverLogger: ILogger;
  readonly logger: ILogger;
  /** Audit logger (if enabled) - Issue #740 Phase 2 */
  readonly auditLogger: AuditLogger | null;
  /** Tool calls to drain before the audit logger closes (#6573). */
  readonly inFlightToolCalls: InFlightToolCalls;
  /** Drain bound in ms. Default: {@link TOOL_CALL_DRAIN_TIMEOUT_MS}. */
  readonly drainTimeoutMs?: number | undefined;
}

/**
 * Creates the shutdown cleanup handler.
 */
export function createShutdownCleanup(options: ShutdownCleanupOptions): () => Promise<void> {
  const { eventBusBridge, observer, eventContext, server, serverLogger, logger, auditLogger } =
    options;
  const drainTimeoutMs = options.drainTimeoutMs ?? TOOL_CALL_DRAIN_TIMEOUT_MS;

  return async (): Promise<void> => {
    // 1. Stop accepting requests. Closing the transport also aborts each
    //    running handler's signal, which is what lets the drain be short.
    const closeResult = await closeServer(server, serverLogger);

    // 2. Let running tool calls finish, so their audit events are written into
    //    an open logger (#6573). Bounded: see TOOL_CALL_DRAIN_TIMEOUT_MS.
    const toolCallsStillRunning = await options.inFlightToolCalls.drain(drainTimeoutMs);
    if (toolCallsStillRunning > 0) {
      logger.warn('Closing the audit logger with tool calls still running', {
        toolCallsStillRunning,
        drainTimeoutMs,
      });
    }

    // 3. The rest of the teardown.
    if (eventBusBridge.initialized) {
      logFinalEventBusStats(logger);
      eventBusBridge.cleanup();
    }

    recordServerShutdown(observer, eventContext);
    logFinalHealthMetrics(observer, logger);

    // Persist tool memory session to disk (Issue #690)
    shutdownToolMemory();

    // Cleanup the cached MCP-config tempdir (closes #2946)
    await shutdownExpertBridge();

    // Release the V2 pipeline → global event forwarder. This slot used to hold
    // `shutdownFeedbackSubscriber()`, which was an unconditional no-op: nothing
    // ever called `startFeedbackSubscriber`, because #5003's panel removed that
    // bridge on purpose. The forwarder is the subscription that WAS leaking.
    shutdownPipelineEventBridge();

    // Release the shadow TuneStage signal subscription (#3147)
    shutdownTuneStage();

    // Release the swarm-health signal poll timer (#3223)
    shutdownSwarmHealthSignals();

    // Release the adapter-failover signal subscription (#3321)
    shutdownFailoverSignals();

    // Release the scheduled improvement_review timer (#3229)
    shutdownImprovementReviewScheduler();

    // 4. Close the audit logger LAST (Issue #740 Phase 2, #6573). The shutdown
    //    record carries the undrained count, so a call whose event is missing
    //    is visible on the record instead of silently absent.
    await shutdownAuditLogger(auditLogger, logger, { toolCallsStillRunning });

    // Reported after the audit close, so a failed server close cannot skip it.
    if (!closeResult.ok) {
      throw new Error(closeResult.error.message);
    }
  };
}
