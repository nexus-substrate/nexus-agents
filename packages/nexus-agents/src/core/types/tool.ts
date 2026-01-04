/**
 * @nexus-agents/core - Tool Types
 *
 * Interface for MCP tools (MCP Protocol 2025-11-25).
 */

// Note: Zod types used here are for documentation.
// Actual validation will be done in @nexus-agents/mcp package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodSchema = { parse: (data: unknown) => any; safeParse: (data: unknown) => any };
import type { Result } from '../result.js';
import type { ValidationError } from '../errors.js';

/**
 * Content block in tool results.
 */
export type ToolContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; uri: string; mimeType?: string; text?: string };

/**
 * Tool execution result.
 */
export interface ToolResult {
  /** Content blocks */
  content: ToolContentBlock[];
  /** Whether this is an error result */
  isError?: boolean;
  /** Structured content (for JSON responses) */
  structuredContent?: unknown;
}

/**
 * Tool execution error.
 */
export class ToolError extends Error {
  readonly toolName: string;
  readonly input?: unknown;

  constructor(message: string, toolName: string, input?: unknown) {
    super(message);
    this.name = 'ToolError';
    this.toolName = toolName;
    this.input = input;
  }
}

/**
 * Tool metadata for listing.
 */
export interface ToolInfo {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** JSON Schema for inputs */
  inputSchema: Record<string, unknown>;
}

/**
 * MCP Tool interface.
 */
export interface ITool {
  /** Tool name (verb_noun format, e.g., 'create_expert') */
  readonly name: string;

  /** Tool description (Claude uses this to decide when to call) */
  readonly description: string;

  /** Zod schema for input validation */
  readonly inputSchema: ZodSchema;

  /** Optional Zod schema for output validation */
  readonly outputSchema?: ZodSchema;

  /**
   * Execute the tool.
   * @param input - Validated input
   * @returns Result with ToolResult or ToolError
   */
  execute(input: unknown): Promise<Result<ToolResult, ToolError>>;
}

/**
 * Tool registry for managing tools.
 */
export interface IToolRegistry {
  /**
   * Register a tool.
   * @param tool - Tool to register
   */
  register(tool: ITool): void;

  /**
   * Get a tool by name.
   * @param name - Tool name
   * @returns Tool if found
   */
  get(name: string): ITool | undefined;

  /**
   * List all registered tools.
   * @returns Array of tool info
   */
  list(): ToolInfo[];

  /**
   * Validate input for a tool.
   * @param name - Tool name
   * @param input - Input to validate
   * @returns Result with validated input or ValidationError
   */
  validate(name: string, input: unknown): Result<unknown, ValidationError>;
}
