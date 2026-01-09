/**
 * nexus-agents/agents - Free-MAD Scoring
 *
 * Implementation of Free-MAD (Score-based Decision with Anti-Conformity)
 * scoring mechanism. Evaluates entire debate trajectories and penalizes
 * conformity to majority positions to preserve correct minority answers.
 *
 * @module agents/collaboration/free-mad-scoring
 * (Source: arXiv:2509.11035, Issue #152)
 */

import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type {
  DebatePosition,
  AgentTrajectory,
  RoundSnapshot,
  AntiConformityScore,
  DebateTrajectory,
  FreeMadResult,
  FreeMadConfig,
  TrajectoryVote,
  VoteDecision,
} from './free-mad-types.js';
import { DEFAULT_FREE_MAD_CONFIG } from './free-mad-types.js';

/**
 * Options for recording a position.
 */
export interface RecordPositionOptions {
  trajectory: DebateTrajectory;
  agentId: string;
  round: number;
  position: string;
  confidence: number;
  reasoning?: string;
}

/**
 * Free-MAD Scorer for anti-conformity weighted consensus.
 */
export class FreeMadScorer {
  private readonly config: FreeMadConfig;
  private readonly logger: ILogger;

  constructor(config: Partial<FreeMadConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_FREE_MAD_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'FreeMadScorer' });
  }

  /**
   * Creates a new debate trajectory tracker.
   */
  createTrajectory(debateId: string, topic: string): DebateTrajectory {
    return {
      debateId,
      topic,
      allPositions: [],
      agentTrajectories: new Map(),
      roundSnapshots: [],
      totalRounds: 0,
      startedAt: new Date(),
    };
  }

  /**
   * Records a position in the debate trajectory.
   */
  recordPosition(opts: RecordPositionOptions): void {
    const { trajectory, agentId, round, position, confidence, reasoning } = opts;
    const normalizedPosition = this.normalizePosition(position);
    const debatePosition: DebatePosition = {
      agentId,
      round,
      position: normalizedPosition,
      confidence,
      timestamp: new Date(),
      ...(reasoning !== undefined && { reasoning }),
    };

    trajectory.allPositions.push(debatePosition);
    trajectory.totalRounds = Math.max(trajectory.totalRounds, round + 1);

    this.ensureAgentTrajectory(trajectory, agentId);
    const agentTrajectory = trajectory.agentTrajectories.get(agentId);
    agentTrajectory?.positions.push(debatePosition);

    if (this.config.verbose) {
      this.logger.debug('Recorded position', { agentId, round, position: normalizedPosition });
    }
  }

  /**
   * Ensures agent trajectory exists in the map.
   */
  private ensureAgentTrajectory(trajectory: DebateTrajectory, agentId: string): void {
    if (!trajectory.agentTrajectories.has(agentId)) {
      trajectory.agentTrajectories.set(agentId, {
        agentId,
        positions: [],
        positionChanges: 0,
        conformedToMajority: false,
        conformityRounds: [],
      });
    }
  }

  /**
   * Finalizes a round and computes round snapshot.
   */
  finalizeRound(trajectory: DebateTrajectory, round: number): RoundSnapshot {
    const roundPositions = trajectory.allPositions.filter((p) => p.round === round);
    const positionDistribution = new Map<string, string[]>();

    for (const pos of roundPositions) {
      const agents = positionDistribution.get(pos.position) ?? [];
      agents.push(pos.agentId);
      positionDistribution.set(pos.position, agents);
    }

    const totalAgents = roundPositions.length;
    const { majorityPosition, majorityStrength } = this.findMajority(
      positionDistribution,
      totalAgents
    );

    const snapshot: RoundSnapshot = {
      round,
      positionDistribution,
      majorityPosition,
      majorityStrength,
    };

    trajectory.roundSnapshots.push(snapshot);
    this.detectConformity(trajectory, snapshot);

    return snapshot;
  }

  /**
   * Finds the majority position if threshold is met.
   */
  private findMajority(
    distribution: Map<string, string[]>,
    totalAgents: number
  ): { majorityPosition: string | null; majorityStrength: number | null } {
    let majorityPosition: string | null = null;
    let majorityStrength: number | null = null;

    for (const [position, agents] of distribution) {
      const strength = agents.length / totalAgents;
      if (strength >= this.config.majorityThreshold) {
        if (majorityStrength === null || strength > majorityStrength) {
          majorityPosition = position;
          majorityStrength = strength;
        }
      }
    }

    return { majorityPosition, majorityStrength };
  }

  /**
   * Detects conformity behavior in the trajectory.
   */
  private detectConformity(trajectory: DebateTrajectory, snapshot: RoundSnapshot): void {
    if (snapshot.majorityPosition === null || snapshot.round === 0) {
      return;
    }

    const prevSnapshot = trajectory.roundSnapshots.find((s) => s.round === snapshot.round - 1);
    if (prevSnapshot === undefined) {
      return;
    }

    for (const agentTrajectory of trajectory.agentTrajectories.values()) {
      this.checkAgentConformity(agentTrajectory, snapshot, prevSnapshot);
    }
  }

  /**
   * Checks if a single agent conformed to majority.
   */
  private checkAgentConformity(
    agentTrajectory: AgentTrajectory,
    snapshot: RoundSnapshot,
    prevSnapshot: RoundSnapshot
  ): void {
    const currentPos = agentTrajectory.positions.find((p) => p.round === snapshot.round);
    const prevPos = agentTrajectory.positions.find((p) => p.round === snapshot.round - 1);

    if (currentPos === undefined || prevPos === undefined) {
      return;
    }

    if (currentPos.position === prevPos.position) {
      return; // No position change
    }

    agentTrajectory.positionChanges++;

    if (currentPos.position !== snapshot.majorityPosition) {
      return; // Didn't change to majority
    }

    const wasInMajority =
      prevSnapshot.majorityPosition !== null && prevPos.position === prevSnapshot.majorityPosition;

    if (wasInMajority) {
      return; // Was already in majority
    }

    agentTrajectory.conformedToMajority = true;
    agentTrajectory.conformityRounds.push(snapshot.round);
    this.logConformity(
      agentTrajectory.agentId,
      snapshot.round,
      prevPos.position,
      currentPos.position
    );
  }

  /**
   * Logs conformity detection if verbose mode is enabled.
   */
  private logConformity(agentId: string, round: number, from: string, to: string): void {
    if (this.config.verbose) {
      this.logger.debug('Detected conformity', { agentId, round, from, to });
    }
  }

  /**
   * Computes anti-conformity scores for all agents.
   */
  computeScores(trajectory: DebateTrajectory): AntiConformityScore[] {
    const scores: AntiConformityScore[] = [];

    for (const agentTrajectory of trajectory.agentTrajectories.values()) {
      const score = this.computeAgentScore(agentTrajectory, trajectory);
      scores.push(score);
    }

    return scores;
  }

  /**
   * Computes anti-conformity score for a single agent.
   */
  private computeAgentScore(
    agentTrajectory: AgentTrajectory,
    trajectory: DebateTrajectory
  ): AntiConformityScore {
    const avgConfidence =
      agentTrajectory.positions.reduce((sum, p) => sum + p.confidence, 0) /
      Math.max(agentTrajectory.positions.length, 1);

    const maxPossibleChanges = Math.max(trajectory.totalRounds - 1, 1);
    const consistencyRatio = 1 - agentTrajectory.positionChanges / maxPossibleChanges;
    const baseScore = (avgConfidence + consistencyRatio) / 2;

    const conformityPenalty = agentTrajectory.conformedToMajority
      ? -this.config.conformityPenaltyWeight *
        (agentTrajectory.conformityRounds.length / maxPossibleChanges)
      : 0;

    const persistenceBonus = this.computePersistenceBonus(agentTrajectory, trajectory);
    const finalScore = Math.max(0, Math.min(1, baseScore + conformityPenalty + persistenceBonus));

    return {
      agentId: agentTrajectory.agentId,
      baseScore,
      conformityPenalty,
      persistenceBonus,
      finalScore,
    };
  }

  /**
   * Computes persistence bonus for agents who maintained minority positions.
   */
  private computePersistenceBonus(
    agentTrajectory: AgentTrajectory,
    trajectory: DebateTrajectory
  ): number {
    if (agentTrajectory.positions.length === 0) {
      return 0;
    }

    let minorityRounds = 0;
    let totalRoundsWithMajority = 0;

    for (const snapshot of trajectory.roundSnapshots) {
      if (snapshot.majorityPosition === null) {
        continue;
      }

      totalRoundsWithMajority++;
      const agentPos = agentTrajectory.positions.find((p) => p.round === snapshot.round);

      if (agentPos !== undefined && agentPos.position !== snapshot.majorityPosition) {
        minorityRounds++;
      }
    }

    if (totalRoundsWithMajority === 0) {
      return 0;
    }

    const persistenceRatio = minorityRounds / totalRoundsWithMajority;
    return persistenceRatio * this.config.persistenceBonusWeight;
  }

  /**
   * Evaluates the trajectory and determines the winning position.
   */
  evaluate(trajectory: DebateTrajectory): FreeMadResult {
    trajectory.endedAt = new Date();
    const scores = this.computeScores(trajectory);

    const positionScores = this.computePositionScores(trajectory, scores);

    const { winningPosition } = this.findWinningPosition(positionScores);

    const simpleVoteCounts = this.countSimpleVotes(trajectory);
    const simpleMajority = this.getSimpleMajority(simpleVoteCounts);
    const antiConformityMattered = simpleMajority !== winningPosition;

    const reasoning = this.generateReasoning(
      winningPosition,
      positionScores,
      scores,
      antiConformityMattered
    );

    this.logger.info('Free-MAD evaluation complete', {
      debateId: trajectory.debateId,
      winningPosition,
      antiConformityMattered,
      agentCount: trajectory.agentTrajectories.size,
      totalRounds: trajectory.totalRounds,
    });

    return {
      winningPosition,
      scores,
      positionScores,
      antiConformityMattered,
      reasoning,
      trajectory,
    };
  }

  /**
   * Computes weighted position scores.
   */
  private computePositionScores(
    trajectory: DebateTrajectory,
    scores: AntiConformityScore[]
  ): Map<string, number> {
    const positionScores = new Map<string, number>();

    for (const agentTrajectory of trajectory.agentTrajectories.values()) {
      const agentScore = scores.find((s) => s.agentId === agentTrajectory.agentId);
      if (agentScore === undefined) {
        continue;
      }

      const finalPos = agentTrajectory.positions[agentTrajectory.positions.length - 1];
      if (finalPos === undefined) {
        continue;
      }

      const currentScore = positionScores.get(finalPos.position) ?? 0;
      positionScores.set(finalPos.position, currentScore + agentScore.finalScore);
    }

    return positionScores;
  }

  /**
   * Finds the winning position from scores.
   */
  private findWinningPosition(positionScores: Map<string, number>): {
    winningPosition: string;
    maxScore: number;
  } {
    let winningPosition = '';
    let maxScore = -1;

    for (const [position, score] of positionScores) {
      if (score > maxScore) {
        maxScore = score;
        winningPosition = position;
      }
    }

    return { winningPosition, maxScore };
  }

  /**
   * Counts simple votes (ignoring anti-conformity).
   */
  private countSimpleVotes(trajectory: DebateTrajectory): Map<string, number> {
    const counts = new Map<string, number>();

    for (const agentTrajectory of trajectory.agentTrajectories.values()) {
      const finalPos = agentTrajectory.positions[agentTrajectory.positions.length - 1];
      if (finalPos !== undefined) {
        counts.set(finalPos.position, (counts.get(finalPos.position) ?? 0) + 1);
      }
    }

    return counts;
  }

  /**
   * Gets the simple majority position.
   */
  private getSimpleMajority(voteCounts: Map<string, number>): string {
    let majority = '';
    let maxCount = 0;

    for (const [position, count] of voteCounts) {
      if (count > maxCount) {
        maxCount = count;
        majority = position;
      }
    }

    return majority;
  }

  /**
   * Generates reasoning for the decision.
   */
  private generateReasoning(
    winningPosition: string,
    positionScores: Map<string, number>,
    agentScores: AntiConformityScore[],
    antiConformityMattered: boolean
  ): string {
    const parts: string[] = [];

    parts.push(`Winning position: "${winningPosition}"`);

    const scoresStr = Array.from(positionScores.entries())
      .map(([pos, score]) => `"${pos}": ${score.toFixed(2)}`)
      .join(', ');
    parts.push(`Position scores: {${scoresStr}}`);

    if (antiConformityMattered) {
      parts.push('Anti-conformity scoring changed the outcome from simple majority.');
      const conformerCount = agentScores.filter((s) => s.conformityPenalty < 0).length;
      if (conformerCount > 0) {
        parts.push(`${String(conformerCount)} agent(s) penalized for conforming to majority.`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Normalizes a position string for comparison.
   */
  private normalizePosition(position: string): string {
    return position.trim().toLowerCase();
  }

  /**
   * Converts trajectory votes to a debate trajectory.
   * For integration with existing consensus protocols.
   */
  trajectoryFromVotes(
    debateId: string,
    topic: string,
    votesByRound: TrajectoryVote[][]
  ): DebateTrajectory {
    const trajectory = this.createTrajectory(debateId, topic);

    for (let round = 0; round < votesByRound.length; round++) {
      const roundVotes = votesByRound[round];
      if (roundVotes === undefined) continue;

      for (const vote of roundVotes) {
        this.recordPosition({
          trajectory,
          agentId: vote.agentId,
          round,
          position: vote.decision,
          confidence: vote.confidence,
          ...(vote.reasoning !== undefined && { reasoning: vote.reasoning }),
        });
      }

      this.finalizeRound(trajectory, round);
    }

    return trajectory;
  }

  /**
   * Quick evaluation of single-round votes with pseudo-trajectory.
   * Creates a synthetic trajectory from current votes and historical context.
   */
  evaluateVotes(
    debateId: string,
    topic: string,
    votes: Array<{
      agentId: string;
      decision: VoteDecision;
      confidence: number;
      reasoning?: string;
    }>
  ): FreeMadResult {
    const trajectory = this.createTrajectory(debateId, topic);

    for (const vote of votes) {
      this.recordPosition({
        trajectory,
        agentId: vote.agentId,
        round: 0,
        position: vote.decision,
        confidence: vote.confidence,
        ...(vote.reasoning !== undefined && { reasoning: vote.reasoning }),
      });
    }

    this.finalizeRound(trajectory, 0);
    return this.evaluate(trajectory);
  }
}

/**
 * Creates a Free-MAD scorer with optional configuration.
 */
export function createFreeMadScorer(
  config?: Partial<FreeMadConfig>,
  logger?: ILogger
): FreeMadScorer {
  return new FreeMadScorer(config, logger);
}

/**
 * Quick evaluation of votes using Free-MAD scoring.
 */
export function evaluateWithAntiConformity(
  debateId: string,
  topic: string,
  votesByRound: TrajectoryVote[][]
): FreeMadResult {
  const scorer = createFreeMadScorer();
  const trajectory = scorer.trajectoryFromVotes(debateId, topic, votesByRound);
  return scorer.evaluate(trajectory);
}
