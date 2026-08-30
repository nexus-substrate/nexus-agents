/**
 * The `serves` readiness level for `nexus-agents doctor --live` (#4376).
 *
 * Runs a real completion against every configured adapter and reports whether
 * content actually came back. This is the only level that can catch #4351 —
 * every voter returning `stop_sequence` with zero tokens while `healthCheck()`
 * and the auth probe both reported healthy — and the only one that spends the
 * resource it measures, which is why it is opt-in.
 *
 * @module cli/doctor-live
 * (Source: Issue #4376)
 */

import { createAllAdapters } from '../cli-adapters/factory.js';
import type { CliName } from '../cli-adapters/types.js';
import { probeAllClis } from './cli-auth-probe.js';
import { detectCliBinary } from './setup-cli-detection.js';
import {
  buildReadiness,
  formatReadiness,
  probeServes,
  type CliReadiness,
  type LevelOutcome,
  type ServesProbeTarget,
} from './cli-readiness.js';

/** Reason recorded when a level is skipped because an earlier one failed. */
const NOT_REACHED = 'earlier level did not pass, so this was not attempted';

/**
 * Run the full ladder for every adapter.
 *
 * The ladder short-circuits: a CLI that is not installed is not probed for
 * auth, and one that is not authenticated is not billed for a completion. The
 * skipped levels report `not-attempted`, never `failed` — nothing was learned
 * about them, and saying otherwise would invent a measurement.
 */
export async function runLiveReadiness(
  deps: {
    readonly adapters?: Map<CliName, ServesProbeTarget>;
    readonly authStates?: ReadonlyMap<CliName, 'authenticated' | 'unknown' | 'not-ok'>;
    /**
     * Whether a CLI's binary is on PATH. Defaults to a real `which` +
     * `--version` probe (#4840); overridable so the ladder can be exercised
     * without the host's actual toolchain.
     */
    readonly isInstalled?: (cli: CliName) => boolean;
  } = {}
): Promise<readonly CliReadiness[]> {
  // DELIBERATE raw-adapter probe — same reasoning as `doctor.ts:checkCli`
  // (#5191). Readiness must reflect the CLI's actual state, not shared
  // circuit-breaker state another caller populated.
  const adapters =
    deps.adapters ?? (createAllAdapters() as unknown as Map<CliName, ServesProbeTarget>);
  const authStates = deps.authStates ?? (await readAuthStates());
  const isInstalled = deps.isInstalled ?? ((cli: CliName) => detectCliBinary(cli).installed);

  const results: CliReadiness[] = [];
  for (const [cli, adapter] of adapters) {
    results.push(await ladderFor(cli, adapter, authStates.get(cli), isInstalled(cli)));
  }
  return results;
}

async function ladderFor(
  cli: CliName,
  adapter: ServesProbeTarget,
  auth: 'authenticated' | 'unknown' | 'not-ok' | undefined,
  binaryPresent: boolean
): Promise<CliReadiness> {
  // Was the literal `{ status: 'verified' }` — the first rung of a readiness
  // ladder asserting itself (#4840). It also made the auth rung report "no
  // usable credentials found" for a CLI that simply is not installed.
  if (!binaryPresent) {
    return buildReadiness(cli, {
      installed: { status: 'failed', reason: 'binary not found on PATH' },
      authenticated: { status: 'not-attempted', reason: NOT_REACHED },
      serves: { status: 'not-attempted', reason: NOT_REACHED },
    });
  }
  const installed: LevelOutcome = { status: 'verified' };

  // `unknown` (#4391: a CLI exposing no readable auth signal) is admitted
  // optimistically at this level, exactly as the auth probe requires — but it
  // is the live probe below that then actually settles the question.
  const authenticated: LevelOutcome =
    auth === 'not-ok'
      ? { status: 'failed', reason: 'no usable credentials found' }
      : { status: 'verified' };

  if (authenticated.status !== 'verified') {
    return buildReadiness(cli, {
      installed,
      authenticated,
      serves: { status: 'not-attempted', reason: NOT_REACHED },
    });
  }

  return buildReadiness(cli, { installed, authenticated, serves: await probeServes(adapter) });
}

/** Collapse the auth probe's states into what the ladder needs. */
async function readAuthStates(): Promise<
  ReadonlyMap<CliName, 'authenticated' | 'unknown' | 'not-ok'>
> {
  const probes = await probeAllClis();
  const states = new Map<CliName, 'authenticated' | 'unknown' | 'not-ok'>();
  for (const probe of probes) {
    if (probe.state === 'authenticated') states.set(probe.cli, 'authenticated');
    else if (probe.state === 'unknown') states.set(probe.cli, 'unknown');
    else states.set(probe.cli, 'not-ok');
  }
  return states;
}

/** Render the live report, with a heading that says what was and was not proven. */
export function formatLiveReadiness(report: readonly CliReadiness[]): string {
  if (report.length === 0) {
    return '\nLive readiness: no adapters configured — nothing was probed.';
  }
  return [
    '',
    'Live readiness (--live: a real completion per adapter)',
    ...report.map(formatReadiness),
  ].join('\n');
}
