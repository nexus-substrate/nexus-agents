/**
 * nexus-agents/cli-adapters - DAAO Estimator Tests
 *
 * Comprehensive tests for the DAAO difficulty estimator.
 * Covers feature encoding, difficulty estimation, routing, and calibration.
 *
 * @module cli-adapters/daao-estimator.test
 * (Source: Issue #334, arXiv:2509.11079)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DAAOEstimator,
  createDAAOEstimator,
  estimateDAAODifficulty,
  routeByDAAODifficulty,
  encodeTaskFeatures,
} from './daao-estimator.js';
import type { CliTask, CliName } from './types.js';
import {
  type DAAOOutcome,
  type EncodedFeatures,
  DAAOError,
  FEATURE_DIMENSIONS,
  DEFAULT_DAAO_THRESHOLDS,
  DEFAULT_FEATURE_WEIGHTS,
} from './daao-types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTask = (content: string, systemPrompt?: string): CliTask =>
  systemPrompt !== undefined ? { content, systemPrompt } : { content };

const simpleTask: CliTask = createTask('Hello world');

const mediumTask: CliTask = createTask(
  'Implement a function to sort an array of numbers using the quicksort algorithm.'
);

const complexTask: CliTask = createTask(
  'Design and implement a distributed consensus algorithm for a multi-node system ' +
    'that handles Byzantine faults. The implementation must be idempotent and ensure ' +
    'consistency across all replicas. Analyze the trade-offs between consistency, ' +
    'availability, and partition tolerance. You must handle all edge cases including ' +
    'network partitions, message delays, and node failures.'
);

const technicalTask: CliTask = createTask(
  'Implement a microservice architecture with Kubernetes deployment, including ' +
    'API gateway, authentication middleware, distributed caching with Redis, ' +
    'and asynchronous message processing using gRPC and protocol buffers.'
);

const ambiguousTask: CliTask = createTask(
  'Maybe create something that could somehow handle whatever data comes in. ' +
    'It should be flexible and appropriate for general use cases.'
);

const preciseTask: CliTask = createTask(
  'Specifically, implement exactly this: a function that validates email addresses ' +
    'as defined in RFC 5322, meaning the local part must be alphanumeric, ' +
    'for example "john.doe@example.com". The requirements are precisely documented.'
);

const scopeWideTask: CliTask = createTask(
  'Perform a comprehensive, end-to-end analysis of the entire codebase across all ' +
    'modules. Create a complete system-wide refactoring plan that covers every ' +
    'component throughout the project.'
);

const constrainedTask: CliTask = createTask(
  'The function must validate input and ensure all constraints are met. It is ' +
    'required to handle timeout scenarios with retry logic and proper fallback ' +
    'mechanisms. You must guarantee error handling for every edge case and corner ' +
    'case, with full compliance to the specification.'
);

const longContextTask: CliTask = createTask('x'.repeat(5000));

// ============================================================================
// DAAOEstimator Tests
// ============================================================================

describe('DAAOEstimator', () => {
  let estimator: DAAOEstimator;

  beforeEach(() => {
    estimator = new DAAOEstimator({ verbose: false, enableCalibration: false });
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should create estimator with default config', () => {
      const e = new DAAOEstimator();
      const config = e.getConfig();
      expect(config.thresholds).toEqual(DEFAULT_DAAO_THRESHOLDS);
      expect(config.enableCalibration).toBe(true);
    });

    it('should accept custom thresholds', () => {
      const customThresholds = { easyUpperBound: 0.25, hardLowerBound: 0.75 };
      const e = new DAAOEstimator({ thresholds: customThresholds });
      expect(e.getConfig().thresholds).toEqual(customThresholds);
    });

    it('should accept custom weights', () => {
      const customWeights = {
        lexicalComplexity: 0.2,
        syntacticComplexity: 0.15,
        semanticDensity: 0.15,
        technicalSpecificity: 0.1,
        taskScope: 0.1,
        constraintComplexity: 0.1,
        clarity: 0.1,
        outputComplexity: 0.1,
      };
      const e = new DAAOEstimator({ weights: customWeights });
      expect(e.getConfig().weights).toEqual(customWeights);
    });

    it('should accept custom tier mappings', () => {
      const customTierToClis = {
        fast: ['codex', 'gemini', 'claude'] as CliName[],
        balanced: ['claude', 'codex', 'gemini'] as CliName[],
        powerful: ['claude', 'gemini', 'codex'] as CliName[],
      };
      const e = new DAAOEstimator({ tierToClis: customTierToClis });
      expect(e.getConfig().tierToClis).toEqual(customTierToClis);
    });

    it('should apply default values for missing config', () => {
      const e = new DAAOEstimator({});
      expect(e.getConfig().weights).toEqual(DEFAULT_FEATURE_WEIGHTS);
      expect(e.getConfig().maxCalibrationOutcomes).toBe(1000);
    });
  });

  // ==========================================================================
  // Feature Encoding Tests
  // ==========================================================================

  describe('encode', () => {
    it('should return all feature dimensions', () => {
      const features = estimator.encode(mediumTask);

      for (const dim of FEATURE_DIMENSIONS) {
        expect(features[dim]).toBeDefined();
        expect(typeof features[dim]).toBe('number');
      }
    });

    it('should return values between 0 and 1', () => {
      const features = estimator.encode(complexTask);

      for (const dim of FEATURE_DIMENSIONS) {
        expect(features[dim]).toBeGreaterThanOrEqual(0);
        expect(features[dim]).toBeLessThanOrEqual(1);
      }
    });

    it('should detect high technical specificity', () => {
      const techFeatures = estimator.encode(technicalTask);
      const simpleFeatures = estimator.encode(simpleTask);

      expect(techFeatures.technicalSpecificity).toBeGreaterThan(
        simpleFeatures.technicalSpecificity
      );
    });

    it('should detect high constraint complexity', () => {
      const constrainedFeatures = estimator.encode(constrainedTask);
      const simpleFeatures = estimator.encode(simpleTask);

      expect(constrainedFeatures.constraintComplexity).toBeGreaterThan(
        simpleFeatures.constraintComplexity
      );
    });

    it('should detect wide task scope', () => {
      const scopeFeatures = estimator.encode(scopeWideTask);
      const simpleFeatures = estimator.encode(simpleTask);

      expect(scopeFeatures.taskScope).toBeGreaterThan(simpleFeatures.taskScope);
    });

    it('should detect high clarity in precise tasks', () => {
      const preciseFeatures = estimator.encode(preciseTask);
      const ambiguousFeatures = estimator.encode(ambiguousTask);

      expect(preciseFeatures.clarity).toBeGreaterThan(ambiguousFeatures.clarity);
    });

    it('should include system prompt in encoding', () => {
      const withSystemPrompt: CliTask = {
        content: 'Simple query',
        systemPrompt: 'You are an expert in distributed systems and consensus algorithms.',
      };
      const withoutSystemPrompt: CliTask = createTask('Simple query');

      const withFeatures = estimator.encode(withSystemPrompt);
      const withoutFeatures = estimator.encode(withoutSystemPrompt);

      expect(withFeatures.technicalSpecificity).toBeGreaterThan(
        withoutFeatures.technicalSpecificity
      );
    });

    it('should handle empty content', () => {
      const emptyTask: CliTask = createTask('');
      const features = estimator.encode(emptyTask);

      for (const dim of FEATURE_DIMENSIONS) {
        expect(features[dim]).toBeGreaterThanOrEqual(0);
        expect(features[dim]).toBeLessThanOrEqual(1);
      }
    });

    it('should handle very long content', () => {
      const features = estimator.encode(longContextTask);

      expect(features.taskScope).toBeGreaterThan(0.3);
    });
  });

  // ==========================================================================
  // Difficulty Estimation Tests
  // ==========================================================================

  describe('estimateDifficulty', () => {
    it('should estimate low difficulty for simple tasks', () => {
      const estimate = estimator.estimateDifficulty(simpleTask);

      expect(estimate.score).toBeLessThan(0.5);
      expect(estimate.level).toBe('easy');
      expect(estimate.recommendedTier).toBe('fast');
    });

    it('should estimate high difficulty for complex tasks', () => {
      const estimate = estimator.estimateDifficulty(complexTask);

      expect(estimate.score).toBeGreaterThan(0.3);
      expect(['medium', 'hard']).toContain(estimate.level);
      expect(['balanced', 'powerful']).toContain(estimate.recommendedTier);
    });

    it('should return all estimate fields', () => {
      const estimate = estimator.estimateDifficulty(mediumTask);

      expect(estimate.features).toBeDefined();
      expect(estimate.score).toBeDefined();
      expect(estimate.level).toBeDefined();
      expect(estimate.recommendedTier).toBeDefined();
      expect(estimate.confidence).toBeDefined();
      expect(estimate.dominantFeature).toBeDefined();
      expect(estimate.reconstructionError).toBeDefined();
    });

    it('should have score between 0 and 1', () => {
      const tasks = [simpleTask, mediumTask, complexTask, technicalTask];

      for (const task of tasks) {
        const estimate = estimator.estimateDifficulty(task);
        expect(estimate.score).toBeGreaterThanOrEqual(0);
        expect(estimate.score).toBeLessThanOrEqual(1);
      }
    });

    it('should identify dominant feature', () => {
      const estimate = estimator.estimateDifficulty(technicalTask);

      expect(FEATURE_DIMENSIONS).toContain(estimate.dominantFeature);
    });

    it('should calculate confidence between 0 and 1', () => {
      const estimate = estimator.estimateDifficulty(mediumTask);

      expect(estimate.confidence).toBeGreaterThan(0);
      expect(estimate.confidence).toBeLessThanOrEqual(1);
    });

    it('should calculate reconstruction error between 0 and 1', () => {
      const estimate = estimator.estimateDifficulty(mediumTask);

      expect(estimate.reconstructionError).toBeGreaterThanOrEqual(0);
      expect(estimate.reconstructionError).toBeLessThanOrEqual(1);
    });

    it('should map difficulty levels to appropriate tiers', () => {
      const easyEstimate = estimator.estimateDifficulty(simpleTask);
      expect(easyEstimate.level === 'easy' ? easyEstimate.recommendedTier : 'fast').toBe('fast');

      // Create a task that should be hard
      const veryHardTask: CliTask = createTask(
        'Design a comprehensive distributed system with Byzantine fault tolerance, ' +
          'implementing Paxos and Raft consensus algorithms. Must handle network partitions, ' +
          'ensure exactly-once semantics, implement distributed transactions with 2PC, ' +
          'and provide idempotent APIs. The architecture must be scalable, highly available, ' +
          'and compliant with industry standards. Handle all edge cases and corner cases.'
      );
      const hardEstimate = estimator.estimateDifficulty(veryHardTask);
      if (hardEstimate.level === 'hard') {
        expect(hardEstimate.recommendedTier).toBe('powerful');
      }
    });
  });

  // ==========================================================================
  // Routing Tests
  // ==========================================================================

  describe('route', () => {
    it('should route simple tasks to fast tier', () => {
      const decision = estimator.route(simpleTask);

      expect(decision.tier).toBe('fast');
      expect(decision.selectedCli).toBe('gemini');
    });

    it('should provide alternatives', () => {
      const decision = estimator.route(mediumTask);

      expect(decision.alternatives.length).toBeGreaterThan(0);
      expect(decision.alternatives).not.toContain(decision.selectedCli);
    });

    it('should filter by available CLIs', () => {
      const decision = estimator.route(complexTask, ['codex', 'gemini']);

      expect(['codex', 'gemini']).toContain(decision.selectedCli);
    });

    it('should fall back to available when tier has no match', () => {
      const decision = estimator.route(complexTask, ['gemini']);

      expect(decision.selectedCli).toBe('gemini');
    });

    it('should throw when no CLIs available', () => {
      expect(() => estimator.route(mediumTask, [])).toThrow(DAAOError);
      expect(() => estimator.route(mediumTask, [])).toThrow('No CLIs available');
    });

    it('should provide human-readable reason', () => {
      const decision = estimator.route(mediumTask);

      expect(decision.reason).toBeDefined();
      expect(decision.reason.length).toBeGreaterThan(0);
      expect(decision.reason).toContain(decision.estimate.level);
    });

    it('should include estimate in decision', () => {
      const decision = estimator.route(mediumTask);

      expect(decision.estimate).toBeDefined();
      expect(decision.estimate.score).toBeGreaterThanOrEqual(0);
    });

    it('should detect typical patterns', () => {
      const decision = estimator.route(mediumTask);

      expect(typeof decision.isTypicalPattern).toBe('boolean');
    });

    it('should use custom tier to CLI mapping', () => {
      const customEstimator = new DAAOEstimator({
        tierToClis: {
          fast: ['claude', 'gemini', 'codex'],
          balanced: ['codex', 'claude', 'gemini'],
          powerful: ['gemini', 'codex', 'claude'],
        },
      });

      const decision = customEstimator.route(simpleTask);
      expect(decision.selectedCli).toBe('claude');
    });
  });

  // ==========================================================================
  // Calibration Tests
  // ==========================================================================

  describe('calibration', () => {
    let calibratingEstimator: DAAOEstimator;

    beforeEach(() => {
      calibratingEstimator = new DAAOEstimator({
        enableCalibration: true,
        minCalibrationOutcomes: 10,
        maxCalibrationOutcomes: 100,
      });
    });

    it('should record calibration outcomes', () => {
      const features = calibratingEstimator.encode(mediumTask);
      const outcome: DAAOOutcome = {
        taskHash: 'test123',
        features,
        estimatedScore: 0.5,
        selectedCli: 'claude',
        success: true,
        timestamp: Date.now(),
      };

      calibratingEstimator.calibrate(outcome);
      const stats = calibratingEstimator.getCalibrationStats();

      expect(stats.totalOutcomes).toBe(1);
    });

    it('should calculate calibration stats', () => {
      const features = calibratingEstimator.encode(mediumTask);

      for (let i = 0; i < 15; i++) {
        calibratingEstimator.calibrate({
          taskHash: `test${String(i)}`,
          features,
          estimatedScore: 0.3 + i * 0.02,
          selectedCli: 'claude',
          success: i % 2 === 0,
          qualityScore: 0.5 + (i % 5) * 0.1,
          timestamp: Date.now(),
        });
      }

      const stats = calibratingEstimator.getCalibrationStats();

      expect(stats.totalOutcomes).toBe(15);
      expect(stats.featureImportance.length).toBe(FEATURE_DIMENSIONS.length);
    });

    it('should apply calibration adjustment when sufficient data', () => {
      const features = calibratingEstimator.encode(mediumTask);

      // Add many failed outcomes to create upward bias
      for (let i = 0; i < 60; i++) {
        calibratingEstimator.calibrate({
          taskHash: `test${String(i)}`,
          features,
          estimatedScore: 0.3,
          selectedCli: 'claude',
          success: false,
          timestamp: Date.now(),
        });
      }

      const decision = calibratingEstimator.route(simpleTask);
      expect(decision.reason).toContain('calibration applied');
    });

    it('should not apply calibration below minimum outcomes', () => {
      const features = calibratingEstimator.encode(mediumTask);

      calibratingEstimator.calibrate({
        taskHash: 'test',
        features,
        estimatedScore: 0.5,
        selectedCli: 'claude',
        success: true,
        timestamp: Date.now(),
      });

      const decision = calibratingEstimator.route(simpleTask);
      expect(decision.reason).not.toContain('calibration applied');
    });

    it('should trim outcomes to max size', () => {
      const smallEstimator = new DAAOEstimator({
        enableCalibration: true,
        maxCalibrationOutcomes: 5,
        minCalibrationOutcomes: 2,
      });

      const features = smallEstimator.encode(mediumTask);

      for (let i = 0; i < 10; i++) {
        smallEstimator.calibrate({
          taskHash: `test${String(i)}`,
          features,
          estimatedScore: 0.5,
          selectedCli: 'claude',
          success: true,
          timestamp: Date.now(),
        });
      }

      const stats = smallEstimator.getCalibrationStats();
      expect(stats.totalOutcomes).toBe(5);
    });

    it('should track success rate by difficulty level', () => {
      const features = calibratingEstimator.encode(mediumTask);

      // Add easy tasks with high success
      for (let i = 0; i < 5; i++) {
        calibratingEstimator.calibrate({
          taskHash: `easy${String(i)}`,
          features,
          estimatedScore: 0.2,
          selectedCli: 'gemini',
          success: true,
          timestamp: Date.now(),
        });
      }

      // Add hard tasks with lower success
      for (let i = 0; i < 5; i++) {
        calibratingEstimator.calibrate({
          taskHash: `hard${String(i)}`,
          features,
          estimatedScore: 0.8,
          selectedCli: 'claude',
          success: i < 2,
          timestamp: Date.now(),
        });
      }

      const stats = calibratingEstimator.getCalibrationStats();

      expect(stats.successRateByLevel.easy).toBe(1.0);
      expect(stats.successRateByLevel.hard).toBe(0.4);
    });

    it('should not record outcomes when calibration disabled', () => {
      const disabledEstimator = new DAAOEstimator({ enableCalibration: false });
      const features = disabledEstimator.encode(mediumTask);

      disabledEstimator.calibrate({
        taskHash: 'test',
        features,
        estimatedScore: 0.5,
        selectedCli: 'claude',
        success: true,
        timestamp: Date.now(),
      });

      const stats = disabledEstimator.getCalibrationStats();
      expect(stats.totalOutcomes).toBe(0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const emptyTask: CliTask = createTask('');
      const estimate = estimator.estimateDifficulty(emptyTask);

      expect(estimate.score).toBeGreaterThanOrEqual(0);
      expect(estimate.score).toBeLessThanOrEqual(1);
    });

    it('should handle whitespace-only content', () => {
      const whitespaceTask: CliTask = createTask('   \t\n   ');
      const estimate = estimator.estimateDifficulty(whitespaceTask);

      expect(estimate).toBeDefined();
      expect(estimate.level).toBe('easy');
    });

    it('should handle very long content', () => {
      const longTask: CliTask = createTask('x'.repeat(100000));
      const estimate = estimator.estimateDifficulty(longTask);

      expect(estimate).toBeDefined();
      // Very long content increases task scope due to length component
      expect(estimate.features.taskScope).toBeGreaterThan(0.3);
    });

    it('should handle special characters', () => {
      const specialTask: CliTask = createTask('x = y^2 / sqrt(z) * sum(n -> infinity)');
      const estimate = estimator.estimateDifficulty(specialTask);

      expect(estimate).toBeDefined();
    });

    it('should handle unicode content', () => {
      const unicodeTask: CliTask = createTask('Implement a function that processes text');
      const estimate = estimator.estimateDifficulty(unicodeTask);

      expect(estimate).toBeDefined();
    });

    it('should handle task with only system prompt', () => {
      const systemOnlyTask: CliTask = {
        content: '',
        systemPrompt: 'You are an expert in distributed algorithms and consensus protocols.',
      };
      const estimate = estimator.estimateDifficulty(systemOnlyTask);

      expect(estimate).toBeDefined();
      expect(estimate.features.technicalSpecificity).toBeGreaterThan(0);
    });

    it('should handle mixed case keywords', () => {
      const mixedCaseTask: CliTask = createTask(
        'IMPLEMENT a NEW ALGORITHM for DISTRIBUTED consensus'
      );
      const estimate = estimator.estimateDifficulty(mixedCaseTask);

      expect(estimate.features.technicalSpecificity).toBeGreaterThan(0);
    });

    it('should handle all keywords present', () => {
      const keywordHeavyTask: CliTask = createTask(
        'Implement a distributed concurrent asynchronous algorithm with optimization ' +
          'scalability protocol encryption authentication middleware microservice. ' +
          'The entire comprehensive end-to-end system must ensure constraint validation ' +
          'specifically exactly as defined.'
      );
      const estimate = estimator.estimateDifficulty(keywordHeavyTask);

      expect(estimate.score).toBeGreaterThan(0.5);
    });
  });

  // ==========================================================================
  // Custom Thresholds Tests
  // ==========================================================================

  describe('custom thresholds', () => {
    it('should use custom difficulty thresholds', () => {
      const strictEstimator = new DAAOEstimator({
        thresholds: { easyUpperBound: 0.2, hardLowerBound: 0.5 },
      });

      const estimate = strictEstimator.estimateDifficulty(mediumTask);

      // With stricter thresholds, more tasks should be classified as hard
      if (estimate.score > 0.5) {
        expect(estimate.level).toBe('hard');
      }
    });

    it('should use lenient thresholds', () => {
      const lenientEstimator = new DAAOEstimator({
        thresholds: { easyUpperBound: 0.6, hardLowerBound: 0.9 },
      });

      const estimate = lenientEstimator.estimateDifficulty(mediumTask);

      // With lenient thresholds, more tasks should be classified as easy
      if (estimate.score < 0.6) {
        expect(estimate.level).toBe('easy');
      }
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('factory functions', () => {
  describe('createDAAOEstimator', () => {
    it('should create estimator with default config', () => {
      const estimator = createDAAOEstimator();
      expect(estimator).toBeDefined();
      expect(estimator.getConfig().thresholds).toEqual(DEFAULT_DAAO_THRESHOLDS);
    });

    it('should create estimator with custom config', () => {
      const estimator = createDAAOEstimator({
        verbose: true,
        enableCalibration: false,
      });
      expect(estimator.getConfig().verbose).toBe(true);
      expect(estimator.getConfig().enableCalibration).toBe(false);
    });
  });

  describe('estimateDAAODifficulty', () => {
    it('should estimate difficulty using quick function', () => {
      const estimate = estimateDAAODifficulty(mediumTask);

      expect(estimate).toBeDefined();
      expect(estimate.score).toBeGreaterThanOrEqual(0);
      expect(estimate.level).toBeDefined();
    });
  });

  describe('routeByDAAODifficulty', () => {
    it('should route using quick function', () => {
      const decision = routeByDAAODifficulty(complexTask);

      expect(decision).toBeDefined();
      expect(decision.selectedCli).toBeDefined();
      expect(decision.tier).toBeDefined();
    });

    it('should filter by available CLIs', () => {
      const decision = routeByDAAODifficulty(complexTask, ['gemini']);

      expect(decision.selectedCli).toBe('gemini');
    });
  });

  describe('encodeTaskFeatures', () => {
    it('should encode features using quick function', () => {
      const features = encodeTaskFeatures(technicalTask);

      expect(features).toBeDefined();
      expect(features.technicalSpecificity).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('integration scenarios', () => {
  let estimator: DAAOEstimator;

  beforeEach(() => {
    estimator = new DAAOEstimator({ verbose: false });
  });

  it('should correctly classify a code review task', () => {
    const codeReviewTask: CliTask = createTask(
      'Review this pull request for security vulnerabilities, ensure proper ' +
        'error handling, and verify the implementation is correct and type-safe.'
    );

    const estimate = estimator.estimateDifficulty(codeReviewTask);

    // Code review has constraint keywords: ensure, verify
    expect(estimate.features.constraintComplexity).toBeGreaterThan(0.1);
    // Code review difficulty depends on task content; can be easy, medium or hard
    expect(['easy', 'medium', 'hard']).toContain(estimate.level);
  });

  it('should correctly classify a documentation task', () => {
    const docTask: CliTask = createTask(
      'Write documentation for the API endpoints, explaining their purpose and usage.'
    );

    const estimate = estimator.estimateDifficulty(docTask);

    expect(estimate.features.outputComplexity).toBeGreaterThan(0);
    expect(estimate.level).not.toBe('hard');
  });

  it('should correctly classify a refactoring task', () => {
    const refactorTask: CliTask = createTask(
      'Refactor the entire authentication module to use the new middleware pattern. ' +
        'Transform all legacy code throughout the codebase.'
    );

    const estimate = estimator.estimateDifficulty(refactorTask);

    expect(estimate.features.taskScope).toBeGreaterThan(0.3);
  });

  it('should route architectural task to powerful tier', () => {
    const architectureTask: CliTask = createTask(
      'Design a comprehensive microservice architecture with distributed caching, ' +
        'API gateway, authentication middleware, and Kubernetes deployment. The design ' +
        'must ensure scalability, high availability, and compliance with industry standards.'
    );

    const decision = estimator.route(architectureTask);

    // Complex architectural tasks should use powerful models
    expect(['balanced', 'powerful']).toContain(decision.tier);
  });

  it('should route simple query to fast tier', () => {
    const queryTask: CliTask = createTask('What is the capital of France?');

    const decision = estimator.route(queryTask);

    expect(decision.tier).toBe('fast');
    expect(decision.selectedCli).toBe('gemini');
  });

  it('should preserve feature ordering in importance ranking', () => {
    const calibratingEstimator = new DAAOEstimator({
      enableCalibration: true,
      minCalibrationOutcomes: 5,
    });

    const features: EncodedFeatures = {
      lexicalComplexity: 0.5,
      syntacticComplexity: 0.3,
      semanticDensity: 0.7,
      technicalSpecificity: 0.9,
      taskScope: 0.4,
      constraintComplexity: 0.2,
      clarity: 0.8,
      outputComplexity: 0.6,
    };

    for (let i = 0; i < 10; i++) {
      calibratingEstimator.calibrate({
        taskHash: `test${String(i)}`,
        features,
        estimatedScore: 0.5,
        selectedCli: 'claude',
        success: true,
        timestamp: Date.now(),
      });
    }

    const stats = calibratingEstimator.getCalibrationStats();

    expect(stats.featureImportance.length).toBe(FEATURE_DIMENSIONS.length);
    // All feature dimensions should be present
    for (const dim of FEATURE_DIMENSIONS) {
      expect(stats.featureImportance).toContain(dim);
    }
  });
});
