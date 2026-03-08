/**
 * nexus-agents/adapters - Gemini/Google AI Model Adapter
 *
 * Adapter for Google's Gemini models (gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash).
 * Implements the IModelAdapter interface with streaming support, tool calling,
 * and proper error handling.
 *
 * Verified 2026-01-03: @google/genai@1.34.0 is current stable
 * (Source: npm registry - last modified 2025-12-17)
 */

import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse, Content } from '@google/genai';
import type {
  Result,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ContentBlock,
  TokenUsage,
} from '../core/index.js';
import {
  ok,
  err,
  ModelError,
  ConfigError,
  getTimeProvider,
  getRandomProvider,
  getTokenEstimator,
} from '../core/index.js';
import {
  BaseAdapter,
  type BaseAdapterConfig,
  requireApiKey,
  validateApiKeyPresence,
} from './base-adapter.js';
import { createStream } from './streaming.js';
import {
  DEFAULT_MAX_TOKENS,
  mapStopReason,
  mapMessageToContent,
  mapToolToFunctionDeclaration,
  resolveModelId,
  getModelCapabilities,
  type GeminiAdapterConfig,
  type GeminiRequestConfig,
  type GeminiRequestParams,
} from './gemini-types.js';

// Re-export types and constants
export { GEMINI_MODELS, GEMINI_MODEL_ALIASES, type GeminiAdapterConfig } from './gemini-types.js';

