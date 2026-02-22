/**
 * nexus-agents/adapters/sdk - Shared Types
 *
 * Type definitions for AI SDK adapter layer.
 *
 * @module adapters/sdk/types
 * (Source: Issue #1123 — AI SDK provider layer)
 */

/**
 * Supported AI SDK provider identifiers.
 */
export type SdkProviderId = 'anthropic' | 'openai' | 'google';

/**
 * Configuration for creating an AI SDK adapter.
 */
export interface SdkAdapterConfig {
  /** Provider identifier */
  providerId: SdkProviderId;
  /** Model to use (e.g., 'claude-sonnet-4-6', 'gpt-4o') */
  modelId: string;
  /** API key (falls back to environment variable) */
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retries on transient failures */
  maxRetries?: number;
}

/**
 * Maps provider IDs to their environment variable names.
 */
export const PROVIDER_ENV_KEYS: Record<SdkProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_AI_API_KEY',
};
