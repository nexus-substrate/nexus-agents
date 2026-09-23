/**
 * A CLI slot adapter bound to one requested model (#6599).
 *
 * `UnifiedAdapterRegistry.getAdapterForModel` resolves a model preference to
 * its CLI slot, and the slot adapter is shared and CLI-scoped: it has no
 * model of its own beyond the CLI default. Returning it bare dropped the
 * model, so `execute_expert` ran the CLI's default whatever was asked for.
 * This view stamps the model onto every request that does not name its own,
 * and delegates everything else to the shared slot adapter, which the
 * registry still owns.
 *
 * @module adapters/model-bound-adapter
 */

import type {
  CompletionRequest,
  CompletionResponse,
  ConfigError,
  ModelCapability,
  ModelError,
  Result,
} from '../core/index.js';
import type { StreamChunk } from '../core/types/model.js';
import type { CliName } from '../cli-adapters/types.js';
import type { CircuitBreakerRegistry } from '../cli-adapters/circuit-breaker.js';
import type { AdapterHealthInfo, IResilientAdapter } from './resilient-adapter-types.js';

export class ModelBoundAdapter implements IResilientAdapter {
  constructor(
    private readonly slot: IResilientAdapter,
    /** Canonical registry id every unmodelled request is sent with. */
    readonly boundModel: string
  ) {}

  get providerId(): string {
    return this.slot.providerId;
  }

  get modelId(): string {
    return this.slot.modelId;
  }

  get capabilities(): readonly ModelCapability[] {
    return this.slot.capabilities;
  }

  private bind(request: CompletionRequest): CompletionRequest {
    return request.model !== undefined ? request : { ...request, model: this.boundModel };
  }

  complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
    return this.slot.complete(this.bind(request));
  }

  stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    return this.slot.stream(this.bind(request));
  }

  countTokens(text: string): Promise<number> {
    return this.slot.countTokens(text);
  }

  validateConfig(): Result<void, ConfigError> {
    return this.slot.validateConfig();
  }

  getHealth(): AdapterHealthInfo | undefined {
    return this.slot.getHealth();
  }

  refresh(): Promise<void> {
    return this.slot.refresh();
  }

  setPreferredCli(cli: CliName | undefined): void {
    this.slot.setPreferredCli(cli);
  }

  onFailover(cb: (info: AdapterHealthInfo) => void): () => void {
    return this.slot.onFailover(cb);
  }

  getCircuitBreakerRegistry(): CircuitBreakerRegistry | undefined {
    return this.slot.getCircuitBreakerRegistry?.();
  }

  /** No-op: the shared slot adapter belongs to the registry, which disposes it. */
  dispose(): void {
    // Intentionally empty — disposing the view must not dispose the slot.
  }
}
