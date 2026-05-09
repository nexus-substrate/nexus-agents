/**
 * OpenAI-compatible gateway adapter — talk to any HTTP gateway that exposes
 * the OpenAI Chat Completions API. The gateway may itself be a multi-model
 * router (Bedrock/Vertex/Azure proxy, OpenRouter, vLLM, etc.). nexus-agents
 * sees one adapter, the gateway exposes N models, and the existing routing
 * pipeline picks among them.
 *
 * Source: Issue #2468 (epic #2467 child).
 *
 * Configuration is env-var-driven so operators don't have to thread config
 * through the model registry just to point at a custom gateway:
 *   - NEXUS_OPENAI_COMPAT_URL — base URL (e.g. https://gateway.example/v1)
 *   - NEXUS_OPENAI_COMPAT_KEY — API key for the gateway
 *
 * Models are discovered via GET {base}/v1/models at first use. Each model
 * the gateway exposes can be selected by ID; the adapter wraps the existing
 * `OpenAIAdapter` for the actual chat-completions request, so streaming +
 * tool use + the full IModelAdapter contract come for free.
 */

import OpenAI from 'openai';

import type {
  Result,
  CompletionRequest,
  CompletionResponse,
  ModelError,
  IModelAdapter,
} from '../core/index.js';
import { ok, err, ConfigError, getErrorMessage, getTimeProvider } from '../core/index.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { recordUsageEvent, computeCostUSD } from '../learning/usage-log.js';

export interface OpenAICompatConfig {
  /** Gateway base URL — must reach `/v1/models` and `/v1/chat/completions`. */
  readonly baseUrl: string;
  /** API key the gateway expects. */
  readonly apiKey: string;
}

export interface DiscoveredModel {
  readonly id: string;
  /** Unix epoch seconds when the model was created (per OpenAI API). */
  readonly created?: number;
  /** Owning organization or upstream provider name. */
  readonly ownedBy?: string;
}

/**
 * Read the env-var-driven gateway config. Returns `null` when either var is
 * unset or empty — caller can fall back to other adapter sources without
 * surfacing a hard error.
 */
export function readOpenAICompatEnv(): OpenAICompatConfig | null {
  const baseUrl = process.env['NEXUS_OPENAI_COMPAT_URL']?.trim();
  const apiKey = process.env['NEXUS_OPENAI_COMPAT_KEY']?.trim();
  if (baseUrl === undefined || baseUrl === '') return null;
  if (apiKey === undefined || apiKey === '') return null;
  return { baseUrl, apiKey };
}

/**
 * Discover available models by calling `GET {baseUrl}/v1/models`. Uses the
 * official `openai` SDK's `client.models.list()` so we benefit from its
 * pagination + retry handling. The list is the strongly authoritative
 * source: nexus-agents won't try to dispatch to a model the gateway doesn't
 * expose.
 */
export async function discoverModels(
  config: OpenAICompatConfig
): Promise<Result<readonly DiscoveredModel[], ConfigError>> {
  try {
    const client = new OpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });
    const list = await client.models.list();
    const models: readonly DiscoveredModel[] = list.data.map((m) => ({
      id: m.id,
      created: m.created,
      ownedBy: m.owned_by,
    }));
    return ok(models);
  } catch (e: unknown) {
    return err(
      new ConfigError(
        `Failed to discover models from ${config.baseUrl}: ${getErrorMessage(e)}. ` +
          `Verify NEXUS_OPENAI_COMPAT_URL and NEXUS_OPENAI_COMPAT_KEY, then retry.`
      )
    );
  }
}

/**
 * Create an OpenAIAdapter pointed at the gateway for a specific model ID,
 * wrapped with usage recording so every completion appends a UsageEvent
 * to the JSONL log consumed by `nexus-agents usage`.
 *
 * The wrapper is transparent — same IModelAdapter contract, same fields,
 * same error handling. Recording is best-effort (telemetry never fails
 * the user's call).
 *
 * When invoked via MCP, the host harness's model identifier is passed
 * through verbatim — nexus-agents doesn't second-guess what the host is
 * already routing.
 */
export function createOpenAICompatAdapter(
  modelId: string,
  config: OpenAICompatConfig
): IModelAdapter {
  const inner = new OpenAIAdapter({ modelId, apiKey: config.apiKey, baseUrl: config.baseUrl });
  return withUsageRecording(inner);
}

/**
 * Wrap any IModelAdapter so that successful + failed `complete()` calls
 * append a UsageEvent to the on-disk usage log. Stream calls aren't yet
 * instrumented (a future PR can add streaming-aware recording).
 *
 * The returned object preserves the IModelAdapter contract identically;
 * downstream code can't tell the difference except that one extra JSONL
 * line gets written per call.
 */
function withUsageRecording(inner: IModelAdapter): IModelAdapter {
  return {
    providerId: inner.providerId,
    modelId: inner.modelId,
    capabilities: inner.capabilities,
    countTokens: (text) => inner.countTokens(text),
    validateConfig: () => inner.validateConfig(),
    stream: (request) => inner.stream(request),
    async complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
      const start = getTimeProvider().now();
      const result = await inner.complete(request);
      const latencyMs = getTimeProvider().now() - start;
      try {
        if (result.ok) {
          const u = result.value.usage;
          recordUsageEvent({
            timestamp: new Date().toISOString(),
            modelId: inner.modelId,
            providerId: inner.providerId,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
            usdCost: computeCostUSD(inner.modelId, u.inputTokens, u.outputTokens),
            latencyMs,
            success: true,
          });
        } else {
          recordUsageEvent({
            timestamp: new Date().toISOString(),
            modelId: inner.modelId,
            providerId: inner.providerId,
            inputTokens: 0,
            outputTokens: 0,
            usdCost: 0,
            latencyMs,
            success: false,
            errorCode: result.error.code,
          });
        }
      } catch {
        // Telemetry must not break user calls.
      }
      return result;
    },
  };
}

/**
 * Convenience: read env, discover, return adapter instances for every
 * discovered model. Returns `null` (not an error) when env vars aren't set
 * — the caller treats unset gateway as "no adapter from this source."
 *
 * Use case: the unified registry / factory calls this at startup; if the
 * operator has configured a gateway, every discovered model becomes a
 * dispatch target alongside the existing claude/codex/gemini/opencode
 * adapter slots.
 */
export async function buildOpenAICompatAdapters(): Promise<Result<
  readonly IModelAdapter[],
  ConfigError
> | null> {
  const config = readOpenAICompatEnv();
  if (config === null) return null;
  const discovered = await discoverModels(config);
  if (!discovered.ok) return discovered;
  return ok(discovered.value.map((m) => createOpenAICompatAdapter(m.id, config)));
}
