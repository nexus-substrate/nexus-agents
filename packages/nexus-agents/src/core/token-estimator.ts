/**
 * nexus-agents/core - Token Estimator
 *
 * Unified token estimation service to replace duplicated implementations.
 * Supports provider-specific adjustments for Claude, OpenAI, and Gemini.
 *
 * @module core/token-estimator
 * (Source: Issue #574 - Router consolidation, LOOP H redundancy elimination)
 */

/**
 * Provider identifiers for token estimation adjustment.
 */
export type TokenEstimatorProvider = 'claude' | 'openai' | 'gemini' | 'generic';

/**
 * Characters per token by provider.
 * Based on empirical observations:
 * - Claude: ~3.5 chars/token (custom tokenizer)
 * - OpenAI: ~4 chars/token (tiktoken)
 * - Gemini: ~4 chars/token (SentencePiece)
 * - Generic: ~4 chars/token (conservative default)
 */
const CHARS_PER_TOKEN: Record<TokenEstimatorProvider, number> = {
  claude: 3.5,
  openai: 4.0,
  gemini: 4.0,
  generic: 4.0,
};

/**
 * Token estimation result with input/output breakdown.
 */
export interface TokenEstimate {
  /** Estimated input tokens */
  readonly input: number;
  /** Estimated output tokens */
  readonly output: number;
  /** Total estimated tokens */
  readonly total: number;
  /** Provider used for estimation */
  readonly provider: TokenEstimatorProvider;
}

/**
 * Options for token estimation.
 */
export interface TokenEstimateOptions {
  /** Provider to use for estimation (affects chars/token ratio) */
  provider?: TokenEstimatorProvider;
  /** Expected output multiplier relative to input (default: 0.5) */
  outputMultiplier?: number;
  /** Fixed output token estimate (overrides multiplier) */
  fixedOutput?: number;
}

/**
 * Interface for token estimation service.
 */
export interface ITokenEstimator {
  /** Estimate tokens for a single text string */
  estimateText(text: string, provider?: TokenEstimatorProvider): number;

  /** Estimate input/output tokens for a task */
  estimateTask(
    description: string,
    options?: TokenEstimateOptions
  ): TokenEstimate;

  /** Get the chars/token ratio for a provider */
  getCharsPerToken(provider?: TokenEstimatorProvider): number;
}

/**
 * Token estimator implementation.
 * Provides consistent token estimation across the codebase.
 */
export class TokenEstimator implements ITokenEstimator {
  private readonly defaultProvider: TokenEstimatorProvider;

  constructor(defaultProvider: TokenEstimatorProvider = 'generic') {
    this.defaultProvider = defaultProvider;
  }

  /**
   * Estimate tokens for a text string.
   *
   * @param text - Text to estimate tokens for
   * @param provider - Provider for estimation (uses default if not specified)
   * @returns Estimated token count
   */
  estimateText(text: string, provider?: TokenEstimatorProvider): number {
    const p = provider ?? this.defaultProvider;
    const charsPerToken = CHARS_PER_TOKEN[p];
    return Math.ceil(text.length / charsPerToken);
  }

  /**
   * Estimate input and output tokens for a task.
   *
   * @param description - Task description
   * @param options - Estimation options
   * @returns Token estimate with input/output breakdown
   */
  estimateTask(
    description: string,
    options?: TokenEstimateOptions
  ): TokenEstimate {
    const provider = options?.provider ?? this.defaultProvider;
    const outputMultiplier = options?.outputMultiplier ?? 0.5;

    const inputTokens = this.estimateText(description, provider);
    const outputTokens = options?.fixedOutput ?? Math.ceil(inputTokens * outputMultiplier);

    return {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
      provider,
    };
  }

  /**
   * Get the characters per token ratio for a provider.
   *
   * @param provider - Provider to get ratio for
   * @returns Characters per token
   */
  getCharsPerToken(provider?: TokenEstimatorProvider): number {
    return CHARS_PER_TOKEN[provider ?? this.defaultProvider];
  }
}

/**
 * Singleton instance for shared usage.
 * Use createTokenEstimator() for custom configurations.
 */
let defaultEstimator: TokenEstimator | undefined;

/**
 * Gets the shared token estimator instance.
 *
 * @returns Shared TokenEstimator instance
 */
export function getTokenEstimator(): ITokenEstimator {
  defaultEstimator ??= new TokenEstimator();
  return defaultEstimator;
}

/**
 * Creates a new token estimator with the specified configuration.
 *
 * @param defaultProvider - Default provider for estimation
 * @returns New TokenEstimator instance
 */
export function createTokenEstimator(
  defaultProvider?: TokenEstimatorProvider
): ITokenEstimator {
  return new TokenEstimator(defaultProvider);
}

/**
 * Resets the shared token estimator instance.
 * Useful for testing.
 *
 * @internal
 */
export function resetTokenEstimator(): void {
  defaultEstimator = undefined;
}

/**
 * Quick estimation function for simple use cases.
 * Uses the shared estimator with generic provider.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return getTokenEstimator().estimateText(text);
}

/**
 * Quick estimation function with provider specification.
 *
 * @param text - Text to estimate tokens for
 * @param provider - Provider for estimation
 * @returns Estimated token count
 */
export function estimateTokensForProvider(
  text: string,
  provider: TokenEstimatorProvider
): number {
  return getTokenEstimator().estimateText(text, provider);
}
