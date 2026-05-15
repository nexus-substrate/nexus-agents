/**
 * nexus-agents/mcp - Tool Wrapper Helper
 *
 * Provides a convenient wrapper for MCP tools that automatically applies
 * the middleware chain with timeout protection (CVE-2026-0621 mitigation).
 *
 * @module mcp/middleware/tool-wrapper
 * (Source: Issue #271, CVE-2026-0621 mitigation)
 */

import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ILogger } from '../../core/index.js';
import type { TimeoutConfig, SecurityConfig } from '../../config/schemas.js';
import type { IPolicyFirewall, ExecutionMode } from './policy.js';
import type { RateLimiterConfig } from './rate-limiter.js';
import { RateLimiter } from './rate-limiter.js';
import {
  withMiddleware,
  createMiddlewareFactory,
  type ToolHandler,
  type ContextAwareToolHandler,
  type MiddlewareChainConfig,
} from './middleware-chain.js';
import { MCP_TIMEOUTS } from '../../config/timeouts.js';
import {
  progressContextStorage,
  abortSignalStorage,
  type ProgressContext,
} from '../mcp-notifier.js';
import { createLogger as createInternalLogger, getErrorMessage } from '../../core/index.js';
import { getNexusDataDir } from '../../config/nexus-data-dir.js';

/**
 * Default timeout configuration.
 * Values sourced from config/timeouts.ts (Issue #984).
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  defaultTimeoutMs: MCP_TIMEOUTS.defaultMs,
  maxTimeoutMs: MCP_TIMEOUTS.maxMs,
  enableLogging: true,
  uriValidation: true,
};

/**
 * Default per-tool timeout overrides.
 * Sourced from config/timeouts.ts (Issue #984).
 */
export const DEFAULT_TOOL_TIMEOUTS: Record<string, number> = {
  ...MCP_TIMEOUTS.perTool,
};

/**
 * Resolves the timeout for a specific tool.
 * Priority: explicit override > security config perToolTimeout > DEFAULT_TOOL_TIMEOUTS > global default.
 * (Issue #657 - Per-tool timeout configuration)
 */
export function getToolTimeout(
  toolName: string,
  security?: SecurityConfig,
  explicitMs?: number
): number {
  // Explicit override takes highest priority
  if (explicitMs !== undefined) {
    return explicitMs;
  }
  // Check security config per-tool overrides
  const perToolConfig = security?.timeout?.perToolTimeout;
  const perToolMs = perToolConfig?.[toolName];
  if (perToolMs !== undefined) {
    return perToolMs;
  }
  // Check built-in per-tool defaults
  const builtInDefault = DEFAULT_TOOL_TIMEOUTS[toolName];
  if (builtInDefault !== undefined) {
    return builtInDefault;
  }
  // Fall back to global default
  return security?.timeout?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_CONFIG.defaultTimeoutMs;
}

/**
 * Configuration for creating a tool factory.
 */
export interface ToolFactoryConfig {
  /** Logger instance */
  logger?: ILogger | undefined;
  /** Security configuration (includes timeout config) */
  security?: SecurityConfig | undefined;
  /** Policy firewall instance */
  policyFirewall?: IPolicyFirewall | undefined;
  /** Rate limiter configuration */
  rateLimiter?: RateLimiterConfig | RateLimiter | undefined;
  /** Allowed paths for file operations */
  allowedPaths?: readonly string[] | undefined;
}

/**
 * Per-tool configuration options.
 */
export interface ToolWrapperOptions {
  /** Execution mode for policy evaluation (default: 'read-only') */
  executionMode?: ExecutionMode | undefined;
  /** Custom timeout in ms (overrides default) */
  timeoutMs?: number | undefined;
  /** Skip timeout protection (use sparingly) */
  skipTimeout?: boolean | undefined;
  /** Skip rate limiting */
  skipRateLimit?: boolean | undefined;
}

/**
 * Gets timeout configuration from security config or uses defaults.
 */
function getTimeoutConfig(
  security?: SecurityConfig,
  overrideMs?: number
): MiddlewareChainConfig['timeout'] {
  const timeoutConfig = security?.timeout ?? DEFAULT_TIMEOUT_CONFIG;

  return {
    defaultTimeoutMs: overrideMs ?? timeoutConfig.defaultTimeoutMs,
    maxTimeoutMs: timeoutConfig.maxTimeoutMs,
    enableLogging: timeoutConfig.enableLogging,
  };
}

