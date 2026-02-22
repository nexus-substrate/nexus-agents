/**
 * nexus-agents/context - Token Counter Types
 *
 * Type definitions for universal token counting.
 *
 * @module context/token-counter-types
 */

import type { Result, Message } from '../core/index.js';
import { NexusError, ErrorCode } from '../core/index.js';

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Supported model families for token counting.
 */
export const TokenCounterProvider = {
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
  OPENAI: 'openai',
} as const;

export type TokenCounterProvider = (typeof TokenCounterProvider)[keyof typeof TokenCounterProvider];

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error specific to token counting operations.
 */
export class TokenCountError extends NexusError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, { code: ErrorCode.MODEL_ERROR, ...options });
    this.name = 'TokenCountError';
  }
}

// ============================================================================
// Configuration Types
// ============================================================================

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

// ============================================================================
// Result Types
// ============================================================================

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
export interface CacheEntry {
  count: number;
  provider: TokenCounterProvider | 'estimate';
  model?: string;
  timestamp: number;
}

// ============================================================================
// Interface
// ============================================================================

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

// ============================================================================
// Constants
// ============================================================================

/**
 * Characters per token estimates by provider.
 * (Source: Provider documentation and empirical testing)
 */
export const CHARS_PER_TOKEN = {
  anthropic: 3.5, // Claude models
  gemini: 4.0, // Gemini models
  openai: 4.0, // GPT models
  default: 4.0, // Generic fallback
} as const;

/**
 * Default maximum cache entries.
 */
export const DEFAULT_MAX_CACHE_SIZE = 1000;

/**
 * Default cache TTL (5 minutes).
 */
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Default tiktoken model for encoding fallback (uses o200k_base encoding).
 * NOTE: This is a tiktoken library model name, not a nexus-agents model ID.
 * It maps to the o200k_base encoding used for token counting.
 */
export const DEFAULT_TIKTOKEN_MODEL = 'gpt-4o';

/**
 * Tiktoken model mappings for OpenAI token counting.
 * Maps OpenAI model names to tiktoken encoding model names.
 * NOTE: These are tiktoken library identifiers, not nexus-agents model IDs.
 * They exist outside the canonical model registry intentionally.
 */
export const TIKTOKEN_MODEL_MAP: Record<string, string> = {
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-4': 'gpt-4',
  'gpt-3.5-turbo': 'gpt-3.5-turbo',
  o1: 'o1',
  'o1-mini': 'o1',
  'o1-preview': 'o1',
} as const;
