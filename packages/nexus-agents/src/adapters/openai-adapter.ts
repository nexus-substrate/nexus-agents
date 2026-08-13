/**
 * nexus-agents/adapters - OpenAI Model Adapter
 *
 * Adapter for OpenAI models (GPT-4o, GPT-4-turbo, GPT-3.5-turbo).
 * Implements the IModelAdapter interface with streaming support, rate limiting,
 * and proper error handling.
 *
 * Verified 2026-01-03: openai@6.15.0 is current stable
 * (Source: npm registry)
 */

import OpenAI, { APIError } from 'openai';
import type { ChatCompletionMessageParam, ChatCompletion } from 'openai/resources/chat/completions';
import type {
  Result,
  CompletionRequest,
  CompletionResponse,
  ModelMetadata,
  StreamChunk,
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
import {
  DEFAULT_MAX_TOKENS,
  resolveModelId,
  getModelCapabilities,
  type OpenAIAdapterConfig,
} from './openai-types.js';
import { planOptionalParams, type DroppedParam } from './optional-params.js';
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

/**
 * Compose a diagnostic string from an OpenAI SDK `APIError`'s real fields
 * (#4047). The SDK's `.message` alone can be as useless as
 * `"400 status code (no body)"` for an OpenAI-compatible gateway; this pulls the
 * HTTP status, structured error fields, and the raw body so the actual rejection
 * reason is visible.
 */
/** Typed structural view of the OpenAI SDK `APIError` fields we read (the SDK's
 * generic `APIError<any,…>` otherwise leaks `any`). */
interface ApiErrorView {
  readonly status?: number | null;
  readonly type?: string | null;
  readonly code?: string | null;
  readonly param?: string | null;
  readonly requestID?: string | null;
  readonly error?: unknown;
  readonly message?: string;
}

/** `key=value` tag, or `''` when the value is absent. */
function kvTag(key: string, val: string | number | null | undefined): string {
  return val === null || val === undefined || val === '' ? '' : `${key}=${String(val)}`;
}

function describeOpenAIApiError(v: ApiErrorView): string {
  const tags = [
    `HTTP ${String(v.status ?? 'unknown')}`,
    kvTag('type', v.type),
    kvTag('code', v.code),
    kvTag('param', v.param),
    kvTag('request_id', v.requestID),
  ].filter((t) => t !== '');
  let body = '';
  if (v.error !== undefined && v.error !== null) {
    try {
      const raw = JSON.stringify(v.error);
      body = ` body=${raw.length > MAX_ERROR_BODY_CHARS ? `${raw.slice(0, MAX_ERROR_BODY_CHARS)}…` : raw}`;
    } catch {
      body = ' body=<unserializable>';
    }
  }
  return `${tags.join(' ')}: ${v.message ?? ''}${body}`;
}

/** Cap the surfaced gateway error body so a huge response can't bloat logs/messages. */
const MAX_ERROR_BODY_CHARS = 600;

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
    requireApiKey(config.apiKey, 'OpenAI', config.modelId);

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
    const keyResult = validateApiKeyPresence(this.config.apiKey, this.providerId, this.modelId);
    if (!keyResult.ok) return keyResult;

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
   * Surface an OpenAI / OpenAI-compatible gateway's REAL HTTP status + response
   * body in the error (#4047). The OpenAI SDK's default message collapses a
   * gateway rejection to e.g. `"400 status code (no body)"`, which hides WHY a
   * litellm-style gateway rejected a request — exactly the wall hit when
   * diagnosing degraded voter panels on a custom gateway. We re-message with the
   * status/type/code/param/request-id/body. Error-code routing is unchanged: we
   * classify on the ORIGINAL signal (`status`/`code`/`message`) via a clean probe
   * error, so the diagnostic `request_id`/`body` can't pollute the message-
   * substring classifier, then re-message the result with the full detail.
   * Applies to direct OpenAI and the compat gateway alike.
   */
  protected override transformError(error: unknown): ModelError {
    if (error instanceof APIError) {
      const v = error as ApiErrorView;
      // Classify on the original SDK message + status/code/param only. #4069: thread
      // `param` so a param-naming 400 classifies as MODEL_PARAMETER_UNSUPPORTED and
      // the param name reaches the error context.
      const probe: Error & {
        status?: number | undefined;
        code?: string | null | undefined;
        param?: string | undefined;
      } = new Error(typeof v.message === 'string' ? v.message : '');
      probe.status = typeof v.status === 'number' ? v.status : undefined;
      probe.code = v.code ?? undefined;
      probe.param = typeof v.param === 'string' && v.param !== '' ? v.param : undefined;
      probe.cause = error;
      const classified = super.transformError(probe);
      // Surface the full diagnostic detail in the final message (code/cause kept).
      classified.message = `${this.providerId}/${this.modelId}: ${describeOpenAIApiError(v)}`;
      return classified;
    }
    return super.transformError(error);
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
    // Use unified TokenEstimator with OpenAI-specific ratio (~4 chars/token)
    return Promise.resolve(getTokenEstimator().estimateText(text, 'openai'));
  }

  /**
   * Executes the completion request against the OpenAI API.
   */
  private async executeCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    const { params, dropped } = this.buildRequestParams(request);
    // #3036: forward AbortSignal into the OpenAI SDK so withWatchdog
    // timeouts cancel the HTTP request instead of leaking it past the
    // Promise.race boundary. Branch on signal presence — vitest 4
    // toHaveBeenCalledWith treats `(params, undefined)` as a distinct
    // call shape from `(params)`.
    const response =
      request.signal !== undefined
        ? await this.client.chat.completions.create(params, { signal: request.signal })
        : await this.client.chat.completions.create(params);
    // #4069: surface params dropped by the seam (e.g. temperature) as warnings.
    return this.mapResponse(response, dropped);
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
      const { params } = this.buildRequestParams(request);
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
      const modelError = this.transformError(error);
      controller.error(modelError);
    }
  }

  /**
   * Builds OpenAI API request parameters from our CompletionRequest.
   */
  private buildRequestParams(request: CompletionRequest): {
    params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
    dropped: readonly DroppedParam[];
  } {
    const messages = this.buildMessages(request);

    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: this.resolvedModelId,
      messages,
      max_completion_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    const dropped = this.addOptionalParams(params, request);
    return { params, dropped };
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
  ): readonly DroppedParam[] {
    // #4068: the temperature drop-decision (#4061: a gateway routing to a Claude
    // model after Opus 4.6, or an OpenAI reasoning model, rejects a non-1.0
    // temperature with a 400; omit it so a gateway-routed voter panel at the
    // default 0.3 does not 400) is centralized in the shared planOptionalParams
    // seam. NOTE: a gateway that injects its OWN default when the field is absent
    // is outside our control — our contract is only to not SEND a rejected value.
    const plan = planOptionalParams(request, this.resolvedModelId);
    if (plan.temperature !== undefined) {
      params.temperature = plan.temperature;
    }

    if (request.stop !== undefined && request.stop.length > 0) {
      params.stop = request.stop;
    }

    if (request.tools !== undefined && request.tools.length > 0) {
      params.tools = request.tools.map(mapTool);
    }

    this.addResponseFormat(params, request);

    // #4069: report dropped params so mapResponse can surface them as warnings.
    return plan.dropped;
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
  private mapResponse(
    response: ChatCompletion,
    dropped: readonly DroppedParam[] = []
  ): CompletionResponse {
    const firstChoice = response.choices[0];

    // Handle case where no choices are returned
    if (firstChoice === undefined) {
      return this.createEmptyResponse(response, dropped);
    }

    const content = mapChoiceToContentBlocks(firstChoice);
    const usage: TokenUsage | undefined = mapResponseUsage(response);

    return {
      content,
      ...(usage !== undefined ? { usage } : {}),
      stopReason: mapStopReason(firstChoice.finish_reason),
      model: response.model,
      // #4069: surface dropped params (e.g. an omitted temperature). Omitted
      // entirely when nothing was dropped (exactOptionalPropertyTypes).
      ...(dropped.length > 0 ? { warnings: dropped } : {}),
    };
  }

  /**
   * Creates an empty response when no choices are returned.
   */
  private createEmptyResponse(
    response: ChatCompletion,
    dropped: readonly DroppedParam[] = []
  ): CompletionResponse {
    const emptyUsage = mapResponseUsage(response);
    return {
      content: [{ type: 'text', text: '' }],
      ...(emptyUsage !== undefined ? { usage: emptyUsage } : {}),
      stopReason: 'end_turn',
      model: response.model,
      ...(dropped.length > 0 ? { warnings: dropped } : {}),
    };
  }

  /**
   * (#2529) List models served by this OpenAI-compatible endpoint.
   *
   * Wraps `GET /v1/models`. Result is cached for `LIST_MODELS_TTL_MS`
   * so identity resolution doesn't round-trip on every adapter.
   * Concurrent callers share the in-flight promise.
   *
   * Throws on non-2xx so the harness-side identity resolver knows to
   * fall back to modelId parsing — silent empty-list returns would be
   * indistinguishable from "this gateway has no models", which a
   * misconfigured endpoint shouldn't be allowed to claim.
   */
  async listModels(): Promise<readonly ModelMetadata[]> {
    const now = Date.now();
    if (this.modelsCache !== null && now - this.modelsCache.fetchedAt < LIST_MODELS_TTL_MS) {
      return this.modelsCache.value;
    }
    if (this.modelsInFlight !== null) {
      return this.modelsInFlight;
    }
    const inFlight = this.fetchModels();
    this.modelsInFlight = inFlight;
    try {
      const value = await inFlight;
      this.modelsCache = { value, fetchedAt: Date.now() };
      return value;
    } finally {
      this.modelsInFlight = null;
    }
  }

  private modelsCache: { value: readonly ModelMetadata[]; fetchedAt: number } | null = null;
  private modelsInFlight: Promise<readonly ModelMetadata[]> | null = null;

  private async fetchModels(): Promise<readonly ModelMetadata[]> {
    const list = await this.client.models.list();
    return list.data.map((m): ModelMetadata => {
      const meta: ModelMetadata = { id: m.id };
      if (typeof m.owned_by === 'string') {
        return { ...meta, ownedBy: m.owned_by, createdAt: m.created };
      }
      if (typeof m.created === 'number') {
        return { ...meta, createdAt: m.created };
      }
      return meta;
    });
  }
}

const LIST_MODELS_TTL_MS = 5 * 60 * 1000;

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
