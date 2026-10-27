// @export-no-consumer-yet — see #4485
/**
 * nexus-agents/mcp - Execute Expert Tool: MCP Tasks async handler
 *
 * The MCP Tasks (SEP-1686) surface of `execute_expert`: the tool schema handed
 * to `registerToolTask` and the createTask / getTask / getTaskResult handler
 * that runs the synchronous execute path in the background. Moved out of
 * `execute-expert.ts` (#6148); `registerExecuteExpertTool` there is the only
 * consumer.
 *
 * The synchronous execute path (`handleExecuteExpert`) and the full input
 * schema (`ExecuteExpertInputSchema`) are INJECTED through
 * {@link ExpertTaskExecutor} rather than imported, so this module never
 * imports its parent and the split adds no import cycle.
 *
 * @module mcp/tools/execute-expert-task-handler
 * (Source: Issue #1298 - MCP Tasks async execution)
 */

import { z } from 'zod';
import type { CallToolResult } from '../sdk-facade/index.js';
import type {
  CreateTaskOptions,
  CreateTaskResult,
  GetTaskResult,
  Task,
  TaskStatus,
} from '../task-store.js';
import type { ILogger } from '../../core/index.js';

/**
 * Task store methods required by the expert task handler.
 */
export interface HandlerTaskStore {
  createTask: (
    taskParams: CreateTaskOptions,
    requestId?: unknown,
    request?: unknown,
    sessionId?: string
  ) => Promise<Task>;
  getTask: (taskId: string, sessionId?: string) => Promise<Task | null>;
  storeTaskResult: (
    taskId: string,
    status: 'completed' | 'failed',
    result: CallToolResult,
    sessionId?: string
  ) => Promise<void>;
  getTaskResult: (taskId: string, sessionId?: string) => Promise<CallToolResult>;
  updateTaskStatus?: (
    taskId: string,
    status: TaskStatus,
    statusMessage?: string,
    sessionId?: string
  ) => Promise<void>;
  listTasks?: (
    cursor?: string,
    sessionId?: string
  ) => Promise<{ tasks: Task[]; nextCursor?: string | undefined }>;
}

/**
 * Extended handler extra with task store for task creation.
 */
export interface CreateTaskRequestHandlerExtra {
  taskStore: HandlerTaskStore;
  sessionId?: string | undefined;
}

/**
 * Extended handler extra with task ID and store for task operations.
 */
export interface TaskRequestHandlerExtra {
  taskId: string;
  taskStore: HandlerTaskStore;
  sessionId?: string | undefined;
}

/**
 * Interface for task-based tool handlers.
 */
export interface ToolTaskHandler<_Args = unknown> {
  createTask: (
    args: ExpertTaskArgs,
    extra: CreateTaskRequestHandlerExtra
  ) => Promise<CreateTaskResult>;
  getTask: (args: ExpertTaskArgs, extra: TaskRequestHandlerExtra) => Promise<GetTaskResult>;
  getTaskResult: (args: ExpertTaskArgs, extra: TaskRequestHandlerExtra) => Promise<CallToolResult>;
}
import { createLogger, formatZodError, getErrorMessage } from '../../core/index.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import { NOOP_NOTIFIER, withProgressHeartbeat } from '../mcp-notifier.js';
import { EXPERT_TIMEOUTS } from '../../config/timeouts.js';
import { clampTaskTtl, DEFAULT_TASK_TTL_MS } from '../task-store.js';
import { release, suggestRetryAfterMs, tryAcquire } from '../jobs/job-concurrency.js';
import { defaultBusyEnvelope } from '../jobs/run-as-job.js';
import { toolStructuredError, toolSuccess } from './tool-result.js';
import { buildToolMetadata } from '../tool-build-metadata.js';
import { ExpertRecoveryPolicySchema } from '../../agents/index.js';

/** The slice of the tool deps this handler reads itself; the rest passes through to `execute`. */
interface ExpertTaskDeps {
  logger?: ILogger;
  notifier?: IMcpNotifier | undefined;
}

/**
 * What {@link notifyExpertComplete} reports off a successful response. The
 * parent's `ExecuteExpertResponse` satisfies it structurally.
 */
interface ExpertTaskCompletion {
  role: string;
  status: 'success' | 'error';
  tokensUsed: number;
  tokensMeasured?: boolean;
}

/** Outcome of the injected execute path (the parent's `ExpertResult`). */
type ExpertTaskResult = { ok: true; value: ExpertTaskCompletion } | { ok: false; error: string };

/**
 * The parent-owned pieces of the async path. Injected so this module never
 * imports `execute-expert.ts` (#6148).
 */
export interface ExpertTaskExecutor<TDeps extends ExpertTaskDeps, TArgs extends ExpertTaskArgs> {
  /**
   * The full input schema (`ExecuteExpertInputSchema`, a superset of
   * {@link EXECUTE_EXPERT_TOOL_SCHEMA}). Validates createTask args before the
   * background run starts.
   */
  inputSchema: z.ZodType<TArgs>;
  /** The synchronous execute path (`handleExecuteExpert`). */
  execute: (deps: TDeps, args: TArgs) => Promise<ExpertTaskResult>;
}

