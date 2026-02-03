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
}

/**
 * Checks if any model adapter API key is configured.
 * Returns an error message if no keys are found, or undefined if at least one is available.
 * (Issue #656 - Actionable API key error messages)
 */
function checkApiKeyAvailability(): string | undefined {
  const keys = [
    { name: 'ANTHROPIC_API_KEY', provider: 'Anthropic (Claude)' },
    { name: 'OPENAI_API_KEY', provider: 'OpenAI' },
    { name: 'GOOGLE_AI_API_KEY', provider: 'Google AI (Gemini)' },
  ];
  const available = keys.filter(
    (k) => process.env[k.name] !== undefined && process.env[k.name] !== ''
  );
  if (available.length > 0) {
    return undefined; // At least one key is available
  }
  const keyList = keys.map((k) => `  - ${k.name} (${k.provider})`).join('\n');
  return (
    'No model adapter API key configured. Expert execution requires at least one API key.\n\n' +
    'Set one of the following environment variables:\n' +
    keyList +
    '\n\nSee: https://github.com/williamzujkowski/nexus-agents#prerequisites--environment'
  );
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
      maxDuration: 120000, // 2 minute timeout for task execution
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
function buildSuccessResponse(
  expertId: string,
  role: string,
  output: unknown,
  durationMs: number,
  tokensUsed: number
): ExecuteExpertResponse {
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  return {
    expertId,
    role,
    output: outputStr,
    durationMs,
    tokensUsed,
    status: 'success',
  };
}

/**
 * Handles the execute_expert tool execution.
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

  // Validate API key availability before execution (Issue #656)
  const apiKeyError = checkApiKeyAvailability();
  if (apiKeyError !== undefined) {
    return { ok: false, error: apiKeyError };
  }

  const task = buildTask(args);
  deps.logger?.info('Executing expert task', { expertId, role: expert.role, taskId: task.id });

  const startTime = getTimeProvider().now();
  const result = await expert.execute(task);
  const durationMs = getTimeProvider().now() - startTime;

  if (!result.ok) {
    deps.logger?.warn('Expert execution failed', { expertId, error: result.error.message });
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

  return {
    ok: true,
    value: buildSuccessResponse(
      expertId,
      expert.role,
      result.value.output,
      durationMs,
      result.value.metadata.tokensUsed
    ),
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

    ctx.logger.debug('Executing expert task', { expertId: validationResult.data.expertId });

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
