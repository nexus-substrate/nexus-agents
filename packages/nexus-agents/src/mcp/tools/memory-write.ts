/**
 * nexus-agents/mcp - Memory Write Tool
 *
 * MCP tool for manual memory injection across backends.
 * Supports session (learnings), belief (triples), agentic (knowledge),
 * adaptive (priority-scored), and typed (MIRIX-style) writes.
 *
 * @module mcp/tools/memory-write
 * (Source: Issue #1090 - Add memory_write MCP tool)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { withToolError } from '../middleware/tool-error-handler.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { withPrerequisite } from '../middleware/tool-prerequisites.js';
import {
  toolStructuredError,
  toolSuccessStructured,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';
import { getToolMemory } from './tool-memory.js';
import type { MemoryStoreOutcome } from './tool-memory.js';
import { getToolAnnotations } from '../tool-annotations.js';

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
    .enum(['session', 'belief', 'agentic', 'adaptive', 'typed'])
    .describe(
      'Target memory backend: session (learnings), belief (triples), agentic (knowledge), ' +
        'adaptive (priority-scored), typed (MIRIX-style semantic)'
    ),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .optional()
    .default('medium')
    .describe('Confidence level (default: medium)'),
  metadata: z
    .record(z.string().max(100), z.string().max(500))
    .optional()
    .describe('Optional key-value metadata tags'),
});

/**
 * Type for validated memory write input.
 */
export type MemoryWriteInput = z.infer<typeof MemoryWriteInputSchema>;

/**
 * Dependencies for memory_write tool.
 */
