/**
 * nexus-agents/adapters/sdk - AI SDK Adapter Layer
 *
 * Unified model access via Vercel AI SDK (npm: ai).
 * Supports Anthropic, OpenAI, and Google providers behind IModelAdapter.
 *
 * @module adapters/sdk
 * (Source: Issue #1123 — AI SDK provider layer)
 */

export { SdkAdapter } from './sdk-adapter.js';
export type { SdkAdapterConfig, SdkProviderId } from './types.js';
export { PROVIDER_ENV_KEYS } from './types.js';
