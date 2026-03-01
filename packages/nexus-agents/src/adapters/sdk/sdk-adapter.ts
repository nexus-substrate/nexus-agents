/**
 * nexus-agents/adapters/sdk - Base SDK Adapter
 *
 * Implements IModelAdapter using the Vercel AI SDK's generateText/streamText
 * APIs. Provides a unified adapter for any AI SDK-supported provider.
 *
 * @module adapters/sdk/sdk-adapter
 * (Source: Issue #1123 — AI SDK provider layer)
 */

import type {
  CompletionRequest,
  CompletionResponse,
  ContentBlock,
  StreamChunk,
  Result,
  ILogger,
} from '../../core/index.js';
import {
  ok,
  ModelError,
  ModelCapability,
  createLogger,
  getErrorMessage,
} from '../../core/index.js';
import { BaseAdapter, AdapterModelError } from '../base-adapter.js';
import { ErrorCode } from '../../core/index.js';
import type { SdkAdapterConfig, SdkProviderId } from './types.js';
import { PROVIDER_ENV_KEYS } from './types.js';

/** Minimal AI SDK model interface (duck-typed for optional dependency). */
interface AiSdkModel {
  readonly modelId: string;
}

/** AI SDK generateText result shape (duck-typed). */
interface GenerateTextResult {
  text: string;
  finishReason: string;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
  response: { modelId: string };
}

/** AI SDK streamText result shape (duck-typed). */
interface StreamTextResult {
  textStream: AsyncIterable<string>;
}

/** Function signatures for AI SDK entry points (loaded dynamically). */
interface AiSdkFunctions {
  generateText: (options: Record<string, unknown>) => Promise<GenerateTextResult>;
  streamText: (options: Record<string, unknown>) => StreamTextResult;
}

/** AI SDK provider factory: creates a provider instance that is callable as a model factory. */
type ProviderFactory = (opts: Record<string, unknown>) => ProviderInstance;

/** AI SDK provider instance: callable to create a model. */
type ProviderInstance = (id: string) => AiSdkModel;

/**
 * Extracts a named provider factory from a dynamically-imported AI SDK module.
 *
 * AI SDK provider modules export factory functions (e.g., createAnthropic, createOpenAI)
 * that return callable provider instances. Since these are optional peer dependencies
 * loaded via dynamic import, we validate the shape at runtime rather than relying on
 * compile-time types.
 */
function extractProviderFactory(
  mod: Record<string, unknown>,
  factoryName: string
): ProviderFactory {
  const factory = mod[factoryName];
  if (typeof factory !== 'function') {
    throw new Error(`AI SDK module missing expected export: ${factoryName}`);
  }
  return factory as ProviderFactory;
}

/**
 * Validates a dynamically-imported AI SDK module has the expected generateText/streamText exports.
 *
 * The 'ai' package is an optional peer dependency loaded via dynamic import.
 * We validate the shape at runtime to avoid unsafe casts.
 */
function extractAiSdkFunctions(mod: Record<string, unknown>): AiSdkFunctions {
  const generateText = mod['generateText'];
  const streamText = mod['streamText'];
  if (typeof generateText !== 'function') {
    throw new Error("AI SDK module missing expected export: 'generateText'");
  }
  if (typeof streamText !== 'function') {
    throw new Error("AI SDK module missing expected export: 'streamText'");
  }
  return {
    generateText: generateText as AiSdkFunctions['generateText'],
    streamText: streamText as AiSdkFunctions['streamText'],
  };
}

/**
 * Resolves the API key for a given provider.
 * Priority: explicit config > environment variable.
 */
function resolveApiKey(providerId: SdkProviderId, configKey?: string): string | undefined {
  if (configKey !== undefined) return configKey;
  const envVar = PROVIDER_ENV_KEYS[providerId];
  return process.env[envVar];
}

/**
 * Maps AI SDK finish reasons to our StopReason type.
 */
function mapFinishReason(reason: string): CompletionResponse['stopReason'] {
  switch (reason) {
    case 'stop':
    case 'end-turn':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'tool-calls':
      return 'tool_use';
    default:
      return 'end_turn';
  }
}

/**
 * Categorizes an error into an ErrorCode for the circuit breaker.
 */
function categorizeError(error: unknown): ErrorCode {
  const message = getErrorMessage(error).toLowerCase();
  if (message.includes('rate limit') || message.includes('429')) {
    return ErrorCode.MODEL_RATE_LIMITED;
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return ErrorCode.MODEL_TIMEOUT;
  }
  if (message.includes('401') || message.includes('unauthorized') || message.includes('api key')) {
    return ErrorCode.CONFIG_INVALID;
  }
  return ErrorCode.MODEL_ERROR;
}

/**
 * AI SDK adapter implementing IModelAdapter.
 *
 * Uses Vercel AI SDK (npm: ai) for model interaction instead of
 * CLI subprocess spawning. Supports any provider that has an
 * `@ai-sdk/*` package.
 */
export class SdkAdapter extends BaseAdapter {
  private readonly sdkProviderId: SdkProviderId;
  private model: AiSdkModel | undefined;
  private sdkFunctions: AiSdkFunctions | undefined;
  private readonly sdkConfig: SdkAdapterConfig;

