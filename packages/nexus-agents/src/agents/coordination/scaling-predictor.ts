/**
 * Scaling Predictor for Multi-Agent Coordination
 *
 * Predicts optimal coordination topology based on task features and
 * model capabilities. Based on research from arXiv:2512.08296
 * "Towards a Science of Scaling Agent Systems".
 *
 * Key findings applied:
 * - Capability Saturation: Multi-agent shows diminishing returns when
 *   single-agent exceeds 45% accuracy
 * - Tool-Coordination Trade-off: Tool-heavy tasks suffer from multi-agent overhead
 * - Topology-Dependent Error Amplification: Independent agents amplify errors
 *   17.2x vs 4.4x for centralized
 *
 * @module agents/coordination/scaling-predictor
 * (Source: Issue #337, arXiv:2512.08296)
 */

import type { Task, ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type {
  ScalingPrediction,
  ScalingPredictorConfig,
  TaskFeatures,
  ModelCapability,
  CoordinationTopology,
  ScalingTaskType,
  ScalingPrinciple,
  CoordinationMetrics,
} from './scaling-types.js';
import { DEFAULT_SCALING_CONFIG } from './scaling-types.js';
import { extractTaskFeatures } from './task-features.js';
import { estimateModelCapability } from './capability-estimator.js';
import {
  selectTopology,
  selectAgentCount,
  estimateSuccessRate,
  calculateConfidence,
  estimateResources,
  generateAlternatives,
  metricsKey,
} from './scaling-predictor-helpers.js';

// =============================================================================
// Scaling Predictor Class
// =============================================================================

/**
 * Scaling Predictor for multi-agent coordination optimization.
 *
 * Predicts optimal coordination topology based on task features and
 * model capabilities using principles from arXiv:2512.08296.
 *
 * @example
 * ```typescript
 * const predictor = new ScalingPredictor();
 * const prediction = predictor.predict(task, ['claude-3-opus', 'gpt-4']);
 *
 * if (prediction.recommendedTopology === 'single_agent') {
 *   // Use single agent execution
 * } else {
 *   // Set up multi-agent coordination with recommended topology
 *   console.log(`Use ${prediction.recommendedAgentCount} agents`);
 * }
 * ```
 */
export class ScalingPredictor {
  private readonly config: Required<ScalingPredictorConfig>;
  private readonly metricsHistory = new Map<string, CoordinationMetrics>();
  private readonly logger: ILogger;

  constructor(config?: Partial<ScalingPredictorConfig>) {
    this.config = { ...DEFAULT_SCALING_CONFIG, ...config };
    this.logger = createLogger({ component: 'scaling-predictor' });
  }

  /**
   * Predict optimal coordination strategy for a task.
   *
   * @param task - Task to analyze
   * @param availableModels - List of available model IDs
   * @returns Prediction with recommended topology and reasoning
   * @throws Error if no models are available
   */
  predict(task: Task, availableModels: readonly string[]): ScalingPrediction {
    if (availableModels.length === 0) {
      throw new Error('At least one model must be available for prediction');
    }

    // 1. Extract task features
    const features = extractTaskFeatures(task);

    // 2. Estimate model capabilities
    const capabilities = availableModels.map((modelId) =>
      estimateModelCapability(modelId, features.taskType)
    );

    // 3. Apply scaling principles and generate prediction
    const prediction = this.applyScalingPrinciples(features, capabilities);

    this.logger.debug('Scaling prediction generated', {
      taskId: task.id,
      taskType: features.taskType,
      topology: prediction.recommendedTopology,
      confidence: prediction.confidence,
    });

    return prediction;
  }

  /**
   * Apply the three scaling principles from research.
   */
  private applyScalingPrinciples(
    features: TaskFeatures,
    capabilities: readonly ModelCapability[]
  ): ScalingPrediction {
    const bestCapability = findBestCapability(capabilities);
    const { principles, reasons, warnings } = extractPrinciples(features, bestCapability);

    return buildPrediction(features, bestCapability, principles, reasons, warnings);
  }

  /**
   * Record execution outcome for metrics improvement.
   *
   * @param topology - Topology that was used
   * @param taskType - Type of task that was executed
   * @param success - Whether execution succeeded
   * @param latencyMs - Execution latency in milliseconds
   */
  recordOutcome(
    topology: CoordinationTopology,
    taskType: ScalingTaskType,
    success: boolean,
    latencyMs: number
  ): void {
    if (!this.config.collectMetrics) return;

    const key = metricsKey(topology, taskType);
    const existing = this.metricsHistory.get(key);

    if (existing) {
      const newCount = existing.sampleCount + 1;
      const newSuccessRate =
        (existing.successRate * existing.sampleCount + (success ? 1 : 0)) / newCount;
      const newLatency =
        (existing.coordinationLatencyMs * existing.sampleCount + latencyMs) / newCount;

      this.metricsHistory.set(key, {
        ...existing,
        successRate: newSuccessRate,
        coordinationLatencyMs: newLatency,
        sampleCount: newCount,
      });
    } else {
      this.metricsHistory.set(key, {
        errorAmplificationFactor: 1,
        communicationOverhead: 0.2,
        coordinationLatencyMs: latencyMs,
        successRate: success ? 1 : 0,
        sampleCount: 1,
      });
    }

    this.logger.debug('Recorded coordination outcome', {
      topology,
      taskType,
      success,
      latencyMs,
      totalSamples: this.metricsHistory.get(key)?.sampleCount,
    });
  }

  /**
   * Get collected metrics for analysis.
   */
  getMetrics(): Map<string, CoordinationMetrics> {
    return new Map(this.metricsHistory);
  }

  /**
   * Clear collected metrics.
   */
  clearMetrics(): void {
    this.metricsHistory.clear();
  }

  /**
   * Get metrics for a specific topology + task type combination.
   */
  getMetricsFor(
    topology: CoordinationTopology,
    taskType: ScalingTaskType
  ): CoordinationMetrics | undefined {
    return this.metricsHistory.get(metricsKey(topology, taskType));
  }

  /**
   * Check if sufficient metrics exist for reliable historical data.
   */
  hasReliableMetrics(topology: CoordinationTopology, taskType: ScalingTaskType): boolean {
    const metrics = this.getMetricsFor(topology, taskType);
    return metrics !== undefined && metrics.sampleCount >= this.config.minMetricsSamples;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new ScalingPredictor instance.
 *
 * @param config - Optional configuration
 * @returns New ScalingPredictor instance
 */
export function createScalingPredictor(config?: Partial<ScalingPredictorConfig>): ScalingPredictor {
  return new ScalingPredictor(config);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find the best capability from a list.
 */
function findBestCapability(capabilities: readonly ModelCapability[]): ModelCapability {
  return capabilities.reduce((best, cap) =>
    cap.estimatedAccuracy > best.estimatedAccuracy ? cap : best
  );
}

/**
 * Result of principle extraction.
 */
interface PrincipleResult {
  readonly principles: ScalingPrinciple[];
  readonly reasons: string[];
  readonly warnings: string[];
}

/**
 * Extract scaling principles applicable to this prediction.
 */
function extractPrinciples(features: TaskFeatures, cap: ModelCapability): PrincipleResult {
  const principles: ScalingPrinciple[] = [];
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Principle 1: Capability Saturation
  if (cap.exceedsSaturationThreshold) {
    principles.push({
      name: 'Capability Saturation',
      description: 'Single-agent exceeds 45% threshold; multi-agent may have diminishing returns',
      relevance: 'high',
    });
    reasons.push(
      `Best model (${cap.modelId}) exceeds saturation threshold ` +
        `(${(cap.estimatedAccuracy * 100).toFixed(0)}% > 45%)`
    );
  }

  // Principle 2: Tool-Coordination Trade-off
  if (features.toolIntensity > 0.6) {
    principles.push({
      name: 'Tool-Coordination Trade-off',
      description: 'Tool-heavy tasks suffer disproportionately from multi-agent overhead',
      relevance: 'high',
    });
    reasons.push(
      `High tool intensity detected (${(features.toolIntensity * 100).toFixed(0)}%); ` +
        'coordination overhead may hurt performance'
    );
  }

  // Principle 3: Topology-Dependent Error Amplification
  if (features.taskType === 'sequential_reasoning') {
    principles.push({
      name: 'Topology-Dependent Error Amplification',
      description: 'Sequential reasoning tasks degrade 39-70% with multi-agent coordination',
      relevance: 'high',
    });
    warnings.push(
      'Sequential reasoning tasks perform significantly worse with multi-agent coordination'
    );
  }

  // Add warning for sequential dependencies
  if (features.hasSequentialDependencies) {
    warnings.push(
      'Task has sequential dependencies - independent topology would amplify errors 17.2x'
    );
  }

  return { principles, reasons, warnings };
}

/**
 * Build the final prediction from extracted components.
 */
function buildPrediction(
  features: TaskFeatures,
  bestCapability: ModelCapability,
  principles: ScalingPrinciple[],
  reasons: string[],
  warnings: string[]
): ScalingPrediction {
  const topology = selectTopology(features, bestCapability, principles);
  const agentCount = selectAgentCount(topology, features);

  return {
    recommendedTopology: topology,
    recommendedAgentCount: agentCount,
    confidence: calculateConfidence(features, principles),
    predictedSuccessRate: estimateSuccessRate(topology, features, bestCapability),
    resourceEstimate: estimateResources(topology, agentCount, features, bestCapability),
    reasoning: { primaryFactors: reasons, appliedPrinciples: principles, warnings },
    alternatives: generateAlternatives(topology, features, bestCapability),
  };
}
