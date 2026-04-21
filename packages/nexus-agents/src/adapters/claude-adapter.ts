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
import type { MessageStreamEvent } from '@anthropic-ai/sdk/resources/messages';
import type {
  Result,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ContentBlock,
  TokenUsage,
} from '../core/index.js';
import { ok, err, ModelError, ConfigError, getTokenEstimator } from '../core/index.js';
import {
  BaseAdapter,
  type BaseAdapterConfig,
  requireApiKey,
  validateApiKeyPresence,
} from './base-adapter.js';
import { createStream } from './streaming.js';
import type { ClaudeAdapterConfig } from './claude-adapter-types.js';
import { DEFAULT_MAX_TOKENS } from './claude-adapter-types.js';
import {
  mapStopReason,
  mapContentBlock,
  mapMessage,
  mapTool,
  resolveModelId,
  getModelCapabilities,
} from './claude-adapter-helpers.js';
import { extractRequestSystemPrompt } from './prompt-utils.js';

// Re-export types and constants for backward compatibility
export type { ClaudeAdapterConfig } from './claude-adapter-types.js';
export { CLAUDE_MODELS, CLAUDE_MODEL_ALIASES } from './claude-adapter-types.js';

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
    requireApiKey(config.apiKey, 'Anthropic', config.modelId);

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
    const keyResult = validateApiKeyPresence(this.config.apiKey, this.providerId, this.modelId);
    if (!keyResult.ok) return keyResult;

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
    // Use unified TokenEstimator with Claude-specific ratio (~3.5 chars/token)
    return Promise.resolve(getTokenEstimator().estimateText(text, 'claude'));
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
      const modelError = this.transformError(error);
      controller.error(modelError);
    }
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
    const systemPrompt = extractRequestSystemPrompt(request);
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
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- SDK 0.88 deprecated `temperature` for post-Opus-4.6 models; kept for backward compat with older Anthropic models and value 1.0
      params.temperature = request.temperature;
    }

    if (request.stop !== undefined && request.stop.length > 0) {
      params.stop_sequences = request.stop;
    }

    if (request.tools !== undefined && request.tools.length > 0) {
      params.tools = request.tools.map(mapTool);
    }

    // Issue #470: Log warning when responseFormat is requested but not supported
    if (request.responseFormat !== undefined && request.responseFormat.type !== 'text') {
      this.logger.warn('responseFormat is not supported by Claude adapter', {
        requestedFormat: request.responseFormat.type,
        suggestion: 'Use tool use or prompt engineering for structured output',
      });
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
