/* eslint-disable max-lines */
/**
 * nexus-agents/mcp - Execute Expert Tool
 *
 * MCP tool for executing tasks with previously created expert agents.
 * Experts must be created first using the create_expert tool.
 *
 * @module mcp/tools/execute-expert
 * (Source: Issue #437 - Add execute_expert tool)
 * (Refactored: Issue #1298 - MCP Tasks async execution)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  ToolTaskHandler,
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra,
} from '@modelcontextprotocol/sdk/experimental/tasks';
import type { CreateTaskResult, GetTaskResult } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { ILogger, Task } from '../../core/index.js';
import { getErrorMessage } from '../../core/index.js';

import {
  createLogger,
  getTimeProvider,
  getRandomProvider,
  formatZodError,
} from '../../core/index.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import { createMcpNotifier, NOOP_NOTIFIER, withProgressHeartbeat } from '../mcp-notifier.js';
import type { Expert } from '../../agents/index.js';
import { getToolMemory } from './tool-memory.js';
import {
  autoCatalogScan,
  handleExpertFailure,
  handleExpertSuccess,
} from './execute-expert-recording.js';
import { getExpertFallbackChain, ROLE_TO_TASK_CATEGORY } from './create-expert-routing.js';
import { getGlobalRegistry } from '../../adapters/unified-registry.js';
import { createExpert } from '../../agents/experts/expert-factory.js';
import { getOutcomeStore } from '../../orchestration/outcomes/outcome-store.js';
import { getExpertTaskTimeout, HEARTBEAT_TIMEOUTS } from '../../config/timeouts.js';
import type { ICliDetectionCache } from '../../cli-adapters/cli-detection-cache.js';
import { requireAdapterAvailable } from '../middleware/adapter-availability.js';
import { getExpertPool } from '../../agents/expert-pool.js';
import { withDepthGuard } from '../middleware/spawn-depth-guard.js';
import { getHeartbeatMonitor } from '../../agents/heartbeat-monitor.js';
import { clampTaskTtl, DEFAULT_TASK_TTL_MS } from '../task-store.js';
import { toolError, toolSuccess, type BaseMcpToolDeps } from './tool-result.js';

/** Minimum effective timeout for expert tasks — LLM inference takes 20-90s minimum. (#1163, #1330) */
export const EXPERT_TIMEOUT_FLOOR_MS = 120_000;

/**
 * Input schema for execute_expert tool.
 */
export const ExecuteExpertInputSchema = z.object({
  expertId: z.string().min(1).describe('Expert ID from create_expert tool'),
  task: z.string().min(1).max(50000).describe('Task description for the expert to execute'),
  context: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Additional context metadata for the task'),
  timeoutMs: z
    .number()
    .int()
    .min(EXPERT_TIMEOUT_FLOOR_MS)
    .max(900_000)
    .optional()
    .describe('Optional timeout in ms (120s-900s). Overrides auto-detected timeout.'),
});

/**
 * Type for validated execute expert input.
 */
export type ExecuteExpertInput = z.infer<typeof ExecuteExpertInputSchema>;

/**
 * Dependencies for execute_expert tool.
 */
