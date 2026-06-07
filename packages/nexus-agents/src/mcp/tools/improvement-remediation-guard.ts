/**
 * Runaway-loop guard for auto-remediation (#3540 increment 2g / #3617).
 *
 * Condition 6 of the auto-invoke gate. An auto-remediation PR perturbs the
 * codebase → fitness/outcome metrics shift → improvement_review emits a NEW
 * signal → which would trigger another remediation → … a recursive self-trigger
 * loop. This guard makes that impossible by bounding three independent axes,
 * fail-closed (any breach blocks):
 *
 *  1. **Idempotency + cooldown** — the SAME source signal (by `signalKey`)
 *     cannot trigger again within `cooldownMs`. This directly breaks the common
 *     case where a remediation re-perturbs the same metric and the same signal
 *     (e.g. `tech-debt:fitness-below-floor`) re-fires immediately.
 *  2. **Depth/generation** — a remediation triggered as a descendant of another
 *     remediation carries a `generation` ≥ 1; the chain is capped at
 *     `maxGenerations`, so a cascade across DIFFERENT signal keys still can't
 *     recurse without bound.
 *  3. **Rate cap** — at most `maxPerWindow` attempts per `windowMs` across all
 *     signals (mirrors improvement_review's MAX_ISSUES_PER_RUN = 5), bounding
 *     total volume even when individual cooldowns/depths are satisfied.
 *
 * Pure + in-memory + bounded. The shadow path (#3611) can consult it to record
 * "would-block" decisions; the enforce path (#3618) enforces it before routing
 * anything to the dev-pipeline. Nothing here executes a remediation.
 *
 * @module mcp/tools/improvement-remediation-guard
 */

// @export-no-consumer-yet — see #3618
// This guard is one of the hard-blocker safety primitives the enforce capstone
// (#3618) is explicitly "blocked by"; it is consumed there once all of
// inc.2b–inc.2g have landed. Built ahead deliberately (named near-term consumer).

/** Tuning for {@link RemediationGuard}. All durations in milliseconds. */
export interface RemediationGuardConfig {
  /** Minimum time before the same signalKey may be attempted again (idempotency). */
  readonly cooldownMs: number;
  /** Maximum remediation-chain depth (0 = root; a descendant is 1, etc.). */
  readonly maxGenerations: number;
  /** Maximum attempts allowed within {@link windowMs} across all signals. */
  readonly maxPerWindow: number;
  /** Sliding window for the rate cap. */
  readonly windowMs: number;
  /** Cap on retained attempt history (memory bound). */
  readonly maxHistory: number;
}

/** Conservative defaults — biased toward NOT remediating (fail-closed). */
export const DEFAULT_REMEDIATION_GUARD_CONFIG: RemediationGuardConfig = {
  cooldownMs: 6 * 60 * 60 * 1000, // 6h between attempts on the same signal
  maxGenerations: 1, // a remediation may not spawn a remediation that spawns another
  maxPerWindow: 5, // mirror MAX_ISSUES_PER_RUN
  windowMs: 24 * 60 * 60 * 1000, // per day
  maxHistory: 500,
};

/** One recorded remediation attempt. */
export interface RemediationAttempt {
  readonly signalKey: string;
  readonly timestamp: number;
  readonly generation: number;
}

/** Why the guard allowed or blocked a remediation. */
export type GuardBlockReason = 'cooldown' | 'depth' | 'rate';

/** The guard's verdict for one prospective remediation. */
export interface GuardDecision {
  readonly allowed: boolean;
  /** Set when `allowed` is false. */
  readonly blockReason?: GuardBlockReason;
  readonly detail: string;
}

/**
 * Stateful, in-memory runaway guard. One instance per loop; the enforce path
 * holds the process singleton (see {@link getRemediationGuard}).
 */
export class RemediationGuard {
  private readonly config: RemediationGuardConfig;
  private readonly attempts: RemediationAttempt[] = [];

  constructor(config: Partial<RemediationGuardConfig> = {}) {
    this.config = { ...DEFAULT_REMEDIATION_GUARD_CONFIG, ...config };
  }

  /**
   * Decide whether a remediation for `signalKey` at `generation` may proceed at
   * time `now`. Pure read — does not record the attempt (call
   * {@link recordAttempt} only when the remediation actually proceeds).
   */
  canRemediate(signalKey: string, now: number, generation = 0): GuardDecision {
    if (generation > this.config.maxGenerations) {
      return {
        allowed: false,
        blockReason: 'depth',
        detail: `generation ${String(generation)} exceeds maxGenerations ${String(this.config.maxGenerations)} (runaway chain)`,
      };
    }
    const last = this.lastAttempt(signalKey);
    if (last !== undefined && now - last.timestamp < this.config.cooldownMs) {
      const waitMs = this.config.cooldownMs - (now - last.timestamp);
      return {
        allowed: false,
        blockReason: 'cooldown',
        detail: `signal '${signalKey}' attempted ${String(Math.round((now - last.timestamp) / 1000))}s ago; cooldown ${String(Math.round(this.config.cooldownMs / 1000))}s (wait ${String(Math.round(waitMs / 1000))}s)`,
      };
    }
    const inWindow = this.countInWindow(now);
    if (inWindow >= this.config.maxPerWindow) {
      return {
        allowed: false,
        blockReason: 'rate',
        detail: `${String(inWindow)} attempts in the last ${String(Math.round(this.config.windowMs / 1000))}s reaches the cap of ${String(this.config.maxPerWindow)}`,
      };
    }
    return { allowed: true, detail: 'within cooldown, depth, and rate bounds' };
  }

  /** Record that a remediation proceeded. Bounded history (oldest evicted). */
  recordAttempt(signalKey: string, now: number, generation = 0): void {
    this.attempts.push({ signalKey, timestamp: now, generation });
    if (this.attempts.length > this.config.maxHistory) {
      this.attempts.splice(0, this.attempts.length - this.config.maxHistory);
    }
  }

  /** Most-recent attempt for a signalKey, if any. */
  private lastAttempt(signalKey: string): RemediationAttempt | undefined {
    let found: RemediationAttempt | undefined;
    for (const a of this.attempts) {
      if (a.signalKey === signalKey && (found === undefined || a.timestamp > found.timestamp)) {
        found = a;
      }
    }
    return found;
  }

  /** Number of attempts within the rate window ending at `now`. */
  private countInWindow(now: number): number {
    const cutoff = now - this.config.windowMs;
    return this.attempts.reduce((n, a) => (a.timestamp >= cutoff ? n + 1 : n), 0);
  }
}

let singletonGuard: RemediationGuard | undefined;

/** Process-scoped runaway guard — shared across remediation runs. */
export function getRemediationGuard(): RemediationGuard {
  singletonGuard ??= new RemediationGuard();
  return singletonGuard;
}
