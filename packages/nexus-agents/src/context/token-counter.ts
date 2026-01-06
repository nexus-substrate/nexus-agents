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
import { ok, err, NexusError, ErrorCode } from '../core/index.js';

/**
 * Supported model families for token counting.
 */
export const TokenCounterProvider = {
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
  OPENAI: 'openai',
} as const;

export type TokenCounterProvider = (typeof TokenCounterProvider)[keyof typeof TokenCounterProvider];

/**
 * Error specific to token counting operations.
 */
export class TokenCountError extends NexusError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, { code: ErrorCode.MODEL_ERROR, ...options });
    this.name = 'TokenCountError';
  }
}

/**
 * Configuration for the token counter.
 */
export interface TokenCounterConfig {
  /** Anthropic API key (optional, required for Anthropic counting) */
  anthropicApiKey?: string;
  /** Google API key (optional, required for Gemini counting) */
  googleApiKey?: string;
  /** Maximum cache entries (default: 1000) */
  maxCacheSize?: number;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs?: number;
}

/**
 * Token counting result with metadata.
 */
export interface TokenCountResult {
  /** Number of tokens */
  count: number;
  /** Whether the result was from cache */
  cached: boolean;
  /** Provider used for counting */
  provider: TokenCounterProvider | 'estimate';
  /** Model used (if applicable) */
  model?: string;
}

/**
 * Cache entry for token counts.
 */
interface CacheEntry {
  count: number;
  provider: TokenCounterProvider | 'estimate';
  model?: string;
  timestamp: number;
}

/**
 * Interface for token counting operations.
 */
export interface ITokenCounter {
  /**
   * Count tokens for Anthropic/Claude models via API.
   * @param messages - Messages to count tokens for
   * @param model - Model identifier (e.g., 'claude-sonnet-4')
   * @returns Promise with token count result
   */
  countAnthropic(
    messages: Message[],
    model: string
  ): Promise<Result<TokenCountResult, TokenCountError>>;

  /**
   * Count tokens for Gemini models via API.
   * @param content - Text content to count tokens for
   * @param model - Model identifier (e.g., 'gemini-2.0-flash')
   * @returns Promise with token count result
   */
  countGemini(content: string, model: string): Promise<Result<TokenCountResult, TokenCountError>>;

  /**
   * Count tokens for OpenAI models using local tiktoken.
   * @param text - Text to count tokens for
   * @param model - Model identifier (default: 'gpt-4o')
   * @returns Token count result (synchronous, local)
   */
  countOpenAI(text: string, model?: string): Result<TokenCountResult, TokenCountError>;

  /**
   * Estimate tokens offline using character-based heuristic.
   * @param text - Text to estimate tokens for
   * @returns Estimated token count
   */
  estimate(text: string): number;

  /**
   * Clear the token count cache.
   */
  clearCache(): void;

  /**
   * Get current cache statistics.
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number };
}

/**
 * Characters per token estimates by provider.
 * (Source: Provider documentation and empirical testing)
 */
const CHARS_PER_TOKEN = {
  anthropic: 3.5, // Claude models
  gemini: 4.0, // Gemini models
  openai: 4.0, // GPT models
  default: 4.0, // Generic fallback
} as const;

/**
 * Default maximum cache entries.
 */
const DEFAULT_MAX_CACHE_SIZE = 1000;

/**
 * Default cache TTL (5 minutes).
 */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Tiktoken model mappings for OpenAI.
 * Maps model names to tiktoken encoding names.
 */
const TIKTOKEN_MODEL_MAP: Record<string, string> = {
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-4': 'gpt-4',
  'gpt-3.5-turbo': 'gpt-3.5-turbo',
  o1: 'o1',
  'o1-mini': 'o1',
  'o1-preview': 'o1',
} as const;

/**
 * Generates a cache key from content.
 */
function generateCacheKey(
  content: string | Message[],
  provider: TokenCounterProvider | 'estimate',
  model?: string
): string {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  return `${provider}:${model ?? 'default'}:${contentStr}`;
}

/**
 * Converts Message[] to Anthropic MessageParam[] format.
 */
function messagesToAnthropicFormat(messages: Message[]): Anthropic.MessageParam[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const role = m.role === 'user' ? 'user' : 'assistant';
      if (typeof m.content === 'string') {
        return { role, content: m.content };
      }
      // Map content blocks
      const content = m.content.map((block) => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text };
        }
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }
        if (block.type === 'tool_result') {
          return {
            type: 'tool_result' as const,
            tool_use_id: block.tool_use_id,
            content: block.content,
          };
        }
        // Image type - handle source type properly
        return {
          type: 'image' as const,
          source: block.source as Anthropic.ImageBlockParam['source'],
        };
      });
      return { role, content };
    });
}

/**
 * Extracts system prompt from messages if present.
 */
function extractSystemPrompt(messages: Message[]): string | undefined {
  const systemMsg = messages.find((m) => m.role === 'system');
  if (systemMsg === undefined) {
    return undefined;
  }
  if (typeof systemMsg.content === 'string') {
    return systemMsg.content;
  }
  return systemMsg.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

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
 *   googleApiKey: process.env.GOOGLE_API_KEY,
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
        timestamp: Date.now(),
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
        timestamp: Date.now(),
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
        timestamp: Date.now(),
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
    if (Date.now() - entry.timestamp > this.cacheTtlMs) {
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
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
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
 *   googleApiKey: process.env.GOOGLE_API_KEY,
 * });
 * ```
 */
export function createTokenCounter(config: TokenCounterConfig = {}): TokenCounter {
  return new TokenCounter(config);
}
