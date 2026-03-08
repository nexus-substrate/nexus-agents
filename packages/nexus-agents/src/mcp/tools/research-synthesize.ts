/**
 * nexus-agents/mcp - Research Synthesize Tool
 *
 * MCP tool for synthesizing the research registry by grouping papers
 * into topic clusters and generating structured synthesis summaries
 * with themes, findings, techniques, and implementation opportunities.
 *
 * @module mcp/tools/research-synthesize
 * (Source: Issue #1386 — Research Synthesis Pipeline)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { withToolError } from '../middleware/tool-error-handler.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { synthesizeResearch } from '../../cli/research-helpers-synthesize.js';
import type { SynthesisResult } from '../../cli/research-helpers-synthesize.js';
import { toolError, toolSuccess, type ToolResult } from './tool-result.js';

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Input schema for research_synthesize tool.
 */
export const ResearchSynthesizeInputSchema = z.object({
  topic: z.string().optional().describe('Optional topic to filter synthesis to a single cluster'),
});

/**
 * Type for validated research synthesize input.
 */
export type ResearchSynthesizeInput = z.infer<typeof ResearchSynthesizeInputSchema>;

// =============================================================================
// DEPS
// =============================================================================

export interface ResearchSynthesizeDeps {
  readonly logger?: ILogger | undefined;
  readonly rateLimiter: RateLimiter;
  readonly security?: SecurityConfig | undefined;
}

// =============================================================================
// RESPONSE
// =============================================================================

export type ResearchSynthesizeResponse = SynthesisResult;

// =============================================================================
// HANDLER
// =============================================================================

function createResearchSynthesizeHandler(
  deps: ResearchSynthesizeDeps
): (args: unknown, ctx: HandlerContext) => Promise<ToolResult> {
  return async (args: unknown, _ctx: HandlerContext): Promise<ToolResult> => {
    const validationResult = ResearchSynthesizeInputSchema.safeParse(args);
    if (!validationResult.success) {
      return toolError(`Validation error: ${formatZodError(validationResult.error)}`);
    }

    const logger = deps.logger ?? createLogger({ tool: 'research_synthesize' });
    return withToolError('Synthesis failed', logger, async () => {
      const result = await synthesizeResearch(validationResult.data.topic);
      if (!result.ok) {
        return toolError(`Synthesis failed: ${result.error.message}`);
      }
      return toolSuccess(JSON.stringify(result.value, null, 2));
    });
  };
}

// =============================================================================
// REGISTRATION
// =============================================================================

/**
 * Registers the research_synthesize tool with the MCP server.
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerResearchSynthesizeTool(
  server: McpServer,
  deps: ResearchSynthesizeDeps
): void {
  const logger = deps.logger ?? createLogger({ tool: 'research_synthesize' });
  const toolSchema = {
    topic: z.string().optional().describe('Optional topic filter for single-cluster synthesis'),
  };

  const description =
    'Synthesize the research registry by grouping papers into topic clusters. ' +
    'Returns structured summaries with common themes, key insights, techniques, ' +
    'implementation opportunities, and cross-cutting themes across clusters.';

  const secureHandler = createSecureHandler(createResearchSynthesizeHandler(deps), {
    toolName: 'research_synthesize',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('research_synthesize', deps.security);
  const wrappedHandler = wrapToolWithTimeout('research_synthesize', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'research_synthesize',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered research_synthesize tool');
}
