/**
 * Helper functions for the multi-round voting protocol.
 *
 * @module consensus/voting-protocol-helpers
 * (Source: Issue #100, arXiv:2512.21352)
 */

import type {
  VotingSession,
  VotingRound,
  VotingRoundPhase,
  VotingProtocolConfig,
  VotingProtocolResult,
  AgentFinding,
  Vote,
  ConsolidatedFinding,
  RoundSummary,
  SycophancyReport,
  SycophancyIndicator,
} from './types.js';
import { createQuorumValidator, type QuorumValidationConfig } from './quorum-validator.js';

/**
 * Generate a unique session ID.
 */
export function generateSessionId(): string {
  return `session_${String(Date.now())}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate a unique finding ID.
 */
export function generateFindingId(): string {
  return `finding_${String(Date.now())}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate a unique round ID.
 */
export function generateRoundId(): string {
  return `round_${String(Date.now())}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a new voting round.
 */
export function createRound(phase: VotingRoundPhase, roundNumber: number): VotingRound {
  return {
    id: generateRoundId(),
    phase,
    status: 'in_progress',
    findings: new Map(),
    findingVotes: new Map(),
    finalVotes: new Map(),
    startedAt: new Date().toISOString(),
    roundNumber,
  };
}

/**
 * Find the most common element in an array.
 */
export function mostCommon<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;

  const counts = new Map<T, number>();
  items.forEach((item) => {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  });

  let maxCount = 0;
  let result: T | undefined;
  counts.forEach((count, item) => {
    if (count > maxCount) {
      maxCount = count;
      result = item;
    }
  });

  return result;
}

/**
 * Calculate agreement score from votes.
 */
export function calculateAgreementScore(votes: Vote[]): number {
  if (votes.length < 2) return 1;

  const decisions = votes.map((v) => v.decision);
  const mostCommonDecision = mostCommon(decisions);
  const agreementCount = decisions.filter((d) => d === mostCommonDecision).length;

  return agreementCount / votes.length;
}

/**
 * Determine outcome from final votes using unified QuorumValidator.
 * Per ADR-0003, this delegates to the consolidated quorum logic.
 */
export function determineOutcome(
  votes: Vote[],
  config: VotingProtocolConfig
): VotingProtocolResult['outcome'] {
  if (votes.length === 0) return 'no_consensus';

  // Convert array to Map for QuorumValidator
  const voteMap = new Map<string, Vote>();
  votes.forEach((vote, index) => {
    voteMap.set(`voter_${String(index)}`, vote);
  });

  // Create quorum config from voting protocol config
  const quorumConfig: QuorumValidationConfig = {
    algorithm: 'simple_majority',
    threshold: config.agreementThreshold,
    minVoters: 2, // Minimum for valid consensus
  };

  // Use unified QuorumValidator
  const validator = createQuorumValidator();
  const result = validator.validateQuorum({
    votes: voteMap,
    config: quorumConfig,
  });

  // Map QuorumValidationResult to VotingProtocolResult outcome
  if (result.status === 'reached') {
    return result.decision === 'approve' ? 'approved' : 'rejected';
  }

  // Check for mixed votes (needs revision)
  const approvals = votes.filter((v) => v.decision === 'approve').length;
  const rejections = votes.filter((v) => v.decision === 'reject').length;
  if (approvals > 0 && rejections > 0) return 'needs_revision';

  return 'no_consensus';
}

/**
 * Consolidate findings from deliberation round.
 */
export function consolidateFindings(session: VotingSession): ConsolidatedFinding[] {
  const deliberationRound = session.rounds[1];
  if (!deliberationRound) return [];

  const consolidated: ConsolidatedFinding[] = [];

  deliberationRound.findings.forEach((finding, findingId) => {
    const votes = deliberationRound.findingVotes.get(findingId) ?? [];
    const agreeVotes = votes.filter((v) => v.agree);
    const agreementRatio = votes.length > 0 ? agreeVotes.length / votes.length : 0;

    // Only include findings with some agreement
    if (agreementRatio >= 0.5) {
      // Determine final severity (use most common amended severity or original)
      const severityVotes = agreeVotes
        .filter((v) => v.amendedSeverity)
        .map((v) => v.amendedSeverity);
      const finalSeverity =
        severityVotes.length > 0
          ? (mostCommon(severityVotes) ?? finding.severity)
          : finding.severity;

      const consolidatedFinding: ConsolidatedFinding = {
        id: findingId,
        category: finding.category,
        severity: finalSeverity,
        description: finding.description,
        supportingAgents: agreeVotes.map((v) => v.agentId),
        agreementRatio,
        originalFindings: [finding],
      };
      if (finding.location !== undefined) {
        consolidatedFinding.location = finding.location;
      }
      if (finding.suggestion !== undefined) {
        consolidatedFinding.suggestion = finding.suggestion;
      }
      consolidated.push(consolidatedFinding);
    }
  });

  // Sort by severity and agreement
  return consolidated.sort((a, b) => {
    const severityOrder = { critical: 0, major: 1, minor: 2, suggestion: 3 };
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.agreementRatio - a.agreementRatio;
  });
}

/**
 * Build round summaries from session.
 */
export function buildRoundSummaries(session: VotingSession): RoundSummary[] {
  return session.rounds.map((round, index) => {
    const startTime = new Date(round.startedAt).getTime();
    const endTime =
      round.completedAt !== undefined ? new Date(round.completedAt).getTime() : Date.now();

    let votesCount = 0;
    let agreementScore = 0;

    if (round.phase === 'deliberation') {
      // Count finding votes
      round.findingVotes.forEach((votes) => {
        votesCount += votes.length;
        const agreeCount = votes.filter((v) => v.agree).length;
        agreementScore += votes.length > 0 ? agreeCount / votes.length : 0;
      });
      const findingsCount = round.findingVotes.size;
      if (findingsCount > 0) {
        agreementScore /= findingsCount;
      }
    } else if (round.phase === 'consensus') {
      // Count final votes
      votesCount = round.finalVotes.size;
      const votes = Array.from(round.finalVotes.values());
      agreementScore = calculateAgreementScore(votes);
    }

    return {
      roundNumber: index + 1,
      phase: round.phase,
      findingsCount: round.findings.size,
      votesCount,
      agreementScore,
      durationMs: endTime - startTime,
    };
  });
}

// ============================================================================
// Sycophancy Detection
// ============================================================================

/**
 * Check for premature consensus pattern.
 */
export function checkPrematureConsensus(session: VotingSession): SycophancyIndicator | null {
  const analysisRound = session.rounds[0];
  if (!analysisRound) return null;

  const agentFindings = new Map<string, AgentFinding[]>();
  analysisRound.findings.forEach((finding) => {
    const existing = agentFindings.get(finding.agentId) ?? [];
    existing.push(finding);
    agentFindings.set(finding.agentId, existing);
  });

  const allConfidences: number[] = [];
  analysisRound.findings.forEach((finding) => {
    allConfidences.push(finding.confidence);
  });

  const avgConfidence =
    allConfidences.length > 0
      ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
      : 0;

  if (avgConfidence > 0.95 && agentFindings.size >= 2) {
    return {
      type: 'premature_consensus',
      description: 'All agents showing unusually high confidence',
      severity: 'medium',
      agents: Array.from(agentFindings.keys()),
    };
  }

  return null;
}

/**
 * Check for opinion convergence pattern.
 */
export function checkOpinionConvergence(session: VotingSession): SycophancyIndicator | null {
  const deliberationRound = session.rounds[1];
  if (!deliberationRound) return null;

  let totalVotes = 0;
  let agreeVotes = 0;

  deliberationRound.findingVotes.forEach((votes) => {
    totalVotes += votes.length;
    agreeVotes += votes.filter((v) => v.agree).length;
  });

  const agreeRatio = totalVotes > 0 ? agreeVotes / totalVotes : 0;

  if (agreeRatio > session.config.sycophancyThreshold && totalVotes > 3) {
    const affectedAgents: string[] = [];
    deliberationRound.findingVotes.forEach((votes) => {
      votes.forEach((v) => {
        if (v.agree && !affectedAgents.includes(v.agentId)) {
          affectedAgents.push(v.agentId);
        }
      });
    });

    return {
      type: 'opinion_convergence',
      description: `${String(Math.round(agreeRatio * 100))}% agreement rate suggests possible opinion convergence`,
      severity: 'high',
      agents: affectedAgents,
    };
  }

  return null;
}

/**
 * Check for confidence inflation pattern.
 */
export function checkConfidenceInflation(session: VotingSession): SycophancyIndicator | null {
  const consensusRound = session.rounds[2];
  if (!consensusRound) return null;

  const votes = Array.from(consensusRound.finalVotes.values());
  if (votes.length < 2) return null;

  const confidences = votes.map((v) => v.confidence);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const allHigh = confidences.every((c) => c > 0.9);

  if (allHigh && avgConfidence > 0.95) {
    return {
      type: 'confidence_inflation',
      description: 'All agents reporting very high confidence suggests possible sycophancy',
      severity: 'medium',
      agents: Array.from(consensusRound.finalVotes.keys()),
    };
  }

  return null;
}

/**
 * Run all sycophancy detection checks.
 */
export function detectSycophancyPatterns(session: VotingSession): SycophancyReport {
  const indicators: SycophancyIndicator[] = [];
  const affectedAgents: string[] = [];

  const prematureConsensus = checkPrematureConsensus(session);
  if (prematureConsensus) {
    indicators.push(prematureConsensus);
    affectedAgents.push(...prematureConsensus.agents);
  }

  const opinionConvergence = checkOpinionConvergence(session);
  if (opinionConvergence) {
    indicators.push(opinionConvergence);
    affectedAgents.push(...opinionConvergence.agents);
  }

  const confidenceInflation = checkConfidenceInflation(session);
  if (confidenceInflation) {
    indicators.push(confidenceInflation);
    affectedAgents.push(...confidenceInflation.agents);
  }

  const detected = indicators.length > 0;
  const confidenceScore = Math.min(1, indicators.length * 0.3);
  const uniqueAffected = [...new Set(affectedAgents)];

  return {
    detected,
    confidenceScore,
    indicators,
    affectedAgents: uniqueAffected,
    recommendation: detected
      ? 'Consider requesting independent re-analysis or adding more diverse agents'
      : 'No sycophancy detected',
  };
}
