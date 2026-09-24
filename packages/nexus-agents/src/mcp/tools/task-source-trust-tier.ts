/**
 * The declared provenance of a goal/task string (#6795).
 *
 * Shared by every tool whose goal reaches the dev-pipeline consensus→execute
 * policy gate — `run_dev_pipeline` and `run` — so the two cannot drift. Same
 * enum and meaning as `memory_write`'s `sourceTrustTier`.
 *
 * @module mcp/tools/task-source-trust-tier
 */

import { TrustTierSchema } from '../../security/trust-types.js';

/** Optional; omitted means '3' (applied by the pipeline, not defaulted here). */
export const TaskSourceTrustTierSchema = TrustTierSchema.optional().describe(
  "Trust tier ('1'-'4') of where the task text came from, per .rules/untrusted-input.md: '1' only " +
    "for text the caller authored or took from repo files, '3' for issue/PR/web text. Omitted means '3'. " +
    'Can only lower trust: the effective tier is the least-trusted of this, the measured caller tier and ' +
    'every source the run fetched. Recorded with the caller tier at the consensus→execute policy gate.'
);
