/**
 * nexus-agents/mcp - Execute Expert Tool
 *
 * MCP tool for executing tasks with previously created expert agents.
 * Experts must be created first using the create_expert tool.
 *
 * @module mcp/tools/execute-expert
 * (Source: Issue #437 - Add execute_expert tool)
 * (Refactored: Issue #531 - Use createSecureHandlerFactory)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger, Task } from '../../core/index.js';
import { getErrorMessage } from '../../core/index.js';

import {
  createLogger,
  getTimeProvider,
  getRandomProvider,
  formatZodError,
} from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import { createMcpNotifier, NOOP_NOTIFIER, withProgressHeartbeat } from '../mcp-notifier.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import type { Expert } from '../../agents/index.js';
import { getToolMemory } from './tool-memory.js';
import { getAutoCatalog } from './research-auto-catalog.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import type { OutcomeFailureCategory } from '../../orchestration/outcomes/index.js';
import { detectTaskCategory } from '../../config/task-specialization.js';
import { getExpertTaskTimeout, HEARTBEAT_TIMEOUTS } from '../../config/timeouts.js';
import type { ICliDetectionCache } from '../../cli-adapters/cli-detection-cache.js';
import { requireAdapterAvailable } from '../middleware/adapter-availability.js';
import { getExpertPool } from '../../agents/expert-pool.js';
import { getHeartbeatMonitor } from '../../agents/heartbeat-monitor.js';

/**
 * Input schema for execute_expert tool.
 */
export const ExecuteExpertInputSchema = z.object({
  expertId: z.string().min(1).describe('Expert ID from create_expert tool'),
  task: z.string().min(1).describe('Task description for the expert to execute'),
  context: z.record(z.unknown()).optional().describe('Additional context metadata for the task'),
  timeoutMs: z
    .number()
    .int()
    .min(10_000)
    .max(900_000)
    .optional()
    .describe('Optional timeout in ms (10s-900s). Overrides auto-detected timeout.'),
});

/**
 * Type for validated execute expert input.
 */
export type ExecuteExpertInput = z.infer<typeof ExecuteExpertInputSchema>;

/**
 * Dependencies for execute_expert tool.
 */
export interface ExecuteExpertDeps {
  /** Registry of created experts (shared with create_expert) */
  expertRegistry: Map<string, Expert>;
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings - Issue #271, CVE-2026-0621) */
  security?: SecurityConfig | undefined;
  /** Optional CLI detection cache for checking available CLIs (Issue #747) */
  cliCache?: ICliDetectionCache;
  /** MCP notifier for client-visible logging (Issue #974) */
  notifier?: IMcpNotifier | undefined;
}

/**
 * Response from execute_expert tool.
 */
export interface ExecuteExpertResponse {
  /** Expert ID that executed the task */
  expertId: string;
  /** Expert role */
  role: string;
  /** Task execution output */
  output: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Token usage from the model */
  tokensUsed: number;
  /** Status of execution */
  status: 'success' | 'error';
  /** Error message if status is 'error' */
  error?: string;
  /** Model used for execution (Issue #817) */
  modelUsed?: string;
}

/**
 * Builds a task object from the tool input.
 */
function buildTask(input: ExecuteExpertInput): Task {
  const timeoutMs = input.timeoutMs ?? getExpertTaskTimeout(input.task);
  return {
    id: `exec-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 9)}`,
    description: input.task,
    context: {
      metadata: input.context ?? {},
    },
    constraints: {
      maxTokens: 4096,
      maxDuration: timeoutMs, // Caller override or dynamic detection (Issue #1028, #1129)
    },
  };
}

/**
 * Look up expert and return error hint if not found.
 */
function lookupExpert(
  registry: Map<string, Expert>,
  expertId: string
): { ok: true; expert: Expert } | { ok: false; error: string } {
  const expert = registry.get(expertId);
  if (expert === undefined) {
    const availableIds = Array.from(registry.keys());
    const hint =
      availableIds.length > 0
        ? ` Available experts: ${availableIds.join(', ')}`
        : ' No experts have been created yet. Use create_expert first.';
    return { ok: false, error: `Expert not found: ${expertId}.${hint}` };
  }
  return { ok: true, expert };
}

