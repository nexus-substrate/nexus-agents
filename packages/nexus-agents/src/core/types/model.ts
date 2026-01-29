/**
 * nexus-agents/core - Model Adapter Types
 *
 * Unified interface for all model adapters (Claude, OpenAI, Gemini, Ollama).
 */

import type { Result } from '../result.js';
import type { ConfigError, ModelError } from '../errors.js';

/**
 * Model capabilities supported by adapters.
 */
export const ModelCapability = {
  COMPLETION: 'completion',
  STREAMING: 'streaming',
  TOOL_USE: 'tool_use',
  VISION: 'vision',
  EXTENDED_THINKING: 'extended_thinking',
} as const;

export type ModelCapability = (typeof ModelCapability)[keyof typeof ModelCapability];

/**
 * Message role in a conversation.
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Content block types in messages and responses.
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/**
 * Message in a conversation.
 */
export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
}

/**
 * Tool definition for function calling.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Response format specification.
 *
 * @remarks
 * Adapter support (Issue #470):
 * - **OpenAI**: Full support for `json_object` and `json_schema`
 * - **Ollama**: Supports `json_object` and `json_schema` (passes schema directly)
 * - **Claude**: NOT SUPPORTED - Anthropic API lacks native JSON mode
 * - **Gemini**: NOT SUPPORTED - Google API lacks JSON format constraints
 *
 * For Claude/Gemini, use tool use or prompt engineering for structured output.
 */
export type ResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | { type: 'json_schema'; schema: Record<string, unknown> };

/**
 * Request to complete a conversation.
 */
export interface CompletionRequest {
  /** Conversation messages */
  messages: Message[];
  /** System prompt (if not included in messages) */
  systemPrompt?: string;
  /** Sampling temperature (0.0 - 1.0) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Tools available for the model */
  tools?: ToolDefinition[];
  /**
   * Expected response format.
   *
   * @remarks
   * Only supported by OpenAI and Ollama adapters. Claude and Gemini
   * adapters will ignore this field. See {@link ResponseFormat} for details.
   */
  responseFormat?: ResponseFormat;
  /** Stop sequences */
  stop?: string[];
}

/**
 * Token usage statistics.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Reason the model stopped generating.
 */
export type StopReason = 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';

/**
 * Response from a completion request.
 */
export interface CompletionResponse {
  /** Response content blocks */
  content: ContentBlock[];
  /** Token usage statistics */
  usage: TokenUsage;
  /** Reason generation stopped */
  stopReason: StopReason;
  /** Model that generated the response */
  model: string;
}

/**
 * Chunk from a streaming response.
 */
export type StreamChunk =
  | { type: 'content_block_start'; index: number; contentBlock: ContentBlock }
  | { type: 'content_block_delta'; index: number; delta: { type: 'text_delta'; text: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_start'; message: { model: string } }
  | { type: 'message_delta'; delta: { stop_reason: StopReason }; usage: TokenUsage }
  | { type: 'message_stop' };

/**
 * Unified interface for all model adapters.
 */
export interface IModelAdapter {
  /** Provider identifier (e.g., 'anthropic', 'openai') */
  readonly providerId: string;

  /** Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o') */
  readonly modelId: string;

  /** Capabilities this model supports */
  readonly capabilities: readonly ModelCapability[];

  /**
   * Send a completion request.
   * @param request - The completion request
   * @returns Result with response or ModelError
   */
  complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>>;

  /**
   * Stream a completion request.
   * @param request - The completion request
   * @yields StreamChunk objects as they arrive
   */
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;

  /**
   * Count tokens in text.
   * @param text - Text to count tokens for
   * @returns Approximate token count
   */
  countTokens(text: string): Promise<number>;

  /**
   * Validate adapter configuration.
   * @returns Ok if valid, ConfigError if invalid
   */
  validateConfig(): Result<void, ConfigError>;
}
