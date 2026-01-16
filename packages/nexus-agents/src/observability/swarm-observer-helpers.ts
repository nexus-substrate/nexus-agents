/**
 * nexus-agents/observability - SwarmObserver Helpers
 *
 * Pure helper functions for SwarmObserver calculations.
 * Extracted to keep swarm-observer.ts under 400 lines.
 *
 * @module observability/swarm-observer-helpers
 * (Source: Alignment Roadmap Phase 1, Issue #158)
 */

import type {
  AgentId,
  AgentEvent,
  ContributionScore,
  InteractionGraph,
} from './swarm-observer-types.js';

/**
 * Queue metrics for bottleneck detection.
 */
export interface AgentQueueMetrics {
  agentId: AgentId;
  pendingMessages: number;
  lastMessageTime: number;
  totalWaitTimeMs: number;
  messageCount: number;
}

/**
 * Calculate bottleneck severity based on queued messages and blocked agents.
 */
export function calculateSeverity(
  queuedMessages: number,
  blockedAgents: number
): 'low' | 'medium' | 'high' | 'critical' {
  const score = queuedMessages + blockedAgents * 2;
  if (score >= 20) return 'critical';
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

/**
 * Calculate cluster cohesion (ratio of internal edges to max possible).
 */
export function calculateClusterCohesion(agents: AgentId[], graph: InteractionGraph): number {
  if (agents.length < 2) return 0;

  let internalEdges = 0;
  const agentSet = new Set(agents);

  for (const agent of agents) {
    const outgoing = graph.getOutgoingEdges(agent);
    for (const edge of outgoing) {
      if (agentSet.has(edge.to)) {
        internalEdges++;
      }
    }
  }

  const maxPossible = agents.length * (agents.length - 1);
  return maxPossible > 0 ? internalEdges / maxPossible : 0;
}

/**
 * Count internal and external interactions for a cluster.
 */
export function countClusterInteractions(
  agents: AgentId[],
  graph: InteractionGraph
): { internal: number; external: number } {
  const agentSet = new Set(agents);
  let internal = 0;
  let external = 0;

  for (const agent of agents) {
    for (const edge of graph.getOutgoingEdges(agent)) {
      if (agentSet.has(edge.to)) {
        internal++;
      } else {
        external++;
      }
    }
  }

  return { internal, external };
}

/**
 * Find the dominant interaction pattern within a cluster.
 */
export function findDominantPattern(
  agents: AgentId[],
  graph: InteractionGraph
): string | undefined {
  const agentSet = new Set(agents);
  const patterns = new Map<string, number>();

  for (const agent of agents) {
    for (const edge of graph.getOutgoingEdges(agent)) {
      if (agentSet.has(edge.to)) {
        const count = patterns.get(edge.interactionType) ?? 0;
        patterns.set(edge.interactionType, count + 1);
      }
    }
  }

  let maxCount = 0;
  let dominant: string | undefined;
  for (const [pattern, count] of patterns) {
    if (count > maxCount) {
      maxCount = count;
      dominant = pattern;
    }
  }

  return dominant;
}

/**
 * Calculate contribution score for an agent based on their events.
 */
export function calculateContribution(agentId: AgentId, events: AgentEvent[]): ContributionScore {
  let messagesSent = 0;
  let messagesReceived = 0;
  let activeTimeMs = 0;
  let successfulTools = 0;
  let errorCount = 0;

  for (const event of events) {
    if (event.payload.type === 'message') {
      if (event.payload.direction === 'sent') messagesSent++;
      else messagesReceived++;
    } else if (event.payload.type === 'tool' && event.payload.phase === 'completed') {
      if (event.payload.success === true) successfulTools++;
    } else if (event.payload.type === 'error') {
      errorCount++;
    }
    if (event.durationMs !== undefined && event.durationMs > 0) {
      activeTimeMs += event.durationMs;
    }
  }

  // Simple scoring: weight successful actions, penalize errors
  const score = messagesSent * 0.1 + successfulTools * 0.3 - errorCount * 0.2;

  return {
    agentId,
    score: Math.max(0, Math.min(1, score)),
    messagesSent,
    messagesReceived,
    activeTimeMs,
    successfulTools,
    errorCount,
  };
}

/**
 * Normalize contribution scores so they sum to 1.
 */
export function normalizeScores(
  scores: Map<AgentId, ContributionScore>
): Map<AgentId, ContributionScore> {
  const total = Array.from(scores.values()).reduce((sum, s) => sum + s.score, 0);
  if (total === 0) return scores;

  for (const [agentId, contribution] of scores) {
    scores.set(agentId, {
      ...contribution,
      score: contribution.score / total,
    });
  }

  return scores;
}
