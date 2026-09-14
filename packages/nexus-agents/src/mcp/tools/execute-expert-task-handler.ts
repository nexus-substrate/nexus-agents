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
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  ToolTaskHandler,
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra,
} from '@modelcontextprotocol/sdk/experimental/tasks';
import type { CreateTaskResult, GetTaskResult } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError, getErrorMessage } from '../../core/index.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import { NOOP_NOTIFIER, withProgressHeartbeat } from '../mcp-notifier.js';
import { EXPERT_TIMEOUTS } from '../../config/timeouts.js';
import { clampTaskTtl, DEFAULT_TASK_TTL_MS } from '../task-store.js';
import { toolStructuredError, toolSuccess } from './tool-result.js';

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
 * @param executor - The parent's execute path and full input schema
 */
export function createTaskHandler<TDeps extends ExpertTaskDeps, TArgs extends ExpertTaskArgs>(
  deps: TDeps,
  logger: ILogger,
  executor: ExpertTaskExecutor<TDeps, TArgs>
): ToolTaskHandler<ExecuteExpertToolSchema> {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;

  return {
    createTask: (
      args: ExpertTaskArgs,
      extra: CreateTaskRequestHandlerExtra
    ): Promise<CreateTaskResult> => {
      // Validate input
      const parsed = executor.inputSchema.safeParse(args);
      if (!parsed.success) {
        return Promise.reject(new Error(`Validation error: ${formatZodError(parsed.error)}`));
      }

      const validatedArgs = parsed.data;
      const { taskStore } = extra;

      // Create task with clamped TTL
      const ttl = clampTaskTtl(DEFAULT_TASK_TTL_MS);
      return taskStore.createTask({ ttl, pollInterval: 5000 }).then((task) => {
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
          execute: executor.execute,
        });

        return { task };
      });
    },

    getTask: (_args: ExpertTaskArgs, extra: TaskRequestHandlerExtra): Promise<GetTaskResult> => {
      return extra.taskStore.getTask(extra.taskId);
    },

    getTaskResult: (
      _args: ExpertTaskArgs,
      extra: TaskRequestHandlerExtra
    ): Promise<CallToolResult> => {
      return extra.taskStore.getTaskResult(extra.taskId) as Promise<CallToolResult>;
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

/**
 * Runs expert execution in the background, updating task store on completion.
 * Fire-and-forget — errors are caught and stored as task failures.
 */
async function runBackgroundExpertTask<TDeps extends ExpertTaskDeps, TArgs extends ExpertTaskArgs>(
  opts: BackgroundExpertTaskOpts<TDeps, TArgs>
): Promise<void> {
  const { deps, args, taskId, taskStore, notifier, execute } = opts;
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
      await taskStore.storeTaskResult(taskId, 'failed', {
        ...toolStructuredError({
          errorCategory: 'internal',
          message: `Failed to execute expert: ${result.error}`,
        }),
      });
      return;
    }

    notifyExpertComplete(notifier, taskId, result.value);

    await taskStore.storeTaskResult(taskId, 'completed', {
      ...toolSuccess(JSON.stringify(result.value, null, 2)),
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.warn('Background expert task failed', { taskId, error: message });
    try {
      await taskStore.storeTaskResult(taskId, 'failed', {
        ...toolStructuredError({
          errorCategory: 'internal',
          message: `Expert execution error: ${message}`,
        }),
      });
    } catch (storeError: unknown) {
      logger.warn('Failed to store task failure result', {
        taskId,
        error: getErrorMessage(storeError),
      });
    }
  }
}
