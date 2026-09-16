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
   * the `NEXUS_OPENAI_COMPAT_URL` environment variable, or its deprecated
   * alias `NEXUS_CUSTOM_API_BASE_URL` (#4392 increment 3).
   */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retries on transient failures */
  maxRetries?: number;
}

/**
 * Maps provider IDs to their environment variable names.
 *
 * The three vendor entries are current. The `custom-openai` entry is kept at
 * its old value so existing readers of this table keep working, but the name
 * it holds is deprecated — see the entry's own note.
 */
export const PROVIDER_ENV_KEYS: Record<SdkProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_AI_API_KEY',
  /**
   * @deprecated `NEXUS_CUSTOM_API_KEY` is an alias of `NEXUS_OPENAI_COMPAT_KEY`
   * since #4392 increment 3, read only when the replacement is unset, and
   * dropped in the next major (#6291). The `custom-openai` key is resolved by
   * `adapters/sdk/gateway-env.ts`, which honours both spellings; do not read
   * this entry directly.
   */
  'custom-openai': 'NEXUS_CUSTOM_API_KEY',
};

/**
 * Environment variable name for the custom gateway base URL.
 *
 * @deprecated Alias of {@link OPENAI_COMPAT_URL_ENV} since #4392 increment 3;
 * read only when the replacement is unset, dropped in the next major (#6291).
 * Resolve through `adapters/sdk/gateway-env.ts` rather than reading it.
 */
export const CUSTOM_API_BASE_URL_ENV = 'NEXUS_CUSTOM_API_BASE_URL';

/**
 * The OpenAI-compatible gateway base URL (#2468). One of the two names that
 * BOTH gateway mechanisms read: the single-model `custom-openai` SDK path
 * (via `gateway-env.ts`, where the deprecated alias also applies) and the
 * discovery/voter/`api:<endpoint>` path (`openai-compat-adapter.ts`, which
 * is reached through this spelling only — #4392 increment 3, option C).
 */
export const OPENAI_COMPAT_URL_ENV = 'NEXUS_OPENAI_COMPAT_URL';

/** The gateway API key paired with {@link OPENAI_COMPAT_URL_ENV}. */
export const OPENAI_COMPAT_KEY_ENV = 'NEXUS_OPENAI_COMPAT_KEY';

/**
 * The deprecated gateway env aliases (#4392 increment 3), each with the name
 * that replaced it. Each is read by the single-model `custom-openai` path only
 * when its replacement is unset; neither reaches the discovery/voter gateway
 * path. Both are dropped in the next major (#6291). Order is the report order.
 */
export const DEPRECATED_GATEWAY_ENV_ALIASES: readonly {
  readonly deprecated: string;
  readonly replacement: string;
}[] = [
  // Spelled out (not via the @deprecated constants above) so no production
  // code reads a deprecated symbol; the two literals ARE the deprecation.
  { deprecated: 'NEXUS_CUSTOM_API_BASE_URL', replacement: OPENAI_COMPAT_URL_ENV },
  { deprecated: 'NEXUS_CUSTOM_API_KEY', replacement: OPENAI_COMPAT_KEY_ENV },
];

/**
 * Escape hatch: set to `1`/`true` to allow the custom gateway base URL to
 * resolve to a loopback or RFC 1918 private address. Default is DENY —
 * SSRF defense. Only disable this when you know the gateway runs on a
 * trusted internal host and you accept the risk.
 */
export const CUSTOM_API_ALLOW_PRIVATE_ENV = 'NEXUS_CUSTOM_API_ALLOW_PRIVATE';

/**
 * Operator's declaration of what a gateway arm costs (#4392 increment 2).
 * Grammar: `free | local | priced | priced:<inputPer1M>,<outputPer1M>`,
 * optionally endpoint-scoped as `endpoint=decl[;endpoint=decl]`, with at
 * most one bare declaration that applies to every gateway arm without its
 * own entry. Unset means UNDECLARED: the task-class cost ceiling and the
 * per-task budget exclude the gateway (fail-closed, #6393) and `doctor`
 * warns. Parsed by `adapters/sdk/gateway-cost.ts`.
 */
export const GATEWAY_COST_ENV = 'NEXUS_GATEWAY_COST';

/**
 * Endpoint identity of the OpenAI-compatible voter gateway (#4392 increment
 * 2, step 2): the `<endpoint>` in the `api:<endpoint>` arm the gateway
 * registers as, and the key a scoped `NEXUS_GATEWAY_COST` entry names it by.
 * An endpoint id (`isEndpointArmId('api:' + value)`), never the URL.
 * Defaults to {@link DEFAULT_OPENAI_COMPAT_ENDPOINT}.
 */
export const OPENAI_COMPAT_ENDPOINT_ENV = 'NEXUS_OPENAI_COMPAT_ENDPOINT';

/**
 * The default endpoint identity: the `providers.openai-compat` key the
 * opencode.json bridge reads the same gateway from (#2503), so an operator
 * who declares `openai-compat=free` names the arm the gateway registers as.
 */
export const DEFAULT_OPENAI_COMPAT_ENDPOINT = 'openai-compat';
