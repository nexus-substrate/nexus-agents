/**
 * What a warm-start reports about the outcomes it could not replay (#4904).
 *
 * Its own module so the reporting decision is a pure function: the choice of
 * WHICH skips warrant a warning is the thing that was wrong, and testing it
 * through a module-level logger would mean mocking `createLogger` wholesale.
 *
 * @module cli-adapters/warm-start-skips
 */

/**
 * The arm id recorded when an outcome's executing CLI cannot be resolved
 * (#3624). It is not an arm and can never warm-start, by design.
 */
const UNATTRIBUTED_ARM = 'unknown';

/** A warm-start's skipped outcomes, split by whether the skip is expected. */
export interface WarmStartSkips {
  /** Arm-shaped ids that failed to match — the case worth warning about. */
  readonly byArm: Readonly<Record<string, number>>;
  /** Outcomes with no resolvable CLI. Expected, and counted rather than dropped. */
  readonly unattributed: number;
}

/** One log line a warm-start wants emitted, with the level it warrants. */
export interface WarmStartSkipLog {
  readonly level: 'warn' | 'debug';
  readonly message: string;
  readonly context: Record<string, unknown>;
}

/**
 * Separate the skip that means something from the skip that always happens.
 *
 * `skippedByArm` exists to surface an arm that SHOULD have warm-started and did
 * not — #4400 added it after `api:*` arms silently discarded their whole
 * history. Reporting the permanent, by-design `'unknown'` bucket in the same
 * field made a regression render identically to a line printed on every run,
 * which dilutes the signal rather than raising it (#4904).
 *
 * The unattributed count is kept, not filtered away: its volume says how much
 * execution cannot be attributed to a CLI, which is worth seeing.
 */
export function partitionWarmStartSkips(skipped: ReadonlyMap<string, number>): WarmStartSkips {
  const byArm: Record<string, number> = {};
  let unattributed = 0;
  for (const [arm, count] of skipped) {
    if (arm === UNATTRIBUTED_ARM) unattributed += count;
    else byArm[arm] = count;
  }
  return { byArm, unattributed };
}

/**
 * The log lines a warm-start should emit for its skips.
 *
 * Returned rather than logged so the level attached to each bucket is
 * assertable. An unmatched arm is a `warn`; the unattributed bucket is a
 * `debug`, because warning about something that happens on every run is what
 * taught operators to skip past the field that reports real regressions.
 */
export function warmStartSkipLogs(
  skips: WarmStartSkips,
  replayed: number,
  knownArms: readonly string[]
): readonly WarmStartSkipLog[] {
  const lines: WarmStartSkipLog[] = [];
  if (Object.keys(skips.byArm).length > 0) {
    lines.push({
      level: 'warn',
      message: 'Warm-start skipped outcomes for arms this bandit does not have',
      context: { skippedByArm: skips.byArm, replayed, knownArms },
    });
  }
  if (skips.unattributed > 0) {
    lines.push({
      level: 'debug',
      message: 'Warm-start skipped outcomes with no resolvable CLI',
      context: { skippedUnattributed: skips.unattributed, replayed },
    });
  }
  return lines;
}
