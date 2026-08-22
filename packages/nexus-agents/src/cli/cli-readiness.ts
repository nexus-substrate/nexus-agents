/**
 * Readiness levels for a CLI adapter (#4376, #4351 criterion 7).
 *
 * Nothing in the tree could confirm that an adapter which *looks* healthy can
 * actually serve a completion. `healthCheck()` proves the binary exists at an
 * acceptable version; `cli-auth-probe` proves credentials are present and
 * unexpired, and says so explicitly — "No live API calls." Neither proves the
 * adapter serves anything.
 *
 * That is the state #4351 reported: every voter returned `stop_sequence` with
 * zero tokens while every available check said healthy. The checks were not
 * wrong; they were answering a narrower question than the caller assumed.
 *
 * ## Levels, and what each one actually proves
 *
 * | level           | proves                                    | costs |
 * | --------------- | ----------------------------------------- | ----- |
 * | `installed`     | the binary exists at a supported version  | none  |
 * | `authenticated` | credentials are present and unexpired     | none  |
 * | `serves`        | a real completion came back with content  | quota |
 *
 * `serves` is the only level that can catch #4351, and the only one that
 * spends the resource it is measuring. It therefore runs **only when
 * explicitly invoked** (`doctor --live`). Decided by a 7-voter `higher_order`
 * panel on #4376 (5 of 6 approvers): the rejected alternative cached a probe
 * result behind a TTL on the default path, which is a stale measurement
 * presented as current readiness — the same defect this module exists to fix.
 *
 * ## Not-attempted is not a failure
 *
 * The load-bearing distinction. A level that was never run reports
 * `not-attempted`, never `failed`. A reader must be able to tell "we checked
 * and it does not serve" from "we did not check", because the second is the
 * default state of every run that does not pass `--live`, and reporting it as
 * either healthy or broken would be a claim nobody measured.
 *
 * @module cli/cli-readiness
 * (Source: Issue #4376)
 */

import { resolveClassGuardMs } from '../config/timeouts.js';
import type { CliName } from '../cli-adapters/types.js';

/** Ordered weakest to strongest. Each level subsumes the ones before it. */
export const READINESS_LEVELS = ['installed', 'authenticated', 'serves'] as const;

export type ReadinessLevel = (typeof READINESS_LEVELS)[number];

/** What a single level's check concluded. */
export type LevelOutcome =
  | { readonly status: 'verified' }
  | { readonly status: 'failed'; readonly reason: string }
  /** Not run. Carries why, so the report can distinguish opt-out from error. */
  | { readonly status: 'not-attempted'; readonly reason: string };

export interface CliReadiness {
  readonly cli: CliName;
  readonly levels: Readonly<Record<ReadinessLevel, LevelOutcome>>;
  /**
   * The strongest level actually VERIFIED, or undefined when even `installed`
   * failed. Never inferred from a level that was not attempted.
   */
  readonly reached?: ReadinessLevel;
}

/** Human-readable statement of what a level does and does not prove. */
export const LEVEL_MEANING: Readonly<Record<ReadinessLevel, string>> = {
  installed: 'binary present at a supported version — proves nothing about auth or serving',
  authenticated: 'credentials present and unexpired, read locally — no API call was made',
  serves: 'a real completion returned content — the only level that proves the adapter works',
};

/**
 * The strongest verified level, stopping at the first gap.
 *
 * Stops rather than scanning for any verified level, because the ladder is
 * cumulative: a `serves` verification below a failed `authenticated` would
 * mean the two checks disagree, and reporting the higher one would paper over
 * that. A `not-attempted` level stops the ladder exactly like a failure —
 * absence of a check is not a pass.
 */
export function highestVerified(
  levels: Readonly<Record<ReadinessLevel, LevelOutcome>>
): ReadinessLevel | undefined {
  let reached: ReadinessLevel | undefined;
  for (const level of READINESS_LEVELS) {
    if (levels[level].status !== 'verified') break;
    reached = level;
  }
  return reached;
}

/** Assemble a readiness result, deriving `reached` from the outcomes. */
export function buildReadiness(
  cli: CliName,
  levels: Readonly<Record<ReadinessLevel, LevelOutcome>>
): CliReadiness {
  const reached = highestVerified(levels);
  return { cli, levels, ...(reached !== undefined ? { reached } : {}) };
}