// ============================================================================
// Task Handler (Issue #1298 — Layer 2 MCP Tasks async execution)
// ============================================================================

/** Input shape type for registerToolTask. */
type ExecuteExpertToolSchema = typeof EXECUTE_EXPERT_TOOL_SCHEMA;

/** The args the SDK hands the handler, as inferred from the registered shape. */
type ExpertTaskArgs = z.infer<z.ZodObject<ExecuteExpertToolSchema>>;

export const EXECUTE_EXPERT_TOOL_SCHEMA = {
  expertId: z.string().min(1).describe('Expert ID from create_expert tool'),
  task: z.string().min(1).max(50000).describe('Task description for the expert to execute'),
  context: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Additional context metadata for the task'),
  timeoutMs: z
    .number()
    .int()
    .min(EXPERT_TIMEOUTS.executeFloorMs)
    .max(EXPERT_TIMEOUTS.maxMs)
    .optional()
    .describe('Optional timeout in ms (120s-900s). Overrides auto-detected timeout.'),
  recoveryPolicy: ExpertRecoveryPolicySchema.optional().describe(
    'Optional transient failure recovery policy override'
  ),
};

/**
 * Creates a ToolTaskHandler for execute_expert.
 *
 * Implements the MCP Tasks primitive (SEP-1686):
 * - createTask: validates, acquires a shared job slot, starts background execution
 * - getTask: returns current task status from store
 * - getTaskResult: returns completed/failed result from store
 *
 * When the client supports tasks, createTask returns immediately and the client
 * polls for status. When the client doesn't support tasks, the SDK internally
 * polls until completion (handleAutomaticTaskPolling).
 *
 * @param deps - Tool dependencies
 * @param logger - Logger instance
 * @param executor - The parent's execute path and full input schema
 */
interface CreateTaskContext<TDeps extends ExpertTaskDeps, TArgs extends ExpertTaskArgs> {
  deps: TDeps;
  logger: ILogger;
  executor: ExpertTaskExecutor<TDeps, TArgs>;
  notifier: IMcpNotifier;
}

async function handleCreateTask<TDeps extends ExpertTaskDeps, TArgs extends ExpertTaskArgs>(
  ctx: CreateTaskContext<TDeps, TArgs>,
  args: ExpertTaskArgs,
  extra: CreateTaskRequestHandlerExtra
): Promise<CreateTaskResult> {
  // Validate input
  const parsed = ctx.executor.inputSchema.safeParse(args);
  if (!parsed.success) throw new Error(`Validation error: ${formatZodError(parsed.error)}`);

  const validatedArgs = parsed.data;
  const { taskStore } = extra;

  // Both async surfaces occupy the same per-tool and global job slots (#4978).
  if (!tryAcquire('execute_expert')) {
    const busy = defaultBusyEnvelope(suggestRetryAfterMs('execute_expert'), 'execute_expert');
    throw new Error(busy.content.map((content) => content.text).join('\n'));
  }

  // Create task with clamped TTL
  const ttl = clampTaskTtl(DEFAULT_TASK_TTL_MS);
  try {
    const task =
      extra.sessionId !== undefined
        ? await taskStore.createTask(
            { ttl, pollInterval: 5000 },
            undefined,
            undefined,
            extra.sessionId
          )
        : await taskStore.createTask({ ttl, pollInterval: 5000 });
    ctx.logger.info('Task created for execute_expert', {
      taskId: task.taskId,
      expertId: validatedArgs.expertId,
    });

    // Start background execution (fire-and-forget)
    void runBackgroundExpertTask({
      deps: ctx.deps,
      args: validatedArgs,
      taskId: task.taskId,
      taskStore,
      notifier: ctx.notifier,
      execute: ctx.executor.execute,
      sessionId: extra.sessionId,
    });

    return { task };
  } catch (error: unknown) {
    // The background runner only takes ownership after task creation succeeds.
    release('execute_expert');
    throw error;
  }
}

async function handleGetTask(extra: TaskRequestHandlerExtra): Promise<GetTaskResult> {
  const task =
    extra.sessionId !== undefined
      ? await extra.taskStore.getTask(extra.taskId, extra.sessionId)
      : await extra.taskStore.getTask(extra.taskId);
  if (task === null) {
    throw new Error(`Task with ID ${extra.taskId} not found`);
  }
  return task;
}

/**
 * Creates a ToolTaskHandler for execute_expert.
 *
 * Implements the MCP Tasks primitive (SEP-1686):
 * - createTask: validates, acquires a shared job slot, starts background execution
 * - getTask: returns current task status from store
 * - getTaskResult: returns completed/failed result from store
 *
 * When the client supports tasks, createTask returns immediately and the client
 * polls for status. When the client doesn't support tasks, the SDK internally
 * polls until completion (handleAutomaticTaskPolling).
 *
 * @param deps - Tool dependencies
 * @param logger - Logger instance
 * @param executor - The parent's execute path and full input schema
 */
