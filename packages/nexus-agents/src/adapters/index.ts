/**
 * nexus-agents/adapters
 *
 * Model adapters and utilities for Nexus Agents.
 */

// Adapter factory
export {
  AdapterFactory,
  AdapterConfigSchema,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Re-exporting deprecated item for consumers
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

// Capacity monitoring
export {
  CapacityMonitor,
  createCapacityMonitor,
  type ICapacityMonitor,
  type CapacityInfo,
  type CapacityProvider,
  type LowCapacityCallback,
  type HeadersLike,
  type CapacityMonitorConfig,
} from './capacity-monitor.js';

export {
  parseAnthropicHeaders,
  parseOpenAIHeaders,
  GoogleQuotaTracker,
  createGoogleQuotaTracker,
} from './capacity-monitor-helpers.js';

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

// Task complexity estimation (arXiv:2406.18510)
export {
  TaskComplexityEstimator,
  createComplexityEstimator,
  type ComplexityLevel,
  type ComplexityEstimate,
  type ComplexityFactors,
} from './complexity-estimator.js';

// Quality-constrained routing (arXiv:2406.18510)
/* eslint-disable @typescript-eslint/no-deprecated -- Backward compatibility, deprecated in v3.0 */
export {
  QualityRouter,
  createQualityRouter,
  type QualityEstimate,
  type RoutingDecision,
  type AdapterCandidate,
  type QualityRouterConfig,
  type CostModel,
  type QualityRoutedResult,
} from './quality-router.js';
/* eslint-enable @typescript-eslint/no-deprecated */

// Auto-selecting adapter factory
export {
  createAutoAdapter,
  getAvailableAdapters,
  type AutoAdapterConfig,
  type AdapterSelection,
  type AdapterPriority,
} from './auto-adapter.js';
