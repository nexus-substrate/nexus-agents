/**
 * nexus-agents/context - Universal Token Counter
 *
 * Provides token counting across all supported providers using their native APIs
 * or local estimation. Implements caching for repeated content to improve performance.
 *
 * Provider APIs:
 * - Anthropic: /v1/messages/count_tokens (free)
 * - Gemini: countTokens endpoint (free)
 * - OpenAI: tiktoken local library (free)
 *
 * Verified 2026-01-05: tiktoken@1.0.22 is current stable
 * (Source: npm registry)
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { type Tiktoken, encoding_for_model } from 'tiktoken';
import type { Result, Message } from '../core/index.js';
import { ok, err, getTimeProvider } from '../core/index.js';
import type {
  TokenCounterConfig,
  TokenCountResult,
  CacheEntry,
  ITokenCounter,
} from './token-counter-types.js';
import {
  TokenCounterProvider,
  TokenCountError,
  CHARS_PER_TOKEN,
  DEFAULT_MAX_CACHE_SIZE,
  DEFAULT_CACHE_TTL_MS,
  TIKTOKEN_MODEL_MAP,
} from './token-counter-types.js';
import {
  generateCacheKey,
  messagesToAnthropicFormat,
  extractSystemPrompt,
} from './token-counter-helpers.js';

// Re-export types for backward compatibility
export type {
  TokenCounterConfig,
  TokenCountResult,
  CacheEntry,
  ITokenCounter,
} from './token-counter-types.js';
export {
  TokenCounterProvider,
  TokenCountError,
  CHARS_PER_TOKEN,
  DEFAULT_MAX_CACHE_SIZE,
  DEFAULT_CACHE_TTL_MS,
  TIKTOKEN_MODEL_MAP,
} from './token-counter-types.js';

// ============================================================================
// Token Counter Implementation
// ============================================================================

/**
 * Universal token counter supporting multiple providers.
 *
 * Provides accurate token counting via provider APIs (Anthropic, Gemini)
 * or local tiktoken (OpenAI), with fallback to character-based estimation.
 *
 * @example
 * ```typescript
 * const counter = new TokenCounter({
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   googleApiKey: process.env.GOOGLE_AI_API_KEY,
 * });
 *
 * // Count via Anthropic API
 * const result = await counter.countAnthropic(messages, 'claude-sonnet-4');
 *
 * // Count via local tiktoken
 * const openaiResult = counter.countOpenAI('Hello world', 'gpt-4o');
 *
 * // Offline estimation
 * const estimate = counter.estimate('Some text');
 * ```
 */
export class TokenCounter implements ITokenCounter {
  private readonly anthropicClient: Anthropic | undefined;
  private readonly geminiClient: GoogleGenAI | undefined;
  private readonly cache: Map<string, CacheEntry>;
  private readonly maxCacheSize: number;
  private readonly cacheTtlMs: number;
  private tiktokenEncoder: Tiktoken | undefined;
  private currentTiktokenModel: string | undefined;

  /**
   * Creates a new TokenCounter instance.
   *
   * @param config - Token counter configuration
   */
  constructor(config: TokenCounterConfig = {}) {
    this.maxCacheSize = config.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
    this.cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.cache = new Map();

    // Initialize Anthropic client if API key provided
    if (config.anthropicApiKey !== undefined && config.anthropicApiKey !== '') {
      this.anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
    }

    // Initialize Gemini client if API key provided
    if (config.googleApiKey !== undefined && config.googleApiKey !== '') {
      this.geminiClient = new GoogleGenAI({ apiKey: config.googleApiKey });
    }
  }

  /**
   * Count tokens for Anthropic/Claude models via API.
   */
  async countAnthropic(
    messages: Message[],
    model: string
  ): Promise<Result<TokenCountResult, TokenCountError>> {
    // Check cache first
    const cacheKey = generateCacheKey(messages, TokenCounterProvider.ANTHROPIC, model);
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) {
      return ok({ count: cached.count, cached: true, provider: cached.provider, model });
    }

    // Validate client availability
    if (this.anthropicClient === undefined) {
      return err(
        new TokenCountError('Anthropic API key not configured', {
          context: { provider: 'anthropic', model },
        })
      );
    }

