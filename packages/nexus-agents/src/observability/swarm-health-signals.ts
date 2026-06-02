/**
 * SwarmObserver → pipeline-bus signal producer (#3223, epic #3143 P2).
 *
 * Closes the long-standing observability→routing gap: the SwarmObserver
 * collected rich agent-health metrics (bottlenecks, error agents, success rate)
 * that were write-only for dashboards and never fed back into routing. This
 * module polls the observer's health metrics and emits `signal.swarm_unhealthy`
 * onto the typed pipeline event bus for CLI-attributable bottlenecks. The
 * (shadow-by-default) TuneStage consumes the signal and — when
 * `NEXUS_TUNE_ENFORCE` is set — applies a bounded, decaying routing demotion via
 * the TuneAdjustmentStore. This is the final producer that makes the closed
 * loop fire end-to-end.
 *
 * Lives at the observability layer and PUSHES to bus A on a timer, mirroring the
 * `consensus-vote-signals` / `improvement-review-signals` producers: the
 * SwarmObserver stays decoupled from the pipeline bus, preserving the
 * `A = observability / B = messaging` boundary (#3289 scope Option 2).
 *
 * Attribution is deliberately conservative: a bottleneck only produces a signal
 * when its `agentId` confidently resolves to one of the four canonical CLI slots
 * (a CLI-name literal, or a curated model id). Arbitrary agent identifiers
 * (role names, trace ids, voter ids) are skipped with a debug log rather than
 * mis-attributed to the `opencode` catch-all — demoting the wrong CLI is worse
 * than not demoting at all. Broader agent→CLI attribution is tracked separately.
 *
 * @module observability/swarm-health-signals
 */

import { createLogger, getErrorMessage } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';
import type { CliNameLiteral, ModelId } from '../config/model-capabilities-types.js';
import { getCliForModelId } from '../config/model-availability.js';
import type { IEventBus } from '../pipeline/event-types.js';
import type { ISwarmObserver, SwarmHealthMetrics } from './swarm-observer-types.js';

const defaultLogger = createLogger({ component: 'SwarmHealthSignals' });

/** Bottleneck severities severe enough to warrant a routing signal. */
const SEVERE_BOTTLENECK = new Set<string>(['high', 'critical']);

/** Default poll interval for health → signal emission. */
const DEFAULT_HEALTH_SIGNAL_INTERVAL_MS = 60_000;

const CLI_NAME_SET = new Set<string>(CLI_NAMES);

/**
 * Resolve an arbitrary SwarmObserver `agentId` to a canonical CLI slot, but
 * ONLY when the mapping is confident: the id is already a CLI-name literal, or
 * it is a curated model id. Returns undefined for anything else — we never guess
 * a slot for a role name / trace id, which would mis-attribute the demotion.
 */
export function confidentCliSlot(agentId: string): CliNameLiteral | undefined {
  if (CLI_NAME_SET.has(agentId)) return agentId as CliNameLiteral;
  return getCliForModelId(agentId as ModelId);
}

/**
 * Emit `signal.swarm_unhealthy` for each CLI-attributable severe bottleneck in
 * `metrics`. At most one signal per CLI slot per call (deduped). Non-attributable
 * bottlenecks are skipped with a debug log. Returns the number of signals
 * emitted. Emission errors are swallowed and logged — observability signalling
 * must never break the caller.
 */
export function emitSwarmUnhealthySignals(
  metrics: SwarmHealthMetrics,
  bus: IEventBus,
  logger: ILogger = defaultLogger
): number {
  const emittedSlots = new Set<CliNameLiteral>();
  try {
    for (const bottleneck of metrics.bottlenecks) {
      if (!SEVERE_BOTTLENECK.has(bottleneck.severity)) continue;

      const slot = confidentCliSlot(bottleneck.agentId);
      if (slot === undefined) {
        logger.debug('Skipping non-CLI-attributable bottleneck', {
          agentId: bottleneck.agentId,
          severity: bottleneck.severity,
        });
        continue;
      }
      if (emittedSlots.has(slot)) continue;
      emittedSlots.add(slot);

      bus.emit({
        type: 'signal.swarm_unhealthy',
        timestamp: Date.parse(metrics.calculatedAt),
        agentId: slot,
        reason: `bottleneck: ${String(bottleneck.queuedMessages)} queued, ${String(bottleneck.blockedAgents)} blocked (severity ${bottleneck.severity})`,
      });
    }
  } catch (error) {
    logger.warn('Failed to emit signal.swarm_unhealthy', { error: getErrorMessage(error) });
  }
  return emittedSlots.size;
}

// ============================================================================
// Server-wide lifecycle (#3223) — mirrors tune-stage.ts start/shutdown.
//
// cli-server-tools.ts:initV2PipelineSubsystems calls startSwarmHealthSignals()
// at server init (paired with the TuneStage consumer), and cli-server.ts:
// createShutdownCleanup calls shutdownSwarmHealthSignals().
// ============================================================================

export interface SwarmHealthSignalsOptions {
  /** Poll interval in ms. Default 60_000. */
  readonly intervalMs?: number;
  /** Injectable logger. */
  readonly logger?: ILogger;
}

let healthSignalTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Poll the SwarmObserver's health metrics on an interval and emit
 * `signal.swarm_unhealthy` for CLI-attributable bottlenecks. Idempotent —
 * repeated calls are no-ops while a timer is active. Caller must invoke
 * `shutdownSwarmHealthSignals()` on server shutdown to release the timer.
 */
export function startSwarmHealthSignals(
  observer: ISwarmObserver,
  bus: IEventBus,
  options?: SwarmHealthSignalsOptions
): void {
  if (healthSignalTimer !== undefined) return;
  const logger = options?.logger ?? defaultLogger;
  const intervalMs = options?.intervalMs ?? DEFAULT_HEALTH_SIGNAL_INTERVAL_MS;
  healthSignalTimer = setInterval(() => {
    try {
      emitSwarmUnhealthySignals(observer.getHealthMetrics(), bus, logger);
    } catch (error) {
      logger.debug('Swarm health poll failed', { error: getErrorMessage(error) });
    }
  }, intervalMs);
  // Do not keep the process alive solely for the health poll.
  healthSignalTimer.unref();
}

/** Release the server-wide swarm-health signal timer. Idempotent. */
export function shutdownSwarmHealthSignals(): void {
  if (healthSignalTimer !== undefined) {
    clearInterval(healthSignalTimer);
    healthSignalTimer = undefined;
  }
}
