/**
 * nexus-agents/mcp - Memory Write Tool
 *
 * MCP tool for manual memory injection across backends.
 * Supports session (learnings), belief (triples), and agentic (knowledge) writes.
 *
 * @module mcp/tools/memory-write
 * (Source: Issue #1090 - Add memory_write MCP tool)
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
import { getToolMemory } from './tool-memory.js';

// ============================================================================
// Schema & Types
// ============================================================================

/**
 * Input schema for memory_write tool.
 */
export const MemoryWriteInputSchema = z.object({
  key: z.string().min(1).max(200).describe('Memory identifier or subject'),
  content: z.string().min(1).max(5000).describe('Memory content to store'),
  backend: z
    .enum(['session', 'belief', 'agentic'])
    .describe('Target memory backend: session (learnings), belief (triples), agentic (knowledge)'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .optional()
    .default('medium')
    .describe('Confidence level (default: medium)'),
  metadata: z.record(z.string()).optional().describe('Optional key-value metadata tags'),
});

/**
 * Type for validated memory write input.
 */
export type MemoryWriteInput = z.infer<typeof MemoryWriteInputSchema>;

/**
 * Dependencies for memory_write tool.
 */
export interface MemoryWriteDeps {
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings) */
  security?: SecurityConfig | undefined;
}

/**
 * Response from memory_write tool.
 */
export interface MemoryWriteResponse {
  /** Whether the write succeeded */
  success: boolean;
  /** Target backend */
  backend: string;
  /** Key/subject written */
  key: string;
  /** Error message if write failed */
  error?: string;
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Writes to the session backend as a learning.
 */
function writeToSession(
  key: string,
  content: string,
  confidence: 'high' | 'medium' | 'low'
): MemoryWriteResponse {
  const toolMemory = getToolMemory();
  const numericConfidence = confidence === 'high' ? 0.9 : confidence === 'medium' ? 0.7 : 0.4;
  toolMemory.recordLearning({
    pattern: content,
    context: key,
    confidence: numericConfidence,
    source: 'memory_write_tool',
  });
  return { success: true, backend: 'session', key };
}

/**
 * Writes to the belief backend as a triple.
 */
async function writeToBelief(
  key: string,
  content: string,
  confidence: 'high' | 'medium' | 'low'
): Promise<MemoryWriteResponse> {
  const toolMemory = getToolMemory();
  await toolMemory.recordBelief(key, 'has_knowledge', content, confidence);
  return { success: true, backend: 'belief', key };
}

/**
 * Writes to the agentic backend as knowledge.
 */
async function writeToAgentic(
  key: string,
  content: string,
  confidence: 'high' | 'medium' | 'low',
  metadata?: Record<string, string>
): Promise<MemoryWriteResponse> {
  const toolMemory = getToolMemory();
  if (!toolMemory.isAgenticMemoryAvailable()) {
    return {
      success: false,
      backend: 'agentic',
      key,
      error: 'Agentic memory backend unavailable (requires SQLite)',
    };
  }
  await toolMemory.recordKnowledge(key, content, {
    importance: confidence,
    tags: metadata !== undefined ? Object.keys(metadata) : [],
  });
  return { success: true, backend: 'agentic', key };
}

/**
 * Executes the memory write operation.
 */
async function executeMemoryWrite(
  input: MemoryWriteInput,
  logger: ILogger
): Promise<MemoryWriteResponse> {
  logger.debug('Writing to memory', {
    backend: input.backend,
    key: input.key,
    contentLength: input.content.length,
  });

  switch (input.backend) {
    case 'session':
      return writeToSession(input.key, input.content, input.confidence);
    case 'belief':
      return writeToBelief(input.key, input.content, input.confidence);
    case 'agentic':
      return writeToAgentic(input.key, input.content, input.confidence, input.metadata);
  }
}

/** MCP tool response type */
type MemoryWriteToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Core handler logic for memory_write tool.
 */
async function memoryWriteHandler(
  args: unknown,
  ctx: HandlerContext
): Promise<MemoryWriteToolResponse> {
  const validationResult = MemoryWriteInputSchema.safeParse(args);
  if (!validationResult.success) {
    return {
      isError: true,
      content: [
        { type: 'text', text: `Validation error: ${formatZodError(validationResult.error)}` },
      ],
    };
  }

  return withToolError('Memory write failed', ctx.logger, async () => {
    const result = await executeMemoryWrite(validationResult.data, ctx.logger);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      ...(result.success ? {} : { isError: true }),
    };
  });
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Registers the memory_write tool with the MCP server.
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerMemoryWriteTool(server: McpServer, deps: MemoryWriteDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'memory_write' });
  const toolSchema = {
    key: z.string().min(1).max(200).describe('Memory identifier or subject'),
    content: z.string().min(1).max(5000).describe('Memory content to store'),
    backend: z
      .enum(['session', 'belief', 'agentic'])
      .describe(
        'Target memory backend: session (learnings), belief (triples), agentic (knowledge)'
      ),
    confidence: z
      .enum(['high', 'medium', 'low'])
      .optional()
      .describe('Confidence level (default: medium)'),
    metadata: z.record(z.string()).optional().describe('Optional key-value metadata tags'),
  };

  const description =
    'Write a memory entry to a specific backend. ' +
    'Supports session (learnings), belief (subject-predicate-object triples), ' +
    'and agentic (knowledge with attributes) backends.';

  const secureHandler = createSecureHandler(memoryWriteHandler, {
    toolName: 'memory_write',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('memory_write', deps.security);
  const wrappedHandler = wrapToolWithTimeout('memory_write', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'memory_write',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered memory_write tool');
}
