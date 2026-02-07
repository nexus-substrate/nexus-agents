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

type ToolResponse = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function createDryRunResponse(input: ExecuteSpecInput, logger: ILogger): ToolResponse {
  const parseResult = parseSpec(input.spec);
  if (!parseResult.ok) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Parse error: ${parseResult.error.message}` }],
    };
  }

  const dagResult = decomposeSpec(parseResult.value);
  if (!dagResult.ok) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Decompose error: ${dagResult.error.message}` }],
    };
  }

  logger.info('Dry run completed', {
    title: parseResult.value.title,
    nodes: dagResult.value.nodes.length,
  });
  const output = { mode: 'dry_run', spec: parseResult.value, dag: dagResult.value };
  return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
}

async function createFullResponse(input: ExecuteSpecInput, logger: ILogger): Promise<ToolResponse> {
  const result = await executeSpec(input.spec);
  if (!result.ok) {
    return {
      isError: true,
      content: [
        { type: 'text', text: `Execution error (${result.error.stage}): ${result.error.message}` },
      ],
    };
  }

  const analysis = analyzeFailures(result.value);
  logger.info('Spec execution completed', {
    satisfaction: result.value.validation.satisfaction,
    passed: analysis.ok ? analysis.value.passed : false,
  });

  const output = {
    mode: 'execute',
    execution: result.value,
    analysis: analysis.ok ? analysis.value : null,
  };
  return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
}

// ============================================================================
// Registration
// ============================================================================

/** Registers the execute_spec tool with an MCP server. */
export function registerExecuteSpecTool(server: McpServer, deps: ExecuteSpecDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'execute_spec' });

  const handler = async (args: unknown, _ctx: HandlerContext): Promise<ToolResponse> => {
    const parsed = ExecuteSpecInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Invalid input: ${formatZodError(parsed.error)}` }],
      };
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
    spec: z.string().min(1).max(50_000).describe('Markdown specification to execute'),
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