/**
 * Creates a tool factory with shared configuration.
 *
 * This factory produces wrapped handlers that include timeout protection,
 * rate limiting, and other middleware as configured.
 *
 * @example
 * ```typescript
 * const wrapTool = createToolFactory({
 *   security: appConfig.security,
 *   rateLimiter: { capacity: 100, refillRate: 10 },
 * });
 *
 * const handler = wrapTool('my_tool', async (args) => {
 *   // Your tool logic here
 *   return { content: [{ type: 'text', text: 'Done' }] };
 * });
 * ```
 */
export function createToolFactory(
  config: ToolFactoryConfig
): (
  toolName: string,
  handler: ContextAwareToolHandler | ToolHandler,
  options?: ToolWrapperOptions
) => ToolHandler {
  const { security, policyFirewall, rateLimiter, allowedPaths, logger } = config;

  return (toolName, handler, options) => {
    const skip = {
      timeout: options?.skipTimeout,
      rateLimit: options?.skipRateLimit,
    };

    const chainConfig: Omit<MiddlewareChainConfig, 'toolName'> = {
      logger,
      policyFirewall,
      executionMode: options?.executionMode ?? 'read-only',
      allowedPaths,
      rateLimiter,
      timeout: skip.timeout === true ? undefined : getTimeoutConfig(security, options?.timeoutMs),
      skip,
    };

    return withMiddleware(toolName, handler, chainConfig);
  };
}

/**
 * Wraps a single tool handler with timeout protection.
 *
 * This is a convenience function for simple cases where you don't need
 * the full factory setup.
 *
 * @example
 * ```typescript
 * const handler = wrapToolWithTimeout('my_tool', async (args) => {
 *   return { content: [{ type: 'text', text: 'Done' }] };
 * });
 * ```
 */
export function wrapToolWithTimeout(
  toolName: string,
  handler: ContextAwareToolHandler | ToolHandler,
  options?: {
    timeoutMs?: number;
    logger?: ILogger;
  }
): ToolHandler {
  return withMiddleware(toolName, handler, {
    timeout: getTimeoutConfig(undefined, options?.timeoutMs),
    logger: options?.logger,
  });
}

/** Shape of the MCP SDK's extra._meta for progress tokens. */
interface SdkMeta {
  readonly progressToken?: string | number;
}

/** Shape of the MCP SDK's extra object passed to tool handlers. */
interface SdkExtra {
  readonly _meta?: SdkMeta;
  readonly signal?: AbortSignal;
  readonly sendNotification?: (notification: {
    method: string;
    params?: Record<string, unknown>;
  }) => Promise<void>;
}

const wrapperLogger = createInternalLogger({ component: 'tool-wrapper' });

/** Extract progress context from MCP SDK extra if progressToken present. */
function extractProgressContext(extra: unknown): ProgressContext | undefined {
  const sdk = extra as SdkExtra | undefined;
  const token = sdk?._meta?.progressToken;
  const sendFn = sdk?.sendNotification;
  if (token === undefined || sendFn === undefined) return undefined;

  return {
    progressToken: token,
    sendNotification: (progress: number, total?: number) => {
      const params: Record<string, unknown> = {
        progressToken: token,
        progress,
      };
      if (total !== undefined) params['total'] = total;
      sendFn({ method: 'notifications/progress', params }).catch((err: unknown) => {
        wrapperLogger.debug('Failed to send progress notification', {
          error: getErrorMessage(err),
        });
      });
    },
  };
}

/**
 * Runs handler within nested AsyncLocalStorage contexts for progress + abort.
 */
/** SDK-compatible tool result with optional structuredContent (Issue #1117). */
type SdkToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  // Post-#2649: the structured error envelope lives in `_meta` under
  // `nexus-agents/error` (not in `structuredContent`, which is validated
  // against `outputSchema` even on error results).
  _meta?: Record<string, unknown>;
};

function runWithContexts(
  handler: ToolHandler,
  args: unknown,
  progressCtx: ProgressContext | undefined,
  signal: AbortSignal | undefined
): Promise<SdkToolResult> {
  const run = (): Promise<SdkToolResult> => handler(args);

  // Nest contexts: abort signal outer, progress inner
  if (signal !== undefined && progressCtx !== undefined) {
    return abortSignalStorage.run(signal, () => progressContextStorage.run(progressCtx, run));
  }
  if (signal !== undefined) {
    return abortSignalStorage.run(signal, run);
  }
  if (progressCtx !== undefined) {
    return progressContextStorage.run(progressCtx, run);
  }
  return run();
}

