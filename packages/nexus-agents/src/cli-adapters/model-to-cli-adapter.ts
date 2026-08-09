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
import { isRateLimitText } from '../adapters/rate-limit-detector.js';
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

  constructor(modelAdapter: IModelAdapter, config: ModelToCliAdapterConfig) {
    this.modelAdapter = modelAdapter;
    this.name = config.name;
    this.capabilities = config.capabilities ?? NEUTRAL_CAPABILITIES;
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
    return {
      text: this.toText(response),
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
      },
      model: response.model,
    };
  }

  /**
   * Convert a ModelError to a CliError. Rate-limit text → RATE_LIMITED
   * (retryable); everything else → EXECUTION_ERROR (non-retryable) so the
   * routing/circuit layers see a real, typed failure.
   */
  private toCliError(error: ModelError): CliError {
    const rateLimited = isRateLimitText(error.message);
    const code: CliErrorCode = rateLimited ? 'RATE_LIMITED' : 'EXECUTION_ERROR';
    const base: CliError = {
      code,
      message: error.message,
      cli: this.name,
      retryable: rateLimited,
    };
    return error.cause instanceof Error ? { ...base, cause: error.cause } : base;
  }

  async execute(task: CliTask, options?: ExecutionOptions): Promise<Result<CliResponse, CliError>> {
    const result = await this.modelAdapter.complete(this.toCompletionRequest(task, options));
    if (!result.ok) {
      return err(this.toCliError(result.error));
    }
    return ok(this.toCliResponse(result.value));
  }

  /** Health is derived from the model adapter's config validation. */
  async healthCheck(): Promise<HealthStatus> {
    const valid = this.modelAdapter.validateConfig();
    return Promise.resolve({
      healthy: valid.ok,
      version: 'api',
      versionStatus: 'supported',
      lastChecked: new Date(0),
      ...(valid.ok ? {} : { message: valid.error.message }),
    });
  }

  /**
   * API adapters don't expose subprocess-style rate windows; report
   * non-exhausted capacity. Real rate-limit signals surface via execute()'s
   * RATE_LIMITED error, which the resilience layer acts on.
   *
   * #4374: `observed: false` — the infinities below are a stand-in for "this
   * adapter has no rate window to report", not a measurement. Reporting them as
   * observed would tell consumers we had checked and found unlimited capacity.
   */
  getCapacity(): Promise<CapacityStatus> {
    return Promise.resolve({
      remainingTokens: Number.POSITIVE_INFINITY,
      remainingRequests: Number.POSITIVE_INFINITY,
      resetTime: new Date(0),
      utilizationPercent: 0,
      exhausted: false,
      observed: false,
    });
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
