/**
 * nexus-agents/mcp - Tool Result Helpers
 *
 * Canonical type and factory functions for MCP tool results.
 * Extracted from index.ts to allow tool implementations to import
 * without circular dependencies.
 *
 * @module mcp/tools/tool-result
 */

import type { ILogger } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';

// ============================================================================
// Base Dependencies
// ============================================================================

/**
 * Common dependency interface shared by all MCP tool handlers.
 *
 * Tool-specific deps interfaces should extend this base.
 * (Source: Issue #1439 — DRY extraction of 25 duplicated Deps interfaces)
 */
export interface BaseMcpToolDeps {
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings) */
  security?: SecurityConfig | undefined;
}

// ============================================================================
// Types
// ============================================================================

/**
 * MCP tool content types.
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * MCP tool result.
 *
 * Uses mutable properties for compatibility with secure-handler
 * sanitization (which rewrites `text` in-place).
 */
export interface ToolResult {
  content: Array<TextContent>;
  isError?: boolean;
  /** Structured output for SDK outputSchema validation (Issue #1117) */
  structuredContent?: Record<string, unknown>;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a successful tool result.
 *
 * @param text - The result text
 * @returns A ToolResult with the text content
 *
 * @example
 * ```typescript
 * return toolSuccess(JSON.stringify({ status: 'ok', data: result }));
 * ```
 */
export function toolSuccess(text: string): ToolResult {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Creates a successful tool result with structured content for outputSchema validation.
 *
 * When a tool is registered with outputSchema, the SDK validates structuredContent
 * against the schema. This helper returns both text (for display) and structured data.
 *
 * @param data - The structured result data (must match the tool's outputSchema)
 * @returns A ToolResult with both text content and structuredContent
 *
 * @example
 * ```typescript
 * return toolSuccessStructured({ experts: [...], count: 10 });
 * ```
 */
export function toolSuccessStructured(data: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

/**
 * Creates an error tool result.
 *
 * @param message - The error message
 * @returns A ToolResult with isError set to true
 *
 * @example
 * ```typescript
 * if (!input.ok) {
 *   return toolError(`Validation failed: ${input.error}`);
 * }
 * ```
 */
export function toolError(message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}