/**
 * Adapts a ToolHandler to the MCP SDK's expected callback signature.
 *
 * Extracts progressToken and AbortSignal from extra, runs the handler
 * within AsyncLocalStorage contexts so middleware can access them.
 *
 * @param handler - Our internal ToolHandler
 * @returns SDK-compatible callback function
 */
export function toSdkCallback(
  handler: ToolHandler
): (args: unknown, extra: unknown) => Promise<SdkToolResult> {
  return (args: unknown, extra: unknown) => {
    const progressCtx = extractProgressContext(extra);
    const signal = (extra as SdkExtra | undefined)?.signal;
    return runWithContexts(handler, args, progressCtx, signal);
  };
}

/**
 * MCP SDK client default request timeout. Matches `DEFAULT_REQUEST_TIMEOUT_MSEC`
 * in `@modelcontextprotocol/sdk` (`shared/protocol.js`). If a tool's
 * configured server-side budget exceeds this and the client did not send a
 * `progressToken` (i.e. did not pass `onprogress` to its `request()` call),
 * the client kills the request at this threshold regardless of what the
 * server is doing — heartbeats fire but go nowhere.
 *
 * (Source: audit on #2619 / #2631 — root cause of "MCP error -32001 at 60010ms")
 */
export const MCP_SDK_DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Relative path under `$NEXUS_DATA_DIR` for the timeout-mismatch event log.
 * The #2632 WARN was log-only — useful in tail but not queryable. #2703
 * records each mismatch event as a JSONL row keyed by a correlation
 * `eventId` shared with the log entry, so "did mismatch cause this
 * timeout?" can be answered by joining the warning's eventId against the
 * recorded outcome — not just counted in aggregate.
 *
 * Schema lives at `docs/architecture/MCP_PROTOCOL.md` (Timeout-mismatch
 * telemetry section).
 */
export const TIMEOUT_MISMATCH_TELEMETRY_REL_PATH = 'mcp-telemetry/timeout-mismatch-events.jsonl';

/** A single timeout-mismatch event recorded to the telemetry JSONL. */
export interface TimeoutMismatchEvent {
  readonly eventId: string;
  readonly toolName: string;
  readonly configuredTimeoutMs: number;
  readonly mcpSdkDefaultMs: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly outcome: 'success' | 'error';
  /** From the post-#2649 structured error envelope when present. */
  readonly errorCategory?: string;
  readonly errorMessage?: string;
}

/** Best-effort append — telemetry recording must never fail the user's tool call. */
function appendTimeoutMismatchEvent(event: TimeoutMismatchEvent): void {
  try {
    const path = join(getNexusDataDir(), TIMEOUT_MISMATCH_TELEMETRY_REL_PATH);
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(path, JSON.stringify(event) + '\n', 'utf-8');
  } catch (err) {
    wrapperLogger.debug('Best-effort timeout-mismatch event recording failed', {
      error: getErrorMessage(err),
    });
  }
}

/** Pull the post-#2649 errorCategory off an error result's `_meta` envelope. */
function extractErrorCategoryFromResult(result: SdkToolResult): string | undefined {
  const envelope = result._meta?.['nexus-agents/error'];
  if (envelope !== null && typeof envelope === 'object' && 'errorCategory' in envelope) {
    const cat = (envelope as { errorCategory?: unknown }).errorCategory;
    if (typeof cat === 'string') return cat;
  }
  return undefined;
}

/** First text-content line of an error result, truncated for logging. */
function extractErrorMessageFromResult(result: SdkToolResult): string | undefined {
  const first = result.content[0];
  if (first?.type === 'text' && typeof first.text === 'string') {
    return first.text.slice(0, 500);
  }
  return undefined;
}

interface MismatchCallContext {
  readonly log: ILogger;
  readonly handler: ToolHandler;
  readonly args: unknown;
  readonly progressCtx: ProgressContext | undefined;
  readonly signal: AbortSignal | undefined;
  readonly toolName: string;
  readonly configuredTimeoutMs: number;
}

interface MismatchOutcome {
  readonly outcome: 'success' | 'error';
  readonly errorCategory?: string;
  readonly errorMessage?: string;
}

/** Build a complete event record from a finished mismatched call. */
function buildMismatchEvent(
  ctx: MismatchCallContext,
  eventId: string,
  t0: number,
  outcome: MismatchOutcome
): TimeoutMismatchEvent {
  const t1 = Date.now();
  return {
    eventId,
    toolName: ctx.toolName,
    configuredTimeoutMs: ctx.configuredTimeoutMs,
    mcpSdkDefaultMs: MCP_SDK_DEFAULT_REQUEST_TIMEOUT_MS,
    startedAt: new Date(t0).toISOString(),
    endedAt: new Date(t1).toISOString(),
    durationMs: t1 - t0,
    outcome: outcome.outcome,
    ...(outcome.errorCategory !== undefined ? { errorCategory: outcome.errorCategory } : {}),
    ...(outcome.errorMessage !== undefined ? { errorMessage: outcome.errorMessage } : {}),
  };
}