    try {
      const anthropicMessages = messagesToAnthropicFormat(messages);
      const systemPrompt = extractSystemPrompt(messages);

      const params: Anthropic.Messages.MessageCountTokensParams = {
        model,
        messages: anthropicMessages,
      };

      if (systemPrompt !== undefined) {
        params.system = systemPrompt;
      }

      const response = await this.anthropicClient.messages.countTokens(params);
      const count = response.input_tokens;

      // Cache result
      this.setCache(cacheKey, {
        count,
        provider: TokenCounterProvider.ANTHROPIC,
        model,
        timestamp: getTimeProvider().now(),
      });

      return ok({ count, cached: false, provider: TokenCounterProvider.ANTHROPIC, model });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return err(
        new TokenCountError(`Anthropic token counting failed: ${cause.message}`, {
          cause,
          context: { provider: 'anthropic', model },
        })
      );
    }
  }

  /**
   * Count tokens for Gemini models via API.
   */
  async countGemini(
    content: string,
    model: string
  ): Promise<Result<TokenCountResult, TokenCountError>> {
    // Check cache first
    const cacheKey = generateCacheKey(content, TokenCounterProvider.GEMINI, model);
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) {
      return ok({ count: cached.count, cached: true, provider: cached.provider, model });
    }

    // Validate client availability
    if (this.geminiClient === undefined) {
      return err(
        new TokenCountError('Google API key not configured', {
          context: { provider: 'gemini', model },
        })
      );
    }

    try {
      const response = await this.geminiClient.models.countTokens({
        model,
        contents: content,
      });
      const count = response.totalTokens ?? 0;

      // Cache result
      this.setCache(cacheKey, {
        count,
        provider: TokenCounterProvider.GEMINI,
        model,
        timestamp: getTimeProvider().now(),
      });

      return ok({ count, cached: false, provider: TokenCounterProvider.GEMINI, model });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return err(
        new TokenCountError(`Gemini token counting failed: ${cause.message}`, {
          cause,
          context: { provider: 'gemini', model },
        })
      );
    }
  }

  /**
   * Count tokens for OpenAI models using local tiktoken.
   */
  countOpenAI(text: string, model: string = 'gpt-4o'): Result<TokenCountResult, TokenCountError> {
    // Check cache first
    const cacheKey = generateCacheKey(text, TokenCounterProvider.OPENAI, model);
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) {
      return ok({ count: cached.count, cached: true, provider: cached.provider, model });
    }

    try {
      const encoder = this.getOrCreateTiktokenEncoder(model);
      const tokens = encoder.encode(text);
      const count = tokens.length;

      // Cache result
      this.setCache(cacheKey, {
        count,
        provider: TokenCounterProvider.OPENAI,
        model,
        timestamp: getTimeProvider().now(),
      });

      return ok({ count, cached: false, provider: TokenCounterProvider.OPENAI, model });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return err(
        new TokenCountError(`OpenAI token counting failed: ${cause.message}`, {
          cause,
          context: { provider: 'openai', model },
        })
      );
    }
  }

  /**
   * Estimate tokens offline using character-based heuristic.
   * Uses ~4 characters per token as a general approximation.
   */
  estimate(text: string): number {
    if (text.length === 0) {
      return 0;
    }
    return Math.ceil(text.length / CHARS_PER_TOKEN.default);
  }

  /**
   * Estimate tokens for a specific provider.
   */
  estimateForProvider(text: string, provider: TokenCounterProvider): number {
    if (text.length === 0) {
      return 0;
    }
    const charsPerToken = CHARS_PER_TOKEN[provider];
    return Math.ceil(text.length / charsPerToken);
  }

  /**
   * Clear the token count cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get current cache statistics.
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      ttlMs: this.cacheTtlMs,
    };
  }

  /**
   * Gets or creates a tiktoken encoder for the specified model.
   */
  private getOrCreateTiktokenEncoder(model: string): Tiktoken {
    // Map model to tiktoken model name
    const tiktokenModel = TIKTOKEN_MODEL_MAP[model] ?? 'gpt-4o';

    // Reuse encoder if same model
    if (this.tiktokenEncoder !== undefined && this.currentTiktokenModel === tiktokenModel) {
      return this.tiktokenEncoder;
    }

    // Free previous encoder
    if (this.tiktokenEncoder !== undefined) {
      this.tiktokenEncoder.free();
    }

    // Create new encoder
    // encoding_for_model expects TiktokenModel type
    this.tiktokenEncoder = encoding_for_model(
      tiktokenModel as Parameters<typeof encoding_for_model>[0]
    );
    this.currentTiktokenModel = tiktokenModel;

    return this.tiktokenEncoder;
  }

  /**
   * Gets a cached entry if valid.
   */
  private getCached(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);
    if (entry === undefined) {
      return undefined;
    }

    // Check TTL
    if (getTimeProvider().now() - entry.timestamp > this.cacheTtlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Sets a cache entry, evicting oldest if at capacity.
   */
  private setCache(key: string, entry: CacheEntry): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next();
      if (firstKey.done !== true) {
        this.cache.delete(firstKey.value);
      }
    }

    this.cache.set(key, entry);
  }

  /**
   * Frees resources (tiktoken encoder).
   * Call this when done with the counter.
   */
  dispose(): void {
    if (this.tiktokenEncoder !== undefined) {
      this.tiktokenEncoder.free();
      this.tiktokenEncoder = undefined;
      this.currentTiktokenModel = undefined;
    }
    this.cache.clear();
  }
}

/**
 * Creates a TokenCounter instance with the specified configuration.
 *
 * @param config - Token counter configuration
 * @returns Configured TokenCounter instance
 *
 * @example
 * ```typescript
 * const counter = createTokenCounter({
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   googleApiKey: process.env.GOOGLE_AI_API_KEY,
 * });
 * ```
 */
export function createTokenCounter(config: TokenCounterConfig = {}): TokenCounter {
  return new TokenCounter(config);
}
