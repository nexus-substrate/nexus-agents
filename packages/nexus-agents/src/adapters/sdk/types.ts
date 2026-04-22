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
 *
 * `custom-openai` is for OpenAI-compatible gateways (multi-vendor proxies,
 * self-hosted LLM servers, corporate model gateways) — uses the same
 * @ai-sdk/openai package but with a configurable `baseURL`.
 */
export type SdkProviderId = 'anthropic' | 'openai' | 'google' | 'custom-openai';

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
  /**
   * Base URL for OpenAI-compatible gateways. Required when
   * `providerId === 'custom-openai'`, ignored otherwise. Falls back to
   * the `NEXUS_CUSTOM_API_BASE_URL` environment variable.
   */
  baseUrl?: string;
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
  'custom-openai': 'NEXUS_CUSTOM_API_KEY',
};

/**
 * Environment variable name for the custom gateway base URL.
 * Keep in sync with `SdkAdapterConfig.baseUrl`.
 */
export const CUSTOM_API_BASE_URL_ENV = 'NEXUS_CUSTOM_API_BASE_URL';

/**
 * Escape hatch: set to `1`/`true` to allow the custom gateway base URL to
 * resolve to a loopback or RFC 1918 private address. Default is DENY —
 * SSRF defense. Only disable this when you know the gateway runs on a
 * trusted internal host and you accept the risk.
 */
export const CUSTOM_API_ALLOW_PRIVATE_ENV = 'NEXUS_CUSTOM_API_ALLOW_PRIVATE';
