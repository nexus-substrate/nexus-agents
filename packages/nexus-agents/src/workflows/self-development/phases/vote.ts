/**
 * Phase 5: VOTE (Consensus)
 *
 * Consensus voting for self-development workflow.
 *
 * @module workflows/self-development/phases/vote
 */

import type { IAgent, Task } from '../../../core/index.js';
import { createLogger, getTimeProvider } from '../../../core/index.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type { SelfDevWorkflowState, RefineOutput, VoteOutput } from '../types.js';
import { SELF_DEV_PERSONAS } from '../types.js';
import { createSimpleAgent, checkFailFast } from './shared.js';
import { findPersonaRole } from './refine.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../../../config/timeouts.js';

const logger = createLogger({ component: 'self-dev-phase-vote' });

/**
 * Build voting task for consensus protocol.
 */
function buildVotingTask(refine: RefineOutput): Task {
  return {
    id: `vote-${String(getTimeProvider().now())}`,
    description: buildVotingPrompt(refine),
    context: {
      metadata: {
        refinedPlan: refine.refinedPlan,
        critiques: refine.critiques,
        severity: refine.finalSeverity,
      },
    },
    constraints: { maxTokens: 2000, maxDuration: CLI_SUBPROCESS_TIMEOUTS.selfDevVoteMs },
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
      sessionId: `vote-${String(getTimeProvider().now())}`,
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

/** Vote result with decision and reasoning. */
type VoteResult = { decision: 'approve' | 'reject' | 'abstain'; reasoning: string };

/** Context for evaluating a vote. */
interface VoteContext {
  readonly hasTests: boolean;
  readonly hasFiles: boolean;
  readonly hasCriticalIssues: boolean;
  readonly personaSeverity: number;
  readonly personaIssues: readonly string[];
  readonly finalSeverity: number;
  readonly converged: boolean;
  readonly hasDependencies: boolean;
}

/** Evaluates security persona vote. */
function evaluateSecurityVote(ctx: VoteContext): VoteResult {
  const hasSecurityIssue = ctx.personaIssues.some((i) => i.toLowerCase().includes('security'));
  if (ctx.hasCriticalIssues || hasSecurityIssue) {
    return { decision: 'reject', reasoning: 'Security concerns not adequately addressed' };
  }
  if (ctx.finalSeverity < 0.3) {
    return { decision: 'approve', reasoning: 'No critical security issues identified' };
  }
  return { decision: 'abstain', reasoning: 'Security review needed before approval' };
}

/** Evaluates thinker persona vote. */
function evaluateThinkerVote(ctx: VoteContext): VoteResult {
  if (!ctx.hasFiles) {
    return {
      decision: 'abstain',
      reasoning: 'Plan lacks specific file targets - needs clarification',
    };
  }
  return { decision: 'approve', reasoning: 'Problem analysis appears complete' };
}

/** Evaluates reviewer persona vote. */
function evaluateReviewerVote(ctx: VoteContext): VoteResult {
  if (!ctx.hasTests) {
    return {
      decision: ctx.personaSeverity > 0.3 ? 'reject' : 'abstain',
      reasoning: 'Test coverage requirements not clearly defined',
    };
  }
  return { decision: 'approve', reasoning: 'Test plan meets review standards' };
}

/** Evaluates architect persona vote. */
function evaluateArchitectVote(ctx: VoteContext): VoteResult {
  if (ctx.hasDependencies && !ctx.converged) {
    return { decision: 'abstain', reasoning: 'Dependency changes need further review' };
  }
  return { decision: 'approve', reasoning: 'Architectural approach is sound' };
}

/** Evaluates default persona vote. */
function evaluateDefaultVote(ctx: VoteContext, role: string): VoteResult {
  const passes = ctx.finalSeverity < 0.3;
  return {
    decision: passes ? 'approve' : 'abstain',
    reasoning: `${role}: ${passes ? 'Plan meets quality threshold' : 'Minor concerns remain'}`,
  };
}

/**
 * Evaluate criteria-based vote for a persona.
 * Uses heuristic analysis based on plan quality metrics.
 * (Source: Issue #449 - Improve fallback implementations)
 */
function evaluateCriteriaVote(
  persona: (typeof SELF_DEV_PERSONAS)[0],
  refine: RefineOutput
): VoteResult {
  const personaCritique = refine.critiques.find((c) => c.personaId === persona.id);
  const ctx: VoteContext = {
    hasTests: refine.refinedPlan.testPlan.length > 20,
    hasFiles: refine.refinedPlan.files.length > 0,
    hasCriticalIssues: refine.critiques.some((c) => c.severity > 0.5),
    personaSeverity: personaCritique?.severity ?? 0,
    personaIssues: personaCritique?.issues ?? [],
    finalSeverity: refine.finalSeverity,
    converged: refine.converged,
    hasDependencies: refine.refinedPlan.dependencies.length > 0,
  };

  const evaluators: Record<string, (ctx: VoteContext) => VoteResult> = {
    security: evaluateSecurityVote,
    thinker: evaluateThinkerVote,
    reviewer: evaluateReviewerVote,
    architect: evaluateArchitectVote,
  };

  const evaluator = evaluators[persona.role];
  return evaluator !== undefined ? evaluator(ctx) : evaluateDefaultVote(ctx, persona.role);
}

/**
 * Build fallback vote output with criteria-based voting.
 * Uses heuristic analysis when ConsensusProtocol is unavailable.
 * (Source: Issue #449 - Improve fallback implementations)
 */
function buildFallbackVoteOutput(
  refine: RefineOutput,
  minVotes: number,
  startTime: number
): VoteOutput {
  const votes = SELF_DEV_PERSONAS.slice(0, Math.min(minVotes + 2, SELF_DEV_PERSONAS.length)).map(
    (persona) => {
      const voteResult = evaluateCriteriaVote(persona, refine);
      return {
        type: 'vote' as const,
        expertId: persona.id,
        decision: voteResult.decision,
        reasoning: voteResult.reasoning,
        agentRole: persona.role,
        hasVetoPower: persona.id === 'security',
      };
    }
  );

  const approvalCount = votes.filter((v) => v.decision === 'approve').length;
  const rejectCount = votes.filter((v) => v.decision === 'reject').length;
  const abstainCount = votes.filter((v) => v.decision === 'abstain').length;

  const securityVeto = votes.find((v) => v.hasVetoPower && v.decision === 'reject');
  const vetoExercised = securityVeto !== undefined;
  const consensus = !vetoExercised && approvalCount >= minVotes;

  return {
    votes,
    approvalCount,
    rejectCount,
    abstainCount,
    consensus,
    vetoExercised,
    verdict: vetoExercised ? 'REJECTED' : consensus ? 'APPROVED' : 'REQUIRES_REVISION',
    ...(securityVeto !== undefined ? { vetoReason: securityVeto.reasoning } : {}),
    durationMs: getTimeProvider().now() - startTime,
  };
}

/**
 * Error thrown when voting cannot proceed due to missing dependencies.
 * (Source: Issue #501 - Fail-safe voting)
 */
export class VotingUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `VOTE phase cannot proceed: ${reason}. ` +
        'To use heuristic fallback voting (NOT RECOMMENDED), set ' +
        'config.phases.vote.allowHeuristicFallback = true'
    );
    this.name = 'VotingUnavailableError';
  }
}