/**
 * Render one CLI's ladder, naming every level's state.
 *
 * Every level is printed, including the ones that did not run. A report that
 * silently omitted `serves` would read as a clean bill of health from a run
 * that never tested serving — which is precisely how #4351 went unnoticed.
 */
export function formatReadiness(readiness: CliReadiness): string {
  // Exhaustive rather than a ternary chain (#4563): a new LevelOutcome status
  // would otherwise fall into the '·' arm and render as "not attempted",
  // quietly misreporting whatever the new state actually means.
  const icon = (o: LevelOutcome): string => {
    switch (o.status) {
      case 'verified':
        return '✓';
      case 'failed':
        return '✗';
      case 'not-attempted':
        return '·';
      default: {
        const exhaustive: never = o;
        throw new Error(`Unhandled level outcome: ${JSON.stringify(exhaustive)}`);
      }
    }
  };

  const lines = READINESS_LEVELS.map((level) => {
    const outcome = readiness.levels[level];
    const detail = outcome.status === 'verified' ? '' : ` — ${outcome.reason}`;
    return `      ${icon(outcome)} ${level}${detail}`;
  });

  const summary =
    readiness.reached === undefined ? 'not ready' : `ready through "${readiness.reached}"`;

  return [`  ${readiness.cli}: ${summary}`, ...lines].join('\n');
}

/** The minimal adapter surface the `serves` probe needs. */
export interface ServesProbeTarget {
  execute(task: {
    content: string;
    maxTokens?: number;
  }): Promise<{ ok: true; value: { text: string } } | { ok: false; error: { message: string } }>;
}

/**
 * The smallest prompt that still proves generation happened.
 *
 * Short on purpose — this level spends real quota, so it asks for the least
 * that can distinguish "served content" from "returned nothing".
 */
export const SERVES_PROBE_PROMPT = 'Reply with the single word: ok';

/**
 * Probe whether an adapter actually serves a completion.
 *
 * The check that matters is **non-empty content**, not a successful exit.
 * #4351's signature was every voter returning `stop_sequence` with zero
 * tokens: the call succeeded and produced nothing. An adapter that returns
 * `ok` with empty text has not served, and saying otherwise would reproduce
 * the exact reading that made the incident invisible.
 *
 * Bounded by the `interactive` operation-class guard. Found by running it: an
 * unbounded ladder over four adapters hung past two minutes with no output,
 * and a readiness check that never returns is worse than one that reports a
 * failure — the operator learns nothing either way, but waits for it. A
 * timeout is itself a legitimate not-ready result, not an error.
 *
 * @param adapter - The adapter to probe.
 * @param timeoutMs - Per-adapter ceiling; defaults to the interactive guard.
 */
export async function probeServes(
  adapter: ServesProbeTarget,
  timeoutMs: number = resolveClassGuardMs('interactive')
): Promise<LevelOutcome> {
  let result: Awaited<ReturnType<ServesProbeTarget['execute']>>;
  try {
    result = await withDeadline(
      adapter.execute({ content: SERVES_PROBE_PROMPT, maxTokens: 16 }),
      timeoutMs
    );
  } catch (caught: unknown) {
    if (caught instanceof ProbeTimeout) {
      return {
        status: 'failed',
        reason: `no response within ${String(Math.round(timeoutMs / 1000))}s`,
      };
    }
    const message = caught instanceof Error ? caught.message : String(caught);
    return { status: 'failed', reason: `probe threw: ${message}` };
  }

  if (!result.ok) {
    return { status: 'failed', reason: result.error.message };
  }
  if (result.value.text.trim() === '') {
    return {
      status: 'failed',
      reason: 'call succeeded but returned no content — the #4351 signature',
    };
  }
  return { status: 'verified' };
}

/** Raised when a probe outlives its ceiling. */
class ProbeTimeout extends Error {}

/**
 * Race a promise against a deadline.
 *
 * The underlying call is not cancelled — a CLI subprocess keeps running until
 * its own guard reaps it. What this bounds is how long the OPERATOR waits,
 * which is the thing that made an unbounded ladder unusable.
 */
async function withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ProbeTimeout());
    }, timeoutMs);
    // Deliberately NOT unref'd. An unref'd timer does not hold the event loop
    // open, so if the probed call never settles and nothing else is pending,
    // Node can exit at the await before the deadline fires — the guarantee
    // voiding itself in precisely the case it exists for. `clearTimeout` in
    // the finally is what stops it outliving a call that did settle.
  });

  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
