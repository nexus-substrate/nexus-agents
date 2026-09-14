/**
 * nexus-agents/consensus/decision - Strategy resolution
 *
 * Which bar a `consensus_vote` call is measured against, and which error
 * policy it runs under when the caller named none. Extracted verbatim from
 * `mcp/tools/consensus-vote.ts` and `mcp/tools/consensus-vote-types.ts`
 * (#6000 step 1): `resolveStrategy` is where `strategy` silently discarded
 * `threshold` (#5315), so the resolution lives in a module that can be
 * governed on its own path. The types it reads stay in the MCP tool module —
 * they are imported type-only, so this module has no runtime edge into
 * `mcp/`.
 *
 * @module consensus/decision/strategy
 */

import type {
  ConsensusVoteInput,
  ErrorPolicy,
  VotingStrategy,
} from '../../mcp/tools/consensus-vote-types.js';
import type { ConsensusAlgorithm } from '../types-core.js';

// --- Strategy Resolution ---
export function resolveStrategy(input: ConsensusVoteInput): VotingStrategy {
  if (input.strategy !== undefined) return input.strategy;
  if (input.threshold !== undefined) {
    switch (input.threshold) {
      case 'majority':
        return 'simple_majority';
      case 'supermajority':
        return 'supermajority';
      case 'unanimous':
        return 'unanimous';
    }
  }
  return 'simple_majority';
}

export function strategyToAlgorithm(strategy: VotingStrategy): ConsensusAlgorithm {
  if (strategy === 'higher_order') return 'higher_order';
  if (strategy === 'opinion_wise') return 'opinion_wise';
  return strategy;
}

/**
 * Default error policy per voting strategy.
 *
 * Only `unanimous` defaults to `fail_closed`: a missing/errored voter genuinely
 * breaks the unanimity guarantee, so the vote must void. Every other strategy —
 * including `higher_order` and its `opinion_wise` alias — defaults to
 * `reduce_denominator`: Bayesian/weighted aggregation over the *non-error*
 * voters is well-defined, so a single infra timeout (e.g. one slow voter's
 * adapter transport, #3304) should NOT fail-close an otherwise-unanimous result
 * (#3138). The >50% `ERROR_FLOOR_FRACTION` hard floor still voids any vote where
 * most voters errored. Callers can override via the `errorPolicy` input.
 */
export function getDefaultErrorPolicy(strategy: VotingStrategy): ErrorPolicy {
  if (strategy === 'unanimous') {
    return 'fail_closed';
  }
  return 'reduce_denominator';
}
