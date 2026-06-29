/**
 * nexus-agents/adapters - Base Adapter
 *
 * Abstract base class that all model adapters extend.
 * Provides common functionality for token counting, logging, error transformation,
 * and capability checking.
 */

import type {
  Result,
  IModelAdapter,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ILogger,
  ModelCapability,
} from '../core/index.js';
import { getErrorMessage } from '../core/index.js';
import { isRateLimitLikeError } from './rate-limit-detector.js';
import { recordWouldHaveSelfHealed } from './optional-params.js';

import {
  ok,
  err,
  ConfigError,
  ModelError,
  ErrorCode,
  createLogger,
  getTokenEstimator,
  type NexusErrorOptions,
} from '../core/index.js';

/**
 * Configuration options for BaseAdapter.
 */
export interface BaseAdapterConfig {
  /** Provider identifier (e.g., 'anthropic', 'openai') */
  providerId: string;
  /** Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o') */
  modelId: string;
  /** Capabilities this model supports */
  capabilities: readonly ModelCapability[];
  /** Optional custom logger */
  logger?: ILogger;
  /** API key for authentication (optional, may come from environment) */
  apiKey?: string;
  /** Base URL for the API (optional, uses provider default) */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum number of retries for failed requests */
  maxRetries?: number;
}

/**
 * Extended ModelError that supports specific error codes.
 *
 * While ModelError from core uses MODEL_ERROR by default, this subclass
 * allows adapters to specify more granular error codes like
 * MODEL_RATE_LIMITED, MODEL_TIMEOUT, etc.
 *
 * Extends ModelError so `instanceof ModelError` checks pass naturally
 * without requiring `as unknown as ModelError` casts.
 */
export class AdapterModelError extends ModelError {
  constructor(message: string, options: NexusErrorOptions) {
    super(message, options);
    this.name = 'ModelError';
  }
}

// ============================================================================
// API Key Validation Helpers (#1446 — DRY extraction)
// ============================================================================

/**
 * Returns true if the given API key is missing or blank.
 */
export function isApiKeyMissing(apiKey: string | undefined): boolean {
  return apiKey === undefined || apiKey === '' || apiKey.trim() === '';
}

/**
 * Validates API key presence in constructor — throws ConfigError if missing.
 * Use in adapter constructors where throwing is appropriate.
 */
export function requireApiKey(
  apiKey: string | undefined,
  providerName: string,
  modelId: string
): void {
  if (isApiKeyMissing(apiKey)) {
    throw new ConfigError(`${providerName} API key is required`, {
      context: { providerId: providerName.toLowerCase(), modelId },
    });
  }
}

/**
 * Validates API key presence — returns Result for validate-style methods.
 * Use in adapter validateConfig() methods that return Result.
 */
export function validateApiKeyPresence(
  apiKey: string | undefined,
  providerId: string,
  modelId: string
): Result<void, ConfigError> {
  if (isApiKeyMissing(apiKey)) {
    return err(
      new ConfigError(`${providerId} API key is required`, {
        context: { providerId, modelId },
      })
    );
  }
  return ok(undefined);
}

/**
 * Abstract base class for model adapters.
 *
 * Provides default implementations for common adapter functionality while
 * leaving the core API interaction methods abstract for provider-specific
 * implementations.
 *
 * @example
 * ```typescript
 * class ClaudeAdapter extends BaseAdapter {
 *   constructor(config: ClaudeAdapterConfig) {
 *     super({
 *       providerId: 'anthropic',
 *       modelId: config.modelId,
 *       capabilities: [ModelCapability.COMPLETION, ModelCapability.STREAMING],
 *       apiKey: config.apiKey,
 *     });
 *   }
 *
 *   async complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
 *     this.logRequest(request);
 *     // Provider-specific implementation...
 *   }
 *
 *   async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
 *     this.logRequest(request);
 *     // Provider-specific streaming implementation...
 *   }
 * }
 * ```
 */
export abstract class BaseAdapter implements IModelAdapter {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilities: readonly ModelCapability[];

  /** Logger for request/response logging */
  protected readonly logger: ILogger;

  /** Configuration for the adapter */
  protected readonly config: BaseAdapterConfig;

  /**
   * Creates a new BaseAdapter instance.
   *
   * @param config - Adapter configuration
   */
  constructor(config: BaseAdapterConfig) {
    this.providerId = config.providerId;
    this.modelId = config.modelId;
    this.capabilities = config.capabilities;
    this.config = config;
    this.logger =
      config.logger ??
      createLogger({
        adapter: config.providerId,
        model: config.modelId,
      });
  }

