/**
 * nexus-agents/cli-adapters - Gateway health evidence and admission policy
 *
 * First slice of the gateway contract (#4391 increment B).
 *
 * `isCliAvailable` was `health.healthy && auth.state === 'authenticated'` — a
 * boolean that was measured wrong in BOTH directions within one week:
 *
 *   - FALSE NEGATIVE: `agy` served correct answers while `probeGemini` read
 *     `~/.gemini/oauth_creds.json`, a file agy does not use. The arm was
 *     excluded from routing while working (#4346).
 *   - FALSE POSITIVE: the retired `gemini` CLI held a VALID, unexpired
 *     credential file while failing every invocation with `IneligibleTierError`.
 *     The arm was admitted while dead (#4318).
 *
 * The fix is not a better boolean. It is to record WHAT THE PROBE ACTUALLY
 * PROVED, and keep admission policy as a separate pure function over that
 * evidence — so a weak signal is never laundered into a confident verdict.
 *
 * Decided by `consensus_vote` (`higher_order`) at 4/3 — BELOW the supermajority
 * an architecture change requires — so the rejecters' alternative was adopted:
 * a gateway that can only offer `local` evidence reports `unknown` and is
 * admitted optimistically, rather than claiming to be verified.
 *
 * @module cli-adapters/gateway-health
 */

/**
 * What a health probe actually proved, weakest to strongest.
 *
 * The ordering is load-bearing — {@link isAtLeast} compares rungs — so new
 * rungs must be inserted in strength order, not appended.
 */
export const AUTH_EVIDENCE_RUNGS = ['none', 'local', 'service', 'completion'] as const;

/**
 * Evidence rung reached by a health probe.
 *
 * - `none` — nothing was checked, or the gateway offers no probe at all.
 * - `local` — a local artifact exists and parses, or the CLI's own auth-state
 *   command claims success (`codex login status`, `opencode auth list`, a
 *   credential file). **WEAK.** This rung has been measured to produce both a
 *   false negative and a false positive; it proves something about an artifact,
 *   not about the gateway. Never treat a passing `local` check as verification.
 * - `service` — an authenticated call reached the provider and succeeded
 *   (`agy models`, `opencode models`, `GET /v1/models`). Proves the credential
 *   works against the live service, which is what `local` cannot.
 * - `completion` — a real completion returned. The strongest evidence, and the
 *   only rung that proves the gateway can actually serve. Should be harvested
 *   from real traffic via the outcome store rather than synthesized by a probe
 *   that spends tokens to manufacture a signal ordinary calls already produce.
 */
export type AuthEvidence = (typeof AUTH_EVIDENCE_RUNGS)[number];

/**
 * Whether a gateway may be selected.
 *
 * `unknown` is a first-class answer, not a failure. A gateway whose strongest
 * available probe is `local` cannot be verified, and asserting either way would
 * be a guess — so it is admitted optimistically and marked as unverified.
 */
export type Availability = 'available' | 'unavailable' | 'unknown';

/** A single gateway's observed health. Plain data; carries no policy. */
export interface GatewayHealth {
  /** The strongest rung this gateway is CAPABLE of probing. */
  readonly supports: AuthEvidence;
  /** The rung actually reached on the last probe. */
  readonly evidence: AuthEvidence;
  /** Whether the probe at {@link evidence} succeeded. */
  readonly passed: boolean;
  /**
   * Whether the gateway could be contacted at all.
   *
   * Distinct from {@link passed} on purpose: a transient network failure must
   * NOT read as an authentication failure, or a flaky connection marks a
   * working gateway dead — the same false-negative class this module exists to
   * remove.
   */
  readonly reachable: boolean;
  /** Human-readable context. Must never contain credential material. */
  readonly detail?: string;
}

/** Compare evidence rungs by strength. */
export function isAtLeast(evidence: AuthEvidence, floor: AuthEvidence): boolean {
  return AUTH_EVIDENCE_RUNGS.indexOf(evidence) >= AUTH_EVIDENCE_RUNGS.indexOf(floor);
}

/**
 * Decide whether a gateway may be selected, from its observed health.
 *
 * Pure, and deliberately separate from the probes so no gateway's probe code
 * can embed its own admission rule.
 *
 * The policy, in order:
 *
 * 1. **Unreachable → `unknown`.** Transient, not an auth verdict.
 * 2. **Only `local` evidence available → `unknown`.** Regardless of whether the
 *    check passed. A passing local check is not verification, and a FAILING one
 *    is evidence of nothing — agy worked with an expired credential file. This
 *    was the one point every voter agreed on across both sides of the split.
 * 3. **`service` or better, passed → `available`.**
 * 4. **`service` or better, failed → `unavailable`.** The credential was
 *    presented to the live service and rejected. That is a real verdict.
 */
export function resolveAvailability(health: GatewayHealth): Availability {
  if (!health.reachable) return 'unknown';
  if (!isAtLeast(health.supports, 'service')) return 'unknown';
  if (!isAtLeast(health.evidence, 'service')) return 'unknown';
  return health.passed ? 'available' : 'unavailable';
}

/**
 * Whether a gateway should be offered to the router.
 *
 * Admits `unknown` — an unverifiable gateway is given the benefit of the doubt,
 * and real invocation failures (the circuit breaker, #4330) do the excluding.
 * Only a gateway the live service actively rejected is withheld.
 */
export function isSelectable(health: GatewayHealth): boolean {
  return resolveAvailability(health) !== 'unavailable';
}
