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
  ResponseFormat,
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
import { isRateLimitLikeError } from '../rate-limit-detector.js';
import { sanitizeOutput } from '../../security/output-sanitizer.js';
import type { SdkAdapterConfig, SdkProviderId } from './types.js';
import { PROVIDER_ENV_KEYS, CUSTOM_API_BASE_URL_ENV } from './types.js';
import {
  validateCustomApiBaseUrl,
  assertCustomApiHostResolvesPublic,
} from './custom-api-validation.js';

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

/** AI SDK generateObject result shape (duck-typed). */
interface GenerateObjectResult {
  object: unknown;
  finishReason: string;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
  response: { modelId: string };
}

/** Opaque schema handle returned by the AI SDK `jsonSchema` helper. */
type AiSdkSchema = unknown;

/** Function signatures for AI SDK entry points (loaded dynamically). */
interface AiSdkFunctions {
  generateText: (options: Record<string, unknown>) => Promise<GenerateTextResult>;
  streamText: (options: Record<string, unknown>) => StreamTextResult;
  generateObject: (options: Record<string, unknown>) => Promise<GenerateObjectResult>;
  jsonSchema: (schema: Record<string, unknown>) => AiSdkSchema;
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
/**
 * Validate that a dynamically-imported `ai` module exposes the functions this
 * adapter needs; throw a clear, per-export error otherwise. Exported for direct
 * unit testing (#3449) so the "missing export" cases don't need a global module
 * mock (`vi.doMock`/`resetModules`), whose state leaked across parallel tests.
 */
export function extractAiSdkFunctions(mod: Record<string, unknown>): AiSdkFunctions {
  const generateText = mod['generateText'];
  const streamText = mod['streamText'];
  const generateObject = mod['generateObject'];
  const jsonSchema = mod['jsonSchema'];
  if (typeof generateText !== 'function') {
    throw new Error("AI SDK module missing expected export: 'generateText'");
  }
  if (typeof streamText !== 'function') {
    throw new Error("AI SDK module missing expected export: 'streamText'");
  }
  // #3433: structured output routes through generateObject + jsonSchema.
  if (typeof generateObject !== 'function') {
    throw new Error("AI SDK module missing expected export: 'generateObject'");
  }
  if (typeof jsonSchema !== 'function') {
    throw new Error("AI SDK module missing expected export: 'jsonSchema'");
  }
  return {
    generateText: generateText as AiSdkFunctions['generateText'],
    streamText: streamText as AiSdkFunctions['streamText'],
    generateObject: generateObject as AiSdkFunctions['generateObject'],
    jsonSchema: jsonSchema as AiSdkFunctions['jsonSchema'],
  };
}

/**
 * Runtime-validates the duck-typed `generateObject` result shape (#3433).
 *
 * `generateObject` comes from the optional `ai` peer dependency, so its
 * result is `unknown` to us. We narrow it here rather than casting, so a
 * shape change in the SDK surfaces as a clear error instead of a silent
 * `undefined` downstream.
 */
function isGenerateObjectResult(value: unknown): value is GenerateObjectResult {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (!('object' in record)) return false;
  if (typeof record['finishReason'] !== 'string') return false;
  const usage = record['usage'];
  if (typeof usage !== 'object' || usage === null) return false;
  const response = record['response'];
  if (typeof response !== 'object' || response === null) return false;
  if (typeof (response as Record<string, unknown>)['modelId'] !== 'string') return false;
  return true;
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
 * For the `custom-openai` provider only: resolve the base URL (config >
 * env) and run it through the SSRF guard. Returns `undefined` for every
 * other provider (the AI SDK's built-in factories handle their own
 * endpoints). Throws `ConfigError` at construction time for invalid
 * custom-openai setups — catching misconfiguration immediately rather
 * than on the first request.
 */
function resolveAndValidateCustomBaseUrl(config: SdkAdapterConfig): string | undefined {
  if (config.providerId !== 'custom-openai') return undefined;
  const raw = config.baseUrl ?? process.env[CUSTOM_API_BASE_URL_ENV];
  const validated = validateCustomApiBaseUrl(raw);
  if (!validated.ok) throw validated.error;
  return validated.value.toString();
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
  if (isRateLimitLikeError(error)) {
    return ErrorCode.MODEL_RATE_LIMITED;
  }
  const message = getErrorMessage(error).toLowerCase();
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
  /** Validated base URL for custom-openai provider; undefined for built-ins. */
  private readonly customBaseUrl: string | undefined;
  /** Inflight init promise for coalescing concurrent calls (Issue #1438). */
  private initPromise: Promise<void> | undefined;
  /**
   * Cached result of the DNS-resolve-time SSRF check for custom-openai
   * (#3426). Resolved once on first init so we don't re-resolve the gateway
   * hostname on every request. `undefined` until the check has run.
   */
  private resolveSsrfChecked = false;

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
    this.customBaseUrl = resolveAndValidateCustomBaseUrl(config);
  }

  /**
   * Lazily initialize the AI SDK model and functions.
   * This allows the adapter to be created without the AI SDK installed,
   * failing only when actually used.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.model !== undefined) return;
    // Coalesce concurrent init calls into a single load (Issue #1438)
    if (this.initPromise !== undefined) {
      await this.initPromise;
      return;
    }
    this.initPromise = this.doInitialize();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = undefined;
    }
  }

  private async doInitialize(): Promise<void> {
    const apiKey = resolveApiKey(this.sdkProviderId, this.sdkConfig.apiKey);
    if (apiKey === undefined) {
      throw new AdapterModelError(`No API key for ${this.sdkProviderId}`, {
        code: ErrorCode.CONFIG_INVALID,
      });
    }

    // DNS-resolve-time SSRF guard for custom-openai gateways (#3426). The
    // construction-time guard is string-level only; this resolves the gateway
    // hostname and rejects if it points at a private/loopback/link-local IP.
    // Run BEFORE any model state is set so a rejection leaves the adapter
    // uninitialized — a retry re-runs the guard rather than skipping it via the
    // `this.model !== undefined` short-circuit in ensureInitialized().
    await this.ensureCustomHostResolvesPublic();

    // Dynamic import — AI SDK is an optional peer dependency
    const providerModule = await this.loadProvider(apiKey);
    this.model = providerModule.model;

    // AI SDK is an optional peer dependency — validate shape at runtime
    const aiModule = await import('ai');
    this.sdkFunctions = extractAiSdkFunctions(aiModule);
  }

  /**
   * For custom-openai only: run the DNS-resolve-time SSRF check exactly once
   * and throw if the gateway hostname resolves to a private address (#3426).
   * Cached via `resolveSsrfChecked` so the hostname is not re-resolved on
   * every request. No-op for non-custom providers (built-in endpoints are
   * trusted) and when no custom base URL is configured.
   */
  private async ensureCustomHostResolvesPublic(): Promise<void> {
    if (this.resolveSsrfChecked) return;
    if (this.sdkProviderId !== 'custom-openai' || this.customBaseUrl === undefined) {
      this.resolveSsrfChecked = true;
      return;
    }
    const hostname = new URL(this.customBaseUrl).hostname;
    const result = await assertCustomApiHostResolvesPublic(hostname);
    if (!result.ok) {
      // Do NOT cache a rejection (#3426 QA): leaving the flag false means a
      // retry re-runs the guard rather than silently skipping it via the
      // early-return above. The guard itself fails OPEN on transient resolver
      // errors, so a flaky-DNS host still proceeds; only a confirmed private
      // resolution throws here.
      throw result.error;
    }
    this.resolveSsrfChecked = true;
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
        const factory = extractProviderFactory(mod, 'createAnthropic');
        const provider = factory({ apiKey });
        return { model: provider(this.modelId) };
      }
      case 'openai': {
        const mod = await import('@ai-sdk/openai');
        const factory = extractProviderFactory(mod, 'createOpenAI');
        const provider = factory({ apiKey });
        return { model: provider(this.modelId) };
      }
      case 'google': {
        const mod = await import('@ai-sdk/google');
        const factory = extractProviderFactory(mod, 'createGoogleGenerativeAI');
        const provider = factory({ apiKey });
        return { model: provider(this.modelId) };
      }
      case 'custom-openai': {
        // OpenAI-compatible gateway (multi-vendor proxies, self-hosted servers,
        // corporate LLM gateways). Reuses @ai-sdk/openai with a configurable
        // baseURL. See custom-api-validation.ts for the SSRF guard; the
        // adapter constructor validates before this method is reached.
        const mod = await import('@ai-sdk/openai');
        const factory = extractProviderFactory(mod, 'createOpenAI');
        const opts: Record<string, unknown> = { apiKey };
        if (this.customBaseUrl !== undefined) opts['baseURL'] = this.customBaseUrl;
        const provider = factory(opts);
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

  /**
   * generateText path (text / absent responseFormat) — unchanged behavior.
   */
  private async completeText(
    sdk: AiSdkFunctions,
    options: Record<string, unknown>
  ): Promise<CompletionResponse> {
    const result = await sdk.generateText(options);
    return {
      content: [{ type: 'text', text: result.text }],
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      },
      stopReason: mapFinishReason(result.finishReason),
      model: result.response.modelId,
    };
  }

  /**
   * generateObject path (#3433) — json_object / json_schema responseFormat.
   *
   * Uses the AI SDK `jsonSchema` helper to build the schema handle
   * (permissive `{ type: 'object' }` for json_object), then stringifies the
   * returned object into a text content block so downstream parsers /
   * extractTextFromResponse keep working unchanged.
   */
  private async completeStructured(
    sdk: AiSdkFunctions,
    options: Record<string, unknown>,
    responseFormat: Exclude<ResponseFormat, { type: 'text' }>
  ): Promise<CompletionResponse> {
    const rawSchema: Record<string, unknown> =
      responseFormat.type === 'json_schema' ? responseFormat.schema : { type: 'object' };
    const schema = sdk.jsonSchema(rawSchema);
    const result: unknown = await sdk.generateObject({ ...options, schema });
    if (!isGenerateObjectResult(result)) {
      throw new Error(
        'AI SDK generateObject returned an unexpected result shape ' +
          '(missing object/usage/finishReason/response.modelId)'
      );
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result.object) }],
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      },
      stopReason: mapFinishReason(result.finishReason),
      model: result.response.modelId,
    };
  }

  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
    try {
      await this.ensureInitialized();
      this.logRequest(request);

      const sdk = this.sdkFunctions;
      if (sdk === undefined) {
        throw new Error(
          `SDK not initialized for model '${this.sdkConfig.modelId}' (provider: ${this.sdkProviderId}). ` +
            'Ensure ensureInitialized() completes before calling complete().'
        );
      }
      const options = this.buildSdkOptions(request);

      // #3433: native structured output. json_object/json_schema route
      // through generateObject; everything else keeps the generateText path
      // unchanged.
      const responseFormat = request.responseFormat;
      const response =
        responseFormat !== undefined && responseFormat.type !== 'text'
          ? await this.completeStructured(sdk, options, responseFormat)
          : await this.completeText(sdk, options);

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
      // #3317 finding #8: skip empty-string deltas — the SDK can emit zero-length
      // chunks (keepalives/segment boundaries); a `text_delta` with `text: ''` is
      // noise that downstream re-assemblers must otherwise special-case.
      if (text === '') continue;
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
    // Scrub API keys + bearer tokens out of upstream SDK error messages
    // before they hit logs or the surfaced ModelError. Parity with the
    // subprocess-adapter path. Audit #2824.
    const safeMessage = sanitizeOutput(message);
    const errorObj = error instanceof Error ? error : new Error(safeMessage);
    this.logger.error(`SDK adapter error (${this.sdkProviderId})`, errorObj);
    // AdapterModelError extends ModelError — no cast needed
    const modelError = new AdapterModelError(`${this.sdkProviderId} SDK error: ${safeMessage}`, {
      code,
    });
    return { ok: false, error: modelError };
  }
}
