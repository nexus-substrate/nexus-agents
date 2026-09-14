/**
 * nexus-agents/consensus/decision - Voting thresholds
 *
 * The numeric bars a tally is measured against. Extracted from
 * `consensus/types-core.ts` and `mcp/tools/consensus-vote-types.ts` (#6000
 * step 1) so the constants that decide what "approved" means live in a module
 * that can be governed on its own path, apart from the routine types and
 * schemas they used to share a file with. Every previous home re-exports
 * these, so the public API is unchanged.
 *
 * @module consensus/decision/thresholds
 */

import type { ConsensusAlgorithm } from '../types-core.js';

/**
 * The exact 2/3 supermajority agreement threshold — the governance constant for
 * "supermajority" / Byzantine (2-of-3) quorum. SINGLE SOURCE (#3571): every
 * consensus site that needs a supermajority references this constant. It must
 * not be rounded: `0.67` rejected an exact 2-of-3 quorum (#5543).
 * (Per-algorithm values like 0.5/1.0 are intentionally NOT centralized — 0.5 is
 * semantically overloaded across several algorithms.)
 */
export const SUPERMAJORITY_THRESHOLD = 2 / 3;

/**
 * Voting thresholds for each algorithm.
 */
export const VOTING_THRESHOLDS: Record<ConsensusAlgorithm, number> = {
  simple_majority: 0.5,
  supermajority: SUPERMAJORITY_THRESHOLD,
  unanimous: 1.0,
  proof_of_learning: 0.5, // Uses weighted voting
  opinion_wise: 0.5, // Uses correlation-aware Bayesian aggregation (Issue #333)
  higher_order: 0.5, // Alias for opinion_wise (Issue #514)
};

/**
 * Fraction of total voters that, if errored, forces the vote to fail
 * regardless of `errorPolicy`. (#2630 — safety floor.)
 */
export const ERROR_FLOOR_FRACTION = 0.5;
