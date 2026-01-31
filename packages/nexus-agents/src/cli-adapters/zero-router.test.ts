/**
 * nexus-agents/cli-adapters - ZeroRouter Tests
 *
 * Tests for the ZeroRouter universal difficulty space routing.
 *
 * @module cli-adapters/zero-router.test
 * (Source: Issue #338)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ZeroRouter,
  createZeroRouter,
  estimateTaskDifficulty,
  routeByTaskDifficulty,
  ZeroRoutingError,
  DEFAULT_DIFFICULTY_THRESHOLDS,
} from './zero-router.js';
import type { CliTask, CliName } from './types.js';
import type { DifficultyOutcome } from './zero-router-types.js';
import {
  estimateDifficultySpace,
  aggregateDifficulty,
  findDominantDimension,
  classifyDifficultyLevel,
  calculateEstimateConfidence,
  normalize,
} from './difficulty-space.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTask = (content: string, systemPrompt?: string): CliTask =>
  systemPrompt !== undefined ? { content, systemPrompt } : { content };

const easyTask: CliTask = createTask('What is 2 + 2?');

const mediumTask: CliTask = createTask(
  'Implement a function to sort an array of numbers using the quicksort algorithm.'
);

const hardTask: CliTask = createTask(
  'Design and implement a distributed consensus algorithm for a multi-node system ' +
    'that handles Byzantine faults. Analyze the trade-offs between consistency, ' +
    'availability, and partition tolerance. Debug any edge cases and verify the ' +
    'algorithm is correct and type-safe for production use.'
);

const creativeTask: CliTask = createTask(
  'Create a novel design for a user interface that reimagines how users interact ' +
    'with file systems. Brainstorm innovative approaches and generate unique solutions.'
);

const knowledgeTask: CliTask = createTask(
  'Explain the technical specifications and industry standards for implementing ' +
    'HIPAA compliance in healthcare software, including specific regulations and protocols.'
);

const precisionTask: CliTask = createTask(
  'Write comprehensive tests to verify and validate the security implementation. ' +
    'Ensure exact correctness and fix any bugs found during testing.'
);

const longContextTask: CliTask = createTask('A'.repeat(10000));

// ============================================================================
// ZeroRouter Tests
// ============================================================================

describe('ZeroRouter', () => {
  let router: ZeroRouter;

  beforeEach(() => {
    router = new ZeroRouter({ verbose: false, enableCalibration: false });
  });

  describe('constructor', () => {
    it('should create router with default config', () => {
      const r = new ZeroRouter();
      const config = r.getConfig();
      expect(config.thresholds).toEqual(DEFAULT_DIFFICULTY_THRESHOLDS);
      expect(config.enableCalibration).toBe(true);
    });

    it('should accept custom thresholds', () => {
      const customThresholds = { easyUpperBound: 0.2, hardLowerBound: 0.8 };
      const r = new ZeroRouter({ thresholds: customThresholds });
      expect(r.getConfig().thresholds).toEqual(customThresholds);
    });

    it('should accept custom weights', () => {
      const customWeights = {
        reasoning: 0.5,
        knowledge: 0.1,
        creativity: 0.1,
        precision: 0.2,
        context_length: 0.1,
      };
      const r = new ZeroRouter({ weights: customWeights });
      expect(r.getConfig().weights).toEqual(customWeights);
    });

    it('should accept custom tier mappings', () => {
      const customTierToClis = {
        fast: ['codex', 'gemini', 'claude'] as CliName[],
        balanced: ['claude', 'codex', 'gemini'] as CliName[],
        powerful: ['claude', 'gemini', 'codex'] as CliName[],
      };
      const r = new ZeroRouter({ tierToClis: customTierToClis });
      expect(r.getConfig().tierToClis).toEqual(customTierToClis);
    });
  });

  describe('estimateDifficulty', () => {
    it('should estimate difficulty for an easy task', () => {
      const estimate = router.estimateDifficulty(easyTask);

      expect(estimate.aggregateScore).toBeGreaterThanOrEqual(0);
      expect(estimate.aggregateScore).toBeLessThan(0.5);
      expect(estimate.level).toBe('easy');
      expect(estimate.recommendedTier).toBe('fast');
    });

    it('should estimate difficulty for a hard task', () => {
      const estimate = router.estimateDifficulty(hardTask);

      // Hard task has many complexity keywords (design, algorithm, debug, etc.)
      expect(estimate.aggregateScore).toBeGreaterThan(0.3);
      // May be medium or hard depending on exact keyword matches
      expect(['medium', 'hard']).toContain(estimate.level);
      expect(['balanced', 'powerful']).toContain(estimate.recommendedTier);
    });

    it('should estimate medium difficulty for moderate tasks', () => {
      const estimate = router.estimateDifficulty(mediumTask);

      // SharedTaskAnalyzer (ADR-0004) produces lower scores for straightforward tasks
      expect(estimate.aggregateScore).toBeGreaterThan(0.1);
      expect(estimate.aggregateScore).toBeLessThan(0.9);
    });

    it('should return all difficulty dimensions', () => {
      const estimate = router.estimateDifficulty(mediumTask);

      expect(estimate.dimensions).toBeDefined();
      expect(estimate.dimensions.reasoning).toBeGreaterThanOrEqual(0);
      expect(estimate.dimensions.reasoning).toBeLessThanOrEqual(1);
      expect(estimate.dimensions.knowledge).toBeGreaterThanOrEqual(0);
      expect(estimate.dimensions.knowledge).toBeLessThanOrEqual(1);
      expect(estimate.dimensions.creativity).toBeGreaterThanOrEqual(0);
      expect(estimate.dimensions.creativity).toBeLessThanOrEqual(1);
      expect(estimate.dimensions.precision).toBeGreaterThanOrEqual(0);
      expect(estimate.dimensions.precision).toBeLessThanOrEqual(1);
      expect(estimate.dimensions.context_length).toBeGreaterThanOrEqual(0);
      expect(estimate.dimensions.context_length).toBeLessThanOrEqual(1);
    });

    it('should identify dominant dimension', () => {
      const estimate = router.estimateDifficulty(creativeTask);

      expect(estimate.dominantDimension).toBeDefined();
      expect(['reasoning', 'knowledge', 'creativity', 'precision', 'context_length']).toContain(
        estimate.dominantDimension
      );
    });

    it('should calculate confidence score', () => {
      const estimate = router.estimateDifficulty(mediumTask);

      expect(estimate.confidence).toBeGreaterThan(0);
      expect(estimate.confidence).toBeLessThanOrEqual(1);
    });

    it('should detect high creativity in creative tasks', () => {
      const estimate = router.estimateDifficulty(creativeTask);

      // Creative keywords: design, brainstorm, novel, unique, generate
      expect(estimate.dimensions.creativity).toBeGreaterThan(0.15);
    });

    it('should detect high knowledge in domain-specific tasks', () => {
      const estimate = router.estimateDifficulty(knowledgeTask);

      // Knowledge keywords: technical, specifications, standard, regulation
      expect(estimate.dimensions.knowledge).toBeGreaterThan(0.15);
    });

    it('should detect high precision in testing tasks', () => {
      const estimate = router.estimateDifficulty(precisionTask);

      // Precision keywords: test, verify, validate, security, fix
      expect(estimate.dimensions.precision).toBeGreaterThan(0.15);
    });

    it('should detect high context_length for long tasks', () => {
      const estimate = router.estimateDifficulty(longContextTask);

      // 10000 chars = ~3000 tokens, normalized against 50k max
      expect(estimate.dimensions.context_length).toBeGreaterThan(0.05);
    });
  });

  describe('routeByDifficulty', () => {
    it('should route easy tasks to fast tier', () => {
      const decision = router.routeByDifficulty(easyTask);

      expect(decision.tier).toBe('fast');
      expect(decision.selectedCli).toBe('gemini'); // Default fast tier preference
    });

    it('should route hard tasks to powerful or balanced tier', () => {
      const decision = router.routeByDifficulty(hardTask);

      // Hard tasks route to powerful, medium to balanced
      expect(['powerful', 'balanced']).toContain(decision.tier);
      expect(['claude', 'codex']).toContain(decision.selectedCli);
    });

    it('should provide alternatives in tier preference order', () => {
      const decision = router.routeByDifficulty(hardTask);

      expect(decision.alternatives.length).toBeGreaterThan(0);
      expect(decision.alternatives).not.toContain(decision.selectedCli);
    });

    it('should filter by available CLIs', () => {
      const decision = router.routeByDifficulty(hardTask, ['gemini', 'codex']);

      expect(['gemini', 'codex']).toContain(decision.selectedCli);
    });

    it('should select from available when tier has no match', () => {
      const decision = router.routeByDifficulty(hardTask, ['gemini']);

      expect(decision.selectedCli).toBe('gemini');
    });

    it('should throw when no CLIs available', () => {
      expect(() => router.routeByDifficulty(hardTask, [])).toThrow(ZeroRoutingError);
    });

    it('should provide reason for routing decision', () => {
      const decision = router.routeByDifficulty(mediumTask);

      expect(decision.reason).toBeDefined();
      expect(decision.reason.length).toBeGreaterThan(0);
      expect(decision.reason).toContain(decision.difficulty.level);
    });

    it('should include difficulty estimate in decision', () => {
      const decision = router.routeByDifficulty(mediumTask);

      expect(decision.difficulty).toBeDefined();
      expect(decision.difficulty.aggregateScore).toBeGreaterThanOrEqual(0);
      expect(decision.difficulty.aggregateScore).toBeLessThanOrEqual(1);
    });
  });

  describe('calibration', () => {
    let calibratingRouter: ZeroRouter;

    beforeEach(() => {
      calibratingRouter = new ZeroRouter({
        enableCalibration: true,
        minCalibrationOutcomes: 10,
        maxCalibrationOutcomes: 100,
      });
    });

    it('should record calibration outcomes', () => {
      const outcome: DifficultyOutcome = {
        taskHash: 'test123',
        estimatedDifficulty: 0.5,
        selectedCli: 'claude',
        success: true,
        timestamp: Date.now(),
      };

      calibratingRouter.calibrate(outcome);
      const stats = calibratingRouter.getCalibrationStats();

      expect(stats.totalOutcomes).toBe(1);
    });

    it('should calculate calibration stats', () => {
      // Add outcomes to reach minimum threshold
      for (let i = 0; i < 15; i++) {
        calibratingRouter.calibrate({
          taskHash: `test${String(i)}`,
          estimatedDifficulty: 0.3 + i * 0.02,
          selectedCli: 'claude',
          success: i % 2 === 0,
          qualityScore: 0.5 + (i % 5) * 0.1,
          timestamp: Date.now(),
        });
      }

      const stats = calibratingRouter.getCalibrationStats();

      expect(stats.totalOutcomes).toBe(15);
      expect(stats.meanAbsoluteError).toBeGreaterThanOrEqual(0);
      expect(stats.calibrationBias).toBeDefined();
    });

    it('should apply calibration adjustment when sufficient data', () => {
      // Add many failed outcomes to create upward bias
      for (let i = 0; i < 60; i++) {
        calibratingRouter.calibrate({
          taskHash: `test${String(i)}`,
          estimatedDifficulty: 0.3, // Low estimate
          selectedCli: 'claude',
          success: false, // But task failed (was actually harder)
          timestamp: Date.now(),
        });
      }

      const decision = calibratingRouter.routeByDifficulty(easyTask);

      expect(decision.calibrationApplied).toBe(true);
      expect(decision.calibrationAdjustment).toBeDefined();
    });

    it('should not apply calibration below minimum outcomes', () => {
      calibratingRouter.calibrate({
        taskHash: 'test',
        estimatedDifficulty: 0.5,
        selectedCli: 'claude',
        success: true,
        timestamp: Date.now(),
      });

      const decision = calibratingRouter.routeByDifficulty(easyTask);

      expect(decision.calibrationApplied).toBe(false);
    });

    it('should trim outcomes to max size', () => {
      const smallRouter = new ZeroRouter({
        enableCalibration: true,
        maxCalibrationOutcomes: 5,
        minCalibrationOutcomes: 2,
      });

      for (let i = 0; i < 10; i++) {
        smallRouter.calibrate({
          taskHash: `test${String(i)}`,
          estimatedDifficulty: 0.5,
          selectedCli: 'claude',
          success: true,
          timestamp: Date.now(),
        });
      }

      const stats = smallRouter.getCalibrationStats();
      expect(stats.totalOutcomes).toBe(5);
    });

    it('should track success rate by difficulty level', () => {
      // Add easy tasks (low difficulty) with high success
      for (let i = 0; i < 5; i++) {
        calibratingRouter.calibrate({
          taskHash: `easy${String(i)}`,
          estimatedDifficulty: 0.2,
          selectedCli: 'gemini',
          success: true,
          timestamp: Date.now(),
        });
      }

      // Add hard tasks (high difficulty) with lower success
      for (let i = 0; i < 5; i++) {
        calibratingRouter.calibrate({
          taskHash: `hard${String(i)}`,
          estimatedDifficulty: 0.8,
          selectedCli: 'claude',
          success: i < 2, // 40% success for hard
          timestamp: Date.now(),
        });
      }

      const stats = calibratingRouter.getCalibrationStats();

      expect(stats.successRateByLevel.easy).toBe(1.0); // 100% for easy
      expect(stats.successRateByLevel.hard).toBe(0.4); // 40% for hard
    });
  });

  describe('custom difficulty mappings', () => {
    it('should use custom difficulty to tier mapping', () => {
      const customRouter = new ZeroRouter({
        difficultyToTier: {
          easy: 'powerful', // Reverse mapping
          medium: 'fast',
          hard: 'balanced',
        },
      });

      const decision = customRouter.routeByDifficulty(easyTask);

      expect(decision.tier).toBe('powerful');
    });

    it('should use custom tier to CLI mapping', () => {
      const customRouter = new ZeroRouter({
        tierToClis: {
          fast: ['claude', 'gemini', 'codex'],
          balanced: ['codex', 'claude', 'gemini'],
          powerful: ['gemini', 'codex', 'claude'],
        },
      });

      // Easy task should route to fast tier, which now prefers claude
      const decision = customRouter.routeByDifficulty(easyTask);

      expect(decision.selectedCli).toBe('claude');
    });
  });
});

// ============================================================================
// Difficulty Space Tests
// ============================================================================

describe('difficulty-space', () => {
  describe('normalize', () => {
    it('should normalize value to 0-1 range', () => {
      expect(normalize(50, 0, 100)).toBe(0.5);
      expect(normalize(0, 0, 100)).toBe(0);
      expect(normalize(100, 0, 100)).toBe(1);
    });

    it('should clamp values outside range', () => {
      expect(normalize(-50, 0, 100)).toBe(0);
      expect(normalize(150, 0, 100)).toBe(1);
    });

    it('should handle equal min and max', () => {
      expect(normalize(50, 50, 50)).toBe(0.5);
    });
  });

  describe('estimateDifficultySpace', () => {
    it('should return all dimensions', () => {
      const space = estimateDifficultySpace(mediumTask);

      expect(space.reasoning).toBeDefined();
      expect(space.knowledge).toBeDefined();
      expect(space.creativity).toBeDefined();
      expect(space.precision).toBeDefined();
      expect(space.context_length).toBeDefined();
    });

    it('should return values between 0 and 1', () => {
      const space = estimateDifficultySpace(hardTask);

      expect(space.reasoning).toBeGreaterThanOrEqual(0);
      expect(space.reasoning).toBeLessThanOrEqual(1);
      expect(space.knowledge).toBeGreaterThanOrEqual(0);
      expect(space.knowledge).toBeLessThanOrEqual(1);
    });
  });

  describe('aggregateDifficulty', () => {
    it('should return weighted average', () => {
      const space = {
        reasoning: 1.0,
        knowledge: 0.0,
        creativity: 0.0,
        precision: 0.0,
        context_length: 0.0,
      };

      // With default weights, reasoning=0.30, so aggregate should be 0.30
      const aggregate = aggregateDifficulty(space);
      expect(aggregate).toBeCloseTo(0.3, 2);
    });

    it('should respect custom weights', () => {
      const space = {
        reasoning: 1.0,
        knowledge: 0.0,
        creativity: 0.0,
        precision: 0.0,
        context_length: 0.0,
      };

      const customWeights = {
        reasoning: 1.0,
        knowledge: 0.0,
        creativity: 0.0,
        precision: 0.0,
        context_length: 0.0,
      };

      const aggregate = aggregateDifficulty(space, customWeights);
      expect(aggregate).toBe(1.0);
    });
  });

  describe('findDominantDimension', () => {
    it('should return dimension with highest value', () => {
      const space = {
        reasoning: 0.3,
        knowledge: 0.5,
        creativity: 0.9,
        precision: 0.2,
        context_length: 0.1,
      };

      expect(findDominantDimension(space)).toBe('creativity');
    });

    it('should return first dimension when tied', () => {
      const space = {
        reasoning: 0.5,
        knowledge: 0.5,
        creativity: 0.5,
        precision: 0.5,
        context_length: 0.5,
      };

      // reasoning comes first in iteration order
      expect(findDominantDimension(space)).toBe('reasoning');
    });
  });

  describe('classifyDifficultyLevel', () => {
    it('should classify easy when below threshold', () => {
      expect(classifyDifficultyLevel(0.2)).toBe('easy');
      expect(classifyDifficultyLevel(0.29)).toBe('easy');
    });

    it('should classify hard when above threshold', () => {
      expect(classifyDifficultyLevel(0.8)).toBe('hard');
      expect(classifyDifficultyLevel(0.71)).toBe('hard');
    });

    it('should classify medium in between', () => {
      expect(classifyDifficultyLevel(0.5)).toBe('medium');
      expect(classifyDifficultyLevel(0.3)).toBe('medium');
      expect(classifyDifficultyLevel(0.7)).toBe('medium');
    });

    it('should use custom thresholds', () => {
      const customThresholds = { easyUpperBound: 0.4, hardLowerBound: 0.6 } as const;

      expect(classifyDifficultyLevel(0.35, customThresholds)).toBe('easy');
      expect(classifyDifficultyLevel(0.65, customThresholds)).toBe('hard');
    });
  });

  describe('calculateEstimateConfidence', () => {
    it('should return high confidence for consistent dimensions', () => {
      const consistentSpace = {
        reasoning: 0.5,
        knowledge: 0.5,
        creativity: 0.5,
        precision: 0.5,
        context_length: 0.5,
      };

      const confidence = calculateEstimateConfidence(consistentSpace);
      expect(confidence).toBeGreaterThan(0.9);
    });

    it('should return lower confidence for varied dimensions', () => {
      const variedSpace = {
        reasoning: 0.0,
        knowledge: 1.0,
        creativity: 0.0,
        precision: 1.0,
        context_length: 0.5,
      };

      const confidence = calculateEstimateConfidence(variedSpace);
      expect(confidence).toBeLessThan(0.7);
    });
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe('factory functions', () => {
  describe('createZeroRouter', () => {
    it('should create router with default config', () => {
      const router = createZeroRouter();
      expect(router).toBeDefined();
      expect(router.getConfig().thresholds).toEqual(DEFAULT_DIFFICULTY_THRESHOLDS);
    });

    it('should create router with custom config', () => {
      const router = createZeroRouter({
        verbose: true,
        enableCalibration: false,
      });
      expect(router.getConfig().verbose).toBe(true);
      expect(router.getConfig().enableCalibration).toBe(false);
    });
  });

  describe('estimateTaskDifficulty', () => {
    it('should estimate difficulty using quick function', () => {
      const estimate = estimateTaskDifficulty(mediumTask);

      expect(estimate).toBeDefined();
      expect(estimate.aggregateScore).toBeGreaterThanOrEqual(0);
      expect(estimate.level).toBeDefined();
    });
  });

  describe('routeByTaskDifficulty', () => {
    it('should route using quick function', () => {
      const decision = routeByTaskDifficulty(hardTask);

      expect(decision).toBeDefined();
      expect(decision.selectedCli).toBeDefined();
      expect(decision.tier).toBeDefined();
    });

    it('should filter by available CLIs', () => {
      const decision = routeByTaskDifficulty(hardTask, ['gemini']);

      expect(decision.selectedCli).toBe('gemini');
    });
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('edge cases', () => {
  let router: ZeroRouter;

  beforeEach(() => {
    router = new ZeroRouter({ verbose: false });
  });

  it('should handle empty task content', () => {
    const emptyTask: CliTask = createTask('');
    const estimate = router.estimateDifficulty(emptyTask);

    expect(estimate.aggregateScore).toBeGreaterThanOrEqual(0);
    expect(estimate.aggregateScore).toBeLessThanOrEqual(1);
  });

  it('should handle very long task content', () => {
    const veryLongTask: CliTask = createTask('x'.repeat(100000));
    const estimate = router.estimateDifficulty(veryLongTask);

    // 100000 chars = ~30000 tokens, normalized against 50k max, plus bonus for >5000
    expect(estimate.dimensions.context_length).toBeGreaterThan(0.5);
  });

  it('should handle task with only system prompt', () => {
    const systemOnlyTask: CliTask = {
      content: '',
      systemPrompt: 'You are a helpful assistant that analyzes complex algorithms.',
    };
    const estimate = router.estimateDifficulty(systemOnlyTask);

    expect(estimate).toBeDefined();
    expect(estimate.dimensions.reasoning).toBeGreaterThan(0);
  });

  it('should handle special characters in content', () => {
    const specialTask: CliTask = createTask('What is x = y²/√z × ∑(n→∞)?');
    const estimate = router.estimateDifficulty(specialTask);

    expect(estimate).toBeDefined();
  });

  it('should handle unicode content', () => {
    const unicodeTask: CliTask = createTask('分析这个算法的复杂度');
    const estimate = router.estimateDifficulty(unicodeTask);

    expect(estimate).toBeDefined();
  });

  it('should handle very easy single word tasks', () => {
    const trivialTask: CliTask = createTask('Hi');
    const estimate = router.estimateDifficulty(trivialTask);

    expect(estimate.level).toBe('easy');
    expect(estimate.aggregateScore).toBeLessThan(0.5);
  });

  it('should handle all keywords present', () => {
    const keywordHeavyTask: CliTask = createTask(
      'Analyze, reason, prove, debug, expert, domain, technical, creative, novel, ' +
        'design, exact, precise, verify, test, security, critical'
    );
    const estimate = router.estimateDifficulty(keywordHeavyTask);

    expect(estimate.aggregateScore).toBeGreaterThan(0.5);
  });
});
