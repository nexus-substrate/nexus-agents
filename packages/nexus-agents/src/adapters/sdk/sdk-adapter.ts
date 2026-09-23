/* eslint max-lines: ["error", { "max": 500, "skipBlankLines": true, "skipComments": true }] */
// ~475 lines as eslint counts them (blanks and comments skipped), inside the
// 400-600 band .rules/governance.md preserves for a cohesive file — AI SDK model adapter lifecycle, response mapping, and error fidelity (#6618).
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
  TokenUsage,
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
import {
  isRateLimitLikeError,
  resolveRetryAfterMs,
  RETRY_AFTER_CONTEXT_KEY,
} from '../rate-limit-detector.js';
import { sanitizeOutput } from '../../security/output-sanitizer.js';
import type { SdkAdapterConfig, SdkProviderId } from './types.js';
import { PROVIDER_ENV_KEYS } from './types.js';
import { readCustomApiSurface, readGatewayEnv, redactApiKey } from './gateway-env.js';
import { gatewayAiSdkOptions, readGatewayTransport } from '../gateway-http.js';
import { planOptionalParams, type DroppedParam } from '../optional-params.js';
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
  finishReason?: Promise<string> | string | undefined;
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

/** Maps SDK counters without presenting a partial component sum as a total. */
function mapSdkUsage(usage: GenerateTextResult['usage']): TokenUsage | undefined {
  const { inputTokens, outputTokens, totalTokens } = usage;
  if (totalTokens !== undefined) {
    return { inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0, totalTokens };
  }
  if (inputTokens === undefined || outputTokens === undefined) return undefined;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
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

/**
 * AI SDK provider instance: callable to create a model on the provider's
 * default surface. `@ai-sdk/openai` also exposes `.chat` and `.responses`
 * (#6645); they are optional here because other providers lack them.
 */
type ProviderInstance = ((id: string) => AiSdkModel) & {
  readonly chat?: (id: string) => AiSdkModel;
  readonly responses?: (id: string) => AiSdkModel;
};

/** Build the custom-openai model on the chosen OpenAI API surface (#6645). */
function modelOnSurface(
  provider: ProviderInstance,
  surface: ReturnType<typeof readCustomApiSurface>,
  modelId: string
): AiSdkModel {
  const build = surface === 'chat' ? provider.chat : provider.responses;
  if (typeof build !== 'function') {
    throw new Error(`AI SDK OpenAI provider has no '${surface}' model factory`);
  }
  return build(modelId);
}

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
 * Priority: explicit config > environment variable. The `custom-openai`
 * key goes through the gateway-env resolver, which honours the deprecated
 * `NEXUS_CUSTOM_API_KEY` alias (#4392 increment 3).
 */
function resolveApiKey(providerId: SdkProviderId, configKey?: string): string | undefined {
  if (configKey !== undefined) return configKey;
  if (providerId === 'custom-openai') return readGatewayEnv().apiKey;
  return process.env[PROVIDER_ENV_KEYS[providerId]];
}

/**
 * For the `custom-openai` provider only: resolve the base URL (config >
 * env, the env side via the gateway-env resolver) and run it through the
 * SSRF guard. Returns `undefined` for every other provider (the AI SDK's
 * built-in factories handle their own endpoints). Throws `ConfigError` at
 * construction time for invalid custom-openai setups — catching
 * misconfiguration immediately rather than on the first request.
 */
function resolveAndValidateCustomBaseUrl(config: SdkAdapterConfig): string | undefined {
  if (config.providerId !== 'custom-openai') return undefined;
  const raw = config.baseUrl ?? readGatewayEnv().baseUrl;
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
    // #6618: 'content-filter' is never mapped as a finish: the adapter turns it into
    // an error before a response is built (see assertValidCompletion), because
    // every consumer reads a mapped response as an answer.
    default:
      return 'end_turn';
  }
}

/** A completion that must surface as an error, never as an empty success (#6607, #6618). */
interface NonAnswer {
  /** Why the completion carries no answer. */
  readonly reason: 'content_filter' | 'reasoning_truncated';
  readonly detail: string;
  readonly reasoningTokens?: number;
}

const CONTENT_FILTERED: NonAnswer = {
  reason: 'content_filter',
  detail: 'the reply was blocked by a content filter',
};

const REASONING_TRUNCATED: NonAnswer = {
  reason: 'reasoning_truncated',
  detail:
    'the completion budget was spent on reasoning before any output (empty reply, finish length)',
};

/**
 * A non-answer as a non-retryable `MODEL_ERROR` (#6607, #6618). `context.reason`
 * names which kind it was, so telemetry can tell a refusal from a
 * reasoning-exhausted budget. `source` is `provider/model`.
 */
function nonAnswerError(source: string, nonAnswer: NonAnswer, servedModel?: string): ModelError {
  return new ModelError(`${source}: ${nonAnswer.detail}`, {
    code: ErrorCode.MODEL_ERROR,
    context: {
      reason: nonAnswer.reason,
      ...(servedModel !== undefined ? { servedModel } : {}),
      ...(nonAnswer.reasoningTokens !== undefined
        ? { reasoningTokens: nonAnswer.reasoningTokens }
        : {}),
    },
  });
}

/**
 * Classifies whether a completion result is a non-answer and throws a `ModelError` if so (#6618).
 */
function assertValidCompletion(
  source: string,
  finishReason: string,
  hasContent: boolean,
  servedModel?: string
): void {
  if (finishReason === 'content-filter') {
    throw nonAnswerError(source, CONTENT_FILTERED, servedModel);
  }
  if (finishReason === 'length' && !hasContent) {
    throw nonAnswerError(source, REASONING_TRUNCATED, servedModel);
  }
}

/**
 * Awaits and validates the stream finish reason (#6618).
 */
async function assertValidStreamFinish(
  source: string,
  result: StreamTextResult,
  totalText: string
): Promise<void> {
  if (result.finishReason === undefined) return;
  const finishReason = await result.finishReason;
  assertValidCompletion(source, finishReason, totalText !== '');
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
  /** OpenAI API surface for custom-openai (#6645); undefined for built-ins. */
  private readonly customApiSurface: ReturnType<typeof readCustomApiSurface> | undefined;
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
    this.customApiSurface =
      config.providerId === 'custom-openai' ? readCustomApiSurface() : undefined;
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
        if (this.customBaseUrl !== undefined) {
          opts['baseURL'] = this.customBaseUrl;
          // Auth header, extra headers and proxy: the gateway's transport (#6629).
          const transport = readGatewayTransport(this.customBaseUrl, process.env, this.logger);
          Object.assign(opts, gatewayAiSdkOptions({ ...transport, apiKey }));
        }
        const provider = factory(opts);
        // Chat completions unless NEXUS_CUSTOM_API_SURFACE=responses (#6645):
        // the provider's default is the Responses API, which many gateways lack.
        return {
          model: modelOnSurface(provider, this.customApiSurface ?? 'chat', this.modelId),
        };
      }
    }
  }

  /**
   * Maps our CompletionRequest to AI SDK generateText options.
   */
  private buildSdkOptions(request: CompletionRequest): {
    options: Record<string, unknown>;
    dropped: readonly DroppedParam[];
  } {
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
    // #4068: the temperature drop-decision (#4061/#4062: Claude after Opus 4.6 and
    // OpenAI reasoning models reject a non-1.0 temperature with a 400; the AI-SDK
    // path routes to both, so omit the param for those models — 1.0 is the API
    // default, equivalent) is centralized in the shared planOptionalParams seam.
    const plan = planOptionalParams(request, this.modelId);
    if (plan.temperature !== undefined) {
      options['temperature'] = plan.temperature;
    }
    if (request.maxTokens !== undefined) {
      options['maxTokens'] = request.maxTokens;
    }
    if (request.stop !== undefined) {
      options['stopSequences'] = request.stop;
    }

    // #4069: report dropped params so complete() can surface them as warnings.
    return { options, dropped: plan.dropped };
  }

  /**
   * generateText path (text / absent responseFormat) — unchanged behavior.
   */
  private async completeText(
    sdk: AiSdkFunctions,
    options: Record<string, unknown>
  ): Promise<CompletionResponse> {
    const result = await sdk.generateText(options);
    assertValidCompletion(
      `${this.providerId}/${this.modelId}`,
      result.finishReason,
      result.text !== '' && result.text.trim() !== '',
      result.response.modelId
    );
    const usage = mapSdkUsage(result.usage);
    return {
      content: [{ type: 'text', text: result.text }],
      ...(usage !== undefined ? { usage } : {}),
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
    assertValidCompletion(
      `${this.providerId}/${this.modelId}`,
      result.finishReason,
      result.object !== null && result.object !== undefined,
      result.response.modelId
    );
    const usage = mapSdkUsage(result.usage);
    return {
      content: [{ type: 'text', text: JSON.stringify(result.object) }],
      ...(usage !== undefined ? { usage } : {}),
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
      const { options, dropped } = this.buildSdkOptions(request);

      // #3433: native structured output. json_object/json_schema route
      // through generateObject; everything else keeps the generateText path
      // unchanged.
      const responseFormat = request.responseFormat;
      const base =
        responseFormat !== undefined && responseFormat.type !== 'text'
          ? await this.completeStructured(sdk, options, responseFormat)
          : await this.completeText(sdk, options);

      // #4069: surface params dropped by the seam (e.g. temperature) as warnings.
      // Omitted entirely when nothing was dropped (exactOptionalPropertyTypes).
      const response: CompletionResponse =
        dropped.length > 0 ? { ...base, warnings: dropped } : base;

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

    const { options } = this.buildSdkOptions(request);

    // First yield establishes the generator — errors after this point are
    // properly caught by callers using for-await-of with try/catch.
    yield { type: 'message_start', message: { model: this.modelId } };

    const result = sdk.streamText(options);
    let index = 0;
    yield { type: 'content_block_start', index, contentBlock: { type: 'text', text: '' } };

    let totalText = '';
    for await (const text of result.textStream) {
      // #3317 finding #8: skip empty-string deltas — the SDK can emit zero-length
      // chunks (keepalives/segment boundaries); a `text_delta` with `text: ''` is
      // noise that downstream re-assemblers must otherwise special-case.
      if (text === '') continue;
      totalText += text;
      yield {
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text },
      };
    }

    await assertValidStreamFinish(`${this.providerId}/${this.modelId}`, result, totalText);

    yield { type: 'content_block_stop', index };
    index++;
    yield {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      // #4835: no usage is reported on this path, so none is emitted —
      // zero-filling all three made an unmeasured stream indistinguishable
      // from one that consumed nothing. `usage` is optional on the chunk.
    };
    yield { type: 'message_stop' };
  }

  /**
   * Converts a caught error into a Result error with categorized ErrorCode.
   */
  private toErrorResult(error: unknown, code: ErrorCode): Result<CompletionResponse, ModelError> {
    if (error instanceof ModelError) {
      this.logger.error(`SDK adapter error (${this.sdkProviderId})`, error);
      return { ok: false, error };
    }

    // Scrub API keys + bearer tokens out of upstream SDK error messages
    // before they hit logs or the surfaced ModelError. Parity with the
    // subprocess-adapter path. Audit #2824. The RESOLVED key is redacted by
    // exact match first (#4392 inc 3): a gateway key has no vendor shape the
    // pattern sanitizer knows, and a 401 body may echo the key it rejected.
    const apiKey = resolveApiKey(this.sdkProviderId, this.sdkConfig.apiKey);
    const safeMessage = sanitizeOutput(redactApiKey(getErrorMessage(error), apiKey));
    // Never the original object: its message AND its stack's first line carry
    // the raw text. The name is kept so the log still says what was thrown.
    const errorObj = new Error(safeMessage);
    if (error instanceof Error) errorObj.name = error.name;
    this.logger.error(`SDK adapter error (${this.sdkProviderId})`, errorObj);
    // #4606: this path builds the ModelError itself rather than going through
    // `BaseAdapter.transformError`, so it has to capture the horizon too. The
    // AI SDK's `APICallError` carries `responseHeaders` as a plain record;
    // `resolveRetryAfterMs` reads only `retry-after` out of it and returns a
    // number, so no header bag reaches the error or the logs. Parsed off the
    // SANITIZED message, so a scrubbed credential can't be re-read from it.
    const retryAfterMs =
      code === ErrorCode.MODEL_RATE_LIMITED ? resolveRetryAfterMs(error, safeMessage) : undefined;
    // AdapterModelError extends ModelError — no cast needed
    const modelError = new AdapterModelError(`${this.sdkProviderId} SDK error: ${safeMessage}`, {
      code,
      ...(retryAfterMs !== undefined
        ? { context: { [RETRY_AFTER_CONTEXT_KEY]: retryAfterMs } }
        : {}),
    });
    return { ok: false, error: modelError };
  }
}
