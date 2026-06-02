/**
 * TuneAdjustmentStore — the bounded, time-decaying routing-adjustment channel
 * for the self-tuning loop (#3147, epic #3313).
 *
 * The closed-loop Tune stage needs to nudge routing in response to signals
 * (e.g. `signal.swarm_unhealthy` → demote an unhealthy CLI). Per the P2
 * ratifying-vote dissent, that nudge must NOT reuse the LinUCB real-outcome
 * channel — it needs a SEPARATE, provenance-tagged mechanism with hard safety
 * bounds. This store is that mechanism:
 *
 * - **demotion-only** — multipliers are always ≤ 1.0 (we slow a CLI down, never
 *   boost it past its measured performance).
 * - **floored** — never below {@link TUNE_DEMOTION_FLOOR}, so a CLI is never
 *   zeroed out of routing by tuning alone.
 * - **capped** — a single demotion moves at most {@link TUNE_MAX_STEP}.
 * - **time-decaying** — each adjustment decays linearly back to 1.0 over
 *   {@link TUNE_DECAY_WINDOW_MS}, so a transient health blip auto-reverses
 *   (the loop is self-correcting, not a ratchet).
 * - **provenance-tagged** — every adjustment carries a `reason`.
 *
 * The store holds state only; the caller (TuneStage) is responsible for the
 * `NEXUS_TUNE_ENFORCE` gate and for auditing each `demote()` to the durable log.
 * `CompositeRouter` reads `effectiveMultiplier()` to bias candidate scores.
 *
 * @module core/tune-adjustment-store
 */

// @export-no-consumer-yet — see #3147 (keystone step 1: the bounded adjustment
// mechanism lands first; the CompositeRouter read + TuneStage write are the
// immediately-following PRs, careful about TOPSIS scoring blast radius).
import { getTimeProvider } from './time-provider.js';

/** Lowest multiplier tuning can drive a CLI to — never zeroes it out. */
export const TUNE_DEMOTION_FLOOR = 0.5;
/** Maximum demotion applied by a single `demote()` call. */
export const TUNE_MAX_STEP = 0.2;
/** Time over which an adjustment decays linearly back to 1.0. */
export const TUNE_DECAY_WINDOW_MS = 30 * 60_000;

/** An active routing demotion with provenance. */
export interface TuneAdjustment {
  readonly cli: string;
  /** Multiplier at `appliedAt` (in [TUNE_DEMOTION_FLOOR, 1.0]). */
  readonly multiplier: number;
  readonly appliedAt: number;
  readonly reason: string;
}

export class TuneAdjustmentStore {
  private readonly adjustments = new Map<string, TuneAdjustment>();

  /**
   * Apply a bounded demotion to `cli`. `magnitude` is the requested reduction
   * (capped to {@link TUNE_MAX_STEP}); compounds on any current (decayed) value
   * but never below {@link TUNE_DEMOTION_FLOOR}. Non-positive magnitudes are a
   * no-op. Returns the resulting adjustment (or undefined for a no-op).
   */
  demote(cli: string, magnitude: number, reason: string): TuneAdjustment | undefined {
    if (magnitude <= 0) return undefined;
    const step = Math.min(TUNE_MAX_STEP, magnitude);
    const current = this.effectiveMultiplier(cli);
    const next = Math.max(TUNE_DEMOTION_FLOOR, current - step);
    const adjustment: TuneAdjustment = {
      cli,
      multiplier: next,
      appliedAt: getTimeProvider().now(),
      reason,
    };
    this.adjustments.set(cli, adjustment);
    return adjustment;
  }

  /**
   * Current effective multiplier for `cli` — the stored multiplier decayed
   * linearly back toward 1.0 over {@link TUNE_DECAY_WINDOW_MS}. Returns 1.0
   * (no effect) when there is no active adjustment. Fully-decayed entries are
   * evicted lazily.
   */
  effectiveMultiplier(cli: string): number {
    const adjustment = this.adjustments.get(cli);
    if (adjustment === undefined) return 1.0;
    const elapsed = getTimeProvider().now() - adjustment.appliedAt;
    if (elapsed >= TUNE_DECAY_WINDOW_MS || elapsed < 0) {
      this.adjustments.delete(cli);
      return 1.0;
    }
    const decayFraction = elapsed / TUNE_DECAY_WINDOW_MS;
    return adjustment.multiplier + (1.0 - adjustment.multiplier) * decayFraction;
  }

  /** Snapshot of active (non-evicted) adjustments — for observability/audit. */
  list(): readonly TuneAdjustment[] {
    return [...this.adjustments.values()];
  }

  /** Remove all adjustments. */
  clear(): void {
    this.adjustments.clear();
  }
}

let singleton: TuneAdjustmentStore | undefined;

/** Process-wide TuneAdjustmentStore (lazily created). */
export function getTuneAdjustmentStore(): TuneAdjustmentStore {
  singleton ??= new TuneAdjustmentStore();
  return singleton;
}

/** Reset the singleton (tests). */
export function resetTuneAdjustmentStore(): void {
  singleton = undefined;
}
