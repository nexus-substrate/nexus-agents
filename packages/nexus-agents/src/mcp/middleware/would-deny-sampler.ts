/**
 * Occurrence sampling for warn-mode policy near-misses (#5228 review).
 *
 * #4991 made a warn-mode near-miss durable, which is what #4988's enforce
 * decision needs to read. The review panel's dissent named the cost: in enforce
 * mode a denial halts the call, which self-limits a looping agent, but in warn
 * mode the call proceeds — so an agent repeatedly tripping the same rule emits
 * one chain record per iteration, without bound.
 *
 * The naive remedies both fail. Suppressing silently reproduces the original
 * defect: the chain would again under-report what happened. Time-windowing
 * loses the trailing count — a loop that fires ten thousand times and then
 * stops leaves its final window unreported, because the emit that would have
 * carried the count never comes.
 *
 * So this samples on OCCURRENCE, not on time: emit the 1st, 2nd, 4th, 8th …
 * of each `{tool, rule}` pair. Three properties follow, and each is the reason
 * a simpler scheme was rejected:
 *
 * 1. **The first is always recorded.** A near-miss is never invisible, which is
 *    the property #4991 exists to provide.
 * 2. **Growth is logarithmic.** Ten thousand occurrences produce fourteen
 *    records rather than ten thousand.
 * 3. **No trailing loss.** Every emitted record carries its own ordinal, so the
 *    last one written establishes "this fired at least N times" without needing
 *    a later flush. Stopping mid-window costs nothing.
 *
 * Pure and synchronous apart from the counter it owns: no clock, no I/O. Time
 * plays no part, which is what removes the trailing-count problem.
 *
 * @module mcp/middleware/would-deny-sampler
 */

/**
 * Distinct `{tool, rule}` pairs tracked before the counter map is cleared.
 *
 * A dedup that grows without bound would move the problem rather than solve it.
 * The reset is deliberately crude — clear and start over — because the ordinals
 * it produces are a floor ("at least N"), not an exact tally, so restarting
 * understates rather than fabricating. A cap this size is far above any real
 * rule set; reaching it means something is generating synthetic tool names,
 * which is itself worth seeing in the log.
 */
export const MAX_TRACKED_PAIRS = 500;

/** Per-pair occurrence counts. Module state, reset by {@link resetWouldDenySampler}. */
const occurrences = new Map<string, number>();

/** The key a near-miss is deduped on. */
function pairKey(toolName: string, ruleName: string | undefined): string {
  return `${toolName}::${ruleName ?? '(unnamed rule)'}`;
}

/** True for 1, 2, 4, 8, 16 … — one bit set. */
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** What the caller should do with this occurrence. */
export interface WouldDenySample {
  /** Whether to write a durable audit record for it. */
  readonly emit: boolean;
  /** Which occurrence of this `{tool, rule}` pair it is, 1-based. */
  readonly occurrence: number;
}

/**
 * Record one warn-mode near-miss and decide whether it is written.
 *
 * Call ONLY for `would_deny`. A real `deny` must never be sampled: it halts the
 * call, so it is already self-limiting, and dropping one would lose a record of
 * an action that was actually blocked.
 */
export function sampleWouldDeny(toolName: string, ruleName: string | undefined): WouldDenySample {
  if (occurrences.size >= MAX_TRACKED_PAIRS) occurrences.clear();

  const key = pairKey(toolName, ruleName);
  const occurrence = (occurrences.get(key) ?? 0) + 1;
  occurrences.set(key, occurrence);

  return { emit: isPowerOfTwo(occurrence), occurrence };
}

/**
 * Phrase the ordinal for the audit record's `reason`.
 *
 * Deliberately written into `reason` rather than added as a schema field: the
 * count is prose a reader needs, and widening the audit record again would be a
 * second breaking change for something an existing field already carries.
 *
 * The first occurrence says nothing extra — there is no suppression to disclose
 * yet, and annotating it would make the common case noisier for no information.
 */
export function describeOccurrence(occurrence: number): string {
  if (occurrence <= 1) return '';
  return ` (occurrence ${String(occurrence)}; intermediate occurrences of this rule were sampled out)`;
}

/** Clears the counters. Test-only seam; production never resets mid-process. */
export function resetWouldDenySampler(): void {
  occurrences.clear();
}