export interface ExecuteExpertDeps extends BaseMcpToolDeps {
  /** Registry of created experts (shared with create_expert) */
  expertRegistry: Map<string, Expert>;
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
 * Zod schema enforces timeoutMs >= EXPERT_TIMEOUT_FLOOR_MS, so no runtime floor needed (#1330).
 */
function buildTask(input: ExecuteExpertInput): Task {
  const autoTimeout = getExpertTaskTimeout(input.task);
  const timeoutMs = input.timeoutMs ?? autoTimeout;
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

type ExpertResult = { ok: true; value: ExecuteExpertResponse } | { ok: false; error: string };

/** Rate-limit indicator patterns in error messages. */
const RATE_LIMIT_PATTERNS = ['rate limit', '429', 'too many requests', 'quota exceeded'];

/** Checks whether an error message indicates a rate-limit failure. */
function isRateLimitFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return RATE_LIMIT_PATTERNS.some((p) => lower.includes(p));
}

/** Minimum consecutive failures before proactive fallback (#1401). */
const DEGRADATION_CONSECUTIVE_THRESHOLD = 3;

/** Worker model prefix for outcome queries. */
const WORKER_PREFIX = 'worker-';

/**
 * Checks if an expert role is degraded based on recent outcome data.
 * Returns true if the role has >= DEGRADATION_CONSECUTIVE_THRESHOLD
 * consecutive trailing failures. Lightweight — filters outcome store in memory.
 */
export function isExpertDegraded(role: string): boolean {
  const store = getOutcomeStore();
  const modelKey = `${WORKER_PREFIX}${role}`;
  const all = store.query();
  const roleOutcomes = all.filter((o) => o.model === modelKey);
  if (roleOutcomes.length < DEGRADATION_CONSECUTIVE_THRESHOLD) return false;
  let consecutive = 0;
  for (let i = roleOutcomes.length - 1; i >= 0; i--) {
    const outcome = roleOutcomes[i];
    if (outcome === undefined || outcome.success) break;
    consecutive++;
  }
  return consecutive >= DEGRADATION_CONSECUTIVE_THRESHOLD;
}

/**
 * Attempts to execute the task with a fallback CLI after a rate-limit failure. (#1532)
 * Creates a temporary expert with the same config but a different adapter.
 * Tries the first available fallback only (bounded retry).
 */
async function tryExpertFallback(
  expert: Expert,
  task: Task,
  logger: ILogger | undefined
): Promise<ExpertResult | undefined> {
  const roleKey = `${expert.role}_expert`;
  const category = ROLE_TO_TASK_CATEGORY[roleKey];
  if (category === undefined) return undefined;
  const effectiveLogger = logger ?? createLogger({ tool: 'execute_expert' });
  const registry = getGlobalRegistry({ logger: effectiveLogger });
  const routing = registry.getRouting(category);
  const primaryCli = routing?.primaryCli ?? 'unknown';
  const chain = getExpertFallbackChain(roleKey, primaryCli, effectiveLogger);
  if (chain.length === 0) return undefined;
  const fallbackCli = chain[0];
  if (fallbackCli === undefined) return undefined;
  const fallbackAdapter = registry.getAdapterForCli(fallbackCli);
  logger?.info('Retrying expert with fallback CLI', { role: expert.role, fallbackCli });

  const fallbackResult = createExpert(expert.expertConfig, { adapter: fallbackAdapter });
  if (!fallbackResult.ok) return undefined;

  const result = await fallbackResult.value.execute(task);
  if (!result.ok) return undefined;

  return {
    ok: true,
    value: buildSuccessResponse({
      expertId: expert.id,
      role: expert.role,
      output: result.value.output,
      durationMs: 0,
      tokensUsed: result.value.metadata.tokensUsed,
      modelUsed: fallbackCli,
    }),
  };
}

/** Options for classifyExpertResult. */
interface ClassifyExpertResultOpts {
  result: Awaited<ReturnType<Expert['execute']>>;
  expert: Expert;
  task: Task;
  args: ExecuteExpertInput;
  durationMs: number;
  logger: ILogger | undefined;
}

/** Classifies expert execution result, with rate-limit fallback (#1532). */
async function classifyExpertResult(opts: ClassifyExpertResultOpts): Promise<ExpertResult> {
  const { result, expert, task, args, durationMs, logger } = opts;
  const modelId = expert.expertConfig.modelPreference?.modelId;
  const info = {
    expertId: args.expertId,
    role: expert.role,
    ...(modelId !== undefined ? { modelId } : {}),
  };

  if (!result.ok) {
    if (isRateLimitFailure(result.error.message)) {
      const fallback = await tryExpertFallback(expert, task, logger);
      if (fallback !== undefined) return fallback;
    }
    logger?.warn('Expert execution failed', {
      expertId: args.expertId,
      error: result.error.message,
    });
    return handleExpertFailure(args.task, info, result.error.message, durationMs);
  }

  logger?.info('Expert execution completed', { expertId: args.expertId, durationMs });
  handleExpertSuccess(args.task, info, durationMs);
  if (typeof result.value.output === 'string') {
    autoCatalogScan(result.value.output, args.expertId, logger);
  }
  return {
    ok: true,
    value: buildSuccessResponse({
      expertId: args.expertId,
      role: expert.role,
      output: result.value.output,
      durationMs,
      tokensUsed: result.value.metadata.tokensUsed,
      modelUsed: modelId,
    }),
  };
}

/** Runs the expert task and records outcomes. Assumes permit is held. */
async function runExpertTask(
  deps: ExecuteExpertDeps,
  args: ExecuteExpertInput,
  expert: Expert
): Promise<ExpertResult> {
  const { expertId } = args;
  const task = buildTask(args);
  injectErrorHints(task, expert.role);

  // Proactive fallback for degraded experts (#1401)
  if (isExpertDegraded(expert.role)) {
    deps.logger?.warn('Expert role degraded, trying fallback', { role: expert.role });
    const fallback = await tryExpertFallback(expert, task, deps.logger);
    if (fallback !== undefined) return fallback;
  }

  deps.logger?.info('Executing expert task', { expertId, role: expert.role, taskId: task.id });

  const monitor = getHeartbeatMonitor();
  const sessionId = monitor.startSession(expertId);
  const startTime = getTimeProvider().now();

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
  return classifyExpertResult({ result, expert, task, args, durationMs, logger: deps.logger });
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

  // Depth guard: prevent runaway nested expert execution (#1500)
  try {
    return await withDepthGuard('execute_expert', async () => {
      const pool = getExpertPool();
      let permit;
      try {
        permit = await pool.acquire();
      } catch (acquireErr: unknown) {
        return { ok: false as const, error: getErrorMessage(acquireErr) };
      }

      try {
        return await runExpertTask(deps, args, lookup.expert);
      } finally {
        pool.release(permit);
      }
    });
  } catch (depthError: unknown) {
    return { ok: false, error: getErrorMessage(depthError) };
  }
}

// ============================================================================
// Task Handler (Issue #1298 — Layer 2 MCP Tasks async execution)
// ============================================================================

/** Input shape type for registerToolTask. */
type ExecuteExpertToolSchema = typeof EXECUTE_EXPERT_TOOL_SCHEMA;

const EXECUTE_EXPERT_TOOL_SCHEMA = {
  expertId: z.string().min(1).describe('Expert ID from create_expert tool'),
  task: z.string().min(1).max(50000).describe('Task description for the expert to execute'),
  context: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Additional context metadata for the task'),
  timeoutMs: z
    .number()
    .int()
    .min(EXPERT_TIMEOUT_FLOOR_MS)
    .max(900_000)
    .optional()
    .describe('Optional timeout in ms (120s-900s). Overrides auto-detected timeout.'),
};

/**
 * Creates a ToolTaskHandler for execute_expert.
 *
 * Implements the MCP Tasks primitive (SEP-1686):
 * - createTask: validates, starts background execution, returns task immediately
 * - getTask: returns current task status from store
 * - getTaskResult: returns completed/failed result from store
 *
 * When the client supports tasks, createTask returns immediately and the client
 * polls for status. When the client doesn't support tasks, the SDK internally
 * polls until completion (handleAutomaticTaskPolling).
 *
 * @param deps - Tool dependencies
 * @param logger - Logger instance
 */
function createTaskHandler(
  deps: ExecuteExpertDeps,
  logger: ILogger
): ToolTaskHandler<ExecuteExpertToolSchema> {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;

  return {
    createTask: (
      args: ExecuteExpertInput,
      extra: CreateTaskRequestHandlerExtra
    ): Promise<CreateTaskResult> => {
      // Validate input
      const parsed = ExecuteExpertInputSchema.safeParse(args);
      if (!parsed.success) {
        return Promise.reject(new Error(`Validation error: ${formatZodError(parsed.error)}`));
      }

      const validatedArgs = parsed.data;
      const { taskStore } = extra;

      // Create task with clamped TTL
      const ttl = clampTaskTtl(DEFAULT_TASK_TTL_MS);
      const taskPromise = taskStore.createTask({ ttl, pollInterval: 5000 }).then((task) => {
        logger.info('Task created for execute_expert', {
          taskId: task.taskId,
          expertId: validatedArgs.expertId,
        });

        // Start background execution (fire-and-forget)
        void runBackgroundExpertTask({
          deps,
          args: validatedArgs,
          taskId: task.taskId,
          taskStore,
          notifier,
        });

        return { task } as CreateTaskResult;
      });

      return taskPromise;
    },

    getTask: (
      _args: ExecuteExpertInput,
      extra: TaskRequestHandlerExtra
    ): Promise<GetTaskResult> => {
      return extra.taskStore.getTask(extra.taskId) as Promise<GetTaskResult>;
    },

    getTaskResult: (
      _args: ExecuteExpertInput,
      extra: TaskRequestHandlerExtra
    ): Promise<CallToolResult> => {
      return extra.taskStore.getTaskResult(extra.taskId) as Promise<CallToolResult>;
    },
  };
}

/** Options for background expert task execution. */
interface BackgroundExpertTaskOpts {
  deps: ExecuteExpertDeps;
  args: ExecuteExpertInput;
  taskId: string;
  taskStore: CreateTaskRequestHandlerExtra['taskStore'];
  notifier: IMcpNotifier;
}

/**
 * Runs expert execution in the background, updating task store on completion.
 * Fire-and-forget — errors are caught and stored as task failures.
 */
async function runBackgroundExpertTask(opts: BackgroundExpertTaskOpts): Promise<void> {
  const { deps, args, taskId, taskStore, notifier } = opts;
  const logger = deps.logger ?? createLogger({ tool: 'execute_expert' });
  try {
    notifier.info('execute_expert', {
      event: 'expert_start',
      taskId,
      expertId: args.expertId,
    });

    const result = await withProgressHeartbeat('execute_expert', notifier, () =>
      handleExecuteExpert(deps, args)
    );

    if (!result.ok) {
      await taskStore.storeTaskResult(taskId, 'failed', {
        ...toolError(`Failed to execute expert: ${result.error}`),
      });
      return;
    }

    notifier.info('execute_expert', {
      event: 'expert_complete',
      taskId,
      role: result.value.role,
      confidence: result.value.status === 'success' ? 1 : 0,
      tokenUsage: result.value.tokensUsed,
    });

    await taskStore.storeTaskResult(taskId, 'completed', {
      ...toolSuccess(JSON.stringify(result.value, null, 2)),
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.warn('Background expert task failed', { taskId, error: message });
    try {
      await taskStore.storeTaskResult(taskId, 'failed', {
        ...toolError(`Expert execution error: ${message}`),
      });
    } catch (storeError: unknown) {
      logger.warn('Failed to store task failure result', {
        taskId,
        error: getErrorMessage(storeError),
      });
    }
  }
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Registers the execute_expert tool with the MCP server.
 *
 * Uses MCP Tasks primitive (SEP-1686) via registerToolTask for async execution.
 * taskSupport: 'optional' preserves sync fallback for clients without task support.
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

  const description =
    'Execute a task using a previously created expert agent. ' +
    'Returns the expert analysis including output, confidence, and token usage.';

  server.experimental.tasks.registerToolTask(
    'execute_expert',
    {
      description,
      inputSchema: EXECUTE_EXPERT_TOOL_SCHEMA,
      execution: { taskSupport: 'optional' },
    },
    createTaskHandler(depsWithNotifier, logger)
  );
  logger.info('Registered execute_expert tool with MCP Tasks support (taskSupport: optional)');
}
