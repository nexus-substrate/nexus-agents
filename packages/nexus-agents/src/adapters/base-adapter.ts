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
import {
  ok,
  err,
  ConfigError,
  ModelError,
  NexusError,
  ErrorCode,
  createLogger,
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
 * Token estimation factor - average characters per token.
 * This is a rough estimate; specific providers may have different tokenization.
 * (Source: OpenAI documentation suggests ~4 chars per token for English text)
 */
const CHARS_PER_TOKEN = 4;

/**
 * Extended ModelError that supports specific error codes.
 *
 * While ModelError from core uses MODEL_ERROR by default, this class
 * allows adapters to specify more granular error codes like
 * MODEL_RATE_LIMITED, MODEL_TIMEOUT, etc.
 */
export class AdapterModelError extends NexusError {
  constructor(message: string, options: NexusErrorOptions) {
    super(message, options);
    this.name = 'ModelError';
  }
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
   * Count tokens in text using rough character-based estimation.
   *
   * This provides a reasonable estimate for most use cases.
   * Concrete adapters may override this with provider-specific tokenizers.
   *
   * @param text - Text to count tokens for
   * @returns Approximate token count
   */
  countTokens(text: string): Promise<number> {
    // Rough estimation: ~4 characters per token for English text
    return Promise.resolve(Math.ceil(text.length / CHARS_PER_TOKEN));
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

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = this.determineErrorCode(error);

    // Create a NexusError with the specific code, then use ModelError for standard cases
    // For specialized codes, we extend NexusError behavior
    const modelError = this.createModelError(errorMessage, errorCode, error);

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
    originalError: unknown
  ): ModelError {
    const fullMessage = `${this.providerId}/${this.modelId}: ${message}`;

    // Build options object conditionally to satisfy exactOptionalPropertyTypes
    const options: NexusErrorOptions = {
      code: errorCode,
      context: {
        providerId: this.providerId,
        modelId: this.modelId,
      },
    };

    // Only set cause if originalError is an Error
    if (originalError instanceof Error) {
      options.cause = originalError;
    }

    // Use AdapterModelError to support specific error codes
    // This is compatible with ModelError checks (instanceof NexusError)
    return new AdapterModelError(fullMessage, options) as ModelError;
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

    // Check for rate limiting
    if (this.isRateLimitError(message, errorObj)) {
      return ErrorCode.MODEL_RATE_LIMITED;
    }

    // Check for timeout
    if (this.isTimeoutError(message, errorObj)) {
      return ErrorCode.MODEL_TIMEOUT;
    }

    // Check for model unavailable
    if (this.isUnavailableError(message, errorObj)) {
      return ErrorCode.MODEL_UNAVAILABLE;
    }

    return ErrorCode.MODEL_ERROR;
  }

  /**
   * Check if error indicates rate limiting.
   */
  private isRateLimitError(message: string, errorObj: { status?: number; code?: string }): boolean {
    const rateLimitPatterns = ['rate limit', 'too many requests', 'quota exceeded'];
    return (
      errorObj.status === 429 || rateLimitPatterns.some((pattern) => message.includes(pattern))
    );
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
