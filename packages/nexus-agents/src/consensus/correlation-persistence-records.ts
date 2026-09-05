/** Schemas and replay helpers for persisted correlation proposal records. */

import { z } from 'zod';
import type { CorrelationRecordContext, ICorrelationTracker } from './higher-order-types.js';
import type { Vote } from './types-core.js';

const PersistedVoteSchema = z.object({
  agentId: z.string(),
  decision: z.enum(['approve', 'reject', 'abstain']),
  confidence: z.number().min(0).max(1),
  modelKey: z.string().optional(),
  observedModel: z.string().optional(),
});

type PersistedVote = z.infer<typeof PersistedVoteSchema>;

export const PersistedProposalSchema = z.object({
  proposalId: z.string(),
  votes: z.array(PersistedVoteSchema),
  outcome: z.enum(['approved', 'rejected']),
  timestamp: z.iso.datetime(),
});

export type PersistedProposal = z.infer<typeof PersistedProposalSchema>;

export const PersistedCorrelationDataSchema = z.object({
  version: z.number().int().positive(),
  proposals: z.array(PersistedProposalSchema),
  savedAt: z.iso.datetime(),
});

export type PersistedCorrelationData = z.infer<typeof PersistedCorrelationDataSchema>;

/** Build one replayable record without conflating assigned and observed models. */
export function createPersistedProposal(
  proposalId: string,
  votes: ReadonlyMap<string, Vote>,
  outcome: 'approved' | 'rejected',
  context?: CorrelationRecordContext
): PersistedProposal {
  const persistedVotes: PersistedVote[] = [];
  for (const [agentId, vote] of votes) {
    const modelKey = context?.modelPins.get(agentId);
    const observedModel = context?.observedModels?.get(agentId);
    persistedVotes.push({
      agentId,
      decision: vote.decision,
      confidence: vote.confidence,
      ...(modelKey !== undefined ? { modelKey } : {}),
      ...(observedModel !== undefined ? { observedModel } : {}),
    });
  }
  return {
    proposalId,
    votes: persistedVotes,
    outcome,
    timestamp: new Date().toISOString(),
  };
}

function findReplayModelPins(proposals: readonly PersistedProposal[]): {
  first: ReadonlyMap<string, string>;
  latest: ReadonlyMap<string, string>;
} {
  const firstModelPins = new Map<string, string>();
  const latestModelPins = new Map<string, string>();
  for (const proposal of proposals) {
    for (const vote of proposal.votes) {
      if (vote.modelKey !== undefined && !firstModelPins.has(vote.agentId)) {
        firstModelPins.set(vote.agentId, vote.modelKey);
      }
      if (vote.modelKey !== undefined) latestModelPins.set(vote.agentId, vote.modelKey);
    }
  }
  return { first: firstModelPins, latest: latestModelPins };
}

function buildReplayContext(
  votes: readonly PersistedVote[],
  firstModelPins: ReadonlyMap<string, string>
): CorrelationRecordContext {
  const modelPins = new Map<string, string>();
  const observedModels = new Map<string, string>();
  for (const vote of votes) {
    const modelKey = vote.modelKey ?? firstModelPins.get(vote.agentId);
    if (modelKey !== undefined) modelPins.set(vote.agentId, modelKey);
    if (vote.observedModel !== undefined) observedModels.set(vote.agentId, vote.observedModel);
  }
  return { modelPins, observedModels };
}

/** Replay persisted records through the tracker's public recording contract. */
export function replayProposals(
  tracker: ICorrelationTracker,
  proposals: readonly PersistedProposal[]
): number {
  const replayPins = findReplayModelPins(proposals);
  for (const proposal of proposals) {
    const votes = new Map<string, Vote>();
    for (const vote of proposal.votes) {
      votes.set(vote.agentId, {
        decision: vote.decision,
        reasoning: 'replayed from persistence',
        confidence: vote.confidence,
      });
    }
    tracker.recordProposalVotes(
      proposal.proposalId,
      votes,
      proposal.outcome,
      buildReplayContext(proposal.votes, replayPins.first)
    );
  }
  tracker.setCurrentModelPins?.(replayPins.latest);
  return proposals.length;
}
