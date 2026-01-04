/**
 * @nexus-agents/adapters - OpenAI Model Adapter
 *
 * Adapter for OpenAI models (GPT-4o, GPT-4-turbo, GPT-3.5-turbo).
 * Implements the IModelAdapter interface with streaming support, rate limiting,
 * and proper error handling.
 *
 * Verified 2026-01-03: openai@6.15.0 is current stable
 * (Source: npm registry)
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletion } from 'openai/resources/chat/completions';
import type {
  Result,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  TokenUsage,
} from '../core/index.js';
import { ok, err, ModelError, ConfigError } from '../core/index.js';
import { BaseAdapter, type BaseAdapterConfig } from './base-adapter.js';
import { createStream } from './streaming.js';
import {
  OPENAI_CHARS_PER_TOKEN,
  DEFAULT_MAX_TOKENS,
  resolveModelId,
  getModelCapabilities,
  type OpenAIAdapterConfig,
} from './openai-types.js';
import {
  mapMessage,
  mapTool,
  mapStopReason,
  mapChoiceToContentBlocks,
  mapResponseUsage,
  mapStreamChunk,
} from './openai-mappers.js';

// Re-export types and constants for public API
export { OPENAI_MODELS, OPENAI_MODEL_ALIASES, type OpenAIAdapterConfig } from './openai-types.js';

/**
 * OpenAI model adapter.
 *
 * Provides a unified interface for interacting with OpenAI's GPT models.
 * Supports completion, streaming, tool use, and vision capabilities.
 *
 * @example
 * ```typescript
 * const adapter = new OpenAIAdapter({
 *   modelId: 'gpt-4o',
 *   apiKey: process.env.OPENAI_API_KEY,
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
export class OpenAIAdapter extends BaseAdapter {
  private readonly client: OpenAI;
  private readonly resolvedModelId: string;

  /**
   * Creates a new OpenAIAdapter instance.
   *
   * @param config - OpenAI adapter configuration
   * @throws {ConfigError} If API key is missing
   */
  constructor(config: OpenAIAdapterConfig) {
    const resolvedModelId = resolveModelId(config.modelId);

    // Build baseConfig conditionally to satisfy exactOptionalPropertyTypes
    const baseConfig: BaseAdapterConfig = {
      providerId: 'openai',
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
      throw new ConfigError('OpenAI API key is required', {
        context: { providerId: 'openai', modelId: config.modelId },
      });
    }

    this.client = this.createClient(config);
  }

  /**
   * Creates the OpenAI client with configuration.
   */
  private createClient(config: OpenAIAdapterConfig): OpenAI {
    const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {
      apiKey: config.apiKey,
      maxRetries: config.maxRetries ?? 2,
    };

    if (config.baseUrl !== undefined) {
      clientOptions.baseURL = config.baseUrl;
    }
    if (config.timeout !== undefined) {
      clientOptions.timeout = config.timeout;
    }
    if (config.organization !== undefined) {
      clientOptions.organization = config.organization;
    }

    return new OpenAI(clientOptions);
  }

  /**
   * Validates adapter configuration.
   * Extends base validation with OpenAI-specific checks.
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
        new ConfigError('OpenAI API key is required', {
          context: { providerId: this.providerId, modelId: this.modelId },
        })
      );
    }

    return ok(undefined);
  }

  /**
   * Send a completion request to OpenAI.
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
   * Stream a completion request from OpenAI.
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
   * Count tokens in text using OpenAI-specific estimation.
   *
   * @param text - Text to count tokens for
   * @returns Approximate token count
   */
  override countTokens(text: string): Promise<number> {
    return Promise.resolve(Math.ceil(text.length / OPENAI_CHARS_PER_TOKEN));
  }

  /**
   * Executes the completion request against the OpenAI API.
   */
  private async executeCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    const params = this.buildRequestParams(request);
    const response = await this.client.chat.completions.create(params);
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
      const stream = await this.client.chat.completions.create({ ...params, stream: true });

      let contentIndex = 0;
      let hasStarted = false;

      for await (const chunk of stream) {
        const mappedChunks = mapStreamChunk(chunk, contentIndex, hasStarted);

        for (const mappedChunk of mappedChunks) {
          if (mappedChunk.type === 'message_start') {
            hasStarted = true;
          }
          if (mappedChunk.type === 'content_block_start') {
            contentIndex++;
          }
          controller.push(mappedChunk);
        }
      }

      controller.complete();
    } catch (error) {
      const modelError = this.transformError(error as Error);
      controller.error(modelError);
    }
  }

  /**
   * Builds OpenAI API request parameters from our CompletionRequest.
   */
  private buildRequestParams(
    request: CompletionRequest
  ): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
    const messages = this.buildMessages(request);

    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: this.resolvedModelId,
      messages,
      max_completion_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    this.addOptionalParams(params, request);
    return params;
  }

  /**
   * Builds the messages array for the request.
   */
  private buildMessages(request: CompletionRequest): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [];

    // Add system prompt if provided explicitly
    if (request.systemPrompt !== undefined && request.systemPrompt !== '') {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    // Map and add all messages (filtering out system if already added via systemPrompt)
    for (const msg of request.messages) {
      if (msg.role === 'system' && request.systemPrompt !== undefined) {
        continue;
      }
      messages.push(mapMessage(msg));
    }

    return messages;
  }

  /**
   * Adds optional parameters to the request.
   */
  private addOptionalParams(
    params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    request: CompletionRequest
  ): void {
    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    if (request.stop !== undefined && request.stop.length > 0) {
      params.stop = request.stop;
    }

    if (request.tools !== undefined && request.tools.length > 0) {
      params.tools = request.tools.map(mapTool);
    }

    this.addResponseFormat(params, request);
  }

  /**
   * Adds response format to the request if specified.
   */
  private addResponseFormat(
    params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    request: CompletionRequest
  ): void {
    if (request.responseFormat === undefined) {
      return;
    }

    if (request.responseFormat.type === 'json_object') {
      params.response_format = { type: 'json_object' };
    } else if (request.responseFormat.type === 'json_schema') {
      params.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: request.responseFormat.schema,
        },
      };
    }
  }

  /**
   * Maps OpenAI API response to our CompletionResponse format.
   */
  private mapResponse(response: ChatCompletion): CompletionResponse {
    const firstChoice = response.choices[0];

    // Handle case where no choices are returned
    if (firstChoice === undefined) {
      return this.createEmptyResponse(response);
    }

    const content = mapChoiceToContentBlocks(firstChoice);
    const usage: TokenUsage = mapResponseUsage(response);

    return {
      content,
      usage,
      stopReason: mapStopReason(firstChoice.finish_reason),
      model: response.model,
    };
  }

  /**
   * Creates an empty response when no choices are returned.
   */
  private createEmptyResponse(response: ChatCompletion): CompletionResponse {
    return {
      content: [{ type: 'text', text: '' }],
      usage: mapResponseUsage(response),
      stopReason: 'end_turn',
      model: response.model,
    };
  }
}

/**
 * Creates an OpenAIAdapter with the specified configuration.
 * Factory function for cleaner API.
 *
 * @param config - OpenAI adapter configuration
 * @returns A configured OpenAIAdapter instance
 *
 * @example
 * ```typescript
 * const adapter = createOpenAIAdapter({
 *   modelId: 'gpt-4o',
 *   apiKey: process.env.OPENAI_API_KEY!,
 * });
 * ```
 */
export function createOpenAIAdapter(config: OpenAIAdapterConfig): OpenAIAdapter {
  return new OpenAIAdapter(config);
}
