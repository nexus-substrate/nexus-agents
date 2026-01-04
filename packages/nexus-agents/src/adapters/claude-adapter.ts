/**
 * nexus-agents/adapters - Claude/Anthropic Model Adapter
 *
 * Adapter for Anthropic's Claude models (claude-opus-4, claude-sonnet-4, claude-haiku-3).
 * Implements the IModelAdapter interface with streaming support, rate limiting,
 * and proper error handling.
 *
 * Verified 2026-01-03: @anthropic-ai/sdk@0.71.2 is current stable
 * (Source: npm registry)
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlock as AnthropicContentBlock,
  MessageStreamEvent,
} from '@anthropic-ai/sdk/resources/messages';
import type {
  Result,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ContentBlock,
  Message,
  ToolDefinition,
  TokenUsage,
  StopReason,
} from '../core/index.js';
import { ok, err, ModelError, ConfigError, ModelCapability } from '../core/index.js';
import { BaseAdapter, type BaseAdapterConfig } from './base-adapter.js';
import { createStream } from './streaming.js';

/**
 * Supported Claude model identifiers.
 */
export const CLAUDE_MODELS = {
  OPUS_4: 'claude-opus-4-20250514',
  SONNET_4: 'claude-sonnet-4-20250514',
  HAIKU_3: 'claude-3-haiku-20240307',
} as const;

/**
 * Model aliases for convenience.
 */
export const CLAUDE_MODEL_ALIASES: Record<string, string> = {
  'claude-opus-4': CLAUDE_MODELS.OPUS_4,
  'claude-sonnet-4': CLAUDE_MODELS.SONNET_4,
  'claude-haiku-3': CLAUDE_MODELS.HAIKU_3,
} as const;

/**
 * Configuration specific to ClaudeAdapter.
 */
export interface ClaudeAdapterConfig {
  /** Model ID (e.g., 'claude-sonnet-4' or full model identifier) */
  modelId: string;
  /** API key for Anthropic API (required) */
  apiKey: string;
  /** Base URL for API (optional, defaults to Anthropic's API) */
  baseUrl?: string;
  /** Request timeout in milliseconds (optional) */
  timeout?: number;
  /** Maximum retries for failed requests (optional) */
  maxRetries?: number;
}

/**
 * Characters per token estimate for Claude models.
 * Claude uses a custom tokenizer, but ~3.5 chars/token is a reasonable estimate
 * for English text.
 * (Source: Anthropic documentation on token counting)
 */
const CLAUDE_CHARS_PER_TOKEN = 3.5;

/**
 * Default maximum tokens for Claude models.
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Maps Anthropic stop reasons to our StopReason type.
 */
function mapStopReason(anthropicReason: string | null): StopReason {
  switch (anthropicReason) {
    case 'end_turn':
      return 'end_turn';
    case 'max_tokens':
      return 'max_tokens';
    case 'stop_sequence':
      return 'stop_sequence';
    case 'tool_use':
      return 'tool_use';
    default:
      return 'end_turn';
  }
}

/**
 * Maps Anthropic content blocks to our ContentBlock type.
 */
function mapContentBlock(block: AnthropicContentBlock): ContentBlock {
  if (block.type === 'text') {
    return { type: 'text', text: block.text };
  }
  if (block.type === 'tool_use') {
    const toolBlock = block;
    return {
      type: 'tool_use',
      id: toolBlock.id,
      name: toolBlock.name,
      input: toolBlock.input,
    };
  }
  // Handle unexpected block types gracefully
  return { type: 'text', text: '' };
}

/**
 * Maps our Message format to Anthropic's MessageParam format.
 */
function mapMessage(message: Message): MessageParam {
  const role = message.role === 'user' ? 'user' : 'assistant';

  if (typeof message.content === 'string') {
    return { role, content: message.content };
  }

  // Map content blocks
  const content = message.content.map((block) => {
    if (block.type === 'text') {
      return { type: 'text' as const, text: block.text };
    }
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use' as const,
        id: block.id,
        name: block.name,
        input: block.input,
      };
    }
    if (block.type === 'tool_result') {
      const toolResult: {
        type: 'tool_result';
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      } = {
        type: 'tool_result' as const,
        tool_use_id: block.tool_use_id,
        content: block.content,
      };
      // Only set is_error if explicitly defined (exactOptionalPropertyTypes)
      if (block.is_error !== undefined) {
        toolResult.is_error = block.is_error;
      }
      return toolResult;
    }
    // Image type is the remaining possibility
    // Cast source to match Anthropic's expected type
    return {
      type: 'image' as const,
      source: block.source as Anthropic.ImageBlockParam['source'],
    };
  });

  return { role, content };
}