/**
 * Build success response from execution result.
 */
interface SuccessResponseParams {
  expertId: string;
  role: string;
  output: unknown;
  durationMs: number;
  tokensUsed: number;
  modelUsed?: string | undefined;
}

function buildSuccessResponse(params: SuccessResponseParams): ExecuteExpertResponse {
  const outputStr =
    typeof params.output === 'string' ? params.output : JSON.stringify(params.output, null, 2);
  const response: ExecuteExpertResponse = {
    expertId: params.expertId,
    role: params.role,
    output: outputStr,
    durationMs: params.durationMs,
    tokensUsed: params.tokensUsed,
    status: 'success',
  };
  if (params.modelUsed !== undefined) {
    response.modelUsed = params.modelUsed;
  }
  return response;
}

/** Records expert execution outcome to OutcomeStore (Issue #1014). Best-effort. */
function recordExpertOutcome(opts: {
  task: string;
  success: boolean;
  durationMs: number;
  model?: string;
  failureCategory?: OutcomeFailureCategory;
}): void {
  try {
    const match = detectTaskCategory(opts.task);
    getOutcomeStore().append({
      id: `exp-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      cli: 'claude',
      category: match?.category ?? 'exploration',
      model: opts.model ?? 'expert',
      success: opts.success,
      durationMs: opts.durationMs,
      timestamp: new Date(getTimeProvider().now()).toISOString(),
      source: 'delegate',
      ...(opts.failureCategory !== undefined ? { failureCategory: opts.failureCategory } : {}),
    });
  } catch (error: unknown) {
    createLogger({ tool: 'execute_expert' }).debug('Best-effort outcome recording failed', {
      error: getErrorMessage(error),
    });
  }
}

/**
 * Records a successful expert execution to session memory. (Issue #690)
 */
function recordExpertSuccess(expertId: string, role: string, durationMs: number): void {
  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Expert execution: ${role} (${expertId})`,
      challenges: [],
      durationMs,
    });
    // Record learning about successful execution pattern
    memory.recordLearning({
      pattern: `Expert ${role} completed successfully`,
      context: `id=${expertId} duration=${String(durationMs)}ms`,
      confidence: 0.75,
      source: 'execute-expert-success',
    });
    // Fire-and-forget promotion pipeline (Issue #753)
    void memory.runPromotionPipeline().catch((error: unknown) => {
      createLogger({ tool: 'execute_expert' }).debug('Promotion pipeline failed', { error });
    });
  } catch (error: unknown) {
    // Best-effort memory recording
    createLogger({ tool: 'execute_expert' }).debug('Best-effort success recording failed', {
      error: getErrorMessage(error),
      expertId,
    });
  }
}

/**
 * Records a failed expert execution to session memory. (Issue #690)
 */
function recordExpertError(expertId: string, role: string, errorMessage: string): void {
  try {
    const memory = getToolMemory();
    memory.recordError({
      error: `Expert ${role} (${expertId}): ${errorMessage.slice(0, 150)}`,
      solution: 'Pending - expert execution failed',
      filePattern: 'mcp/tools/execute-expert',
    });
  } catch (error: unknown) {
    // Best-effort memory recording
    createLogger({ tool: 'execute_expert' }).debug('Best-effort error recording failed', {
      error: getErrorMessage(error),
      expertId,
    });
  }
}

/** Injects past error solutions into task context (best-effort). */
function injectErrorHints(task: Task, role: string): void {
  try {
    const hints = getToolMemory().getRelevantErrorHints(role);
    if (hints !== undefined) {
      (task.context.metadata as Record<string, unknown>)._pastErrorSolutions = hints;
    }
  } catch (error: unknown) {
    createLogger({ tool: 'execute_expert' }).warn('Failed to inject error hints', {
      error: getErrorMessage(error),
      role,
    });
  }
}

