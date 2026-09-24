/**
 * Schema of a cancelled vote's partials (#6735). A leaf module so both the
 * store (`job-result-store.ts`, which embeds it in `JobResultSchema`) and the
 * writer (`job-cancelled-partial.ts`, which imports the store) can use it
 * without an import cycle.
 *
 * @module mcp/jobs/job-cancelled-partial-schema
 */

import { z } from 'zod';

/**
 * The votes a cancelled `consensus_vote` had cast before the cancel (#6735).
 *
 * This is NOT a decision and carries none. No verdict is computed from these
 * seats: a cancelled vote never reaches the engine, the vote-record ledger or
 * the correlation tracker. `seatsCast` counts `partialVotes` (derived by the
 * writer, so the two cannot disagree) against `panelSize`, the seats the panel
 * convened, so a reader sees the coverage — `0` of `3` included — rather than
 * a tally that looks complete. The votes are the collector's own
 * `AgentVoteResult`s, typed `unknown` here because the store is tool-agnostic.
 */
export const CancelledPartialSchema = z.strictObject({
  partialVotes: z.array(z.unknown()),
  seatsCast: z.number().int().nonnegative(),
  panelSize: z.number().int().nonnegative(),
});
export type CancelledPartial = z.infer<typeof CancelledPartialSchema>;