/**
 * Maps our ToolDefinition to Anthropic's tool format.
 */
function mapTool(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  };
}

/**
 * Resolves model alias to full model identifier.
 */
function resolveModelId(modelId: string): string {
  return CLAUDE_MODEL_ALIASES[modelId] ?? modelId;
}

/**
 * Determines capabilities based on model ID.
 */
function getModelCapabilities(modelId: string): readonly ModelCapability[] {
  const capabilities: ModelCapability[] = [
    ModelCapability.COMPLETION,
    ModelCapability.STREAMING,
    ModelCapability.TOOL_USE,
    ModelCapability.VISION,
  ];

  // Extended thinking is available on Opus and Sonnet 4
  const resolvedId = resolveModelId(modelId);
  if (resolvedId.includes('opus') || resolvedId.includes('sonnet-4')) {
    capabilities.push(ModelCapability.EXTENDED_THINKING);
  }

  return capabilities;
}

/**
 * Claude/Anthropic model adapter.
 *
 * Provides a unified interface for interacting with Anthropic's Claude models.
 * Supports completion, streaming, tool use, and vision capabilities.
 *
 * @example
 * ```typescript
 * const adapter = new ClaudeAdapter({
 *   modelId: 'claude-sonnet-4',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * });
 *
 * const result = await adapter.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   maxTokens: 1024,
 * });
 *
 * if (result.ok) {
 *   console.log(result.value.content);
 * }
 * ```
 */
export class ClaudeAdapter extends BaseAdapter {
  private readonly client: Anthropic;
  private readonly resolvedModelId: string;

  /**
   * Creates a new ClaudeAdapter instance.
   *
   * @param config - Claude adapter configuration
   * @throws {ConfigError} If API key is missing
   */
  constructor(config: ClaudeAdapterConfig) {
    const resolvedModelId = resolveModelId(config.modelId);

    // Build baseConfig conditionally to satisfy exactOptionalPropertyTypes
    const baseConfig: BaseAdapterConfig = {
      providerId: 'anthropic',
      modelId: resolvedModelId,
      capabilities: getModelCapabilities(config.modelId),
      apiKey: config.apiKey,
    };

    // Only set optional properties if defined
    if (config.baseUrl !== undefined) {
      baseConfig.baseUrl = config.baseUrl;
    }
    if (config.timeout !== undefined) {
      baseConfig.timeout = config.timeout;
    }
    if (config.maxRetries !== undefined) {
      baseConfig.maxRetries = config.maxRetries;
    }

    super(baseConfig);

    this.resolvedModelId = resolvedModelId;

    // Validate API key presence
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new ConfigError('Anthropic API key is required', {
        context: { providerId: 'anthropic', modelId: config.modelId },
      });
    }