/**
 * Execute VOTE phase - Consensus voting.
 *
 * By default, this phase FAILS if ConsensusProtocol is unavailable to prevent
 * fake votes from impacting decisions. Heuristic fallback can be explicitly
 * enabled via config but is NOT RECOMMENDED for production use.
 * (Source: Issue #501 - Fail-safe voting)
 */
export async function executeVote(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  refine: RefineOutput
): Promise<VoteOutput> {
  const startTime = getTimeProvider().now();
  const minVotes = state.config.phases?.vote?.minVotes ?? 4;
  const allowHeuristicFallback = state.config.phases?.vote?.allowHeuristicFallback === true;

  // Fail-fast check before falling back (Issue #455)
  checkFailFast(state.config.failFast, deps.consensus, 'VOTE', 'ConsensusProtocol');

  if (deps.consensus !== undefined) {
    const result = await runConsensusVoting(deps, state, refine, minVotes);
    if (result !== null) {
      return { ...result, durationMs: getTimeProvider().now() - startTime };
    }
    // Consensus execution failed - fail unless heuristic fallback explicitly allowed
    if (!allowHeuristicFallback) {
      throw new VotingUnavailableError('ConsensusProtocol execution failed');
    }
    logger.warn('VOTE phase: ConsensusProtocol failed, using heuristic fallback (NOT RECOMMENDED)');
  } else {
    // ConsensusProtocol not injected - fail unless heuristic fallback explicitly allowed
    // (Source: Issue #501 - Fail-safe voting)
    if (!allowHeuristicFallback) {
      throw new VotingUnavailableError('ConsensusProtocol not injected');
    }
    logger.warn(
      'VOTE phase: ConsensusProtocol not injected, using heuristic fallback (NOT RECOMMENDED)'
    );
  }

  return buildFallbackVoteOutput(refine, minVotes, startTime);
}