export function createTaskHandler<TDeps extends ExpertTaskDeps, TArgs extends ExpertTaskArgs>(
  deps: TDeps,
  logger: ILogger,
  executor: ExpertTaskExecutor<TDeps, TArgs>
): ToolTaskHandler<ExecuteExpertToolSchema> {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;
  const ctx: CreateTaskContext<TDeps, TArgs> = { deps, logger, executor, notifier };

  return {
    createTask: (
      args: ExpertTaskArgs,
      extra: CreateTaskRequestHandlerExtra
    ): Promise<CreateTaskResult> => handleCreateTask(ctx, args, extra),

    getTask: (_args: ExpertTaskArgs, extra: TaskRequestHandlerExtra): Promise<GetTaskResult> =>
      handleGetTask(extra),

    getTaskResult: (
      _args: ExpertTaskArgs,
      extra: TaskRequestHandlerExtra
    ): Promise<CallToolResult> => {
      return extra.sessionId !== undefined
        ? extra.taskStore.getTaskResult(extra.taskId, extra.sessionId)
        : extra.taskStore.getTaskResult(extra.taskId);
    },
  };
}

/** Options for background expert task execution. */
interface BackgroundExpertTaskOpts<TDeps extends ExpertTaskDeps, TArgs extends ExpertTaskArgs> {
  deps: TDeps;
  args: TArgs;
  taskId: string;
  taskStore: CreateTaskRequestHandlerExtra['taskStore'];
  notifier: IMcpNotifier;
  execute: ExpertTaskExecutor<TDeps, TArgs>['execute'];
  sessionId?: string | undefined;
}

/** Report a completed background expert task with token provenance. */
function notifyExpertComplete(
  notifier: IMcpNotifier,
  taskId: string,
  response: ExpertTaskCompletion
): void {
  notifier.info('execute_expert', {
    event: 'expert_complete',
    taskId,
    role: response.role,
    confidence: response.status === 'success' ? 1 : 0,
    tokenUsage: response.tokensUsed,
    ...(response.tokensMeasured !== undefined ? { tokensMeasured: response.tokensMeasured } : {}),
  });
}

/** Store background failure result safely. */
async function recordBackgroundFailure(
  taskStore: HandlerTaskStore,
  taskId: string,
  message: string,
  sessionId?: string
): Promise<void> {
  await storeResult(
    taskStore,
    taskId,
    'failed',
    {
      ...toolStructuredError({
        errorCategory: 'internal',
        message,
      }),
    },
    sessionId
  );
}

/** Store background success result safely. */
async function recordBackgroundSuccess<TDeps extends ExpertTaskDeps, TArgs extends ExpertTaskArgs>(
  opts: BackgroundExpertTaskOpts<TDeps, TArgs>,
  completion: ExpertTaskCompletion
): Promise<void> {
  notifyExpertComplete(opts.notifier, opts.taskId, completion);
  await storeResult(
    opts.taskStore,
    opts.taskId,
    'completed',
    {
      ...toolSuccess(JSON.stringify(completion, null, 2)),
    },
    opts.sessionId
  );
}

/**
 * Runs expert execution in the background, updating task store on completion.
 * Fire-and-forget — errors are caught and stored as task failures.
 */
async function runBackgroundExpertTask<TDeps extends ExpertTaskDeps, TArgs extends ExpertTaskArgs>(
  opts: BackgroundExpertTaskOpts<TDeps, TArgs>
): Promise<void> {
  const { deps, args, taskId, taskStore, notifier, execute, sessionId } = opts;
  const logger = deps.logger ?? createLogger({ tool: 'execute_expert' });
  try {
    notifier.info('execute_expert', {
      event: 'expert_start',
      taskId,
      expertId: args.expertId,
    });

    const result = await withProgressHeartbeat('execute_expert', notifier, () =>
      execute(deps, args)
    );

    if (!result.ok) {
      await recordBackgroundFailure(
        taskStore,
        taskId,
        `Failed to execute expert: ${result.error}`,
        sessionId
      );
      return;
    }

    await recordBackgroundSuccess(opts, result.value);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.warn('Background expert task failed', { taskId, error: message });
    try {
      await recordBackgroundFailure(
        taskStore,
        taskId,
        `Expert execution error: ${message}`,
        sessionId
      );
    } catch (storeError: unknown) {
      logger.warn('Failed to store task failure result', {
        taskId,
        error: getErrorMessage(storeError),
      });
    }
  } finally {
    release('execute_expert');
  }
}

/** Helper to call storeTaskResult without passing undefined sessionId */
async function storeResult(
  taskStore: HandlerTaskStore,
  taskId: string,
  status: 'completed' | 'failed',
  result: CallToolResult,
  sessionId?: string
): Promise<void> {
  const producedResult = { ...result, _meta: buildToolMetadata(result._meta) };
  if (sessionId !== undefined) {
    await taskStore.storeTaskResult(taskId, status, producedResult, sessionId);
  } else {
    await taskStore.storeTaskResult(taskId, status, producedResult);
  }
}