export type MemoryWriteDeps = BaseMcpToolDeps;

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
  /** Whether write was skipped due to identical content already existing (#1455) */
  deduplicated?: boolean;
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
 * Skips write if identical content already exists (content-hash dedup #1455).
 */
async function writeToBelief(
  key: string,
  content: string,
  confidence: 'high' | 'medium' | 'low'
): Promise<MemoryWriteResponse> {
  const toolMemory = getToolMemory();
  const countBefore = toolMemory.getBeliefCount();
  const outcome: MemoryStoreOutcome = await toolMemory.recordBelief(
    key,
    'has_knowledge',
    content,
    confidence
  );
  if (!outcome.persisted) {
    return { success: false, backend: 'belief', key, error: outcome.reason };
  }
  // An unchanged count after a PERSISTED retain means the triple was already
  // held. Before #4997 the count was the only signal, so a rejected write and a
  // deduplicated one were the same observation.
  const deduplicated = toolMemory.getBeliefCount() === countBefore;
  return { success: true, backend: 'belief', key, ...(deduplicated ? { deduplicated: true } : {}) };
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
  const outcome: MemoryStoreOutcome = await toolMemory.recordKnowledge(key, content, {
    importance: confidence,
    tags: metadata !== undefined ? Object.keys(metadata) : [],
  });
  if (!outcome.persisted) {
    return { success: false, backend: 'agentic', key, error: outcome.reason };
  }
  return { success: true, backend: 'agentic', key };
}

/**
 * Writes to the adaptive backend with priority scoring.
 */
async function writeToAdaptive(
  key: string,
  content: string,
  confidence: 'high' | 'medium' | 'low'
): Promise<MemoryWriteResponse> {
  const toolMemory = getToolMemory();
  if (!toolMemory.isAdaptiveMemoryAvailable()) {
    return {
      success: false,
      backend: 'adaptive',
      key,
      error: 'Adaptive memory backend unavailable (requires SQLite)',
    };
  }
  const importance = confidence === 'high' ? 0.9 : confidence === 'medium' ? 0.7 : 0.5;
  const outcome: MemoryStoreOutcome = await toolMemory.storeAdaptive(key, content, importance);
  if (!outcome.persisted) {
    return { success: false, backend: 'adaptive', key, error: outcome.reason };
  }
  return { success: true, backend: 'adaptive', key };
}

/**
 * Writes to the typed backend as a semantic memory entry.
 */
async function writeToTyped(
  key: string,
  content: string,
  confidence: 'high' | 'medium' | 'low'
): Promise<MemoryWriteResponse> {
  const toolMemory = getToolMemory();
  if (!toolMemory.isTypedMemoryAvailable()) {
    return {
      success: false,
      backend: 'typed',
      key,
      error: 'Typed memory backend unavailable (requires SQLite)',
    };
  }
  const importance = confidence === 'high' ? 'high' : confidence === 'medium' ? 'medium' : 'low';
  const outcome: MemoryStoreOutcome = await toolMemory.storeTyped(key, content, importance);
  if (!outcome.persisted) {
    return { success: false, backend: 'typed', key, error: outcome.reason };
  }
  return { success: true, backend: 'typed', key };
}

/**
 * Executes the memory write operation.
 */
/** Track recently written keys to prevent immediate duplicate writes within a session. */
const recentWriteKeys = new Map<string, string>();

/** Maximum entries in the dedup cache before pruning oldest. */
const MAX_DEDUP_CACHE = 200;

/**
 * Session-level dedup: prevent writing the same key+content twice.
 * Returns true if this is a duplicate that should be skipped.
 */
function dedupCacheKey(input: MemoryWriteInput): string {
  // #4997: the backend is part of the identity. Without it, writing the same
  // key+content to `session` and then to `belief` reported the second as
  // `deduplicated: true` while the belief store never received it.
  return `${input.backend}::${input.key}::${input.content}`;
}

function isDuplicateWrite(input: MemoryWriteInput): boolean {
  return recentWriteKeys.has(dedupCacheKey(input));
}

/**
 * Remembers a write that actually landed (#4997).
 *
 * Recording it before dispatch cached intent rather than persistence: a write
 * that failed still populated the cache, so the identical retry came back
 * `success: true, deduplicated: true` — the tool asserting the content was
 * already stored when nothing had ever stored it.
 */
function rememberWrite(input: MemoryWriteInput): void {
  if (recentWriteKeys.size >= MAX_DEDUP_CACHE) {
    const firstKey = recentWriteKeys.keys().next().value;
    if (firstKey !== undefined) recentWriteKeys.delete(firstKey);
  }
  recentWriteKeys.set(dedupCacheKey(input), new Date().toISOString());
}

async function executeMemoryWrite(
  input: MemoryWriteInput,
  logger: ILogger
): Promise<MemoryWriteResponse> {
  // Session-level dedup: skip if the same key+content reached this backend
  if (isDuplicateWrite(input)) {
    logger.debug('Skipping duplicate memory write', { key: input.key, backend: input.backend });
    return { success: true, backend: input.backend, key: input.key, deduplicated: true };
  }

  logger.debug('Writing to memory', {
    backend: input.backend,
    key: input.key,
    contentLength: input.content.length,
  });

  const response = await dispatchWrite(input);
  // Only a write that landed is worth deduplicating against.
  if (response.success) rememberWrite(input);
  return response;
}

/**
 * #5438: wait for the non-blocking startup initialization before dispatching.
 *
 * Three of the five writers refuse with `"<backend> memory backend unavailable
 * (requires SQLite)"`, and each of those guards reads an availability flag that
 * is `false` for a short window after session start while the backend is merely
 * still opening. Reproduced live on `memory_stats`: five backends reported
 * absent, then all five present 55 seconds later with 519 entries already
 * there. Here the cost is worse than a misreport — the write is DROPPED, and
 * the caller is told SQLite is the cause when it is not.
 *
 * Awaited once at the dispatch seam rather than inside each writer, so a new
 * backend cannot be added without inheriting the wait.
 */
async function dispatchWrite(input: MemoryWriteInput): Promise<MemoryWriteResponse> {
  try {
    await getToolMemory().awaitBackendInitialization();
  } catch {
    // A backend that failed to initialise must still produce the writer's own
    // honest "unavailable" response below, not an exception from the wait.
  }
  switch (input.backend) {
    case 'session':
      return writeToSession(input.key, input.content, input.confidence);
    case 'belief':
      return writeToBelief(input.key, input.content, input.confidence);
    case 'agentic':
      return writeToAgentic(input.key, input.content, input.confidence, input.metadata);
    case 'adaptive':
      return writeToAdaptive(input.key, input.content, input.confidence);
    case 'typed':
      return writeToTyped(input.key, input.content, input.confidence);
  }
}

/**
 * Core handler logic for memory_write tool.
 */
async function memoryWriteHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const validationResult = MemoryWriteInputSchema.safeParse(args);
  if (!validationResult.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(validationResult.error)}`,
    });
  }

  return withToolError('Memory write failed', ctx.logger, async () => {
    const result = await executeMemoryWrite(validationResult.data, ctx.logger);
    if (!result.success) {
      return toolStructuredError({
        errorCategory: 'internal',
        message: JSON.stringify(result, null, 2),
      });
    }
    return toolSuccessStructured(result as unknown as Record<string, unknown>);
  });
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Registers the memory_write tool with the MCP server.
 *
 * @category MCP
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
// eslint-disable-next-line max-lines-per-function -- single cohesive registration: schema + handler + wrapping + register; +4 lines for #2648 annotations tipped past 50.
export function registerMemoryWriteTool(server: McpServer, deps: MemoryWriteDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'memory_write' });
  const toolSchema = {
    key: z.string().min(1).max(200).describe('Memory identifier or subject'),
    content: z.string().min(1).max(5000).describe('Memory content to store'),
    backend: z
      .enum(['session', 'belief', 'agentic', 'adaptive', 'typed'])
      .describe(
        'Target memory backend: session (learnings), belief (triples), agentic (knowledge), ' +
          'adaptive (priority-scored), typed (MIRIX-style semantic)'
      ),
    confidence: z
      .enum(['high', 'medium', 'low'])
      .optional()
      .describe('Confidence level (default: medium)'),
    metadata: z
      .record(z.string().max(100), z.string().max(500))
      .optional()
      .describe('Optional key-value metadata tags'),
  };

  const description =
    'Write a memory entry to a specific backend. ' +
    'Supports session (learnings), belief assertions (subject + object; predicate fixed as `has_knowledge`), ' +
    'agentic (knowledge with attributes), adaptive (priority-scored), ' +
    'and typed (MIRIX-style semantic) backends.';

  const secureHandler = createSecureHandler(memoryWriteHandler, {
    toolName: 'memory_write',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const guardedHandler = withPrerequisite('memory_write', secureHandler);
  const timeoutMs = getToolTimeout('memory_write', deps.security);
  const wrappedHandler = wrapToolWithTimeout('memory_write', guardedHandler, { timeoutMs, logger });

  // Concrete shape: every backend writer returns success+backend+key, with an
  // optional `deduplicated` flag (belief backend only) and an optional `error`
  // field on failure paths (#2340 batch 2).
  const outputSchema = {
    success: z.boolean(),
    backend: z.string(),
    key: z.string(),
    deduplicated: z.boolean().optional(),
    error: z.string().optional(),
  };

  server.registerTool(
    'memory_write',
    {
      description,
      inputSchema: toolSchema,
      outputSchema,
      annotations: getToolAnnotations('memory_write'),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered memory_write tool');
}