  constructor(config: SdkAdapterConfig, logger?: ILogger) {
    const apiKey = resolveApiKey(config.providerId, config.apiKey);
    super({
      providerId: `sdk-${config.providerId}`,
      modelId: config.modelId,
      capabilities: [ModelCapability.COMPLETION, ModelCapability.STREAMING],
      logger: logger ?? createLogger({ adapter: `sdk-${config.providerId}` }),
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(config.timeout !== undefined ? { timeout: config.timeout } : {}),
      ...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
    });
    this.sdkProviderId = config.providerId;
    this.sdkConfig = config;
  }

  /**
   * Lazily initialize the AI SDK model and functions.
   * This allows the adapter to be created without the AI SDK installed,
   * failing only when actually used.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.model !== undefined) return;

    const apiKey = resolveApiKey(this.sdkProviderId, this.sdkConfig.apiKey);
    if (apiKey === undefined) {
      throw new AdapterModelError(`No API key for ${this.sdkProviderId}`, {
        code: ErrorCode.CONFIG_INVALID,
      });
    }

    // Dynamic import — AI SDK is an optional peer dependency
    const providerModule = await this.loadProvider(apiKey);
    this.model = providerModule.model;

    // AI SDK is an optional peer dependency — validate shape at runtime
    const aiModule = await import('ai');
    this.sdkFunctions = extractAiSdkFunctions(aiModule as Record<string, unknown>);
  }

  /**
   * Loads the provider-specific AI SDK module.
   *
   * Each @ai-sdk/* package exports a factory function (e.g., createAnthropic)
   * that returns a callable provider instance. We use extractProviderFactory()
   * to validate the export exists at runtime, since these are optional peer deps.
   */
  private async loadProvider(apiKey: string): Promise<{ model: AiSdkModel }> {
    switch (this.sdkProviderId) {
      case 'anthropic': {
        const mod = await import('@ai-sdk/anthropic');
        const factory = extractProviderFactory(mod as Record<string, unknown>, 'createAnthropic');
        const provider = factory({ apiKey });
        return { model: provider(this.modelId) };
      }
      case 'openai': {
        const mod = await import('@ai-sdk/openai');
        const factory = extractProviderFactory(mod as Record<string, unknown>, 'createOpenAI');
        const provider = factory({ apiKey });
        return { model: provider(this.modelId) };
      }
      case 'google': {
        const mod = await import('@ai-sdk/google');
        const factory = extractProviderFactory(
          mod as Record<string, unknown>,
          'createGoogleGenerativeAI'
        );
        const provider = factory({ apiKey });
        return { model: provider(this.modelId) };
      }
    }
  }

  /**
   * Maps our CompletionRequest to AI SDK generateText options.
   */
  private buildSdkOptions(request: CompletionRequest): Record<string, unknown> {
    const options: Record<string, unknown> = {
      model: this.model,
      messages: request.messages.map((m) => ({
        role: m.role === 'system' ? 'system' : m.role,
        content:
          typeof m.content === 'string'
            ? m.content
            : m.content.map((c: ContentBlock) => {
                if (c.type === 'text') return { type: 'text' as const, text: c.text };
                return c;
              }),
      })),
    };

    if (request.systemPrompt !== undefined) {
      options['system'] = request.systemPrompt;
    }
    if (request.temperature !== undefined) {
      options['temperature'] = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      options['maxTokens'] = request.maxTokens;
    }
    if (request.stop !== undefined) {
      options['stopSequences'] = request.stop;
    }

    return options;
  }

  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
    try {
      await this.ensureInitialized();
      this.logRequest(request);

      const sdk = this.sdkFunctions;
      if (sdk === undefined) throw new Error('SDK not initialized');
      const options = this.buildSdkOptions(request);
      const result = await sdk.generateText(options);

      const response: CompletionResponse = {
        content: [{ type: 'text', text: result.text }],
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
        stopReason: mapFinishReason(result.finishReason),
        model: result.response.modelId,
      };

      this.logResponse(response);
      return ok(response);
    } catch (error: unknown) {
      const code = categorizeError(error);
      return this.toErrorResult(error, code);
    }
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    // Ensure initialization and SDK readiness before entering the generator body.
    // Errors thrown before the first yield in an async generator bypass for-await-of
    // try/catch in callers, so we validate eagerly and wrap the body in try/catch.
    await this.ensureInitialized();
    this.logRequest(request);

    const sdk = this.sdkFunctions;
    if (sdk === undefined) {
      throw new AdapterModelError('SDK not initialized after ensureInitialized()', {
        code: ErrorCode.CONFIG_INVALID,
      });
    }

    const options = this.buildSdkOptions(request);

    // First yield establishes the generator — errors after this point are
    // properly caught by callers using for-await-of with try/catch.
    yield { type: 'message_start', message: { model: this.modelId } };

    const result = sdk.streamText(options);
    let index = 0;
    yield { type: 'content_block_start', index, contentBlock: { type: 'text', text: '' } };

    for await (const text of result.textStream) {
      yield {
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text },
      };
    }

    yield { type: 'content_block_stop', index };
    index++;
    yield {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
    yield { type: 'message_stop' };
  }

  /**
   * Converts a caught error into a Result error with categorized ErrorCode.
   */
  private toErrorResult(error: unknown, code: ErrorCode): Result<CompletionResponse, ModelError> {
    const message = getErrorMessage(error);
    const errorObj = error instanceof Error ? error : new Error(message);
    this.logger.error(`SDK adapter error (${this.sdkProviderId})`, errorObj);
    // AdapterModelError extends ModelError — no cast needed
    const modelError = new AdapterModelError(`${this.sdkProviderId} SDK error: ${message}`, {
      code,
    });
    return { ok: false, error: modelError };
  }
}
