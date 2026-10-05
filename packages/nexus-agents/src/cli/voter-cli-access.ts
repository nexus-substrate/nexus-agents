/**
 * Which CLIs may serve a voter seat (#6962).
 *
 * Every voter seat asks for read-only analysis (#6754). The CLI path deals
 * seats round-robin over the detected CLIs, so a CLI that cannot enforce that
 * mode got seats anyway, and each one refused: once agy (the gemini slot)
 * stopped declaring the mode, the security and catfish seats of the default
 * 7-seat panel errored on every vote. Dealing only over CLIs that declare the
 * mode keeps the panel whole; the families present are whatever CLIs remain.
 *
 * @module cli/voter-cli-access
 */

import type { ExecutionAccessMode } from '../core/index.js';
import { adapterEnforces } from '../cli-adapters/access-mode.js';
import { createCliAdapter } from '../cli-adapters/factory.js';
import type { CliName, ICliAdapter } from '../cli-adapters/types.js';

/** The access mode every voter seat runs in (#6754). */
export const VOTER_ACCESS_MODE = 'read-only-analysis' satisfies ExecutionAccessMode;

/** The adapter declarations the filter reads. */
type AccessDeclarations = Pick<ICliAdapter, 'enforcesReadOnlyAnalysis' | 'enforcesWorkspaceEdit'>;

/** The CLIs that may serve a voter seat, and the ones dropped for not enforcing its mode. */
export interface VoterCliAccess {
  readonly serving: CliName[];
  readonly refused: CliName[];
}

/**
 * Split `clis` into those whose adapter declares {@link VOTER_ACCESS_MODE} and
 * those that do not, preserving order. Only the declaration is read; the
 * adapter is never run. `declarationsFor` is injectable for tests.
 */
export function clisServingVoterSeats(
  clis: readonly CliName[],
  declarationsFor: (cli: CliName) => AccessDeclarations = (cli) => createCliAdapter({ cli })
): VoterCliAccess {
  const serving: CliName[] = [];
  const refused: CliName[] = [];
  for (const cli of clis) {
    const enforces = adapterEnforces(declarationsFor(cli), { accessMode: VOTER_ACCESS_MODE });
    (enforces ? serving : refused).push(cli);
  }
  return { serving, refused };
}
