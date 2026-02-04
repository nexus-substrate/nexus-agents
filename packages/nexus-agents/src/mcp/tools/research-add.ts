/**
 * nexus-agents/mcp - Research Add Tool
 *
 * MCP tool for adding papers to the research registry.
 * Wraps existing CLI helpers: addResearchPaper(), fetchArxivMetadataResult().
 *
 * @module mcp/tools/research-add
 * (Source: Research System Enhancement - Phase 1B)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { addResearchPaper, paperExists } from '../../cli/research-helpers.js';
import { getToolMemory } from './tool-memory.js';

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Input schema for research_add tool.
 */
export const ResearchAddInputSchema = z.object({
  arxivId: z
    .string()
    .regex(/^\d{4}\.\d{4,5}$/, 'Invalid arXiv ID format (expected XXXX.XXXXX)')
    .describe('arXiv paper ID (e.g., "2401.12345")'),
  topic: z.string().optional().describe('Research topic to categorize the paper under'),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional().describe('Priority level for the paper'),
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe('Preview what would be added without persisting'),
});

/**
 * Type for validated research add input.
 */
export type ResearchAddInput = z.infer<typeof ResearchAddInputSchema>;

// =============================================================================
// DEPS
// =============================================================================

/**
 * Dependencies for research_add tool.
 */
export interface ResearchAddDeps {
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings) */
  security?: SecurityConfig | undefined;
}

// =============================================================================
// RESPONSE
// =============================================================================

/**
 * Response from research_add tool.
 */
export interface ResearchAddResponse {
  /** Whether the operation succeeded */
  success: boolean;
  /** Paper ID */
  paperId: string;
  /** Paper title (empty on failure) */
  title: string;
  /** Human-readable message */
  message: string;
  /** Whether this was a dry run */
  dryRun: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

/** Executes the research add operation. */
async function executeResearchAdd(
  input: ResearchAddInput,
  logger: ILogger
): Promise<ResearchAddResponse> {
  // Check for duplicates first
  const exists = await paperExists(input.arxivId);
  if (exists) {
    return {
      success: false,
      paperId: `arxiv-${input.arxivId}`,
      title: '',
      message: `Paper arxiv-${input.arxivId} already exists in registry`,
      dryRun: input.dryRun,
    };
  }

  const result = await addResearchPaper({
    arxivId: input.arxivId,
    topic: input.topic,
    priority: input.priority,
    dryRun: input.dryRun,
  });

  // Record learning in session memory on success (auto-catalog hook)
  if (result.success && !input.dryRun) {
    try {
      const memory = getToolMemory(logger);
      memory.recordLearning({
        pattern: `Added paper: ${result.title} (${result.paperId})`,
        context: `topic=${input.topic ?? 'general'}, priority=${input.priority ?? 'unset'}`,
        confidence: 0.9,
        source: 'research_add',
      });
    } catch {
      logger.debug('Failed to record learning in session memory');
    }
  }

  return {
    success: result.success,
    paperId: result.paperId,
    title: result.title,
    message: result.message,
    dryRun: result.dryRun,
  };
}

// =============================================================================
// MCP TOOL
// =============================================================================

/** MCP tool response type */
type ResearchAddToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Creates the core handler logic for research_add tool.
 */
function createResearchAddHandler(deps: ResearchAddDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<ResearchAddToolResponse> => {
    const validationResult = ResearchAddInputSchema.safeParse(args);
    if (!validationResult.success) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Validation error: ${formatZodError(validationResult.error)}` },
        ],
      };
    }

    ctx.logger.debug('Adding research paper', { arxivId: validationResult.data.arxivId });

    try {
      const logger = deps.logger ?? createLogger({ tool: 'research_add' });
      const result = await executeResearchAdd(validationResult.data, logger);

      if (!result.success) {
        return {
          isError: true,
          content: [{ type: 'text', text: result.message }],
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to add paper: ${message}` }],
      };
    }
  };
}

/**
 * Registers the research_add tool with the MCP server.
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerResearchAddTool(server: McpServer, deps: ResearchAddDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'research_add' });
  const toolSchema = {
    arxivId: z
      .string()
      .regex(/^\d{4}\.\d{4,5}$/)
      .describe('arXiv paper ID (e.g., "2401.12345")'),
    topic: z.string().optional().describe('Research topic to categorize the paper under'),
    priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional().describe('Priority level'),
    dryRun: z.boolean().optional().default(false).describe('Preview without persisting'),
  };

  const description =
    'Add an arXiv paper to the research registry. ' +
    'Fetches metadata from the arXiv API and persists to the registry. ' +
    'Use dryRun=true to preview without saving.';

  const secureHandler = createSecureHandler(createResearchAddHandler(deps), {
    toolName: 'research_add',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('research_add', deps.security);
  const wrappedHandler = wrapToolWithTimeout('research_add', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'research_add',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered research_add tool with secure handler and timeout protection');
}