/** Classify a tool result into a MismatchOutcome (success or structured error). */
function classifyResult(result: SdkToolResult): MismatchOutcome {
  if (result.isError !== true) return { outcome: 'success' };
  const errorCategory = extractErrorCategoryFromResult(result);
  const errorMessage = extractErrorMessageFromResult(result);
  return {
    outcome: 'error',
    ...(errorCategory !== undefined ? { errorCategory } : {}),
    ...(errorMessage !== undefined ? { errorMessage } : {}),
  };
}

/** Run a mismatched call, recording its outcome to the JSONL. */
async function runMismatchedCall(ctx: MismatchCallContext): Promise<SdkToolResult> {
  const eventId = randomUUID();
  const t0 = Date.now();
  ctx.log.warn(
    'MCP tool budget exceeds client default and no progressToken received — request likely to be killed by client before server-side deadline',
    {
      tool: ctx.toolName,
      eventId,
      configuredTimeoutMs: ctx.configuredTimeoutMs,
      mcpSdkDefaultMs: MCP_SDK_DEFAULT_REQUEST_TIMEOUT_MS,
      remediation:
        'Client should pass `onprogress` and `resetTimeoutOnProgress: true` when calling, or extend `options.timeout`. See docs/architecture/MCP_PROTOCOL.md.',
    }
  );
  try {
    const result = await runWithContexts(ctx.handler, ctx.args, ctx.progressCtx, ctx.signal);
    appendTimeoutMismatchEvent(buildMismatchEvent(ctx, eventId, t0, classifyResult(result)));
    return result;
  } catch (err) {
    appendTimeoutMismatchEvent(
      buildMismatchEvent(ctx, eventId, t0, {
        outcome: 'error',
        errorMessage: getErrorMessage(err).slice(0, 500),
      })
    );
    throw err;
  }
}

/**
 * Like `toSdkCallback`, but emits a one-shot WARN at invocation start when
 * the configured per-tool budget exceeds the MCP SDK client default AND the
 * client did not send a `progressToken`. The call is almost certainly going
 * to die at the client default (~60s) regardless of server-side timeout
 * config or progress heartbeats — surface that at the moment of invocation
 * so operators can spot the mismatch in logs without waiting for the
 * timeout to fire.
 *
 * Wrap a long-running tool (`orchestrate`, `consensus_vote`,
 * `execute_expert`, `run_workflow`) with this instead of plain
 * `toSdkCallback`. Tools whose budget already fits within
 * `MCP_SDK_DEFAULT_REQUEST_TIMEOUT_MS` should keep using `toSdkCallback`.
 *
 * Each mismatch is **also recorded** to
 * `$NEXUS_DATA_DIR/mcp-telemetry/timeout-mismatch-events.jsonl` with a
 * correlation `eventId` (also surfaced in the WARN log entry) and the
 * call's eventual outcome (`success` / `error` + post-#2649 errorCategory
 * if present). This lets the Epic #2631 gate be answered with data —
 * "of N mismatches, what fraction ended in a timeout?" — not just counted
 * in aggregate (#2703).
 *
 * (Source: audit on #2619 / #2631 — observability for client-timeout mismatch)
 */
export function toSdkCallbackWithBudgetCheck(
  handler: ToolHandler,
  toolName: string,
  configuredTimeoutMs: number,
  logger?: ILogger
): (args: unknown, extra: unknown) => Promise<SdkToolResult> {
  const log = logger ?? wrapperLogger;
  return (args: unknown, extra: unknown) => {
    const progressCtx = extractProgressContext(extra);
    const signal = (extra as SdkExtra | undefined)?.signal;
    const isMismatch =
      configuredTimeoutMs > MCP_SDK_DEFAULT_REQUEST_TIMEOUT_MS && progressCtx === undefined;
    if (!isMismatch) return runWithContexts(handler, args, progressCtx, signal);
    return runMismatchedCall({
      log,
      handler,
      args,
      progressCtx,
      signal,
      toolName,
      configuredTimeoutMs,
    });
  };
}

/**
 * Re-export middleware factory for advanced use cases.
 */
export { createMiddlewareFactory, withMiddleware };
