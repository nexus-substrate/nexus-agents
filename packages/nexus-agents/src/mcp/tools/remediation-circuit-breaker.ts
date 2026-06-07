/**
 * Circuit-breaker for autonomous remediation (#3540 phase 3 / #3653).
 *
 * Consensus-vote condition 3: rate caps + the runaway guard bound *volume* and
 * *recursion*, but not *sustained wrongness*. If a degraded selector or a drifted
 * adapter keeps producing remediations that get rejected or fail, the loop would
 * burn its rate budget every run and flood reviewers. This breaker trips to OFF
 * after K consecutive rejected/failed remediations; a success resets the streak.
 *
 * Once tripped, the enforce path must refuse to run (auto-revert to off), file a
 * p1 issue, and require a consensus RE-VOTE to re-enable — which calls
 * {@link RemediationCircuitBreaker.reset}. The breaker itself only tracks the
 * streak + tripped state; the entry point wires the file-p1 + re-vote-to-reset.
 *
 * Pure + in-memory; process singleton via {@link getRemediationCircuitBreaker}.
 *
 * @module mcp/tools/remediation-circuit-breaker
 */

// @export-no-consumer-yet — see #3648
// Consulted by the enforce entry point (#3648): abort if tripped, record each
// remediation's result, and reset only after a re-vote. Built ahead for it.

/** Tuning for the breaker. */
export interface CircuitBreakerConfig {
  /** Consecutive failures before the breaker trips to off. */
  readonly threshold: number;
}

/** Conservative default — trip after 3 consecutive failures (mirrors the 3x-wedge rule). */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = { threshold: 3 };

/** A remediation's terminal result for breaker accounting. */
export type RemediationResult = 'success' | 'failure';

/** Observable breaker state. */
export interface CircuitBreakerState {
  readonly tripped: boolean;
  readonly consecutiveFailures: number;
  readonly threshold: number;
}

/**
 * Trips OFF after `threshold` consecutive failures; a success resets the streak.
 * Failure = a rejected consensus vote OR a failed/failed-to-merge remediation.
 */
export class RemediationCircuitBreaker {
  private readonly threshold: number;
  private consecutiveFailures = 0;
  private tripped = false;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.threshold = config.threshold ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.threshold;
  }

  /** A remediation succeeded — clears the failure streak (does NOT un-trip). */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  /** A remediation was rejected/failed — trips once the streak reaches the threshold. */
  recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.threshold) this.tripped = true;
  }

  /** Record by result (convenience). */
  record(result: RemediationResult): void {
    if (result === 'success') this.recordSuccess();
    else this.recordFailure();
  }

  /** True once the breaker has tripped — the enforce path must auto-revert to off. */
  isTripped(): boolean {
    return this.tripped;
  }

  /** Re-enable after a consensus re-vote. Clears the trip and the streak. */
  reset(): void {
    this.tripped = false;
    this.consecutiveFailures = 0;
  }

  /** Snapshot for audit/telemetry. */
  state(): CircuitBreakerState {
    return {
      tripped: this.tripped,
      consecutiveFailures: this.consecutiveFailures,
      threshold: this.threshold,
    };
  }
}

let singleton: RemediationCircuitBreaker | undefined;

/** Process-scoped breaker — shared across remediation runs. */
export function getRemediationCircuitBreaker(): RemediationCircuitBreaker {
  singleton ??= new RemediationCircuitBreaker();
  return singleton;
}
