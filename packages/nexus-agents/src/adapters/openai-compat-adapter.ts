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
  ILogger,
  ModelError,
  ModelMetadata,
  IModelAdapter,
} from '../core/index.js';
import { ok, err, ConfigError, getErrorMessage, getTimeProvider } from '../core/index.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { recordUsageEvent } from '../learning/usage-log.js';
import { gatewayCostDetail } from '../cli-adapters/budget-arm-cost.js';
import { readOpencodeGateway } from '../config/opencode-bridge.js';
import { isEndpointArmId, type EndpointArmId } from '../cli-adapters/types-core.js';
import { DEFAULT_OPENAI_COMPAT_ENDPOINT, OPENAI_COMPAT_ENDPOINT_ENV } from './sdk/types.js';

export interface OpenAICompatConfig {
  /** Gateway base URL — must reach `/v1/models` and `/v1/chat/completions`. */
  readonly baseUrl: string;
  /** API key the gateway expects. */
  readonly apiKey: string;
  /**
   * Endpoint identity the gateway registers as — the `<endpoint>` of its
   * `api:<endpoint>` arm (#4392 increment 2, step 2). Always set by
   * {@link readOpenAICompatEnv}; optional on the type so a hand-built config
   * (tests, embedders) keeps working, with the default applying at
   * registration. Never the URL.
   */
  readonly endpoint?: string;
}

/**
 * A per-model gateway adapter, marked with the `api:<endpoint>` arm it
 * registers under (#4392 increment 2, step 4). The telemetry writers key on
 * this — the usage log here, the vote rollup in `decision-cost-recording` —
 * to price a call by the arm's `NEXUS_GATEWAY_COST` declaration instead of
 * by the model id alone. `providerId` stays `'openai'` on purpose:
 * `inFamilyFallback` and `authRemediation` take their inputs from it.
 * Reached through {@link isGatewayModelAdapter} (narrowing) and
 * {@link createOpenAICompatAdapter} (construction); not exported by name
 * because nothing outside this module needs to spell it.
 */
interface GatewayModelAdapter extends IModelAdapter {
  readonly gatewayArm: EndpointArmId;
}

/**
 * True iff `adapter` carries a valid gateway arm id. Checked by shape, not
 * by construction site: a hand-built config can name an endpoint that is not
 * an endpoint id, and a marker that fails the id rule is no marker.
 */
export function isGatewayModelAdapter(adapter: IModelAdapter): adapter is GatewayModelAdapter {
  const arm: unknown = (adapter as Partial<GatewayModelAdapter>).gatewayArm;
  return typeof arm === 'string' && isEndpointArmId(arm);
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
  return { baseUrl: envUrl, apiKey: envKey, endpoint: readOpenAICompatEndpoint() };
}

function readGatewayFromOpencode(): OpenAICompatConfig | null {
  const opencodePath = process.env['NEXUS_OPENCODE_CONFIG']?.trim();
  if (opencodePath === undefined || opencodePath === '') return null;
  const fromFile = readOpencodeGateway(opencodePath);
  if (fromFile === null) return null;
  return {
    baseUrl: fromFile.baseURL,
    apiKey: fromFile.apiKey,
    endpoint: readOpenAICompatEndpoint(),
  };
}

/**
 * The gateway's endpoint identity (#4392 increment 2, step 2):
 * `NEXUS_OPENAI_COMPAT_ENDPOINT` when it is a valid endpoint id, else
 * {@link DEFAULT_OPENAI_COMPAT_ENDPOINT}. The fallback is deliberate: the env
 * schema reports an invalid value at startup, and this reader must never turn
 * a pasted URL — or a credential inside one — into an arm id, telemetry key
 * or display string. Both config paths (env, opencode.json) share it.
 */
export function readOpenAICompatEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[OPENAI_COMPAT_ENDPOINT_ENV]?.trim();
  if (raw === undefined || raw === '') return DEFAULT_OPENAI_COMPAT_ENDPOINT;
  return isEndpointArmId(`api:${raw}`) ? raw : DEFAULT_OPENAI_COMPAT_ENDPOINT;
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

