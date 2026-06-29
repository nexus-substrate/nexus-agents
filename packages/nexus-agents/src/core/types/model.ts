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
  /**
   * Per-request timeout override in milliseconds. When set, adapters that
   * support it use this instead of their construction-time default — lets a
   * long-running caller (e.g. a consensus vote with a 300s budget) prevent the
   * adapter's shorter standard timeout from firing first (#3304). Adapters that
   * don't support per-request timeouts ignore it.
   */
  timeoutMs?: number;
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
  /**
   * Cancellation signal (#3036). When the signal aborts, the adapter
   * cancels the in-flight model call. All five concrete adapters
   * (claude, openai, ollama, gemini, openai-compat) honor this by
   * passing the signal to their respective vendor SDK.
   *
   * Used by `withWatchdog` to cancel race-loser model calls when the
   * worker-dispatch timeout wins. Without this, the SDK keeps running
   * after `Promise.race` resolves with the timeout — late results land
   * in OutcomeStore for a decision already discarded.
   *
   * Typed as `AbortSignal | undefined` (not `AbortSignal?`) so adapter
   * internals that destructure `request` keep working under
   * `exactOptionalPropertyTypes`.
   */
  signal?: AbortSignal | undefined;
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
  /**
   * Request params the adapter dropped before sending (#4069, epic #4066 layer 3).
   * Present (and non-empty) only when a param was silently unsupported — e.g. a
   * post-Opus-4.6 Claude or OpenAI reasoning model that rejects `temperature`. The
   * request still ran (at the provider default); this surfaces what was omitted so
   * the caller can SEE a behavioral param had no effect. Absent when nothing was
   * dropped. Typed via the adapter-layer {@link DroppedParam} shape, re-declared
   * structurally here to avoid a core→adapters import cycle.
   */
  warnings?: readonly {
    readonly param: string;
    readonly reason: string;
    readonly severity: 'behavioral' | 'cosmetic';
  }[];
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

  /**
   * (Optional, #2529) List models served by this adapter's endpoint.
   *
   * Implemented by adapters facing OpenAI-compatible endpoints (the
   * upstream OpenAI API, OpenRouter, vLLM, custom gateways, etc.) —
   * usually wraps `GET /v1/models`. Result is the harness-side identity
   * resolver's most-trusted signal for "what model is actually being
   * served behind this adapter."
   *
   * Subprocess-CLI adapters (claude / codex / gemini / opencode) leave
   * this undefined; identity for those falls back to `modelId` parse.
   *
   * Implementations should cache the result for ~5 minutes — operators
   * shouldn't pay round-trip latency on every resolve. Failures
   * (network error, endpoint unsupported, auth missing) should throw
   * so the caller can fall back; do NOT silently return an empty list.
   */
  listModels?(): Promise<readonly ModelMetadata[]>;
}

/**
 * Metadata for one model served by an OpenAI-compatible endpoint
 * (#2529). Mirrors the shape of `GET /v1/models`. Most fields are
 * optional because gateways differ in what they expose.
 */
export interface ModelMetadata {
  /** Stable model id — matches what callers pass as `modelId` to `complete`. */
  readonly id: string;
  /** Free-form vendor / org tag. Upstream OpenAI: `openai`/`system`. OpenRouter: `anthropic`/`google`/etc. */
  readonly ownedBy?: string;
  /** Unix epoch seconds when the model was created (when the gateway reports it). */
  readonly createdAt?: number;
  /** Free-form capability strings the gateway exposes — passthrough, no normalisation. */
  readonly capabilities?: readonly string[];
  /** Maximum context window in tokens — populated by gateways that report it (OpenRouter does). */
  readonly contextLength?: number;
  /** Pricing — passthrough only. Gateway-defined units. */
  readonly pricing?: { readonly input?: number; readonly output?: number };
}