    // Create Anthropic client
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout,
      maxRetries: config.maxRetries ?? 2,
    });
  }

  /**
   * Validates adapter configuration.
   * Extends base validation with Claude-specific checks.
   */
  override validateConfig(): Result<void, ConfigError> {
    const baseResult = super.validateConfig();
    if (!baseResult.ok) {
      return baseResult;
    }

    // Validate API key is present
    const apiKey = this.config.apiKey;
    if (apiKey === undefined || apiKey === '' || apiKey.trim() === '') {
      return err(
        new ConfigError('Anthropic API key is required', {
          context: { providerId: this.providerId, modelId: this.modelId },
        })
      );
    }

    return ok(undefined);
  }

  /**
   * Send a completion request to Claude.
   *
   * @param request - The completion request
   * @returns Result with response or ModelError
   */
  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
    this.logRequest(request);

    try {
      const response = await this.executeCompletion(request);
      this.logResponse(response);
      return ok(response);
    } catch (error) {
      return err(this.transformError(error));
    }
  }

  /**
   * Stream a completion request from Claude.
   *
   * @param request - The completion request
   * @yields StreamChunk objects as they arrive
   */
  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    this.logRequest(request);

    const [controller, iterable] = createStream<StreamChunk>();

    // Start streaming in the background
    this.executeStream(request, controller).catch((error: unknown) => {
      const modelError = this.transformError(error);
      controller.error(modelError);
    });

    yield* iterable;
  }

  /**
   * Count tokens in text using Claude-specific estimation.
   *
   * Claude uses a custom tokenizer. This provides a more accurate estimate
   * than the base adapter's generic calculation.
   *
   * @param text - Text to count tokens for
   * @returns Approximate token count
   */
  override countTokens(text: string): Promise<number> {
    // Claude tokenizes slightly differently than GPT models
    // ~3.5 characters per token is a reasonable estimate for English
    return Promise.resolve(Math.ceil(text.length / CLAUDE_CHARS_PER_TOKEN));
  }

  /**
   * Executes the completion request against the Anthropic API.
   */
  private async executeCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    const params = this.buildRequestParams(request);
    const response = await this.client.messages.create(params);

    return this.mapResponse(response);
  }

  /**
   * Executes streaming completion and pushes chunks to the controller.
   */
  private async executeStream(
    request: CompletionRequest,
    controller: {
      push: (chunk: StreamChunk) => Result<void, Error>;
      complete: () => void;
      error: (error: Error) => void;
    }
  ): Promise<void> {
    try {
      const params = this.buildRequestParams(request);
      const stream = this.client.messages.stream(params);

      for await (const event of stream) {
        const chunk = this.mapStreamEvent(event);
        if (chunk) {
          controller.push(chunk);
        }
      }

      controller.complete();
    } catch (error) {
      const modelError = this.transformError(error as Error);
      controller.error(modelError);
    }
  }

  /**
   * Extracts system prompt from request, checking both systemPrompt field and messages.
   */
  private extractSystemPrompt(request: CompletionRequest): string | undefined {
    // Check explicit systemPrompt field first
    if (request.systemPrompt !== undefined && request.systemPrompt !== '') {
      return request.systemPrompt;
    }

    // Check for system message in messages array
    const systemMessage = request.messages.find((m) => m.role === 'system');
    if (systemMessage === undefined) {
      return undefined;
    }

    if (typeof systemMessage.content === 'string') {
      return systemMessage.content;
    }

    return systemMessage.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }

  /**
   * Builds Anthropic API request parameters from our CompletionRequest.
   */
  private buildRequestParams(
    request: CompletionRequest
  ): Anthropic.MessageCreateParamsNonStreaming {
    // Filter out system messages and map the rest
    const messages = request.messages.filter((m) => m.role !== 'system').map(mapMessage);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.resolvedModelId,
      messages,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    // Add system prompt if provided
    const systemPrompt = this.extractSystemPrompt(request);
    if (systemPrompt !== undefined) {
      params.system = systemPrompt;
    }

    // Apply optional parameters
    this.applyOptionalParams(params, request);

    return params;
  }

  /**
   * Applies optional parameters to the request params.
   */
  private applyOptionalParams(
    params: Anthropic.MessageCreateParamsNonStreaming,
    request: CompletionRequest
  ): void {
    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    if (request.stop !== undefined && request.stop.length > 0) {
      params.stop_sequences = request.stop;
    }

    if (request.tools !== undefined && request.tools.length > 0) {
      params.tools = request.tools.map(mapTool);
    }
  }

  /**
   * Maps Anthropic API response to our CompletionResponse format.
   */
  private mapResponse(response: Anthropic.Message): CompletionResponse {
    const content: ContentBlock[] = response.content.map(mapContentBlock);

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    return {
      content,
      usage,
      stopReason: mapStopReason(response.stop_reason),
      model: response.model,
    };
  }

  /**
   * Maps Anthropic stream events to our StreamChunk format.
   */
  private mapStreamEvent(event: MessageStreamEvent): StreamChunk | null {
    switch (event.type) {
      case 'message_start':
        return {
          type: 'message_start',
          message: { model: event.message.model },
        };

      case 'content_block_start':
        return {
          type: 'content_block_start',
          index: event.index,
          contentBlock: mapContentBlock(event.content_block),
        };

      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          return {
            type: 'content_block_delta',
            index: event.index,
            delta: { type: 'text_delta', text: event.delta.text },
          };
        }
        return null;

      case 'content_block_stop':
        return {
          type: 'content_block_stop',
          index: event.index,
        };

      case 'message_delta':
        return {
          type: 'message_delta',
          delta: { stop_reason: mapStopReason(event.delta.stop_reason ?? null) },
          usage: {
            inputTokens: 0, // Not available in delta
            outputTokens: event.usage.output_tokens,
            totalTokens: event.usage.output_tokens,
          },
        };

      case 'message_stop':
        return { type: 'message_stop' };

      default:
        return null;
    }
  }
}

/**
 * Creates a ClaudeAdapter with the specified configuration.
 * Factory function for cleaner API.
 *
 * @param config - Claude adapter configuration
 * @returns A configured ClaudeAdapter instance
 *
 * @example
 * ```typescript
 * const adapter = createClaudeAdapter({
 *   modelId: 'claude-sonnet-4',
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 * });
 * ```
 */
export function createClaudeAdapter(config: ClaudeAdapterConfig): ClaudeAdapter {
  return new ClaudeAdapter(config);
}
