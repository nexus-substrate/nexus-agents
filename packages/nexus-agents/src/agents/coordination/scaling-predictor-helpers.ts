/**
 * Scaling Predictor Helpers
 *
 * Internal helper functions for the ScalingPredictor.
 * Extracted to keep main file under 400 lines.
 *
 * @module agents/coordination/scaling-predictor-helpers
 * (Source: Issue #337, arXiv:2512.08296)
 */

import type {
  CoordinationTopology,
  TaskFeatures,
  ModelCapability,
  ScalingPrinciple,
  ResourceEstimate,
  AlternativeStrategy,
  ScalingTaskType,
} from './scaling-types.js';
import { TASK_TYPE_PERFORMANCE, COORDINATION_OVERHEAD_FACTORS } from './scaling-types.js';
import { clamp } from '../../utils/math-utils.js';

// =============================================================================
// Topology Selection
// =============================================================================

/**
 * Check if single-agent topology should be used.
 */
function shouldUseSingleAgent(features: TaskFeatures, capability: ModelCapability): boolean {
  // Rule 1: Capability saturation
  if (capability.exceedsSaturationThreshold) return true;
  // Rule 2: Sequential reasoning degrades with multi-agent
  if (features.taskType === 'sequential_reasoning') return true;
  // Rule 3: Tool-heavy tasks suffer from coordination overhead
  if (features.toolIntensity > 0.7) return true;
  return false;
}

/**
 * Determine multi-agent topology based on task type.
 */
function selectMultiAgentTopology(features: TaskFeatures): CoordinationTopology {
  const { taskType, parallelizability } = features;

  // Rule 4: Parallelizable tasks benefit from centralized (+80.8%)
  if (taskType === 'parallelizable' && parallelizability >= 2) return 'centralized';
  // Rule 5: Web navigation benefits from decentralized (+45.7%)
  if (taskType === 'web_navigation') return 'decentralized';
  // Rule 6: Knowledge retrieval can use independent aggregation
  if (taskType === 'knowledge_retrieval' && parallelizability >= 2) return 'independent';
  // Rule 7: Code generation with parallelizable structure
  if (taskType === 'code_generation' && parallelizability >= 3) return 'centralized';

  return 'single_agent';
}

/**
 * Select optimal topology based on task features and capabilities.
 *
 * Decision rules from arXiv:2512.08296:
 * 1. Single agent when capability > saturation threshold (45%)
 * 2. Single agent for sequential reasoning (degrades with multi-agent)
 * 3. Single agent for tool-heavy tasks (coordination overhead)
 * 4. Centralized for parallelizable (+80.8%)
 * 5. Decentralized for web navigation (+45.7%)
 * 6. Independent for knowledge retrieval
 */
export function selectTopology(
  features: TaskFeatures,
  capability: ModelCapability,
  _principles: readonly ScalingPrinciple[]
): CoordinationTopology {
  if (shouldUseSingleAgent(features, capability)) {
    return 'single_agent';
  }
  return selectMultiAgentTopology(features);
}

// =============================================================================
// Agent Count Selection
// =============================================================================

/**
 * Select optimal agent count for a topology.
 */
export function selectAgentCount(topology: CoordinationTopology, features: TaskFeatures): number {
  switch (topology) {
    case 'single_agent':
      return 1;
    case 'centralized':
      // 1 coordinator + workers based on parallelizability (max 5)
      return Math.min(1 + features.parallelizability, 5);
    case 'decentralized':
      // 2-3 agents typically optimal for peer-to-peer
      return clamp(features.parallelizability, 2, 3);
    case 'independent':
      // 3-5 independent agents for aggregation
      return clamp(features.parallelizability, 3, 5);
    case 'hierarchical':
      // Tree structure based on complexity
      return clamp(Math.ceil(features.complexity * 7), 3, 7);
    default:
      return 1;
  }
}

// =============================================================================
// Success Rate Estimation
// =============================================================================

/**
 * Get performance multiplier for a multi-agent topology.
 */
function getMultiplier(
  topology: 'centralized' | 'decentralized' | 'independent',
  features: TaskFeatures
): number {
  const perf = TASK_TYPE_PERFORMANCE[features.taskType];
  const multiplier = 1 + perf[topology];

  // Additional penalty for sequential dependencies with independent topology
  if (topology === 'independent' && features.hasSequentialDependencies) {
    return multiplier * 0.3; // Significant degradation
  }
  return multiplier;
}

/**
 * Estimate success rate for a topology given task and capability.
 */
export function estimateSuccessRate(
  topology: CoordinationTopology,
  features: TaskFeatures,
  capability: ModelCapability
): number {
  const baseRate = capability.estimatedAccuracy;

  // Single agent has no multiplier
  if (topology === 'single_agent') {
    return clamp(baseRate, 0, 1);
  }

  // Hierarchical uses conservative estimate
  if (topology === 'hierarchical') {
    return clamp(baseRate * 0.95, 0, 1);
  }

  // Multi-agent topologies: centralized, decentralized, independent
  const multiplier = getMultiplier(topology, features);
  return clamp(baseRate * multiplier, 0, 1);
}

