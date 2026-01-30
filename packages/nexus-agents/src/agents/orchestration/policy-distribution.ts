/**
 * Policy Distribution Functions
 *
 * Distribution conversion and sampling for rule-based agent selection.
 * Converts raw scores to probability distributions via softmax,
 * enforces minimum probabilities, and provides sampling methods.
 *
 * @module agents/orchestration/policy-distribution
 * (Source: Issue #335, Issue #352, arXiv:2505.19591)
 */

import { getRandomProvider } from '../../core/index.js';
import type { AgentDistribution } from './puppeteer-types.js';
import type { AgentScores } from './policy-scoring.js';

// =============================================================================
// Softmax Distribution
// =============================================================================

/**
 * Apply softmax with temperature to convert scores to probabilities.
 */
export function softmax(scores: Map<string, number>, temperature: number): Map<string, number> {
  const scaledScores = new Map<string, number>();
  let maxScore = -Infinity;

  for (const score of scores.values()) {
    if (score > maxScore) maxScore = score;
  }

  let sumExp = 0;
  for (const [agentId, score] of scores) {
    const scaled = Math.exp((score - maxScore) / temperature);
    scaledScores.set(agentId, scaled);
    sumExp += scaled;
  }

  const probabilities = new Map<string, number>();
  for (const [agentId, scaled] of scaledScores) {
    probabilities.set(agentId, scaled / sumExp);
  }

  return probabilities;
}

/**
 * Enforce minimum probability for all agents.
 * Redistributes probability mass from high-prob agents to low-prob agents.
 */
export function enforceMinProbability(
  probs: Map<string, number>,
  agents: readonly string[],
  minProb: number
): void {
  const agentCount = agents.length;
  const maxMinTotal = minProb * agentCount;

  if (maxMinTotal >= 1) return; // Cannot enforce minimum

  let deficit = 0;
  let surplus = 0;

  for (const agentId of agents) {
    const prob = probs.get(agentId) ?? 0;
    if (prob < minProb) {
      deficit += minProb - prob;
      probs.set(agentId, minProb);
    } else {
      surplus += prob - minProb;
    }
  }

  // Redistribute deficit from surplus
  if (deficit > 0 && surplus > 0) {
    for (const agentId of agents) {
      const prob = probs.get(agentId) ?? 0;
      if (prob > minProb) {
        const reduction = ((prob - minProb) / surplus) * deficit;
        probs.set(agentId, prob - reduction);
      }
    }
  }
}

/**
 * Generate human-readable reasoning for agent selection.
 */
export function generateReasoning(
  scores: Map<string, AgentScores>,
  agents: readonly string[]
): string {
  const sorted = [...agents].sort((a, b) => {
    return (scores.get(b)?.total ?? 0) - (scores.get(a)?.total ?? 0);
  });

  const top = sorted[0];
  if (top === undefined) return 'No agents available.';

  const topScores = scores.get(top);
  if (!topScores) return 'No scores computed.';

  const parts: string[] = [`Top choice: ${top}`];

  if (topScores.capability > 0.7) {
    parts.push('Good capability match for task');
  }
  if (topScores.recency > 0.8) {
    parts.push('Not recently used');
  }
  if (topScores.patternMatch > 0.7) {
    parts.push('Follows expected pattern');
  }
  if (topScores.progressAdjust > 0.2) {
    parts.push('Appropriate for current progress');
  }

  return parts.join('. ');
}

/**
 * Convert agent scores to probability distribution.
 */
export function scoresToDistribution(
  scores: Map<string, AgentScores>,
  agents: readonly string[],
  temperature: number,
  minProbability: number
): AgentDistribution {
  const rawScores = new Map<string, number>();
  for (const [agentId, agentScores] of scores) {
    rawScores.set(agentId, agentScores.total);
  }

  // Apply softmax with temperature
  const probabilities = softmax(rawScores, temperature);

  // Ensure minimum probability
  enforceMinProbability(probabilities, agents, minProbability);

  // Generate reasoning
  const reasoning = generateReasoning(scores, agents);

  return { probabilities, rawScores, reasoning };
}

// =============================================================================
// Sampling Functions
// =============================================================================

/**
 * Select agent with highest probability (deterministic).
 */
export function argmax(distribution: AgentDistribution): string {
  let maxProb = -1;
  let maxAgent = '';

  for (const [agentId, prob] of distribution.probabilities) {
    if (prob > maxProb) {
      maxProb = prob;
      maxAgent = agentId;
    }
  }

  return maxAgent;
}

/**
 * Sample agent according to probability distribution.
 */
export function weightedSample(distribution: AgentDistribution): string {
  const random = getRandomProvider().random();
  let cumulative = 0;

  for (const [agentId, prob] of distribution.probabilities) {
    cumulative += prob;
    if (random <= cumulative) {
      return agentId;
    }
  }

  // Fallback to last agent (should not happen with valid probabilities)
  const entries = [...distribution.probabilities.entries()];
  return entries[entries.length - 1]?.[0] ?? '';
}

/**
 * Sample an agent from distribution (deterministic or stochastic).
 */
export function sampleFromDistribution(
  distribution: AgentDistribution,
  deterministic: boolean
): string {
  if (deterministic) {
    return argmax(distribution);
  }
  return weightedSample(distribution);
}
