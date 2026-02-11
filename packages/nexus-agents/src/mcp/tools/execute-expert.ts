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
import {
  createLogger,
  getTimeProvider,
  getRandomProvider,
  formatZodError,
} from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import type { Expert } from '../../agents/index.js';
import { getToolMemory } from './tool-memory.js';
import { getAutoCatalog } from './research-auto-catalog.js';
import type { ICliDetectionCache } from '../../cli-adapters/cli-detection-cache.js';
import { requireAdapterAvailable } from '../middleware/adapter-availability.js';

/**
 * Input schema for execute_expert tool.
 */
export const ExecuteExpertInputSchema = z.object({
  expertId: z.string().min(1).describe('Expert ID from create_expert tool'),
  task: z.string().min(1).describe('Task description for the expert to execute'),
  context: z.record(z.unknown()).optional().describe('Additional context metadata for the task'),
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
  return {
    id: `exec-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 9)}`,
    description: input.task,
    context: {
      metadata: input.context ?? {},
    },
    constraints: {
      maxTokens: 4096,
      maxDuration: 90_000, // 90s inner timeout — must complete before MCP client timeout (120s)
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
 * Build error response for failed execution.
 */
function buildErrorResponse(
  expertId: string,
  role: string,
  errorMessage: string,
  durationMs: number
): ExecuteExpertResponse {
  return {
    expertId,
    role,
    output: '',
    durationMs,
    tokensUsed: 0,
    status: 'error',
    error: errorMessage,
  };
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
      error: error instanceof Error ? error.message : String(error),
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
      error: error instanceof Error ? error.message : String(error),
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
      error: error instanceof Error ? error.message : String(error),
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
      error: error instanceof Error ? error.message : String(error),
      expertId,
    });
  }
}

/**
 * Handles the execute_expert tool execution.
 * (Issue #747 - CLI detection support)
 */
async function handleExecuteExpert(
  deps: ExecuteExpertDeps,
  args: ExecuteExpertInput
): Promise<{ ok: true; value: ExecuteExpertResponse } | { ok: false; error: string }> {
  const { expertId } = args;

  const lookup = lookupExpert(deps.expertRegistry, expertId);
  if (!lookup.ok) {
    return { ok: false, error: lookup.error };
  }
  const expert = lookup.expert;

  // Validate adapter availability before execution (Issue #656, #747, #749)
  const adapterError = await requireAdapterAvailable(deps.cliCache);
  if (adapterError !== undefined) {
    return { ok: false, error: adapterError };
  }

  const task = buildTask(args);
  injectErrorHints(task, expert.role);
  deps.logger?.info('Executing expert task', { expertId, role: expert.role, taskId: task.id });

  const startTime = getTimeProvider().now();
  const result = await expert.execute(task);
  const durationMs = getTimeProvider().now() - startTime;

  if (!result.ok) {
    deps.logger?.warn('Expert execution failed', { expertId, error: result.error.message });
    recordExpertError(expertId, expert.role, result.error.message);
    return {
      ok: true,
      value: buildErrorResponse(expertId, expert.role, result.error.message, durationMs),
    };
  }

  deps.logger?.info('Expert execution completed', {
    expertId,
    durationMs,
    tokensUsed: result.value.metadata.tokensUsed,
  });

  recordExpertSuccess(expertId, expert.role, durationMs);
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

    // Execute tool logic
    const result = await handleExecuteExpert(deps, validationResult.data);

    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to execute expert: ${result.error}` }],
      };
    }

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
  const toolSchema = {
    expertId: z.string().min(1).describe('Expert ID from create_expert tool'),
    task: z.string().min(1).describe('Task description for the expert to execute'),
    context: z.record(z.unknown()).optional().describe('Additional context metadata for the task'),
  };

  const description =
    'Execute a task using a previously created expert agent. ' +
    'Returns the expert analysis including output, confidence, and token usage.';

  // Wrap handler with secure handler for rate limiting and request context (Issue #531)
  const secureHandler = createSecureHandler(createExecuteExpertHandler(deps), {
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
