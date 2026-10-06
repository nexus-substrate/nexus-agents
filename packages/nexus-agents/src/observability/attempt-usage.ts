/**
 * attempt-usage — token usage observed across EVERY outer completion of a
 * voter seat (#6821).
 *
 * A seat's legacy token fields describe only the completion whose answer was
 * kept. The transport bills every completion that returned a response: one
 * whose output failed to parse as a vote, an earlier retry attempt, the first
 * pass of a seat the per-role retry replaced (#5578), and the primary of a
 * seat that fell over to another CLI (#3587). Those were discarded, so a seat
 * that answered on its third try recorded one try's tokens as its measurement.
 *
 * Scope, stated so the figure is not over-read: only OUTER completions that
 * settled with a response are counted. An adapter error, a timeout, a
 * completion still in flight when the panel deadline fired, and any retry
 * inside an adapter are not observed here — their usage is unknown, not zero.
 *
 * Empty cases, named:
 *  - no completion settled ⇒ no {@link AttemptUsage} at all (`undefined`),
 *    never a zero record;
 *  - completions settled but none reported a counter ⇒ that counter is absent,
 *    never 0;
 *  - some completions reported and some did not ⇒ `reportedCompletions <
 *    completions`, and the counters are a LOWER BOUND.
 *
 * @module observability/attempt-usage
 */

import { z } from 'zod';

/** Seat-level usage summed over every outer completion that settled (#6821). */
export interface AttemptUsage {
  /** Outer completions that returned a response. Always ≥ 1 on a record. */
  readonly completions: number;
  /**
   * Of {@link completions}, how many reported BOTH input and output counts.
   * Fewer than `completions` ⇒ the counters below are a lower bound.
   */
  readonly reportedCompletions: number;
  /** Sum over the completions that reported it; absent when none did. */
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly cachedInputTokens?: number | undefined;
  readonly cacheCreationInputTokens?: number | undefined;
}

type CounterKey = 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheCreationInputTokens';

/** One completion's reported counters — structurally the voter's `VoteUsage`. */
export type CompletionCounters = Readonly<Pick<AttemptUsage, CounterKey>>;

const COUNTER_KEYS: readonly CounterKey[] = [
  'inputTokens',
  'outputTokens',
  'cachedInputTokens',
  'cacheCreationInputTokens',
];

/** Persisted shape of {@link AttemptUsage}; refuses a self-contradicting record. */
export const AttemptUsageSchema = z
  .object({
    completions: z.number().int().positive(),
    reportedCompletions: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    cacheCreationInputTokens: z.number().int().nonnegative().optional(),
  })
  .refine((u) => u.reportedCompletions <= u.completions, {
    message: 'reportedCompletions cannot exceed completions',
  });

/**
 * Decision-level total of {@link AttemptUsage} across the seats that carried
 * one. Tokens are a floor whenever `incompleteSeats > 0`.
 */
export interface ObservedAttemptUsage {
  /** Seats that settled at least one completion. */
  readonly seats: number;
  /** Seats with `reportedCompletions < completions`. */
  readonly incompleteSeats: number;
  readonly completions: number;
  readonly reportedCompletions: number;
  /** Sum of reported input counts; an unreported counter contributes nothing. */
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** `inputTokens + outputTokens` — uncached, like the legacy `totalTokens`. */
  readonly totalTokens: number;
}