/** Scans expert output for research references (best-effort). */
function autoCatalogScan(output: string, expertId: string, logger?: ILogger): void {
  try {
    const catalog = getAutoCatalog();
    catalog.scanAndRecord(output, 'execute_expert');
  } catch (error: unknown) {
    logger?.debug('Best-effort auto-catalog scan failed', {
      error: getErrorMessage(error),
      expertId,
    });
  }
}

/** Records failure outcome and returns error result with observability data (#1129). */
function handleExpertFailure(
  args: ExecuteExpertInput,
  expert: { expertId: string; role: string; modelId?: string },
  errorMsg: string,
  durationMs: number
): { ok: false; error: string } {
  recordExpertError(expert.expertId, expert.role, errorMsg);
  const fc = categorizeOutcomeErrorMessage(errorMsg);
  recordExpertOutcome({
    task: args.task,
    success: false,
    durationMs,
    failureCategory: fc,
    ...(expert.modelId !== undefined ? { model: expert.modelId } : {}),
  });
  const durationSec = Math.round(durationMs / 1000);
  const model = expert.modelId ?? 'default';
  return {
    ok: false,
    error: `Expert execution failed after ${String(durationSec)}s (role=${expert.role}, model=${model}): ${errorMsg}`,
  };
}

/** Records success outcome and tracking. */
function handleExpertSuccess(
  args: ExecuteExpertInput,
  expert: { expertId: string; role: string; modelId?: string },
  durationMs: number
): void {
  recordExpertSuccess(expert.expertId, expert.role, durationMs);
  recordExpertOutcome({
    task: args.task,
    success: true,
    durationMs,
    ...(expert.modelId !== undefined ? { model: expert.modelId } : {}),
  });
}

type ExpertResult = { ok: true; value: ExecuteExpertResponse } | { ok: false; error: string };

/** Runs the expert task and records outcomes. Assumes permit is held. */
async function runExpertTask(
  deps: ExecuteExpertDeps,
  args: ExecuteExpertInput,
  expert: Expert
): Promise<ExpertResult> {
  const { expertId } = args;
  const task = buildTask(args);
  injectErrorHints(task, expert.role);
  deps.logger?.info('Executing expert task', { expertId, role: expert.role, taskId: task.id });

  const monitor = getHeartbeatMonitor();
  const sessionId = monitor.startSession(expertId);
  const startTime = getTimeProvider().now();

  // Periodic heartbeat + expiry detection (Issue #1087, #1088 Phase 2)
  // Note: Check health BEFORE emitting heartbeat — checking after would
  // always show 'alive' since heartbeat() resets the timer.
  const heartbeatTimer = setInterval(() => {
    if (monitor.isExpired(sessionId)) {
      deps.logger?.warn('Expert session expired', { expertId, sessionId });
    }
    monitor.heartbeat(sessionId);
  }, HEARTBEAT_TIMEOUTS.heartbeatIntervalMs);

  let result;
  try {
    result = await expert.execute(task);
  } finally {
    clearInterval(heartbeatTimer);
    monitor.endSession(sessionId);
  }
  const durationMs = getTimeProvider().now() - startTime;
  const modelId = expert.expertConfig.modelPreference?.modelId;
  const info = { expertId, role: expert.role, ...(modelId !== undefined ? { modelId } : {}) };

  if (!result.ok) {
    deps.logger?.warn('Expert execution failed', { expertId, error: result.error.message });
    return handleExpertFailure(args, info, result.error.message, durationMs);
  }

  deps.logger?.info('Expert execution completed', { expertId, durationMs });
  handleExpertSuccess(args, info, durationMs);
  autoCatalogScan(result.value.output as string, expertId, deps.logger);

  return {
    ok: true,
    value: buildSuccessResponse({
      expertId,
      role: expert.role,
      output: result.value.output,
      durationMs,
      tokensUsed: result.value.metadata.tokensUsed,
      modelUsed: expert.expertConfig.modelPreference?.modelId,
    }),
  };
}

