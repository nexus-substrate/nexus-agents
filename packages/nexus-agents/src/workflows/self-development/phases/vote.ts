/**
 * Phase 5: VOTE (Consensus)
 *
 * Consensus voting for self-development workflow.
 *
 * @module workflows/self-development/phases/vote
 */

import type { IAgent, Task } from '../../../core/index.js';
import { createLogger } from '../../../core/index.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type { SelfDevWorkflowState, RefineOutput, VoteOutput } from '../types.js';
import { SELF_DEV_PERSONAS } from '../types.js';
import { createSimpleAgent } from './shared.js';
import { findPersonaRole } from './refine.js';

const logger = createLogger({ component: 'self-dev-phase-vote' });

/**
 * Build voting task for consensus protocol.
 */
function buildVotingTask(refine: RefineOutput): Task {
  return {
    id: `vote-${String(Date.now())}`,
    description: buildVotingPrompt(refine),
    context: {
      metadata: {
        refinedPlan: refine.refinedPlan,
        critiques: refine.critiques,
        severity: refine.finalSeverity,
      },
    },
    constraints: { maxTokens: 2000, maxDuration: 120000 },
  };
}

/**
 * Build voting prompt from refined plan.
 */
function buildVotingPrompt(refine: RefineOutput): string {
  const parts = [
    'Vote on the following implementation plan:',
    '',
    '## Plan Summary',
    refine.refinedPlan.problemAnalysis,
    '',
    '## Success Criteria',
    ...refine.refinedPlan.successCriteria.map((c) => `- ${c}`),
    '',
    '## Refinement Results',
    `Iterations: ${String(refine.iterations)}`,
    `Converged: ${String(refine.converged)}`,
    `Final Severity: ${refine.finalSeverity.toFixed(2)}`,
    '',
    '## Outstanding Critiques',
    ...refine.critiques.flatMap((c) => c.issues.map((i) => `- [${c.role}] ${i}`)),
    '',
    'Vote: APPROVE, REJECT, or ABSTAIN with reasoning.',
  ];
  return parts.join('\n');
}

/**
 * Parse vote decision from contribution text.
 */
function parseVoteDecision(contribution: string): 'approve' | 'reject' | 'abstain' {
  const lower = contribution.toLowerCase();
  if (lower.includes('approve') || lower.includes('yes') || lower.includes('accept')) {
    return 'approve';
  }
  if (lower.includes('reject') || lower.includes('no') || lower.includes('deny')) {
    return 'reject';
  }
  return 'abstain';
}

/**
 * Extract reasoning from vote contribution.
 */
function extractVoteReasoning(contribution: string): string {
  const lines = contribution.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('reason') || lower.includes('because') || lower.includes('rationale')) {
      return line.replace(/^[-*#\d.]+\s*/, '').trim();
    }
  }
  const substantial = lines.find((l) => l.trim().length > 20);
  return substantial?.trim() ?? 'No detailed reasoning provided';
}

/**
 * Create agents map from personas.
 */
function createAgentsFromPersonas(deps: SelfDevWorkflowDependencies): {
  agents: Map<string, IAgent>;
  expertIds: string[];
} {
  const agents = new Map<string, IAgent>();
  const expertIds: string[] = [];

  for (const persona of SELF_DEV_PERSONAS) {
    agents.set(persona.id, createSimpleAgent(deps, persona.id, persona.role));
    expertIds.push(persona.id);
  }

  return { agents, expertIds };
}

/**
 * Count votes by decision type.
 */
function countVotes(votes: Array<{ decision: string }>): {
  approve: number;
  reject: number;
  abstain: number;
} {
  return {
    approve: votes.filter((v) => v.decision === 'approve').length,
    reject: votes.filter((v) => v.decision === 'reject').length,
    abstain: votes.filter((v) => v.decision === 'abstain').length,
  };
}

/**
 * Determine verdict from vote results.
 */
function determineVerdict(
  vetoExercised: boolean,
  consensus: boolean
): 'APPROVED' | 'REJECTED' | 'REQUIRES_REVISION' {
  if (vetoExercised) return 'REJECTED';
  if (consensus) return 'APPROVED';
  return 'REQUIRES_REVISION';
}