/**
 * Shape of a model id this adapter will dispatch to (#4392 increment 2, step
 * 2). A discovered id becomes a request field, a usage-log key and — through
 * the gateway catalogue — a pricing key, so whitespace and control characters
 * are refused; `/`, `:`, `.` and `_` are kept because aggregators use them
 * (`org/model:tag`). Length is capped at 128.
 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

/**
 * Keep the ids that satisfy {@link MODEL_ID_PATTERN}. Warns with the dropped
 * COUNT only — an offending id is exactly the string that must not reach a
 * log line, and the count is what tells an operator the gateway's listing
 * needs a look.
 */
function keepValidModelIds(
  models: readonly DiscoveredModel[],
  logger: ILogger | undefined
): readonly DiscoveredModel[] {
  const kept = models.filter((m) => MODEL_ID_PATTERN.test(m.id));
  const dropped = models.length - kept.length;
  if (dropped > 0) {
    logger?.warn(
      `Dropped ${String(dropped)} gateway model id(s) that are not a valid model id shape (whitespace, control characters, or over 128 chars)`,
      { dropped, kept: kept.length }
    );
  }
  return kept;
}

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
  config: OpenAICompatConfig,
  logger?: ILogger
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
    return ok(keepValidModelIds(models, logger));
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
 * same error handling — plus the {@link GatewayModelAdapter} arm marker,
 * `api:<config.endpoint>` (the default endpoint when a hand-built config
 * omits it, matching registration). Recording is best-effort (telemetry
 * never fails the user's call).
 *
 * When invoked via MCP, the host harness's model identifier is passed
 * through verbatim — nexus-agents doesn't second-guess what the host is
 * already routing.
 */
export function createOpenAICompatAdapter(
  modelId: string,
  config: OpenAICompatConfig
): GatewayModelAdapter {
  const inner = new OpenAIAdapter({ modelId, apiKey: config.apiKey, baseUrl: config.baseUrl });
  return withUsageRecording(inner, `api:${config.endpoint ?? DEFAULT_OPENAI_COMPAT_ENDPOINT}`);
}

/**
 * Wrap a gateway model adapter so that successful + failed `complete()`
 * calls append a UsageEvent to the on-disk usage log. Stream calls aren't
 * yet instrumented (a future PR can add streaming-aware recording).
 *
 * The returned object preserves the IModelAdapter contract identically;
 * downstream code can't tell the difference except that one extra JSONL
 * line gets written per call. The line is priced by `gatewayArm`'s
 * `NEXUS_GATEWAY_COST` declaration ({@link gatewayCostDetail}, #4392 step 4):
 * an undeclared gateway records `priced: false`, never the model id's vendor
 * list price.
 */
function withUsageRecording(inner: IModelAdapter, gatewayArm: EndpointArmId): GatewayModelAdapter {
  const wrapped: GatewayModelAdapter = {
    gatewayArm,
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
          // No vendor usage ⇒ nothing to record. Zero-filling here would write
          // a fabricated measurement into the usage log, which is the defect
          // #4439 exists to remove — a lost latency datapoint is the cheaper
          // loss than a false token count.
          if (u === undefined) return result;
          // Declaration-first pricing with provenance (#4165, #4392 step 4):
          // `priced: false` marks the $0 as UNPRICED (unmeasured), not a real $0.
          const cost = gatewayCostDetail(gatewayArm, inner.modelId, u.inputTokens, u.outputTokens);
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
          recordFailedCall(inner, latencyMs, result.error.code);
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

/** The usage line for a failed call: no tokens, no cost — the error code is the datum. */
function recordFailedCall(inner: IModelAdapter, latencyMs: number, errorCode: string): void {
  recordUsageEvent({
    timestamp: new Date().toISOString(),
    modelId: inner.modelId,
    providerId: inner.providerId,
    inputTokens: 0,
    outputTokens: 0,
    usdCost: 0,
    latencyMs,
    success: false,
    errorCode,
  });
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
export async function buildOpenAICompatAdapters(
  logger?: ILogger
): Promise<Result<readonly IModelAdapter[], ConfigError> | null> {
  const config = readOpenAICompatEnv();
  if (config === null) return null;
  const discovered = await discoverModels(config, logger);
  if (!discovered.ok) return discovered;
  return ok(discovered.value.map((m) => createOpenAICompatAdapter(m.id, config)));
}
