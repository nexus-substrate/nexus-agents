/**
 * OpenAI-compatible gateway adapter — talk to any HTTP gateway that exposes
 * the OpenAI Chat Completions API. The gateway may itself be a multi-model
 * router (Bedrock/Vertex/Azure proxy, OpenRouter, vLLM, etc.). nexus-agents
 * sees one adapter, the gateway exposes N models, and the existing routing
 * pipeline picks among them.
 *
 * Source: Issue #2468 (epic #2467 child).
 *
 * Configuration precedence (#2503, child 3 of epic #2500):
 *   1. NEXUS_OPENAI_COMPAT_URL + NEXUS_OPENAI_COMPAT_KEY env vars (both required)
 *   2. NEXUS_OPENCODE_CONFIG path → opencode.json → providers.openai-compat
 *   3. Unconfigured → adapter not built
 *
 * Models are discovered via GET {base}/v1/models at first use. Each model
 * the gateway exposes can be selected by ID; the adapter wraps the existing
 * `OpenAIAdapter` for the actual chat-completions request, so streaming +
 * tool use + the full IModelAdapter contract come for free.
 */

import OpenAI from 'openai';
import { assertCustomApiHostResolvesPublic } from './sdk/custom-api-validation.js';

import type {
  Result,
  CompletionRequest,
  CompletionResponse,
  ModelError,
  ModelMetadata,
  IModelAdapter,
} from '../core/index.js';
import { ok, err, ConfigError, getErrorMessage, getTimeProvider } from '../core/index.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { recordUsageEvent, computeCostDetail } from '../learning/usage-log.js';
import { readOpencodeGateway } from '../config/opencode-bridge.js';

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
 * Read the gateway config with the precedence chain documented in the
 * module docstring: env vars > opencode.json > unconfigured.
 *
 * The env-var path (#2468) wins when both `NEXUS_OPENAI_COMPAT_URL` and
 * `NEXUS_OPENAI_COMPAT_KEY` are set. Otherwise, when `NEXUS_OPENCODE_CONFIG`
 * names a path, the opencode.json bridge tries to source the gateway from
 * `providers.openai-compat.options.{baseURL, apiKey}` (#2503). Returns
 * `null` when neither path yields a config — caller treats unset gateway
 * as "no adapter from this source."
 */
export function readOpenAICompatEnv(): OpenAICompatConfig | null {
  const fromEnv = readGatewayFromEnv();
  if (fromEnv !== null) return fromEnv;
  return readGatewayFromOpencode();
}

function readGatewayFromEnv(): OpenAICompatConfig | null {
  const envUrl = process.env['NEXUS_OPENAI_COMPAT_URL']?.trim();
  const envKey = process.env['NEXUS_OPENAI_COMPAT_KEY']?.trim();
  if (envUrl === undefined || envUrl === '') return null;
  if (envKey === undefined || envKey === '') return null;
  return { baseUrl: envUrl, apiKey: envKey };
}

function readGatewayFromOpencode(): OpenAICompatConfig | null {
  const opencodePath = process.env['NEXUS_OPENCODE_CONFIG']?.trim();
  if (opencodePath === undefined || opencodePath === '') return null;
  const fromFile = readOpencodeGateway(opencodePath);
  if (fromFile === null) return null;
  return { baseUrl: fromFile.baseURL, apiKey: fromFile.apiKey };
}

/**
 * Ceiling on how many models one gateway may contribute.
 *
 * `buildOpenAICompatAdapters` constructs one adapter per discovered model, so an
 * unbounded list becomes unbounded objects during bootstrap. Aggregators
 * legitimately serve hundreds — models.dev lists 339 for one and 620 for
 * another — so this is a sanity ceiling on adapter construction, not a claim
 * about what a gateway may offer.
 */
const MAX_DISCOVERED_MODELS = 256;

/** Bound on the discovery call. Bootstrap must not hang on a dead gateway. */
const MODEL_DISCOVERY_TIMEOUT_MS = 10_000;

/** Hostname of a base URL, or the raw string when it will not parse. */
function hostnameOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
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
  // Reuse the SDK path's DNS-resolve-time SSRF guard (#3426) rather than
  // growing a second one. This path needs it at least as much: it can read its
  // base URL from a FILE (`NEXUS_OPENCODE_CONFIG` -> opencode.json), not only
  // from an env var, so the input is not always direct operator intent.
  // The guard fails OPEN on transient resolver errors and rejects only a
  // confirmed private/loopback/link-local resolution.
  const hostCheck = await assertCustomApiHostResolvesPublic(hostnameOf(config.baseUrl));
  if (!hostCheck.ok) {
    return err(new ConfigError(`Gateway URL rejected: ${hostCheck.error.message}`));
  }
  try {
    const client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      // Discovery runs during server bootstrap, so an unresponsive gateway must
      // not stall startup indefinitely. The SDK's own default is far longer.
      timeout: MODEL_DISCOVERY_TIMEOUT_MS,
      maxRetries: 1,
    });
    const list = await client.models.list();
    if (list.data.length > MAX_DISCOVERED_MODELS) {
      return err(
        new ConfigError(
          `Gateway ${config.baseUrl} listed ${String(list.data.length)} models, above the ` +
            `${String(MAX_DISCOVERED_MODELS)} cap. Refusing to build an adapter per model.`
        )
      );
    }
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
  const wrapped: IModelAdapter = {
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
          // Full-registry pricing with provenance (#4165): `priced: false`
          // marks the $0 as UNPRICED (unmeasured), not a real $0.
          const cost = computeCostDetail(inner.modelId, u.inputTokens, u.outputTokens);
          recordUsageEvent({
            timestamp: new Date().toISOString(),
            modelId: inner.modelId,
            providerId: inner.providerId,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
            usdCost: cost.costUsd,
            latencyMs,
            success: true,
            priced: cost.priced,
            ...(cost.priced ? { priceSource: cost.resolvedId } : {}),
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
  attachListModels(wrapped, inner);
  return wrapped;
}

/**
 * (#2540) Forward `listModels` through the wrapper when the inner adapter
 * exposes one. Only attach when defined so the wrapper's `listModels?:`
 * hint stays accurate for the resolver. The inner reference is captured
 * by closure so the forwarded call binds `this` to the inner adapter.
 */
function attachListModels(wrapped: IModelAdapter, inner: IModelAdapter): void {
  const list = inner.listModels?.bind(inner);
  if (list === undefined) return;
  wrapped.listModels = (): Promise<readonly ModelMetadata[]> => list();
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