export const ObservedAttemptUsageSchema = z.object({
  seats: z.number().int().positive(),
  incompleteSeats: z.number().int().nonnegative(),
  completions: z.number().int().positive(),
  reportedCompletions: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

/** Add two optional counters; absent only when both are absent. */
function addCounter(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + b;
}

/** The summed counters, each spread only when present (absent is not 0). */
function sumCounters(a: CompletionCounters, b: CompletionCounters): CompletionCounters {
  const out: Partial<Record<CounterKey, number>> = {};
  for (const key of COUNTER_KEYS) {
    const sum = addCounter(a[key], b[key]);
    if (sum !== undefined) out[key] = sum;
  }
  return out;
}

/** Fold one settled completion's usage into the seat's running total. */
export function foldCompletionUsage(
  acc: AttemptUsage | undefined,
  usage: CompletionCounters
): AttemptUsage {
  const reported = usage.inputTokens !== undefined && usage.outputTokens !== undefined;
  const one: AttemptUsage = {
    completions: 1,
    reportedCompletions: reported ? 1 : 0,
    ...sumCounters({}, usage),
  };
  return acc === undefined ? one : addUsage(acc, one);
}

function addUsage(a: AttemptUsage, b: AttemptUsage): AttemptUsage {
  return {
    completions: a.completions + b.completions,
    reportedCompletions: a.reportedCompletions + b.reportedCompletions,
    ...sumCounters(a, b),
  };
}

/** Combine the usage of two attempt chains of the same seat (retry pass, fallback). */
export function mergeAttemptUsage(
  a: AttemptUsage | undefined,
  b: AttemptUsage | undefined
): AttemptUsage | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return addUsage(a, b);
}

/** Roll per-seat attempt usage up to the decision; undefined when no seat carried any. */
export function summarizeAttemptUsage(
  seats: readonly (AttemptUsage | undefined)[]
): ObservedAttemptUsage | undefined {
  const observed = seats.filter((s): s is AttemptUsage => s !== undefined);
  if (observed.length === 0) return undefined;
  let completions = 0;
  let reportedCompletions = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let incompleteSeats = 0;
  for (const seat of observed) {
    completions += seat.completions;
    reportedCompletions += seat.reportedCompletions;
    inputTokens += seat.inputTokens ?? 0;
    outputTokens += seat.outputTokens ?? 0;
    if (seat.reportedCompletions < seat.completions) incompleteSeats++;
  }
  return {
    seats: observed.length,
    incompleteSeats,
    completions,
    reportedCompletions,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

/** One settled outer response, captured before parsing; snapshots are immutable. */
const VoterAttemptEventSchema = z
  .object({
    id: z.string().min(1).max(200),
    role: z.string().min(1).max(64),
    cli: z.string().min(1).max(120),
    adapter: z.string().min(1).max(120),
    model: z.string().min(1).max(120).optional(),
    attemptKind: z
      .enum([
        'initial',
        'parse_retry',
        'error_retry',
        'role_retry',
        'cli_fallback',
        'option_reask',
        'unknown',
      ])
      .or(z.string().transform(() => 'unknown' as const)),
    outcome: z
      .enum(['parsed', 'parse_failed', 'superseded', 'final', 'unknown'])
      .or(z.string().transform(() => 'unknown' as const)),
    withinRoleRetry: z.boolean().optional(),
    usage: z.discriminatedUnion('kind', [
      z
        .object({ kind: z.literal('unknown') })
        .strip()
        .readonly(),
      z
        .object({
          kind: z.literal('reported'),
          input: z.number().int().nonnegative(),
          output: z.number().int().nonnegative(),
          cached: z.number().int().nonnegative().optional(),
          reasoning: z.number().int().nonnegative().optional(),
          cacheCreation: z.number().int().nonnegative().optional(),
        })
        .strip()
        .readonly(),
    ]),
  })
  .strip()
  .readonly();
export type VoterAttemptEvent = z.infer<typeof VoterAttemptEventSchema>;

/**
 * Started calls without responses have no event. They remain observable but
 * unobserved, including errors/timeouts and settlement after persistence. A
 * late response before persistence contributes exactly one event. Adapter
 * internal retries cannot be observed at this seam.
 */
export const AttemptTelemetrySchema = z
  .object({
    events: z.array(VoterAttemptEventSchema).readonly(),
    observableAttempts: z.number().int().nonnegative(),
  })
  .strip()
  .refine((t) => t.observableAttempts >= t.events.length, {
    message: 'observableAttempts cannot be smaller than settled response events',
  })
  .refine((t) => new Set(t.events.map((e) => e.id)).size === t.events.length, {
    message: 'duplicate outer-attempt event IDs',
  })
  .refine(
    (t) => {
      const finalRoles = t.events.filter((e) => e.outcome === 'final').map((e) => e.role);
      return new Set(finalRoles).size === finalRoles.length;
    },
    { message: 'multiple final response events for one role' }
  )
  .readonly();
export type AttemptTelemetry = z.infer<typeof AttemptTelemetrySchema>;
