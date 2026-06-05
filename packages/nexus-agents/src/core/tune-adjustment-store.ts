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

/** Why an active adjustment was reversed (cleared back toward 1.0). */
export type TuneReversalCause =
  /** The decay window elapsed; routing restored to 1.0 (auto-reversible blip). */
  | 'decay_expiry'
  /** A fresh demotion overwrote the prior active adjustment for this CLI. */
  | 'superseded';

/**
 * Notification that an active routing adjustment for `cli` was reversed (#3323).
 * Emitted when a fully-decayed adjustment is evicted (`decay_expiry`) or when a
 * new demotion overwrites a still-active one (`superseded`). Carries enough to
 * reconstruct the routing-state change for the immutable audit chain: the CLI,
 * the multiplier in effect just before reversal, the value routing is restored
 * to, and the reason the reversed adjustment carried.
 */
export interface TuneReversal {
  readonly cli: string;
  readonly cause: TuneReversalCause;
  /** Multiplier the reversed adjustment was holding at reversal time. */
  readonly previousMultiplier: number;
  /** Multiplier routing returns to after reversal (1.0 for decay_expiry). */
  readonly restoredMultiplier: number;
  /** Provenance reason the reversed adjustment carried. */
  readonly reason: string;
  readonly reversedAt: number;
}

/** Listener invoked when an active adjustment is reversed. */
export type TuneReversalListener = (reversal: TuneReversal) => void;

/** Max length of a stat's retained reason string (#3323 telemetry). */
const STAT_REASON_MAX = 512;

/**
 * Cumulative per-CLI demotion telemetry (#3323) — survives decay/eviction so a
 * shadow soak can show what the loop is (or WOULD be) doing before the loop is
 * enabled by default. `applied` counts demotions that actually biased routing
 * (enforce mode); `intended` counts demotions the loop WOULD have applied while
 * shadow (enforcement off) — recorded WITHOUT touching routing.
 */
export interface TuneDemotionStat {
  readonly cli: string;
  readonly applied: number;
  readonly intended: number;
  /** Most recent reason recorded (capped to {@link STAT_REASON_MAX}). */
  readonly lastReason: string;
  /** Timestamp of the most recent record (applied or intended). */
  readonly lastAt: number;
}

interface MutableDemotionStat {
  cli: string;
  applied: number;
  intended: number;
  lastReason: string;
  lastAt: number;
}

export class TuneAdjustmentStore {
  private readonly adjustments = new Map<string, TuneAdjustment>();
  /** Cumulative telemetry — never evicted (bounded by CLI cardinality). */
  private readonly stats = new Map<string, MutableDemotionStat>();
  /**
   * Optional reversal listener (#3323). The store stays state-only — it does
   * NOT know about the audit chain. The caller (TuneStage) registers a listener
   * that appends a `tune.reversal` record to the immutable log, so a routing
   * restore is durably audited just like the demotion that preceded it. A
   * throwing listener never corrupts store state (errors are swallowed).
   */
  private reversalListener: TuneReversalListener | undefined;

  /**
   * Register (or clear, with `undefined`) the reversal listener. Replaces any
   * prior listener — a single sink, mirroring the singleton-store pattern.
   */
  onReversal(listener: TuneReversalListener | undefined): void {
    this.reversalListener = listener;
  }

  /** Best-effort fire of the reversal listener — a throwing sink is swallowed. */
  private emitReversal(reversal: TuneReversal): void {
    if (this.reversalListener === undefined) return;
    try {
      this.reversalListener(reversal);
    } catch {
      // Auditing is observability, not a gate (#3323): a failed reversal append
      // must never corrupt routing state or throw out of effectiveMultiplier
      // (a hot router-read path). The reversal has already taken effect.
    }
  }

  /** Increment a CLI's cumulative demotion counter. Pure telemetry. */
  private bumpStat(cli: string, kind: 'applied' | 'intended', reason: string): void {
    let stat = this.stats.get(cli);
    if (stat === undefined) {
      stat = { cli, applied: 0, intended: 0, lastReason: '', lastAt: 0 };
      this.stats.set(cli, stat);
    }
    stat[kind] += 1;
    stat.lastReason = reason.length > STAT_REASON_MAX ? reason.slice(0, STAT_REASON_MAX) : reason;
    stat.lastAt = getTimeProvider().now();
  }

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
    // If a still-active (not-yet-decayed) adjustment exists, the new demotion
    // supersedes it — audit that reversal before overwriting (#3323).
    const prior = this.adjustments.get(cli);
    const next = Math.max(TUNE_DEMOTION_FLOOR, current - step);
    const now = getTimeProvider().now();
    const adjustment: TuneAdjustment = {
      cli,
      multiplier: next,
      appliedAt: now,
      reason,
    };
    this.adjustments.set(cli, adjustment);
    this.bumpStat(cli, 'applied', reason);
    if (prior !== undefined) {
      this.emitReversal({
        cli,
        cause: 'superseded',
        previousMultiplier: current,
        restoredMultiplier: next,
        reason: prior.reason,
        reversedAt: now,
      });
    }
    return adjustment;
  }

  /**
   * Record a demotion the loop WOULD have applied, for shadow-soak telemetry
   * (#3323) — increments the `intended` counter ONLY and does NOT touch the
   * routing adjustments. Lets an operator observe what enabling the loop would
   * do (via {@link demotionStats}) while `effectiveMultiplier` stays 1.0 and
   * routing is untouched. Non-empty `reason` required; otherwise a no-op.
   */
  recordIntended(cli: string, reason: string): void {
    if (reason === '') return;
    this.bumpStat(cli, 'intended', reason);
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
    const now = getTimeProvider().now();
    const elapsed = now - adjustment.appliedAt;
    if (elapsed >= TUNE_DECAY_WINDOW_MS || elapsed < 0) {
      this.adjustments.delete(cli);
      // The adjustment has fully decayed — routing is restored to 1.0. Audit
      // this reversal so the full lifecycle (demote → decay/expiry) is durable
      // and reconstructable from the immutable chain (#3323).
      this.emitReversal({
        cli,
        cause: 'decay_expiry',
        previousMultiplier: adjustment.multiplier,
        restoredMultiplier: 1.0,
        reason: adjustment.reason,
        reversedAt: now,
      });
      return 1.0;
    }
    const decayFraction = elapsed / TUNE_DECAY_WINDOW_MS;
    return adjustment.multiplier + (1.0 - adjustment.multiplier) * decayFraction;
  }

  /** Snapshot of active (non-evicted) adjustments — for observability/audit. */
  list(): readonly TuneAdjustment[] {
    return [...this.adjustments.values()];
  }

  /**
   * Cumulative demotion telemetry per CLI (#3323) — survives decay, so a shadow
   * soak shows how often each CLI is (or would be) demoted. Read-only snapshot.
   */
  demotionStats(): readonly TuneDemotionStat[] {
    // Sorted by CLI for deterministic output (stable health table/JSON + tests).
    return [...this.stats.values()]
      .map((s) => ({ ...s }))
      .sort((a, b) => a.cli.localeCompare(b.cli));
  }

  /** Remove all adjustments and telemetry. */
  clear(): void {
    this.adjustments.clear();
    this.stats.clear();
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
