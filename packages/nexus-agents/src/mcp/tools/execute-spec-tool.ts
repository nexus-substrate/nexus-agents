/**
 * MCP tool for spec-driven execution.
 *
 * Exposes the full spec pipeline (parse → decompose → compile →
 * execute → validate → analyze) as an MCP tool.
 *
 * @module mcp/tools/execute-spec-tool
 * (Source: Issue #853 — Phase 5 of AI Software Factory Epic #843)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { parseSpec } from '../../orchestration/spec-parser.js';
import { decomposeSpec } from '../../orchestration/spec-decomposer.js';
import { executeSpec } from '../../orchestration/spec-executor.js';
import { analyzeFailures } from '../../orchestration/failure-analyzer.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { getToolMemory } from './tool-memory.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import { DEFAULT_CLI } from '../../config/model-capabilities-types.js';
import { toolError, toolSuccess, type ToolResult } from './tool-result.js';

// ============================================================================
// Types & Schema
// ============================================================================

export const ExecuteSpecInputSchema = z.object({
  spec: z.string().min(1).max(50_000).describe('Markdown specification to execute'),
  dryRun: z.boolean().optional().default(false).describe('Parse and decompose only'),
});

export type ExecuteSpecInput = z.infer<typeof ExecuteSpecInputSchema>;

export interface ExecuteSpecDeps {
  readonly logger?: ILogger | undefined;
  readonly rateLimiter: RateLimiter;
  readonly security?: SecurityConfig | undefined;
}

// ============================================================================
// Handler
// ============================================================================

function createDryRunResponse(input: ExecuteSpecInput, logger: ILogger): ToolResult {
  const parseResult = parseSpec(input.spec);
  if (!parseResult.ok) {
    return toolError(`Parse error: ${parseResult.error.message}`);
  }

  const dagResult = decomposeSpec(parseResult.value);
  if (!dagResult.ok) {
    return toolError(`Decompose error: ${dagResult.error.message}`);
  }

  logger.info('Dry run completed', {
    title: parseResult.value.title,
    nodes: dagResult.value.nodes.length,
  });
  const output = { mode: 'dry_run', spec: parseResult.value, dag: dagResult.value };
  return toolSuccess(JSON.stringify(output, null, 2));
}

async function createFullResponse(input: ExecuteSpecInput, logger: ILogger): Promise<ToolResult> {
  const startMs = Date.now();
  const result = await executeSpec(input.spec);
  const durationMs = Date.now() - startMs;

  if (!result.ok) {
    recordSpecOutcome(false, durationMs, result.error.stage);
    return toolError(`Execution error (${result.error.stage}): ${result.error.message}`);
  }

  const analysis = analyzeFailures(result.value);
  const satisfaction = result.value.validation.satisfaction;
  logger.info('Spec execution completed', {
    satisfaction,
    passed: analysis.ok ? analysis.value.passed : false,
  });

  recordSpecSuccess(satisfaction, durationMs);
  recordSpecOutcome(true, durationMs);

  const output = {
    mode: 'execute',
    execution: result.value,
    analysis: analysis.ok ? analysis.value : null,
  };
  return toolSuccess(JSON.stringify(output, null, 2));
}

// ============================================================================
// Registration
// ============================================================================

/** Registers the execute_spec tool with an MCP server. */
export function registerExecuteSpecTool(server: McpServer, deps: ExecuteSpecDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'execute_spec' });

  const handler = async (args: unknown, _ctx: HandlerContext): Promise<ToolResult> => {
    const parsed = ExecuteSpecInputSchema.safeParse(args);
    if (!parsed.success) {
      return toolError(`Invalid input: ${formatZodError(parsed.error)}`);
    }

    if (parsed.data.dryRun) {
      return createDryRunResponse(parsed.data, logger);
    }

    return createFullResponse(parsed.data, logger);
  };

  const secureHandler = createSecureHandler(handler, {
    toolName: 'execute_spec',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('execute_spec', deps.security);
  const wrapped = wrapToolWithTimeout('execute_spec', secureHandler, { timeoutMs, logger });

  const toolSchema = {
    spec: z
      .string()
      .min(1)
      .max(50_000)
      .describe(
        'Markdown specification to execute. ' +
          'Must contain "## Requirements" and "## Acceptance Criteria" sections.'
      ),
    dryRun: z.boolean().optional().describe('Parse and decompose only (no execution)'),
  };

  const description =
    'Execute a markdown specification through the full pipeline: ' +
    'parse, decompose into task DAG, compile to graph, execute, ' +
    'validate against acceptance criteria, and analyze failures.';

  server.registerTool(
    'execute_spec',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrapped)
  );
  logger.info('Registered execute_spec tool');
}

// ============================================================================
// Recording Helpers (Issue #1174)
// ============================================================================

const specLogger = createLogger({ tool: 'execute-spec' });

/** Records a successful spec execution to session memory. Best-effort. */
function recordSpecSuccess(satisfaction: number, durationMs: number): void {
  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Spec execution (satisfaction: ${String(satisfaction)})`,
      challenges: [],
      durationMs,
    });
    memory.recordLearning({
      pattern: `spec_execution → satisfaction=${String(satisfaction)}`,
      context: `duration=${String(durationMs)}ms`,
      confidence: 0.8,
      source: 'manual',
    });
  } catch (error: unknown) {
    specLogger.warn('Failed to record spec success', { error: String(error) });
  }
}

/** Records spec execution outcome for adaptive routing. Best-effort. */
function recordSpecOutcome(success: boolean, durationMs: number, stage?: string): void {
  try {
    if (!success && stage !== undefined) {
      const memory = getToolMemory();
      memory.recordError({
        error: `Spec execution failed at stage: ${stage}`,
        solution: 'Check spec format and requirements',
        filePattern: 'mcp/tools/execute-spec-tool',
      });
    }
    const store = getOutcomeStore();
    store.append({
      id: `spec-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      cli: DEFAULT_CLI,
      category: 'code_generation',
      model: 'spec-executor',
      success,
      durationMs,
      timestamp: new Date().toISOString(),
      source: 'manual',
      ...(!success && stage !== undefined
        ? { failureCategory: categorizeOutcomeErrorMessage(`Spec failed at stage: ${stage}`) }
        : {}),
    });
  } catch (storeErr: unknown) {
    specLogger.debug('Failed to record spec outcome to store', {
      error: storeErr instanceof Error ? storeErr.message : String(storeErr),
    });
  }
}
