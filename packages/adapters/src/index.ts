/**
 * @nexus-agents/adapters
 *
 * Model adapters and utilities for Nexus Agents.
 */

export const VERSION = '0.0.1';

// Adapter factory
export {
  AdapterFactory,
  AdapterConfigSchema,
  defaultFactory,
  type AdapterConfig,
  type AdapterCreator,
  type RegisterOptions,
} from './factory.js';

// Rate limiting
export {
  RateLimiter,
  createRateLimiter,
  type RateLimiterConfig,
  type RateLimitExceeded,
} from './rate-limiter.js';

// Retry logic with exponential backoff
export {
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
} from './retry.js';

// Base adapter abstract class
export { BaseAdapter, AdapterModelError, type BaseAdapterConfig } from './base-adapter.js';

// Streaming utilities
export {
  StreamController,
  StreamError,
  StreamCancelledError,
  createStream,
  collectStream,
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
} from './streaming.js';

// Claude/Anthropic adapter
export {
  ClaudeAdapter,
  createClaudeAdapter,
  CLAUDE_MODELS,
  CLAUDE_MODEL_ALIASES,
  type ClaudeAdapterConfig,
} from './claude-adapter.js';

// OpenAI adapter
export {
  OpenAIAdapter,
  createOpenAIAdapter,
  OPENAI_MODELS,
  OPENAI_MODEL_ALIASES,
  type OpenAIAdapterConfig,
} from './openai-adapter.js';

// Ollama adapter
export {
  OllamaAdapter,
  createOllamaAdapter,
  OLLAMA_MODELS,
  type OllamaAdapterConfig,
} from './ollama-adapter.js';

// Gemini/Google AI adapter
export {
  GeminiAdapter,
  createGeminiAdapter,
  GEMINI_MODELS,
  GEMINI_MODEL_ALIASES,
  type GeminiAdapterConfig,
} from './gemini-adapter.js';