// =============================================================================
// Confidence Calculation
// =============================================================================

/**
 * Calculate prediction confidence.
 */
export function calculateConfidence(
  features: TaskFeatures,
  principles: readonly ScalingPrinciple[]
): number {
  let confidence = features.typeConfidence;

  // Higher confidence when more high-relevance principles apply
  const highRelevanceCount = principles.filter((p) => p.relevance === 'high').length;
  confidence *= 1 + highRelevanceCount * 0.1;

  // Lower confidence for unknown task types
  if (features.taskType === 'unknown') {
    confidence *= 0.5;
  }

  // Lower confidence for low type confidence
  if (features.typeConfidence < 0.4) {
    confidence *= 0.8;
  }

  return clamp(confidence, 0, 1);
}

// =============================================================================
// Resource Estimation
// =============================================================================

/**
 * Estimate resource utilization.
 */
export function estimateResources(
  topology: CoordinationTopology,
  agentCount: number,
  features: TaskFeatures,
  capability: ModelCapability
): ResourceEstimate {
  const baseTokens = features.estimatedTokens;
  const baseLatency = capability.avgLatencyMs;

  // Get coordination overhead factor
  const overhead = COORDINATION_OVERHEAD_FACTORS[topology];

  // Token estimate: base * agents * (1 + overhead)
  const estimatedTokens = Math.ceil(baseTokens * agentCount * (1 + overhead));

  // Latency estimate: single agent is serial, multi-agent can parallelize
  const parallelizationFactor = topology === 'single_agent' ? 1 : 0.6;
  const estimatedLatencyMs = Math.ceil(baseLatency * (1 + overhead) * parallelizationFactor);

  // Cost estimate: relative cost * agents * (1 + overhead)
  const estimatedCost = capability.relativeCost * agentCount * (1 + overhead);

  return {
    estimatedTokens,
    estimatedLatencyMs,
    estimatedCost,
    coordinationOverhead: overhead,
  };
}

// =============================================================================
// Alternative Strategies
// =============================================================================

/**
 * Generate alternative strategies for comparison.
 */
export function generateAlternatives(
  recommended: CoordinationTopology,
  features: TaskFeatures,
  capability: ModelCapability
): readonly AlternativeStrategy[] {
  const alternatives: AlternativeStrategy[] = [];
  const topologies: CoordinationTopology[] = [
    'single_agent',
    'centralized',
    'decentralized',
    'independent',
  ];

  for (const topology of topologies) {
    if (topology === recommended) continue;

    const agentCount = selectAgentCount(topology, features);
    const successRate = estimateSuccessRate(topology, features, capability);

    alternatives.push({
      topology,
      agentCount,
      expectedSuccessRate: successRate,
      tradeoffs: getTradeoffs(topology, features),
    });
  }

  // Sort by expected success rate descending
  return alternatives.sort((a, b) => b.expectedSuccessRate - a.expectedSuccessRate);
}

/**
 * Get tradeoff descriptions for a topology.
 */
export function getTradeoffs(
  topology: CoordinationTopology,
  features: TaskFeatures
): readonly string[] {
  const tradeoffs: string[] = [];

  switch (topology) {
    case 'single_agent':
      tradeoffs.push('No coordination overhead');
      tradeoffs.push('Limited parallelization');
      if (features.parallelizability > 2) {
        tradeoffs.push('May not leverage parallelizable structure');
      }
      break;
    case 'centralized':
      tradeoffs.push('Good for parallelizable tasks (+80.8%)');
      tradeoffs.push('Single point of failure at coordinator');
      if (features.toolIntensity > 0.5) {
        tradeoffs.push('May suffer from tool-coordination trade-off');
      }
      break;
    case 'decentralized':
      tradeoffs.push('Resilient to single failures');
      tradeoffs.push('Higher communication overhead (25%)');
      tradeoffs.push('Best for web navigation (+45.7%)');
      break;
    case 'independent':
      tradeoffs.push('Maximum parallelization potential');
      tradeoffs.push('17.2x error amplification risk');
      if (features.hasSequentialDependencies) {
        tradeoffs.push('Warning: Task has sequential dependencies');
      }
      break;
    case 'hierarchical':
      tradeoffs.push('Structured coordination for complex tasks');
      tradeoffs.push('Highest coordination overhead (30%)');
      break;
  }

  return tradeoffs;
}

// =============================================================================
// Metrics Key Generation
// =============================================================================

/**
 * Generate metrics key for topology + task type combination.
 */
export function metricsKey(topology: CoordinationTopology, taskType: ScalingTaskType): string {
  return `${topology}:${taskType}`;
}

// =============================================================================
