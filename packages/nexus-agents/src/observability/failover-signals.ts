/**
 * Adapter-failover → pipeline-bus signal producer (#3321, epic #3143 P2).
 *
 * A second, higher-reliability `signal.swarm_unhealthy` producer alongside the
 * SwarmObserver-bottleneck poll (#3223). `ResilientAdapter.emitFailover()` emits
 * an `adapter.failover` `DomainEvent` on the collaboration bus (bus B) whose
 * payload (`AdapterHealthInfo`) carries the **exact `CliName`** and health state
 * on circuit-breaker trips / failovers. That is directly CLI-attributable — no
 * `confidentCliSlot` guesswork needed — so it fires reliably on real CLI
 * failures.
 *
 * This producer subscribes to bus B and re-emits `signal.swarm_unhealthy` on the
 * typed pipeline bus (bus A) when an adapter degrades or becomes unavailable.
 * The (shadow-by-default) TuneStage consumes it; under `NEXUS_TUNE_ENFORCE` it
 * applies a bounded, decaying routing demotion. A short per-CLI cooldown stops a
 * flapping breaker from spamming signals (the TuneAdjustmentStore also caps and
 * decays the resulting effect).
 *
 * Bus direction is B→A here (the reverse of `pipeline/event-bus-bridge.ts`),
 * preserving the `A = observability / B = messaging` boundary: the adapter never
 * touches bus A directly.
 *
 * @module observability/failover-signals
 */

import { createLogger, getErrorMessage, getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import { getGlobalEventBus } from '../core/event-bus.js';
import type { DomainEvent, Subscription } from '../core/event-bus.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';
import type { CliNameLiteral } from '../config/model-capabilities-types.js';
import type { AdapterHealthInfo } from '../adapters/resilient-adapter-types.js';
import { getPipelineEventBus } from '../pipeline/event-bus.js';
import type { IEventBus } from '../pipeline/event-types.js';

const defaultLogger = createLogger({ component: 'FailoverSignals' });

/** Health states that warrant a routing signal (a `healthy` adapter does not). */
const UNHEALTHY_STATES = new Set<string>(['degraded', 'unavailable']);

/** Minimum gap between signals for the same CLI, to absorb breaker flapping. */
const FAILOVER_SIGNAL_COOLDOWN_MS = 30_000;

const CLI_NAME_SET = new Set<string>(CLI_NAMES);

/** Narrow an `adapter.failover` payload to a CLI-attributable unhealthy health-info. */
function unhealthyCliFrom(payload: unknown): { cli: CliNameLiteral; reason: string } | undefined {
  if (payload === null || typeof payload !== 'object') return undefined;
  const info = payload as Partial<AdapterHealthInfo>;
  if (typeof info.source !== 'string' || !CLI_NAME_SET.has(info.source)) return undefined;
  if (typeof info.state !== 'string' || !UNHEALTHY_STATES.has(info.state)) return undefined;
  const lastError = typeof info.lastError === 'string' ? info.lastError : undefined;
  const count = typeof info.failoverCount === 'number' ? info.failoverCount : 0;
  const reason = `adapter ${info.state} (failovers: ${String(count)})${lastError !== undefined ? `: ${lastError}` : ''}`;
  return { cli: info.source as CliNameLiteral, reason };
}

// ============================================================================
// Server-wide lifecycle (#3321) — mirrors swarm-health-signals.ts start/shutdown.
//
// cli-server-tools.ts:initV2PipelineSubsystems calls startFailoverSignals() at
// server init, and cli-server.ts:createShutdownCleanup calls
// shutdownFailoverSignals().
// ============================================================================

export interface FailoverSignalsOptions {
  /** Injectable bus B (collaboration). Defaults to the global event bus. */
  readonly sourceBus?: {
    subscribe: (pattern: string, listener: (e: DomainEvent) => void) => Subscription;
  };
  /** Injectable bus A (pipeline). Defaults to the pipeline event bus. */
  readonly pipelineBus?: IEventBus;
  /** Per-CLI cooldown in ms. Default 30_000. */
  readonly cooldownMs?: number;
  /** Injectable logger. */
  readonly logger?: ILogger;
}

let failoverSubscription: Subscription | undefined;

/**
 * Subscribe to `adapter.failover` events on bus B and re-emit
 * `signal.swarm_unhealthy` on bus A for degraded/unavailable CLIs. Idempotent —
 * repeated calls are no-ops while a subscription is active. Caller must invoke
 * `shutdownFailoverSignals()` on server shutdown.
 */
export function startFailoverSignals(options?: FailoverSignalsOptions): void {
  if (failoverSubscription !== undefined) return;
  const logger = options?.logger ?? defaultLogger;
  const sourceBus = options?.sourceBus ?? getGlobalEventBus();
  const pipelineBus = options?.pipelineBus ?? getPipelineEventBus();
  const cooldownMs = options?.cooldownMs ?? FAILOVER_SIGNAL_COOLDOWN_MS;
  const lastEmitByCli = new Map<CliNameLiteral, number>();

  failoverSubscription = sourceBus.subscribe('adapter.failover', (event: DomainEvent) => {
    try {
      const unhealthy = unhealthyCliFrom(event.payload);
      if (unhealthy === undefined) return;
      const now = getTimeProvider().now();
      const last = lastEmitByCli.get(unhealthy.cli);
      if (last !== undefined && now - last < cooldownMs) return; // within cooldown
      lastEmitByCli.set(unhealthy.cli, now);

      pipelineBus.emit({
        type: 'signal.swarm_unhealthy',
        timestamp: now,
        agentId: unhealthy.cli,
        reason: unhealthy.reason,
      });
    } catch (error) {
      logger.warn('Failed to emit signal.swarm_unhealthy from failover', {
        error: getErrorMessage(error),
      });
    }
  });
}

/** Release the adapter-failover signal subscription. Idempotent. */
export function shutdownFailoverSignals(): void {
  if (failoverSubscription !== undefined) {
    failoverSubscription.unsubscribe();
    failoverSubscription = undefined;
  }
}

/** Exposed for unit tests: the pure failover-payload → unhealthy-CLI mapping. */
export { unhealthyCliFrom };