  /**
   * Send a completion request to the model.
   * Must be implemented by concrete adapter classes.
   *
   * @param request - The completion request
   * @returns Result with response or ModelError
   */
  abstract complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>>;

  /**
   * Stream a completion request from the model.
   * Must be implemented by concrete adapter classes.
   *
   * @param request - The completion request
   * @yields StreamChunk objects as they arrive
   */
  abstract stream(request: CompletionRequest): AsyncIterable<StreamChunk>;

  /**
   * Count tokens in text using the unified TokenEstimator.
   *
   * This provides a reasonable estimate for most use cases.
   * Concrete adapters may override this with provider-specific tokenizers.
   *
   * @param text - Text to count tokens for
   * @returns Approximate token count
   */
  countTokens(text: string): Promise<number> {
    return Promise.resolve(getTokenEstimator().estimateText(text));
  }

  /**
   * Validate adapter configuration.
   *
   * Checks that required configuration fields are present and valid.
   * Concrete adapters may override to add provider-specific validation.
   *
   * @returns Ok if valid, ConfigError if invalid
   */
  validateConfig(): Result<void, ConfigError> {
    const errors: string[] = [];

    if (!this.providerId || this.providerId.trim() === '') {
      errors.push('Provider ID is required');
    }

    if (!this.modelId || this.modelId.trim() === '') {
      errors.push('Model ID is required');
    }

    if (this.config.timeout !== undefined && this.config.timeout <= 0) {
      errors.push('Timeout must be positive');
    }

    if (this.config.maxRetries !== undefined && this.config.maxRetries < 0) {
      errors.push('Max retries cannot be negative');
    }

    if (errors.length > 0) {
      return err(
        new ConfigError(`Invalid adapter configuration: ${errors.join('; ')}`, {
          context: {
            providerId: this.providerId,
            modelId: this.modelId,
            errors,
          },
        })
      );
    }

    return ok(undefined);
  }

  /**
   * Check if this adapter supports a specific capability.
   *
   * @param capability - The capability to check for
   * @returns True if the capability is supported
   */
  hasCapability(capability: ModelCapability): boolean {
    return this.capabilities.includes(capability);
  }

  /**
   * Log details about an outgoing request.
   * Sanitizes sensitive information before logging.
   *
   * @param request - The completion request to log
   */
  protected logRequest(request: CompletionRequest): void {
    const messageCount = request.messages.length;
    const hasTools = request.tools !== undefined && request.tools.length > 0;
    const toolCount = request.tools?.length ?? 0;

    this.logger.debug('Sending completion request', {
      messageCount,
      hasSystemPrompt: request.systemPrompt !== undefined,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      hasTools,
      toolCount,
      responseFormat: request.responseFormat?.type,
      stopSequences: request.stop?.length ?? 0,
    });
  }

  /**
   * Log details about a received response.
   *
   * @param response - The completion response to log
   */
  protected logResponse(response: CompletionResponse): void {
    this.logger.debug('Received completion response', {
      contentBlocks: response.content.length,
      stopReason: response.stopReason,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      model: response.model,
    });
  }

  /**
   * Transform a provider-specific error into a standardized ModelError.
   *
   * Maps common error patterns to appropriate error codes:
   * - Rate limiting (429, quota exceeded)
   * - Timeouts (ETIMEDOUT, ESOCKETTIMEDOUT)
   * - Authentication (401, 403)
   * - Model unavailable (503, 502)
   *
   * @param error - The original error from the provider
   * @returns A standardized ModelError
   */
  protected transformError(error: unknown): ModelError {
    if (error instanceof ModelError) {
      return error;
    }

    const errorMessage = getErrorMessage(error);
    const errorCode = this.determineErrorCode(error);

    // #4069: a param-naming 400 carries the offending param name in context, and
    // counts as a would-have-self-healed event (the reactive #4071 path would catch
    // exactly this 400). Only set for MODEL_PARAMETER_UNSUPPORTED — all other codes
    // are unchanged.
    const param =
      errorCode === ErrorCode.MODEL_PARAMETER_UNSUPPORTED
        ? this.extractErrorParam(error)
        : undefined;
    if (param !== undefined) {
      recordWouldHaveSelfHealed(this.modelId, param);
    }

    const modelError = this.createModelError(errorMessage, errorCode, error, param);

    this.logger.error('Model adapter error', modelError, {
      errorCode,
      providerId: this.providerId,
      modelId: this.modelId,
    });

    return modelError;
  }

