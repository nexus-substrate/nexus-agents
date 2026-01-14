/**
 * nexus-agents/agents - Free-MAD Scoring Helpers
 *
 * Internal helper functions for Free-MAD scoring operations.
 *
 * @module agents/collaboration/free-mad-helpers
 */

import type { ILogger } from '../../core/index.js';
import type {
  AgentTrajectory,
  RoundSnapshot,
  AntiConformityScore,
  DebateTrajectory,
  FreeMadConfig,
} from './free-mad-types.js';

/**
 * Finds the majority position if threshold is met.
 */
export function findMajority(
  distribution: Map<string, string[]>,
  totalAgents: number,
  majorityThreshold: number
): { majorityPosition: string | null; majorityStrength: number | null } {
  let majorityPosition: string | null = null;
  let majorityStrength: number | null = null;

  for (const [position, agents] of distribution) {
    const strength = agents.length / totalAgents;
    if (strength >= majorityThreshold) {
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
export function detectConformity(
  trajectory: DebateTrajectory,
  snapshot: RoundSnapshot,
  config: FreeMadConfig,
  logger: ILogger
): void {
  if (snapshot.majorityPosition === null || snapshot.round === 0) {
    return;
  }

  const prevSnapshot = trajectory.roundSnapshots.find((s) => s.round === snapshot.round - 1);
  if (prevSnapshot === undefined) {
    return;
  }

  for (const agentTrajectory of trajectory.agentTrajectories.values()) {
    checkAgentConformity(agentTrajectory, snapshot, prevSnapshot, config, logger);
  }
}

/**
 * Checks if a single agent conformed to majority.
 */
export function checkAgentConformity(
  agentTrajectory: AgentTrajectory,
  snapshot: RoundSnapshot,
  prevSnapshot: RoundSnapshot,
  config: FreeMadConfig,
  logger: ILogger
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

  if (config.verbose) {
    logger.debug('Detected conformity', {
      agentId: agentTrajectory.agentId,
      round: snapshot.round,
      from: prevPos.position,
      to: currentPos.position,
    });
  }
}

/**
 * Computes weighted position scores.
 */
export function computePositionScores(
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
export function findWinningPosition(positionScores: Map<string, number>): {
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
export function countSimpleVotes(trajectory: DebateTrajectory): Map<string, number> {
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
export function getSimpleMajority(voteCounts: Map<string, number>): string {
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
export function generateReasoning(
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
