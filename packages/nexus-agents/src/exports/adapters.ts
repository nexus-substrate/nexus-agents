/**
 * Adapters exports - Model adapters (Claude, OpenAI, Gemini, Ollama)
 * Split from index.ts for file size compliance (Issue #285)
 */

export {
  // Adapter factory
  AdapterFactory,
  AdapterConfigSchema,
  type AdapterConfig,
  type AdapterCreator,
  type RegisterOptions as AdapterRegisterOptions,
  // Rate limiting
  RateLimiter as AdapterRateLimiter,
  createRateLimiter,
  type RateLimiterConfig as AdapterRateLimiterConfig,
  type RateLimitExceeded,
  // Retry logic
  withRetry,
  withRetryWrapper,
  isRetryableError,
  calculateDelay,
  sleep,
  RetryExhaustedError,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
  type RetryAttemptInfo,
  type WithRetryOptions,
  // Base adapter
  BaseAdapter,
  AdapterModelError,
  type BaseAdapterConfig,
  // Streaming utilities
  StreamController,
  StreamError,
  StreamCancelledError,
  createStream,
  collectStream,
  DEFAULT_COLLECT_STREAM_MAX_CHUNKS,
  transformStream,
  mergeStreams,
  takeUntil,
  take,
  skip,
  filterStream,
  withTimeout,
  bufferStream,
  concatStreams,
  fromArray,
  tapStream,
  reduceStream,
  type StreamState,
  type CreateStreamOptions,
  // Claude adapter
  ClaudeAdapter,
  createClaudeAdapter,
  CLAUDE_MODELS,
  CLAUDE_MODEL_ALIASES,
  type ClaudeAdapterConfig,
  // OpenAI adapter
  OpenAIAdapter,
  createOpenAIAdapter,
  OPENAI_MODELS,
  OPENAI_MODEL_ALIASES,
  type OpenAIAdapterConfig,
  // Ollama adapter
  OllamaAdapter,
  createOllamaAdapter,
  OLLAMA_MODELS,
  type OllamaAdapterConfig,
  // Gemini adapter
  GeminiAdapter,
  createGeminiAdapter,
  GEMINI_MODELS,
  GEMINI_MODEL_ALIASES,
  type GeminiAdapterConfig,
  // AI SDK adapter (Issue #1123)
  SdkAdapter,
  PROVIDER_ENV_KEYS as SDK_PROVIDER_ENV_KEYS,
  type SdkAdapterConfig,
  type SdkProviderId,
  // (#2540 PR 8) Runtime retire-and-retry on MODEL_NOT_FOUND.
  // Wraps any IModelAdapter so a 404 / "model is deprecated" error
  // refreshes the AvailableModelsCache and retries through the
  // closest sibling per the registry.
  withModelNotFoundFallback,
  wrapResilientWithFallback,
  type ModelNotFoundFallbackOptions,
  type RetirementInfo,
  type ResilientLike,
} from '../adapters/index.js';
