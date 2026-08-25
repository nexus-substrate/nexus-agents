/**
 * nexus-agents/adapters
 *
 * Model adapters and utilities for Nexus Agents.
 */

// Adapter factory
export {
  AdapterFactory,
  AdapterConfigSchema,
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
// Prompt extraction utilities (Issue #1596 — DRY adapter standardization)
export { extractRequestSystemPrompt } from './prompt-utils.js';

// Rate limit detection (Issue #996 — Rate limit error surfacing)
export {
  isRateLimitLikeError,
  isRateLimitText,
  RATE_LIMIT_PATTERNS,
  parseRetryAfterMs,
  // HTTP `Retry-After` capture (#4606)
  parseRetryAfterHeader,
  extractRetryAfterMs,
  resolveRetryAfterMs,
  retryAfterMsFromContext,
  RETRY_AFTER_CONTEXT_KEY,
  toRateLimitError,
  recordRateLimitEvent,
  getRateLimitStats,
  clearRateLimitEvents,
  type RateLimitEvent,
  type RateLimitStats,
} from './rate-limit-detector.js';

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
export {
  BaseAdapter,
  AdapterModelError,
  type BaseAdapterConfig,
  isApiKeyMissing,
  requireApiKey,
  validateApiKeyPresence,
} from './base-adapter.js';

// Streaming utilities
export {
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

// Task complexity estimation: use SharedTaskAnalyzer from core (ADR-0004)
// QualityRouter: use CompositeRouter with TopsisRouter stage

// Auto-selecting adapter factory
export {
  createAutoAdapter,
  getAvailableAdapters,
  type AutoAdapterConfig,
  type AdapterSelection,
  type AdapterPriority,
} from './auto-adapter.js';

// Resilient adapter (Issue #811 — lazy detection, failover, health monitoring)
export { createResilientAdapter, ResilientAdapter } from './resilient-adapter.js';
export type {
  IResilientAdapter,
  AdapterHealthInfo,
  AdapterHealthState,
  ResilientAdapterConfig,
} from './resilient-adapter-types.js';

// Stdin lifecycle monitoring (Issue #810 — zombie process prevention)
export {
  StdinLifecycleMonitor,
  getStdinLifecycleMonitor,
  resetStdinLifecycleMonitor,
} from './stdin-lifecycle.js';

// Unified adapter registry (Issue #1149 — centralized model access & task routing)
export {
  UnifiedAdapterRegistry,
  createUnifiedRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
  type UnifiedRegistryConfig,
  type TaskRoutingEntry,
  type RegistrySnapshot,
} from './unified-registry.js';

// AI SDK adapter (Issue #1123 — unified provider layer via Vercel AI SDK)
export { SdkAdapter } from './sdk/index.js';
export type { SdkAdapterConfig, SdkProviderId } from './sdk/index.js';
export { PROVIDER_ENV_KEYS } from './sdk/index.js';