  /**
   * Create a ModelError with appropriate error code.
   */
  private createModelError(
    message: string,
    errorCode: (typeof ErrorCode)[keyof typeof ErrorCode],
    originalError: unknown,
    param?: string
  ): ModelError {
    const fullMessage = `${this.providerId}/${this.modelId}: ${message}`;

    // Build options object conditionally to satisfy exactOptionalPropertyTypes
    const context: Record<string, unknown> = {
      providerId: this.providerId,
      modelId: this.modelId,
    };
    // #4069: surface the offending param name for a param-naming 400 so callers
    // and the reactive self-heal path (#4071) can read which param to retry without.
    if (param !== undefined) {
      context.param = param;
    }
    const options: NexusErrorOptions = {
      code: errorCode,
      context,
    };

    // Only set cause if originalError is an Error
    if (originalError instanceof Error) {
      options.cause = originalError;
    }

    // AdapterModelError extends ModelError — no cast needed
    return new AdapterModelError(fullMessage, options);
  }

  /**
   * Determine the appropriate error code based on error characteristics.
   */
  private determineErrorCode(error: unknown): (typeof ErrorCode)[keyof typeof ErrorCode] {
    if (!(error instanceof Error)) {
      return ErrorCode.MODEL_ERROR;
    }

    const message = error.message.toLowerCase();
    const errorObj = error as { status?: number; code?: string };

    // Check for rate limiting (canonical detection from rate-limit-detector)
    if (isRateLimitLikeError(error)) {
      return ErrorCode.MODEL_RATE_LIMITED;
    }

    // Check for timeout
    if (this.isTimeoutError(message, errorObj)) {
      return ErrorCode.MODEL_TIMEOUT;
    }

    // Check for model-not-found (#2540 PR 8) — distinct from transient
    // MODEL_UNAVAILABLE (502/503). 404 + vendor-specific phrases ("model
    // not found", "deprecated", "no such model") all mean: this id is
    // gone, retry won't help, route to a different one.
    if (this.isModelNotFoundError(message, errorObj)) {
      return ErrorCode.MODEL_NOT_FOUND;
    }

    // Check for model unavailable
    if (this.isUnavailableError(message, errorObj)) {
      return ErrorCode.MODEL_UNAVAILABLE;
    }

    // Check for a param-naming 400 (#4069): a 400 that identifies an unsupported
    // parameter by name. Distinct from generic MODEL_ERROR — non-retryable, and the
    // param name is threaded into context. Only changes 400s that NAME a param; a
    // 400 with no param, and every non-400, stay MODEL_ERROR.
    if (this.extractErrorParam(error) !== undefined) {
      return ErrorCode.MODEL_PARAMETER_UNSUPPORTED;
    }

    return ErrorCode.MODEL_ERROR;
  }

  /**
   * Extract the offending parameter name from a param-naming 400 (#4069).
   *
   * Returns the param only when the error is a 400 AND carries a non-empty `param`
   * field (the OpenAI SDK / OpenAI-compatible gateways set this on a rejected
   * parameter; the OpenAI adapter threads it onto the classification probe).
   * Returns undefined otherwise, so non-400s and param-less 400s are untouched.
   */
  private extractErrorParam(error: unknown): string | undefined {
    if (!(error instanceof Error)) {
      return undefined;
    }
    const errorObj = error as { status?: number; param?: unknown };
    if (errorObj.status !== 400) {
      return undefined;
    }
    return typeof errorObj.param === 'string' && errorObj.param !== '' ? errorObj.param : undefined;
  }

  /**
   * (#2540 PR 8) Detect model-retirement errors. Distinct from transient
   * 502/503: 404 + vendor messages indicating the model id is gone.
   */
  private isModelNotFoundError(
    message: string,
    errorObj: { status?: number; code?: string }
  ): boolean {
    if (errorObj.status === 404) return true;
    const patterns = [
      'model not found',
      'model_not_found',
      'no such model',
      'model is deprecated',
      'model has been deprecated',
      'model is no longer available',
    ];
    return patterns.some((p) => message.includes(p));
  }

  /**
   * Check if error indicates a timeout.
   */
  private isTimeoutError(message: string, errorObj: { status?: number; code?: string }): boolean {
    const timeoutPatterns = ['timeout', 'etimedout', 'esockettimedout'];
    return (
      errorObj.code === 'ETIMEDOUT' ||
      errorObj.code === 'ESOCKETTIMEDOUT' ||
      timeoutPatterns.some((pattern) => message.includes(pattern))
    );
  }

  /**
   * Check if error indicates model unavailability.
   */
  private isUnavailableError(
    message: string,
    errorObj: { status?: number; code?: string }
  ): boolean {
    const unavailablePatterns = ['unavailable', 'service unavailable', 'overloaded'];
    return (
      errorObj.status === 502 ||
      errorObj.status === 503 ||
      unavailablePatterns.some((pattern) => message.includes(pattern))
    );
  }
}