/**
 * Handles the execute_expert tool execution.
 * (Issue #747 - CLI detection, Issue #1029 - admission control)
 */
async function handleExecuteExpert(
  deps: ExecuteExpertDeps,
  args: ExecuteExpertInput
): Promise<ExpertResult> {
  const lookup = lookupExpert(deps.expertRegistry, args.expertId);
  if (!lookup.ok) return { ok: false, error: lookup.error };

  const adapterError = await requireAdapterAvailable(deps.cliCache);
  if (adapterError !== undefined) return { ok: false, error: adapterError };

  const pool = getExpertPool();
  let permit;
  try {
    permit = await pool.acquire();
  } catch (acquireErr: unknown) {
    return { ok: false, error: getErrorMessage(acquireErr) };
  }

  try {
    return await runExpertTask(deps, args, lookup.expert);
  } finally {
    pool.release(permit);
  }
}

/** MCP tool response type for execute_expert */
type ExecuteExpertToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Creates the core handler logic for execute_expert tool.
 * Rate limiting is handled by createSecureHandler wrapper.
 * @param deps - Tool dependencies
 * @returns Context-aware handler function
 */
function createExecuteExpertHandler(deps: ExecuteExpertDeps) {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;
  return async (args: unknown, ctx: HandlerContext): Promise<ExecuteExpertToolResponse> => {
    // Validate input
    const validationResult = ExecuteExpertInputSchema.safeParse(args);
    if (!validationResult.success) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Validation error: ${formatZodError(validationResult.error)}` },
        ],
      };
    }

    ctx.logger.info('Executing expert task', {
      expertId: validationResult.data.expertId,
      taskLength: validationResult.data.task.length,
    });

    // Look up expert role for notification
    const expert = deps.expertRegistry.get(validationResult.data.expertId);
    const role = expert?.role ?? 'unknown';
    notifier.info('execute_expert', { event: 'expert_start', role });

    // Execute tool logic (heartbeat provides observability during long runs)
    const result = await withProgressHeartbeat('execute_expert', notifier, () =>
      handleExecuteExpert(deps, validationResult.data)
    );

    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to execute expert: ${result.error}` }],
      };
    }

    notifier.info('execute_expert', {
      event: 'expert_complete',
      role: result.value.role,
      confidence: result.value.status === 'success' ? 1 : 0,
      tokenUsage: result.value.tokensUsed,
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result.value, null, 2) }],
    };
  };
}

/**
 * Registers the execute_expert tool with the MCP server.
 *
 * Uses createSecureHandler for standardized security middleware (Issue #531).
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerExecuteExpertTool(server: McpServer, deps: ExecuteExpertDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'execute_expert' });
  const notifier = deps.notifier ?? createMcpNotifier(server);
  const depsWithNotifier = { ...deps, notifier };
  const toolSchema = {
    expertId: z.string().min(1).describe('Expert ID from create_expert tool'),
    task: z.string().min(1).describe('Task description for the expert to execute'),
    context: z.record(z.unknown()).optional().describe('Additional context metadata for the task'),
    timeoutMs: z
      .number()
      .int()
      .min(10_000)
      .max(900_000)
      .optional()
      .describe('Optional timeout in ms (10s-900s). Overrides auto-detected timeout.'),
  };

  const description =
    'Execute a task using a previously created expert agent. ' +
    'Returns the expert analysis including output, confidence, and token usage.';

  // Wrap handler with secure handler for rate limiting and request context (Issue #531)
  const secureHandler = createSecureHandler(createExecuteExpertHandler(depsWithNotifier), {
    toolName: 'execute_expert',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Wrap with timeout protection (Issue #271, CVE-2026-0621, Issue #661)
  const timeoutMs = getToolTimeout('execute_expert', deps.security);
  const wrappedHandler = wrapToolWithTimeout('execute_expert', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'execute_expert',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered execute_expert tool with secure handler and timeout protection');
}
