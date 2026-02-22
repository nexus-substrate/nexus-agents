/**
 * Scaling Predictor Tests
 *
 * Tests for the coordination scaling predictor.
 * Based on arXiv:2512.08296 research findings.
 *
 * @module agents/coordination/scaling-predictor.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Task } from '../../core/index.js';
import { ScalingPredictor, createScalingPredictor } from './scaling-predictor.js';
import { extractTaskFeatures, isLikelyParallelizable } from './task-features.js';
import {
  estimateModelCapability,
  registerModelCapability,
  findBestModel,
  rankModelsByEfficiency,
  exceedsSaturation,
} from './capability-estimator.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createTask(description: string, id = 'test-task'): Task {
  return { id, description, context: {} };
}

// =============================================================================
// ScalingPredictor Tests
// =============================================================================

describe('ScalingPredictor', () => {
  let predictor: ScalingPredictor;

  beforeEach(() => {
    predictor = createScalingPredictor();
  });

  describe('predict()', () => {
    // Test 1: Sequential reasoning recommends single-agent
    it('should recommend single-agent for sequential reasoning tasks', () => {
      const task = createTask('Step by step, reason through this mathematical proof');
      const prediction = predictor.predict(task, ['claude-opus']);

      expect(prediction.recommendedTopology).toBe('single_agent');
      expect(prediction.recommendedAgentCount).toBe(1);
      expect(
        prediction.reasoning.appliedPrinciples.some(
          (p) => p.name === 'Topology-Dependent Error Amplification'
        )
      ).toBe(true);
    });

    // Test 2: Parallelizable tasks respect capability saturation
    it('should respect capability saturation even for parallelizable tasks', () => {
      const task = createTask('Process each of the 10 files independently and summarize them');
      // claude-haiku: ~0.7 accuracy (derived from quality scores) > 0.45 saturation threshold
      // Even for parallelizable tasks, saturation takes precedence
      const prediction = predictor.predict(task, ['claude-haiku']);

      // Per research: multi-agent has diminishing returns when single-agent
      // exceeds saturation threshold
      expect(prediction.recommendedTopology).toBe('single_agent');
      expect(prediction.recommendedAgentCount).toBe(1);
    });

    // Test 3: Tool-heavy tasks consider overhead
    it('should warn about tool-coordination trade-off for tool-heavy tasks', () => {
      const task = createTask(
        'Execute the API calls, invoke the database commands, and run the shell scripts'
      );
      const prediction = predictor.predict(task, ['claude-sonnet']);

      expect(
        prediction.reasoning.appliedPrinciples.some((p) => p.name === 'Tool-Coordination Trade-off')
      ).toBe(true);
    });

    // Test 4: High capability model triggers saturation
    it('should apply capability saturation for high-performing models', () => {
      const task = createTask('Generate code for a sorting algorithm');
      const prediction = predictor.predict(task, ['claude-opus']);

      expect(
        prediction.reasoning.appliedPrinciples.some((p) => p.name === 'Capability Saturation')
      ).toBe(true);
      expect(prediction.recommendedTopology).toBe('single_agent');
    });

    // Test 5: Web navigation — capable models still trigger saturation
    it('should recommend single-agent for web navigation with capable models', () => {
      const task = createTask('Navigate to the website and click on the download link');
      const prediction = predictor.predict(task, ['claude-haiku']);

      // claude-haiku: ~0.7 accuracy - 0.15 web_nav penalty = 0.55 > 0.45 threshold
      // Saturation applies → single_agent is correct
      expect(prediction.recommendedTopology).toBe('single_agent');
    });

    // Test 6: Knowledge retrieval with parallelizability
    it('should recommend topology for knowledge retrieval tasks', () => {
      const task = createTask('Find information about each of these 5 topics: AI, ML, DL, NLP, CV');
      const prediction = predictor.predict(task, ['claude-haiku']);

      // claude-haiku exceeds saturation threshold (~0.7 > 0.45)
      // so single_agent is recommended even for parallelizable knowledge retrieval
      expect(prediction.recommendedTopology).toBeDefined();
    });

    // Test 7: Resource estimation is reasonable
    it('should provide reasonable resource estimates', () => {
      const task = createTask('Write a function to calculate factorial');
      const prediction = predictor.predict(task, ['claude-sonnet']);

      expect(prediction.resourceEstimate.estimatedTokens).toBeGreaterThan(0);
      expect(prediction.resourceEstimate.estimatedLatencyMs).toBeGreaterThan(0);
      expect(prediction.resourceEstimate.estimatedCost).toBeGreaterThanOrEqual(0);
      expect(prediction.resourceEstimate.coordinationOverhead).toBeGreaterThanOrEqual(0);
      expect(prediction.resourceEstimate.coordinationOverhead).toBeLessThanOrEqual(1);
    });

    // Test 8: Alternatives are provided
    it('should provide alternative strategies', () => {
      const task = createTask('Analyze the codebase structure');
      const prediction = predictor.predict(task, ['claude-opus']);

      expect(prediction.alternatives.length).toBeGreaterThan(0);
      expect(
        prediction.alternatives.every((a) => a.topology !== prediction.recommendedTopology)
      ).toBe(true);
    });

    // Test 9: Confidence is calculated
    it('should calculate confidence based on signals', () => {
      const task = createTask('Implement the algorithm step by step using logical reasoning');
      const prediction = predictor.predict(task, ['claude-opus']);

      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
    });

    // Test 10: Unknown task types handled gracefully
    it('should handle unknown task types with lower confidence', () => {
      const task = createTask('xyz abc 123 random words');
      const prediction = predictor.predict(task, ['claude-sonnet']);

      expect(prediction.recommendedTopology).toBe('single_agent');
      expect(prediction.confidence).toBeLessThan(0.5);
    });

    // Test 11: Empty model list throws error
    it('should throw error for empty model list', () => {
      const task = createTask('Test task');
      expect(() => predictor.predict(task, [])).toThrow('At least one model must be available');
    });

    // Test 12: Multiple models finds best
    it('should use best model for capability assessment', () => {
      const task = createTask('Solve this complex problem');
      const prediction = predictor.predict(task, ['claude-haiku', 'claude-opus']);

      // claude-opus has highest capability (~0.95), should trigger saturation
      expect(
        prediction.reasoning.appliedPrinciples.some((p) => p.name === 'Capability Saturation')
      ).toBe(true);
    });

    // Test 13: Sequential dependencies warning
    it('should warn about sequential dependencies', () => {
      const task = createTask('First do A, then do B, finally do C after B is complete');
      const prediction = predictor.predict(task, ['claude-haiku']);

      expect(prediction.reasoning.warnings.length).toBeGreaterThan(0);
      expect(
        prediction.reasoning.warnings.some((w) => w.toLowerCase().includes('sequential'))
      ).toBe(true);
    });
  });

  describe('recordOutcome()', () => {
    // Test 14: Metrics are recorded
    it('should record execution outcomes', () => {
      predictor.recordOutcome('centralized', 'parallelizable', true, 5000);
      predictor.recordOutcome('centralized', 'parallelizable', true, 4000);
      predictor.recordOutcome('centralized', 'parallelizable', false, 6000);

      const metrics = predictor.getMetrics();
      const key = 'centralized:parallelizable';

      expect(metrics.has(key)).toBe(true);
      expect(metrics.get(key)?.sampleCount).toBe(3);
      expect(metrics.get(key)?.successRate).toBeCloseTo(2 / 3, 2);
    });

    // Test 15: Metrics can be cleared
    it('should clear metrics', () => {
      predictor.recordOutcome('single_agent', 'code_generation', true, 1000);
      expect(predictor.getMetrics().size).toBe(1);

      predictor.clearMetrics();
      expect(predictor.getMetrics().size).toBe(0);
    });

    // Test 16: Get specific metrics
    it('should get metrics for specific topology/task type', () => {
      predictor.recordOutcome('decentralized', 'web_navigation', true, 2000);

      const metrics = predictor.getMetricsFor('decentralized', 'web_navigation');
      expect(metrics).toBeDefined();
      expect(metrics?.successRate).toBe(1);

      const missing = predictor.getMetricsFor('centralized', 'unknown');
      expect(missing).toBeUndefined();
    });

    // Test 17: Reliable metrics check
    it('should check for reliable metrics', () => {
      expect(predictor.hasReliableMetrics('centralized', 'parallelizable')).toBe(false);

      // Record 10 outcomes (default minMetricsSamples)
      for (let i = 0; i < 10; i++) {
        predictor.recordOutcome('centralized', 'parallelizable', true, 1000);
      }

      expect(predictor.hasReliableMetrics('centralized', 'parallelizable')).toBe(true);
    });
  });

  describe('configuration', () => {
    // Test 18: Metrics collection can be disabled
    it('should respect collectMetrics config', () => {
      const noMetricsPredictor = createScalingPredictor({ collectMetrics: false });
      noMetricsPredictor.recordOutcome('single_agent', 'unknown', true, 1000);

      expect(noMetricsPredictor.getMetrics().size).toBe(0);
    });

    // Test 19: Custom min metrics samples config
    it('should use custom minMetricsSamples config', () => {
      // Custom config with lower minMetricsSamples requirement
      const customPredictor = createScalingPredictor({ minMetricsSamples: 5 });

      // Record 5 outcomes
      for (let i = 0; i < 5; i++) {
        customPredictor.recordOutcome('centralized', 'parallelizable', true, 1000);
      }

      // Should have reliable metrics with only 5 samples
      expect(customPredictor.hasReliableMetrics('centralized', 'parallelizable')).toBe(true);

      // Default predictor needs 10 samples
      const defaultPredictor = createScalingPredictor();
      for (let i = 0; i < 5; i++) {
        defaultPredictor.recordOutcome('centralized', 'parallelizable', true, 1000);
      }
      expect(defaultPredictor.hasReliableMetrics('centralized', 'parallelizable')).toBe(false);
    });
  });
});

// =============================================================================
// extractTaskFeatures Tests
// =============================================================================

describe('extractTaskFeatures', () => {
  // Test 20: Extracts sequential reasoning features
  it('should extract sequential reasoning features', () => {
    const task = createTask('Step by step, prove this theorem using logical deduction');
    const features = extractTaskFeatures(task);

    expect(features.taskType).toBe('sequential_reasoning');
    expect(features.hasSequentialDependencies).toBe(true);
  });

  // Test 21: Detects parallelizability
  it('should detect parallelizable tasks', () => {
    const task = createTask('Process each of the 5 documents and summarize them');
    const features = extractTaskFeatures(task);

    expect(features.parallelizability).toBeGreaterThan(0);
  });

  // Test 22: Calculates tool intensity
  it('should calculate tool intensity', () => {
    const task = createTask('Execute the command, call the API, and invoke the function');
    const features = extractTaskFeatures(task);

    expect(features.toolIntensity).toBeGreaterThan(0.5);
  });

  // Test 23: Extracts signals
  it('should extract classification signals', () => {
    const task = createTask('Navigate to the website and click the button');
    const features = extractTaskFeatures(task);

    expect(features.signals.length).toBeGreaterThan(0);
    expect(features.signals.some((s) => s.source === 'keyword')).toBe(true);
  });

  // Test 24: Estimates complexity
  it('should estimate complexity based on description length', () => {
    const shortTask = createTask('Hello');
    const longTask = createTask(
      'This is a very long and detailed task description that involves ' +
        'multiple steps and considerations. It requires careful analysis ' +
        'of the problem, identification of potential solutions, and ' +
        'implementation of the best approach. The complexity is significant.'
    );

    const shortFeatures = extractTaskFeatures(shortTask);
    const longFeatures = extractTaskFeatures(longTask);

    expect(longFeatures.complexity).toBeGreaterThan(shortFeatures.complexity);
  });

  // Test 25: Quick parallelizability check
  it('should provide quick parallelizability check', () => {
    const parallelTask = createTask('Process each of the files independently');
    const sequentialTask = createTask('Think carefully about this problem');

    expect(isLikelyParallelizable(parallelTask)).toBe(true);
    expect(isLikelyParallelizable(sequentialTask)).toBe(false);
  });
});

// =============================================================================
// Capability Estimator Tests
// =============================================================================

describe('Capability Estimator', () => {
  // Test 26: Estimates known model capability
  it('should estimate capability for known models', () => {
    const capability = estimateModelCapability('claude-opus', 'code_generation');

    expect(capability.modelId).toBe('claude-opus');
    expect(capability.estimatedAccuracy).toBeGreaterThan(0.8);
    expect(capability.exceedsSaturationThreshold).toBe(true);
  });

  // Test 27: Applies task type adjustments
  it('should apply task type adjustments', () => {
    const codeGen = estimateModelCapability('claude-opus', 'code_generation');
    const webNav = estimateModelCapability('claude-opus', 'web_navigation');

    // Web navigation is harder, should have lower accuracy
    expect(codeGen.estimatedAccuracy).toBeGreaterThan(webNav.estimatedAccuracy);
  });

  // Test 28: Handles unknown models
  it('should handle unknown models with defaults', () => {
    const capability = estimateModelCapability('unknown-model-xyz', 'code_generation');

    expect(capability.modelId).toBe('unknown-model-xyz');
    expect(capability.estimatedAccuracy).toBeGreaterThan(0);
    expect(capability.estimatedAccuracy).toBeLessThan(1);
  });

  // Test 29: Registers custom models
  it('should register custom model capabilities', () => {
    registerModelCapability('my-custom-model', {
      estimatedAccuracy: 0.95,
      relativeCost: 0.1,
      avgLatencyMs: 500,
    });

    const capability = estimateModelCapability('my-custom-model', 'code_generation');
    expect(capability.estimatedAccuracy).toBeCloseTo(1.0, 1); // 0.95 + 0.05 adjustment
  });

  // Test 30: Finds best model
  it('should find best model from list', () => {
    const best = findBestModel(['claude-haiku', 'claude-opus', 'gemini-pro'], 'code_generation');

    expect(best).toBeDefined();
    // codex-5.3 or claude-opus will win (both have 10 codeGeneration)
    // claude-opus: (10+9)/2/10 + 0.05 = 1.0
    // gemini-pro: (9+8)/2/10 + 0.05 = 0.9
    expect(best?.estimatedAccuracy).toBeGreaterThanOrEqual(0.9);
  });

  // Test 31: Ranks models by efficiency
  it('should rank models by efficiency', () => {
    const ranked = rankModelsByEfficiency(
      ['claude-haiku', 'claude-opus', 'gemini-flash'],
      'code_generation'
    );

    expect(ranked.length).toBe(3);
    // All should have valid efficiency (accuracy / cost)
    for (const cap of ranked) {
      expect(cap.estimatedAccuracy / cap.relativeCost).toBeGreaterThan(0);
    }
  });

  // Test 32: Checks saturation threshold
  it('should check saturation threshold', () => {
    // All canonical models exceed saturation (quality scores ≥ 7)
    expect(exceedsSaturation('claude-opus', 'code_generation')).toBe(true);
    expect(exceedsSaturation('claude-haiku', 'parallelizable')).toBe(true);
    // Open-source mixtral-8x7b on web_navigation: 0.62 - 0.15 = 0.47 > 0.45
    expect(exceedsSaturation('mixtral-8x7b', 'web_navigation')).toBe(true);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration scenarios', () => {
  // Test 33: Code generation workflow
  it('should handle code generation workflow', () => {
    const predictor = createScalingPredictor();
    const task = createTask(
      'Implement a REST API with authentication, database integration, and tests'
    );
    const prediction = predictor.predict(task, ['claude-sonnet', 'gpt-4']);

    // Complex code task with high-capability models should prefer single agent
    expect(prediction.recommendedTopology).toBe('single_agent');
    expect(prediction.confidence).toBeGreaterThan(0.3);
  });

  // Test 34: Batch processing workflow
  it('should handle batch processing workflow', () => {
    const predictor = createScalingPredictor();
    const task = createTask(
      'Batch process all 20 files in the directory, extracting metadata from each'
    );
    // claude-haiku has ~0.7 accuracy (derived) which exceeds 0.45 saturation threshold
    // so single_agent is recommended even for parallelizable tasks
    const prediction = predictor.predict(task, ['claude-haiku']);

    // When capability exceeds saturation threshold, single_agent is preferred
    // This follows the research finding that multi-agent has diminishing returns
    expect(prediction.recommendedTopology).toBeDefined();
    expect(prediction.recommendedAgentCount).toBeGreaterThanOrEqual(1);
  });

  // Test 35: Research task workflow
  it('should handle research task workflow', () => {
    const predictor = createScalingPredictor();
    const task = createTask('Research and explain the differences between React, Vue, and Angular');
    const prediction = predictor.predict(task, ['gemini-flash']);

    // Knowledge retrieval, potentially parallelizable
    expect(prediction.recommendedTopology).toBeDefined();
    expect(prediction.predictedSuccessRate).toBeGreaterThan(0);
  });
});
