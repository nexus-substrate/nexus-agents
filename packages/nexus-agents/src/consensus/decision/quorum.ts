/**
 * nexus-agents/consensus/decision - Quorum computation
 *
 * The engine's quorum predicate and its default bar, extracted verbatim
 * (#6180, mirroring #6000 step 1) from the two files that used to hold them:
 *
 * - `isQuorumReached` — the `votes.size >= config.minVotersForQuorum`
 *   comparison that `consensus/result-builder.ts` inlined in each of its three
 *   builders. It is the `quorumReached` input to `determineFinalStatus`, so a
 *   caller that answered it by hand could pass every verdict fixture; the
 *   #6175 seam now derives the expected quorum through this function.
 * - `DEFAULT_MIN_VOTERS_FOR_QUORUM` — the literal `2` that
 *   `consensus/types-core.ts` held twice, as the Zod default of
 *   `ConsensusEngineConfigSchema.minVotersForQuorum` and as
 *   `DEFAULT_CONSENSUS_CONFIG.minVotersForQuorum`. Both now read it from here.
 *
 * What stays outside: the engine's own `minVotersForQuorum` config field (a
 * caller may still raise the bar per engine), the vote-list shaping that
 * decides which seats reach the engine (`consensus-vote-error-policy.ts`), and
 * `consensus/quorum-validator.ts`, which is a different predicate for the
 * `VotingProtocol` path and has no in-tree caller (#4666).
 *
 * This module imports nothing at runtime: `types-core.ts` imports the default
 * from here, so a runtime edge back would be a cycle.
 *
 * @module consensus/decision/quorum
 */

/**
 * The smallest number of votes — approve, reject or abstain — a proposal must
 * hold when it closes for the engine to report `quorumReached`. Below it the
 * engine's outcome is `rejected` whatever the tally says.
 */
export const DEFAULT_MIN_VOTERS_FOR_QUORUM = 2;

/**
 * Whether `voteCount` votes reach a quorum of `minVotersForQuorum`.
 *
 * Counts votes, not respondents: an abstention holds a seat. Zero votes never
 * reach a positive bar, which is how the engine's empty close reads as no
 * quorum (#6172, the named empty case).
 */
export function isQuorumReached(voteCount: number, minVotersForQuorum: number): boolean {
  return voteCount >= minVotersForQuorum;
}
