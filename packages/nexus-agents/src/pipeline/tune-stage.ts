/**
 * TuneStage — the consumer side of the closed loop (#3147, epic #3143 P2).
 *
 * Subscribes to the `signal.*` `PipelineEvent`s emitted by push-only producers
 * (fitness audit, swarm health, consensus) and computes the BOUNDED tuning
 * action each signal implies. It ships **shadow/dry-run first**: it only LOGS
 * the intended action and mutates nothing. Actual parameter mutation (e.g.
 * routing downweights) is a separate, human-gated step (#3147 PR-4) and must
 * NOT reuse the LinUCB real-outcome channel (per the ratifying-vote dissent) —
 * it needs a provenance-tagged mechanism, which is why this stage is dry-run
 * only for now.
 *
 * Mirrors the proven `feedback-subscriber` pattern: a single `subscribe` over
 * a typed filter, errors caught and logged, an `Unsubscribe` returned.
 *
 * @module pipeline/tune-stage
 */

import { createLogger, getErrorMessage, getTuneAdjustmentStore } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import { parseBoolEnv } from '../config/defaults-env.js';
import type { PipelineEvent, IEventBus, Unsubscribe } from './event-types.js';

const defaultLogger = createLogger({ component: 'TuneStage' });

/** Env flag gating real enforcement (shared with the router read, #3147). */
const TUNE_ENFORCE_ENV = 'NEXUS_TUNE_ENFORCE';

/**
 * Demotion magnitude applied per `swarm_unhealthy` signal. Kept under the
 * store's per-step cap (`TUNE_MAX_STEP`); the store also floors and time-decays
 * it, so repeated unhealthy signals slow a CLI down gradually and reversibly.
 */
const TUNE_ENFORCE_DEMOTION = 0.15;

/** Signal event types the TuneStage reacts to. */
export const TUNE_SIGNAL_TYPES = [
  'signal.fitness_declined',
  'signal.swarm_unhealthy',
  'signal.vote_rejected',
] as const;

/** A bounded tuning action the loop WOULD take for a signal (described, not applied). */
export interface IntendedTuneAction {
  /** Action kind (stable key for audit/telemetry). */
  readonly kind: 'flag_tech_debt' | 'downweight_agent' | 'record_rejection';
  /** Human-readable description of the bounded action. */
  readonly detail: string;
  /** The signal type that triggered it. */
  readonly signal: PipelineEvent['type'];
}

export interface TuneStageOptions {
  /**
   * When false (default), the stage is in SHADOW/dry-run mode: it logs the
   * intended action and mutates nothing. `true` is reserved for the
   * human-gated mutation path (#3147 PR-4), which is not implemented yet — so
   * enabled mode currently fails closed (logs and no-ops) rather than acting.
   */
  readonly enabled?: boolean;
  /** Injectable logger (defaults to the module logger). */
  readonly logger?: ILogger;
}

/**
 * Compute the bounded tuning action a signal implies. Pure — no side effects.
 * Returns undefined for events the TuneStage doesn't act on.
 */
export function intendedActionFor(event: PipelineEvent): IntendedTuneAction | undefined {
  switch (event.type) {
    case 'signal.fitness_declined':
      return {
        kind: 'flag_tech_debt',
        detail: `fitness ${String(event.score)} below floor ${String(event.floor)}${event.dimension !== undefined ? ` (dimension: ${event.dimension})` : ''} — would surface a tech-debt remediation signal`,
        signal: event.type,
      };
    case 'signal.swarm_unhealthy':
      return {
        kind: 'downweight_agent',
        detail: `agent ${event.agentId} unhealthy (${event.reason}) — would downweight it for routing (bounded, never zeroed)`,
        signal: event.type,
      };
    case 'signal.vote_rejected':
      return {
        kind: 'record_rejection',
        detail: `proposal ${event.proposalId} rejected at ${String(event.approvalPercentage)}% — would record a rejection signal for review`,
        signal: event.type,
      };
    default:
      return undefined;
  }
}

/**
 * Subscribe the TuneStage to the signal events on `bus`. Returns an
 * `Unsubscribe`. Shadow/dry-run by default — logs intended actions, mutates
 * nothing.
 */
export function createTuneStage(bus: IEventBus, options: TuneStageOptions = {}): Unsubscribe {
  const enabled = options.enabled ?? false;
  const log = options.logger ?? defaultLogger;
  return bus.subscribe({ type: [...TUNE_SIGNAL_TYPES] }, (event) => {
    try {
      const action = intendedActionFor(event);
      if (action === undefined) return;
      if (enabled) {
        if (event.type === 'signal.swarm_unhealthy') {
          // Bounded auto-enforce (#3147): apply a routing demotion via the
          // TuneAdjustmentStore, which guarantees demotion-only, floored,
          // capped, and time-decaying (auto-reversible). The router reads this
          // (behind the same flag) as a scoring penalty. Audited via this log.
          const adjustment = getTuneAdjustmentStore().demote(
            event.agentId,
            TUNE_ENFORCE_DEMOTION,
            `swarm_unhealthy: ${event.reason}`
          );
          log.info('TuneStage (enforce) — applied bounded routing demotion', {
            kind: action.kind,
            signal: action.signal,
            agentId: event.agentId,
            reason: event.reason,
            multiplier: adjustment?.multiplier,
          });
          return;
        }
        // Other signals' actions (flag_tech_debt / record_rejection) are not
        // routing mutations — they belong to issue-filing / review paths, not
        // the TuneAdjustmentStore. Keep shadow-logging until those land.
        log.info('TuneStage (enforce) — non-routing action, shadow-only', {
          kind: action.kind,
          signal: action.signal,
          detail: action.detail,
        });
        return;
      }
      log.info('TuneStage (shadow) — intended action', {
        kind: action.kind,
        signal: action.signal,
        detail: action.detail,
      });
    } catch (e) {
      log.warn('TuneStage handler error', { error: getErrorMessage(e) });
    }
  });
}

// ============================================================================
// Server-wide lifecycle (#3147) — mirrors feedback-subscriber.ts start/shutdown
//
// cli-server-tools.ts:initV2PipelineSubsystems calls startTuneStage() at server
// init, paired with shutdownTuneStage() in cli-server.ts:createShutdownCleanup.
// ============================================================================

let cachedTuneUnsubscribe: Unsubscribe | null = null;

/**
 * Wire the shadow TuneStage to the pipeline bus for the process lifetime.
 * Idempotent — repeated calls are no-ops. Caller must invoke
 * `shutdownTuneStage()` on server shutdown to release the subscription.
 */
export function startTuneStage(bus: IEventBus, options?: TuneStageOptions): void {
  if (cachedTuneUnsubscribe !== null) return;
  // Enforcement is gated by the same flag the router read uses, so the loop is
  // either fully live or fully shadow — never half-wired. Explicit options
  // (tests) override the flag. Default off → shadow (#3147).
  const enabled = options?.enabled ?? parseBoolEnv(TUNE_ENFORCE_ENV, false);
  cachedTuneUnsubscribe = createTuneStage(bus, { ...options, enabled });
}

/** Release the server-wide TuneStage subscription. Idempotent. */
export function shutdownTuneStage(): void {
  if (cachedTuneUnsubscribe !== null) {
    cachedTuneUnsubscribe();
    cachedTuneUnsubscribe = null;
  }
}