/**
 * Gemini/Google AI model adapter.
 *
 * Provides a unified interface for interacting with Google's Gemini models.
 * Supports completion, streaming, tool use, and vision capabilities.
 *
 * @example
 * ```typescript
 * const adapter = new GeminiAdapter({
 *   modelId: 'gemini-2.5-flash',
 *   apiKey: process.env.GOOGLE_AI_API_KEY,
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
export class GeminiAdapter extends BaseAdapter {
  private readonly client: GoogleGenAI;
  private readonly resolvedModelId: string;

  /**
   * Creates a new GeminiAdapter instance.
   *
   * @param config - Gemini adapter configuration
   * @throws {ConfigError} If API key is missing
   */
  constructor(config: GeminiAdapterConfig) {
    const resolvedModelId = resolveModelId(config.modelId);

    // Build baseConfig conditionally to satisfy exactOptionalPropertyTypes
    const baseConfig: BaseAdapterConfig = {
      providerId: 'google',
      modelId: resolvedModelId,
      capabilities: getModelCapabilities(config.modelId),
      apiKey: config.apiKey,
    };

    // Only set optional properties if defined
    if (config.timeout !== undefined) {
      baseConfig.timeout = config.timeout;
    }
    if (config.maxRetries !== undefined) {
      baseConfig.maxRetries = config.maxRetries;
    }

    super(baseConfig);

    this.resolvedModelId = resolvedModelId;

    // Validate API key presence
    requireApiKey(config.apiKey, 'Google', config.modelId);

    // Create Google GenAI client
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  /**
   * Validates adapter configuration.
   * Extends base validation with Gemini-specific checks.
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
   * Send a completion request to Gemini.
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
   * Stream a completion request from Gemini.
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
   * Count tokens in text using Gemini-specific estimation.
   *
   * @param text - Text to count tokens for
   * @returns Approximate token count
   */
  override countTokens(text: string): Promise<number> {
    // Use unified TokenEstimator with Gemini-specific ratio (~4 chars/token)
    return Promise.resolve(getTokenEstimator().estimateText(text, 'gemini'));
  }

  /**
   * Executes the completion request against the Google AI API.
   */
  private async executeCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    const params = this.buildRequestParams(request);
    const response = await this.client.models.generateContent(params);

    return this.mapResponse(response);
  }

  /** Stream controller type for executeStream. */
  private readonly streamControllerType = {} as {
    push: (chunk: StreamChunk) => Result<void, Error>;
    complete: () => void;
    error: (error: Error) => void;
  };

  /**
   * Emits the end-of-message events to the stream controller.
   */
  private emitStreamEnd(
    controller: typeof this.streamControllerType,
    hasStartedBlock: boolean,
    index: number
  ): void {
    if (hasStartedBlock) {
      controller.push({ type: 'content_block_stop', index });
    }
    controller.push({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    controller.push({ type: 'message_stop' });
    controller.complete();
  }

  /**
   * Executes streaming completion and pushes chunks to the controller.
   */
  private async executeStream(
    request: CompletionRequest,
    controller: typeof this.streamControllerType
  ): Promise<void> {
    try {
      const params = this.buildRequestParams(request);
      const stream = await this.client.models.generateContentStream(params);

      controller.push({ type: 'message_start', message: { model: this.resolvedModelId } });

      const index = 0;
      let hasStartedBlock = false;

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text !== undefined && text !== '') {
          if (!hasStartedBlock) {
            controller.push({
              type: 'content_block_start',
              index,
              contentBlock: { type: 'text', text: '' },
            });
            hasStartedBlock = true;
          }
          controller.push({
            type: 'content_block_delta',
            index,
            delta: { type: 'text_delta', text },
          });
        }
      }

      this.emitStreamEnd(controller, hasStartedBlock, index);
    } catch (error) {
      controller.error(this.transformError(error as Error));
    }
  }

  /**
   * Extracts system prompt from request.
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
   * Builds generation config from request parameters.
   */
  private buildGenerationConfig(request: CompletionRequest): GeminiRequestConfig {
    const config: GeminiRequestConfig = {};
    config.maxOutputTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;

    const systemPrompt = this.extractSystemPrompt(request);
    if (systemPrompt !== undefined) config.systemInstruction = systemPrompt;
    if (request.temperature !== undefined) config.temperature = request.temperature;
    if (request.stop !== undefined && request.stop.length > 0) config.stopSequences = request.stop;
    if (request.tools !== undefined && request.tools.length > 0) {
      config.tools = [{ functionDeclarations: request.tools.map(mapToolToFunctionDeclaration) }];
    }

    return config;
  }

  /**
   * Logs warning when responseFormat is used with Gemini (not supported).
   */
  private warnIfUnsupportedFormat(request: CompletionRequest): void {
    if (request.responseFormat !== undefined && request.responseFormat.type !== 'text') {
      this.logger.warn('responseFormat is not supported by Gemini adapter', {
        requestedFormat: request.responseFormat.type,
        suggestion: 'Use tool use or prompt engineering for structured output',
      });
    }
  }

  /**
   * Builds Google AI API request parameters from our CompletionRequest.
   */
  private buildRequestParams(request: CompletionRequest): GeminiRequestParams {
    const contents = request.messages
      .map(mapMessageToContent)
      .filter((c): c is Content => c !== null);

    const params: GeminiRequestParams = { model: this.resolvedModelId, contents };
    const config = this.buildGenerationConfig(request);

    this.warnIfUnsupportedFormat(request);

    if (Object.keys(config).length > 0) params.config = config;
    return params;
  }

  /**
   * Generates a unique tool ID.
   */
  private generateToolId(): string {
    return `tool_${String(getTimeProvider().now())}_${getRandomProvider().random().toString(36).slice(2, 9)}`;
  }

  /**
   * Extracts content blocks from the response.
   */
  private extractContentBlocks(response: GenerateContentResponse): ContentBlock[] {
    const content: ContentBlock[] = [];

    const text = response.text;
    if (text !== undefined && text !== '') {
      content.push({ type: 'text', text });
    }

    const functionCalls = response.functionCalls;
    if (functionCalls !== undefined) {
      for (const fc of functionCalls) {
        content.push({
          type: 'tool_use',
          id: this.generateToolId(),
          name: fc.name ?? '',
          input: fc.args ?? {},
        });
      }
    }

    return content;
  }

  /**
   * Maps Google AI API response to our CompletionResponse format.
   */
  private mapResponse(response: GenerateContentResponse): CompletionResponse {
    const content = this.extractContentBlocks(response);
    const candidate = response.candidates?.[0];
    const usageMetadata = response.usageMetadata;

    const usage: TokenUsage = {
      inputTokens: usageMetadata?.promptTokenCount ?? 0,
      outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: usageMetadata?.totalTokenCount ?? 0,
    };

    return {
      content,
      usage,
      stopReason: mapStopReason(candidate?.finishReason),
      model: this.resolvedModelId,
    };
  }
}

/**
 * Creates a GeminiAdapter with the specified configuration.
 * Factory function for cleaner API.
 *
 * @param config - Gemini adapter configuration
 * @returns A configured GeminiAdapter instance
 *
 * @example
 * ```typescript
 * const adapter = createGeminiAdapter({
 *   modelId: 'gemini-2.5-flash',
 *   apiKey: process.env.GOOGLE_AI_API_KEY!,
 * });
 * ```
 */
export function createGeminiAdapter(config: GeminiAdapterConfig): GeminiAdapter {
  return new GeminiAdapter(config);
}
