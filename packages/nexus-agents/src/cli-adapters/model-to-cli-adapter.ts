/**
 * Model-to-CLI Adapter Bridge (#3422)
 *
 * The inverse of {@link createCliToModelAdapter}: wraps an `IModelAdapter`
 * (direct-API adapter — Anthropic/OpenAI/Google/custom-OpenAI) to implement
 * `ICliAdapter`, so a CompositeRouter — which operates on `Map<_, ICliAdapter>`
 * — can route to API adapters and record their bandit outcomes on a *distinct*
 * arm (epic #3317 step 1, Option C). The routing arm id is the Map key
 * (`api:<vendor>`), kept separate from this adapter's display `name` (a CLI
 * slot), so CLI and API telemetry are never merged.
 *
 * @module cli-adapters/model-to-cli-adapter
 */

import type {
  Result,
  IModelAdapter,
  CompletionRequest,
  CompletionResponse,
} from '../core/index.js';
import { ok, err, ModelError } from '../core/index.js';
import { FALLBACK_CONTEXT_WINDOW } from '../config/model-config-helpers.js';
import {
  isRateLimitText,
  parseRetryAfterMs,
  retryAfterMsFromContext,
} from '../adapters/rate-limit-detector.js';
import { CapacityTracker, createCapacityTracker } from './capacity-tracker.js';
import type {
  ICliAdapter,
  CliTask,
  CliResponse,
  CliError,
  CliErrorCode,
  CliModelInfo,
  CliName,
  CliTransport,
  CapabilityProfile,
  ExecutionOptions,
  ModelInfo,
  HealthStatus,
  CapacityStatus,
} from './types.js';

/** Configuration for {@link ModelToCliAdapter}. */
export interface ModelToCliAdapterConfig {
  /**
   * Display CLI slot for attribution/`getModelInfo` (e.g. `claude` for the
   * Anthropic API). This is NOT the routing arm id — the router indexes arms by
   * the adapter Map key (`api:<vendor>`), so the display name can be the slot
   * without merging CLI and API telemetry.
   */
  readonly name: CliName;
  /**
   * Routing capability profile (TOPSIS/preference scoring). Supply the
   * display slot's registry profile; falls back to a neutral mid profile.
   */
  readonly capabilities?: CapabilityProfile;
}

/** Default context window when the model adapter exposes no capability hint. */
const DEFAULT_CONTEXT_WINDOW = FALLBACK_CONTEXT_WINDOW;

/** Neutral mid capability profile used when the caller supplies none. */
const NEUTRAL_CAPABILITIES: CapabilityProfile = {
  reasoning: 7,
  contextWindow: DEFAULT_CONTEXT_WINDOW,
  codeGeneration: 7,
  speed: 7,
  cost: 5,
};

/** Direct-API calls are outbound requests; tag them as the subprocess-style transport. */
const API_TRANSPORT: CliTransport = 'subprocess';

/**
 * Bridge adapter that wraps `IModelAdapter` to implement `ICliAdapter`.
 */
export class ModelToCliAdapter implements ICliAdapter {
  readonly name: CliName;
  readonly transport: CliTransport = API_TRANSPORT;
  readonly capabilities: CapabilityProfile;

  private readonly modelAdapter: IModelAdapter;

  /**
   * Per-arm capacity state (#4602). The same canonical `CapacityTracker` the
   * subprocess adapters use — this bridge previously answered `getCapacity()`
   * from literals, so no API/SDK arm could report a quota signal at all.
   * Per-instance, so one arm's exhaustion never speaks for another's.
   */
  private readonly capacityTracker: CapacityTracker;

  constructor(modelAdapter: IModelAdapter, config: ModelToCliAdapterConfig) {
    this.modelAdapter = modelAdapter;
    this.name = config.name;
    this.capabilities = config.capabilities ?? NEUTRAL_CAPABILITIES;
    this.capacityTracker = createCapacityTracker(config.name);
  }

  /** Build a single-turn CompletionRequest from a CliTask. */
  private toCompletionRequest(task: CliTask, options?: ExecutionOptions): CompletionRequest {
    const request: CompletionRequest = {
      messages: [{ role: 'user', content: task.content }],
    };
    if (task.systemPrompt !== undefined) {
      (request as { systemPrompt: string }).systemPrompt = task.systemPrompt;
    }
    if (task.maxTokens !== undefined) {
      (request as { maxTokens: number }).maxTokens = task.maxTokens;
    }
    if (options?.timeoutMs !== undefined) {
      (request as { timeoutMs: number }).timeoutMs = options.timeoutMs;
    }
    return request;
  }

  /** Flatten a CompletionResponse's content blocks to plain text. */
  private toText(response: CompletionResponse): string {
    return response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }

  /** Convert a CompletionResponse to a CliResponse. */
  private toCliResponse(response: CompletionResponse): CliResponse {
    const usage = response.usage;
    return {
      text: this.toText(response),
      // Omit rather than zero-fill (#4439): a synthesised 0/0/0 is
      // indistinguishable from a real zero-token call downstream.
      ...(usage !== undefined
        ? {
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              totalTokens: usage.totalTokens,
              ...(usage.cachedInputTokens !== undefined
                ? { cachedInputTokens: usage.cachedInputTokens }
                : {}),
              ...(usage.cacheCreationInputTokens !== undefined
                ? { cacheCreationInputTokens: usage.cacheCreationInputTokens }
                : {}),
            },
          }
        : {}),
      model: response.model,
    };
  }

  /**
   * Convert a ModelError to a CliError. Rate-limit text → RATE_LIMITED
   * (retryable); everything else → EXECUTION_ERROR (non-retryable) so the
   * routing/circuit layers see a real, typed failure.
   *
   * #4602: parses `retryAfterMs` off the message, mirroring
   * `base-adapter.ts`'s `createError`. Pre-fix this bridge classified
   * RATE_LIMITED and then threw the provider's stated horizon away — and that
   * horizon is the sole input `CapacityTracker.recordProviderQuotaExhaustion`
   * accepts, so the API/SDK arms could never assert quota exhaustion.
   *
   * Only parsed on a retryable error, as on the subprocess path: a wait hint
   * inside a 500 body is not a rate-limit assertion.
   *
   * #4606: the adapter that raised this error already captured the HTTP
   * `Retry-After` header, which the message never carries — Anthropic states
   * no horizon in its 429 body at all. That captured value wins; the message
   * parse remains the fallback for a `ModelError` raised outside `BaseAdapter`.
   */
  private toCliError(error: ModelError): CliError {
    const rateLimited = isRateLimitText(error.message);
    const code: CliErrorCode = rateLimited ? 'RATE_LIMITED' : 'EXECUTION_ERROR';
    const retryAfterMs = rateLimited
      ? (retryAfterMsFromContext(error.context) ?? parseRetryAfterMs(error.message))
      : undefined;
    const base: CliError = {
      code,
      message: error.message,
      cli: this.name,
      retryable: rateLimited,
      ...(retryAfterMs !== undefined && { retryAfterMs }),
    };
    return error.cause instanceof Error ? { ...base, cause: error.cause } : base;
  }

  /**
   * Feed a provider's own rate-limit assertion into capacity tracking (#4602).
   *
   * The API-side counterpart of `BaseCliAdapter.recordQuotaSignal`. The
   * tracker — not this adapter — decides whether the stated wait is long
   * enough to mean durable quota rather than a per-minute throttle.
   */
  private recordQuotaSignal(error: CliError): void {
    if (error.code !== 'RATE_LIMITED') return;
    this.capacityTracker.recordProviderQuotaExhaustion(error.retryAfterMs);
  }

  async execute(task: CliTask, options?: ExecutionOptions): Promise<Result<CliResponse, CliError>> {
    const result = await this.modelAdapter.complete(this.toCompletionRequest(task, options));
    if (!result.ok) {
      const cliError = this.toCliError(result.error);
      this.recordQuotaSignal(cliError);
      return err(cliError);
    }
    const response = this.toCliResponse(result.value);
    // A served request is direct evidence the provider is serving; the tracker
    // uses it both to count the window and to retire a stale assertion.
    this.capacityTracker.recordUsage(response.usage);
    return ok(response);
  }

  /** Health is derived from the model adapter's config validation. */
  async healthCheck(): Promise<HealthStatus> {
    const valid = this.modelAdapter.validateConfig();
    return Promise.resolve({
      healthy: valid.ok,
      version: 'api',
      versionStatus: 'supported',
      // In-process API adapter: there is no binary to be missing, so it is
      // always reachable and only its config can be wrong (#5060).
      reachable: true,
      lastChecked: new Date(0),
      ...(valid.ok ? {} : { message: valid.error.message }),
    });
  }

  /**
   * Report this arm's capacity from its `CapacityTracker` (#4602).
   *
   * Previously this returned literals: `POSITIVE_INFINITY` remaining,
   * `quotaExhausted: false`, `observed: false`. The `observed: false` half was
   * honest (#4374 — nothing had been observed), but `quotaExhausted: false`
   * asserted a measurement that never happened, and since `assessCapacity`
   * reaches `'exhausted'` only through `quotaExhausted`, it made every
   * API/SDK arm unexcludable for quota by construction — a check that cannot
   * fail, whatever the provider said.
   *
   * The tracker keeps the honest empty case: until this arm has served a call
   * or a provider has asserted a horizon, it reports `observed: false` and the
   * stage grades it `unmeasured`, never `healthy`.
   */
  getCapacity(): Promise<CapacityStatus> {
    return Promise.resolve(this.capacityTracker.getCapacity());
  }

  getVersion(): Promise<string> {
    return Promise.resolve('api');
  }

  getModelInfo(): ModelInfo {
    return {
      id: this.modelAdapter.modelId,
      name: this.modelAdapter.modelId,
      contextWindow: DEFAULT_CONTEXT_WINDOW,
    };
  }

  /** Delegate to the model adapter's listModels surface when present (#2529). */
  async listModels(): Promise<readonly CliModelInfo[]> {
    if (this.modelAdapter.listModels === undefined) return [];
    const models = await this.modelAdapter.listModels();
    return models.map((m) => ({
      id: m.id,
      ...(m.ownedBy !== undefined ? { provider: m.ownedBy } : {}),
    }));
  }

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

/** Creates an ICliAdapter from an IModelAdapter (direct-API adapter). */
export function createModelToCliAdapter(
  modelAdapter: IModelAdapter,
  config: ModelToCliAdapterConfig
): ModelToCliAdapter {
  return new ModelToCliAdapter(modelAdapter, config);
}