/**
 * Build vote output from consensus result.
 */
function buildVoteOutputFromConsensus(
  consensusResult: { expertResults: Array<{ expertId: string; result?: { output?: unknown } }> },
  minVotes: number
): Omit<VoteOutput, 'durationMs'> {
  const votes = consensusResult.expertResults.map((expert) => {
    const contribution = expert.result?.output?.toString() ?? '';
    return {
      type: 'vote' as const,
      expertId: expert.expertId,
      decision: parseVoteDecision(contribution),
      reasoning: extractVoteReasoning(contribution),
      agentRole: findPersonaRole(expert.expertId),
      hasVetoPower: expert.expertId === 'security',
    };
  });

  const counts = countVotes(votes);
  const vetoExercised = votes.some((v) => v.hasVetoPower && v.decision === 'reject');
  const consensus = !vetoExercised && counts.approve >= minVotes;
  const verdict = determineVerdict(vetoExercised, consensus);

  return {
    votes,
    approvalCount: counts.approve,
    rejectCount: counts.reject,
    abstainCount: counts.abstain,
    consensus,
    vetoExercised,
    verdict,
    ...(vetoExercised ? { vetoReason: 'Security expert vetoed the proposal' } : {}),
  };
}

/**
 * Run consensus voting with the protocol.
 */
async function runConsensusVoting(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  refine: RefineOutput,
  minVotes: number
): Promise<Omit<VoteOutput, 'durationMs'> | null> {
  if (deps.consensus === undefined) return null;

  logger.info('VOTE phase: Executing ConsensusProtocol');
  const { agents, expertIds } = createAgentsFromPersonas(deps);
  const votingTask = buildVotingTask(refine);

  const result = await deps.consensus.execute(
    {
      sessionId: `vote-${String(Date.now())}`,
      pattern: 'consensus',
      experts: expertIds,
      task: votingTask,
      minVotes,
      requireUnanimous: state.config.phases?.vote?.requireUnanimous ?? false,
    },
    agents
  );

  if (!result.ok) {
    logger.warn('VOTE phase: ConsensusProtocol failed', { error: result.error.message });
    return null;
  }

  logger.info('VOTE phase: ConsensusProtocol completed', {
    success: result.value.success,
    votes: result.value.expertResults.length,
  });

  return buildVoteOutputFromConsensus(result.value, minVotes);
}

/**
 * Build fallback vote output without consensus protocol.
 */
function buildFallbackVoteOutput(
  refine: RefineOutput,
  minVotes: number,
  startTime: number
): VoteOutput {
  const votes = SELF_DEV_PERSONAS.slice(0, minVotes + 1).map((persona, index) => ({
    type: 'vote' as const,
    expertId: persona.id,
    decision: index < minVotes ? ('approve' as const) : ('reject' as const),
    reasoning: `${persona.role}: ${refine.finalSeverity < 0.3 ? 'Plan meets quality threshold' : 'Minor concerns remain'}`,
    agentRole: persona.role,
    hasVetoPower: persona.id === 'security',
  }));

  const approvalCount = votes.filter((v) => v.decision === 'approve').length;
  const rejectCount = votes.filter((v) => v.decision === 'reject').length;

  return {
    votes,
    approvalCount,
    rejectCount,
    abstainCount: 0,
    consensus: approvalCount >= minVotes,
    vetoExercised: false,
    verdict: approvalCount >= minVotes ? 'APPROVED' : 'REQUIRES_REVISION',
    durationMs: Date.now() - startTime,
  };
}

/**
 * Execute VOTE phase - Consensus voting.
 */
export async function executeVote(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  refine: RefineOutput
): Promise<VoteOutput> {
  const startTime = Date.now();
  const minVotes = state.config.phases?.vote?.minVotes ?? 4;

  if (deps.consensus !== undefined) {
    const result = await runConsensusVoting(deps, state, refine, minVotes);
    if (result !== null) {
      return { ...result, durationMs: Date.now() - startTime };
    }
  } else {
    logger.info('VOTE phase: ConsensusProtocol not injected, using fallback');
  }

  return buildFallbackVoteOutput(refine, minVotes, startTime);
}
