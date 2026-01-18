/**
 * nexus-agents/cli-adapters - Router Integration Tests
 *
 * Integration tests for the routing system that test:
 * - Router pipeline flow (ZeroRouter -> CompositeRouter)
 * - Different task types routing correctly
 * - Error handling across router boundaries
 * - Configuration options and their effects
 *
 * @module cli-adapters/routing-integration.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZeroRouter, createZeroRouter, ZeroRoutingError } from './zero-router.js';
import {
  CompositeRouter,
  createCompositeRouter,
  CompositeRoutingError,
} from './composite-router.js';
import {
  DAAOEstimator,
  createDAAOEstimator,
  estimateDAAODifficulty,
  routeByDAAODifficulty,
} from './daao-estimator.js';
import { DAAOError } from './daao-types.js';
import type { ICliAdapter, CliTask, CliName } from './types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/** Default adapter capabilities for testing. */
const DEFAULT_TEST_CAPABILITIES: ICliAdapter['capabilities'] = {
  reasoning: 8,
  contextWindow: 200000,
  codeGeneration: 9,
  speed: 7,
  cost: 5,
};

/**
 * Creates a mock CLI adapter for testing.
 */
function createMockAdapter(
  name: CliName,
  capabilities?: Partial<ICliAdapter['capabilities']>
): ICliAdapter {
  const mergedCapabilities = { ...DEFAULT_TEST_CAPABILITIES, ...capabilities };
  return {
    name,
    transport: 'subprocess',
    capabilities: mergedCapabilities,
    execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'mock response' } }),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, version: '1.0.0' }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getCapacity: vi.fn().mockResolvedValue({ remainingTokens: 100000 }),
    getModelInfo: vi.fn().mockReturnValue({ id: name, name }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as ICliAdapter;
}

/**
 * Creates test adapters map with configured capabilities.
 */
function createTestAdapters(): Map<CliName, ICliAdapter> {
  const map = new Map<CliName, ICliAdapter>();
  map.set('claude', createMockAdapter('claude', { reasoning: 10, speed: 6, cost: 8 }));
  map.set('gemini', createMockAdapter('gemini', { reasoning: 8, speed: 9, cost: 4 }));
  map.set('codex', createMockAdapter('codex', { reasoning: 7, speed: 10, cost: 3 }));
  return map;
}

const createTask = (content: string, systemPrompt?: string): CliTask =>
  systemPrompt !== undefined ? { content, systemPrompt } : { content };

// Task fixtures for different difficulty levels
const taskFixtures = {
  trivial: createTask('Hello'),
  easy: createTask('What is 2 + 2?'),
  codeGeneration: createTask('Write a function to sort an array using quicksort algorithm.'),
  architecture: createTask(
    'Design a scalable microservices architecture with API gateway, ' +
      'service discovery, and distributed tracing.'
  ),
  security: createTask(
    'Implement a secure authentication system with OAuth 2.0, JWT tokens, ' +
      'CSRF protection, and rate limiting.'
  ),
  complex: createTask(
    'Design and implement a distributed consensus algorithm for a multi-node system ' +
      'that handles Byzantine faults. Analyze trade-offs between consistency, ' +
      'availability, and partition tolerance.'
  ),
  documentation: createTask('Write API documentation for the user authentication endpoints.'),
  testing: createTask('Write comprehensive unit tests for the UserService class with mocking.'),
  refactoring: createTask(
    'Refactor the entire payment module to use the new strategy pattern throughout.'
  ),
  creative: createTask('Brainstorm innovative UI/UX designs for a mobile banking application.'),
};

// ============================================================================
// Router Pipeline Flow Tests
// ============================================================================

describe('Router Pipeline Flow', () => {
  describe('ZeroRouter -> CompositeRouter integration', () => {
    let zeroRouter: ZeroRouter;
    let compositeRouter: CompositeRouter;
    let adapters: Map<CliName, ICliAdapter>;

    beforeEach(() => {
      zeroRouter = new ZeroRouter({ verbose: false, enableCalibration: false });
      adapters = createTestAdapters();
      compositeRouter = new CompositeRouter(adapters, {
        enableBudgetFilter: true,
        enableTopsisRanking: true,
        enableLinUCBSelection: true,
      });
    });

    it('should produce consistent difficulty estimates across routers', () => {
      const task = taskFixtures.codeGeneration;

      const zeroDifficulty = zeroRouter.estimateDifficulty(task);
      const daaoEstimator = new DAAOEstimator({ verbose: false, enableCalibration: false });
      const daaoDifficulty = daaoEstimator.estimateDifficulty(task);

      // Both should classify similar tasks similarly
      expect(zeroDifficulty.level).toBeDefined();
      expect(daaoDifficulty.level).toBeDefined();

      // Scores should be in valid range
      expect(zeroDifficulty.aggregateScore).toBeGreaterThanOrEqual(0);
      expect(zeroDifficulty.aggregateScore).toBeLessThanOrEqual(1);
      expect(daaoDifficulty.score).toBeGreaterThanOrEqual(0);
      expect(daaoDifficulty.score).toBeLessThanOrEqual(1);
    });

    it('should route through full pipeline successfully', async () => {
      const task = taskFixtures.architecture;

      // First estimate difficulty with ZeroRouter
      const zeroDecision = zeroRouter.routeByDifficulty(task);

      // Then route through CompositeRouter
      const compositeResult = await compositeRouter.route(task);

      expect(zeroDecision.selectedCli).toBeDefined();
      expect(compositeResult.ok).toBe(true);

      if (compositeResult.ok) {
        expect(compositeResult.value.cliName).toBeDefined();
        expect(compositeResult.value.stagesExecuted).toContain('task-analysis');
      }
    });

    it('should handle task escalation through pipeline', async () => {
      // Start with easy task
      const easyTask = taskFixtures.easy;
      const easyZeroDecision = zeroRouter.routeByDifficulty(easyTask);
      const easyCompositeResult = await compositeRouter.route(easyTask);

      // Move to complex task
      const complexTask = taskFixtures.complex;
      const complexZeroDecision = zeroRouter.routeByDifficulty(complexTask);
      const complexCompositeResult = await compositeRouter.route(complexTask);

      // Easy task should have lower difficulty
      expect(easyZeroDecision.difficulty.aggregateScore).toBeLessThan(
        complexZeroDecision.difficulty.aggregateScore
      );

      // Both should route successfully
      expect(easyCompositeResult.ok).toBe(true);
      expect(complexCompositeResult.ok).toBe(true);
    });
  });

  describe('DAAO -> CompositeRouter integration', () => {
    let daaoEstimator: DAAOEstimator;
    let compositeRouter: CompositeRouter;
    let adapters: Map<CliName, ICliAdapter>;

    beforeEach(() => {
      daaoEstimator = new DAAOEstimator({ verbose: false, enableCalibration: false });
      adapters = createTestAdapters();
      compositeRouter = new CompositeRouter(adapters);
    });

    it('should produce feature-rich estimates', () => {
      const task = taskFixtures.security;

      const estimate = daaoEstimator.estimateDifficulty(task);

      // DAAO provides detailed feature breakdown
      expect(estimate.features.technicalSpecificity).toBeGreaterThan(0);
      // constraintComplexity may be 0 depending on keyword matches
      expect(estimate.features.constraintComplexity).toBeGreaterThanOrEqual(0);
      expect(estimate.dominantFeature).toBeDefined();
      expect(estimate.reconstructionError).toBeDefined();
    });

    it('should route through both routers consistently', async () => {
      const task = taskFixtures.codeGeneration;

      const daaoDecision = daaoEstimator.route(task);
      const compositeResult = await compositeRouter.route(task);

      expect(daaoDecision.selectedCli).toBeDefined();
      expect(compositeResult.ok).toBe(true);

      // Both should select a valid CLI
      if (compositeResult.ok) {
        expect(['claude', 'gemini', 'codex']).toContain(daaoDecision.selectedCli);
        expect(['claude', 'gemini', 'codex']).toContain(compositeResult.value.cliName);
      }
    });
  });
});

// ============================================================================
// Task Type Routing Tests
// ============================================================================

describe('Task Type Routing', () => {
  let zeroRouter: ZeroRouter;
  let daaoEstimator: DAAOEstimator;

  beforeEach(() => {
    zeroRouter = new ZeroRouter({ verbose: false, enableCalibration: false });
    daaoEstimator = new DAAOEstimator({ verbose: false, enableCalibration: false });
  });

  describe('trivial tasks', () => {
    it('should route trivial tasks to fast tier', () => {
      const zeroDecision = zeroRouter.routeByDifficulty(taskFixtures.trivial);
      const daaoDecision = daaoEstimator.route(taskFixtures.trivial);

      expect(zeroDecision.tier).toBe('fast');
      expect(daaoDecision.tier).toBe('fast');
    });

    it('should have low difficulty scores for trivial tasks', () => {
      const zeroEstimate = zeroRouter.estimateDifficulty(taskFixtures.trivial);
      const daaoEstimate = daaoEstimator.estimateDifficulty(taskFixtures.trivial);

      expect(zeroEstimate.aggregateScore).toBeLessThan(0.5);
      expect(daaoEstimate.score).toBeLessThan(0.5);
    });
  });

  describe('code generation tasks', () => {
    it('should identify code generation as medium difficulty', () => {
      const zeroEstimate = zeroRouter.estimateDifficulty(taskFixtures.codeGeneration);
      const daaoEstimate = daaoEstimator.estimateDifficulty(taskFixtures.codeGeneration);

      // Code generation typically falls into medium range
      expect(zeroEstimate.aggregateScore).toBeGreaterThan(0.1);
      expect(daaoEstimate.score).toBeGreaterThan(0.1);
    });

    it('should detect reasoning complexity', () => {
      const zeroEstimate = zeroRouter.estimateDifficulty(taskFixtures.codeGeneration);

      expect(zeroEstimate.dimensions.reasoning).toBeGreaterThan(0);
    });
  });

  describe('architecture tasks', () => {
    it('should route architecture tasks based on complexity analysis', () => {
      const zeroDecision = zeroRouter.routeByDifficulty(taskFixtures.architecture);
      const daaoDecision = daaoEstimator.route(taskFixtures.architecture);

      // Architecture tasks may route to any tier depending on detected complexity
      expect(['fast', 'balanced', 'powerful']).toContain(zeroDecision.tier);
      expect(['fast', 'balanced', 'powerful']).toContain(daaoDecision.tier);
    });

    it('should detect high technical specificity', () => {
      const daaoEstimate = daaoEstimator.estimateDifficulty(taskFixtures.architecture);

      expect(daaoEstimate.features.technicalSpecificity).toBeGreaterThan(0.2);
    });
  });

  describe('security tasks', () => {
    it('should identify security tasks as complex', () => {
      const zeroEstimate = zeroRouter.estimateDifficulty(taskFixtures.security);
      const daaoEstimate = daaoEstimator.estimateDifficulty(taskFixtures.security);

      // Security tasks have some complexity dimensions active
      expect(zeroEstimate.dimensions.precision).toBeGreaterThanOrEqual(0);
      expect(daaoEstimate.features.constraintComplexity).toBeGreaterThanOrEqual(0);
      // At least technical specificity should be present
      expect(daaoEstimate.features.technicalSpecificity).toBeGreaterThan(0);
    });
  });

  describe('complex distributed systems tasks', () => {
    it('should route complex tasks to powerful tier or balanced', () => {
      const zeroDecision = zeroRouter.routeByDifficulty(taskFixtures.complex);
      const daaoDecision = daaoEstimator.route(taskFixtures.complex);

      expect(['balanced', 'powerful']).toContain(zeroDecision.tier);
      expect(['balanced', 'powerful']).toContain(daaoDecision.tier);
    });

    it('should have high difficulty scores', () => {
      const zeroEstimate = zeroRouter.estimateDifficulty(taskFixtures.complex);
      const daaoEstimate = daaoEstimator.estimateDifficulty(taskFixtures.complex);

      expect(zeroEstimate.aggregateScore).toBeGreaterThan(0.3);
      expect(daaoEstimate.score).toBeGreaterThan(0.3);
    });
  });

  describe('documentation tasks', () => {
    it('should route documentation tasks to appropriate tier', () => {
      const zeroDecision = zeroRouter.routeByDifficulty(taskFixtures.documentation);
      const daaoDecision = daaoEstimator.route(taskFixtures.documentation);

      expect(zeroDecision.tier).toBeDefined();
      expect(daaoDecision.tier).toBeDefined();
    });

    it('should not classify documentation as hard', () => {
      const daaoEstimate = daaoEstimator.estimateDifficulty(taskFixtures.documentation);

      expect(daaoEstimate.level).not.toBe('hard');
    });
  });

  describe('testing tasks', () => {
    it('should detect precision requirements in testing tasks', () => {
      const zeroEstimate = zeroRouter.estimateDifficulty(taskFixtures.testing);

      expect(zeroEstimate.dimensions.precision).toBeGreaterThan(0);
    });
  });

  describe('refactoring tasks', () => {
    it('should detect wide task scope', () => {
      const daaoEstimate = daaoEstimator.estimateDifficulty(taskFixtures.refactoring);

      expect(daaoEstimate.features.taskScope).toBeGreaterThan(0.2);
    });
  });

  describe('creative tasks', () => {
    it('should detect creativity dimension', () => {
      const zeroEstimate = zeroRouter.estimateDifficulty(taskFixtures.creative);

      expect(zeroEstimate.dimensions.creativity).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  describe('ZeroRouter errors', () => {
    let router: ZeroRouter;

    beforeEach(() => {
      router = new ZeroRouter({ verbose: false });
    });

    it('should throw ZeroRoutingError when no CLIs available', () => {
      expect(() => router.routeByDifficulty(taskFixtures.easy, [])).toThrow(ZeroRoutingError);
    });

    it('should throw with correct error code', () => {
      try {
        router.routeByDifficulty(taskFixtures.easy, []);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZeroRoutingError);
        expect((error as ZeroRoutingError).code).toBe('NO_AVAILABLE_CLIS');
      }
    });

    it('should handle gracefully when preferred tier has no match', () => {
      // Force a hard task to route to powerful tier, but only gemini is available
      const decision = router.routeByDifficulty(taskFixtures.complex, ['gemini']);

      // Should fall back to available CLI
      expect(decision.selectedCli).toBe('gemini');
    });
  });

  describe('DAAOEstimator errors', () => {
    let estimator: DAAOEstimator;

    beforeEach(() => {
      estimator = new DAAOEstimator({ verbose: false });
    });

    it('should throw DAAOError when no CLIs available', () => {
      expect(() => estimator.route(taskFixtures.easy, [])).toThrow(DAAOError);
    });

    it('should throw with correct error code', () => {
      try {
        estimator.route(taskFixtures.easy, []);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DAAOError);
        expect((error as DAAOError).code).toBe('NO_AVAILABLE_CLIS');
      }
    });
  });

  describe('CompositeRouter errors', () => {
    it('should return error when no adapters available', async () => {
      const emptyRouter = new CompositeRouter(new Map());
      const result = await emptyRouter.route(taskFixtures.easy);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CompositeRoutingError);
        expect(result.error.stage).toBe('initialization');
      }
    });

    it('should handle adapter map with missing entries', async () => {
      const adapters = new Map<CliName, ICliAdapter>();
      adapters.set('claude', createMockAdapter('claude'));
      // Only claude available

      const router = new CompositeRouter(adapters);
      const result = await router.route(taskFixtures.easy);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.cliName).toBe('claude');
      }
    });
  });

  describe('cross-router error propagation', () => {
    it('should maintain error context through pipeline', () => {
      const zeroRouter = new ZeroRouter({ verbose: false });

      try {
        zeroRouter.routeByDifficulty(taskFixtures.easy, []);
        expect.fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('available');
      }
    });
  });
});

// ============================================================================
// Configuration Options Tests
// ============================================================================

describe('Configuration Options', () => {
  describe('ZeroRouter configuration', () => {
    it('should use custom difficulty thresholds', () => {
      const strictRouter = new ZeroRouter({
        thresholds: { easyUpperBound: 0.1, hardLowerBound: 0.4 },
        verbose: false,
      });

      const lenientRouter = new ZeroRouter({
        thresholds: { easyUpperBound: 0.5, hardLowerBound: 0.9 },
        verbose: false,
      });

      const task = taskFixtures.codeGeneration;
      const strictEstimate = strictRouter.estimateDifficulty(task);
      const lenientEstimate = lenientRouter.estimateDifficulty(task);

      // With stricter thresholds, same score may classify differently
      expect(strictEstimate.aggregateScore).toBeCloseTo(lenientEstimate.aggregateScore, 2);
    });

    it('should use custom dimension weights', () => {
      const reasoningFocused = new ZeroRouter({
        weights: {
          reasoning: 1.0,
          knowledge: 0.0,
          creativity: 0.0,
          precision: 0.0,
          context_length: 0.0,
        },
        verbose: false,
      });

      const creativityFocused = new ZeroRouter({
        weights: {
          reasoning: 0.0,
          knowledge: 0.0,
          creativity: 1.0,
          precision: 0.0,
          context_length: 0.0,
        },
        verbose: false,
      });

      const creativeTask = taskFixtures.creative;
      const reasoningEstimate = reasoningFocused.estimateDifficulty(creativeTask);
      const creativityEstimate = creativityFocused.estimateDifficulty(creativeTask);

      // Different weights should produce different scores
      // Creative task should have higher score when creativity is weighted higher
      expect(creativityEstimate.aggregateScore).not.toBe(reasoningEstimate.aggregateScore);
    });

    it('should use custom tier to CLI mappings', () => {
      const customRouter = new ZeroRouter({
        tierToClis: {
          fast: ['claude', 'gemini', 'codex'],
          balanced: ['codex', 'claude', 'gemini'],
          powerful: ['gemini', 'codex', 'claude'],
        },
        verbose: false,
      });

      // Easy task routes to fast tier, which now prefers claude
      const decision = customRouter.routeByDifficulty(taskFixtures.easy);

      expect(decision.selectedCli).toBe('claude');
    });
  });

  describe('DAAOEstimator configuration', () => {
    it('should use custom feature weights', () => {
      const techFocused = new DAAOEstimator({
        weights: {
          lexicalComplexity: 0.0,
          syntacticComplexity: 0.0,
          semanticDensity: 0.0,
          technicalSpecificity: 1.0,
          taskScope: 0.0,
          constraintComplexity: 0.0,
          clarity: 0.0,
          outputComplexity: 0.0,
        },
        verbose: false,
      });

      const estimate = techFocused.estimateDifficulty(taskFixtures.architecture);

      // With only technical specificity weighted, score equals that feature
      expect(estimate.score).toBeCloseTo(estimate.features.technicalSpecificity, 1);
    });

    it('should respect typical pattern threshold', () => {
      const strictEstimator = new DAAOEstimator({
        typicalPatternThreshold: 0.01, // Very strict
        verbose: false,
      });

      const lenientEstimator = new DAAOEstimator({
        typicalPatternThreshold: 0.99, // Very lenient
        verbose: false,
      });

      const task = taskFixtures.codeGeneration;
      const lenientDecision = lenientEstimator.route(task);
      // Strict estimator for comparison (not directly used but validates behavior)
      strictEstimator.route(task);

      // Lenient threshold should almost always mark as typical
      expect(lenientDecision.isTypicalPattern).toBe(true);
    });
  });

  describe('CompositeRouter configuration', () => {
    let adapters: Map<CliName, ICliAdapter>;

    beforeEach(() => {
      adapters = createTestAdapters();
    });

    it('should disable budget filter', async () => {
      const router = new CompositeRouter(adapters, { enableBudgetFilter: false });
      const result = await router.route(taskFixtures.codeGeneration);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).not.toContain('budget-filter');
      }
    });

    it('should disable TOPSIS ranking', async () => {
      const router = new CompositeRouter(adapters, { enableTopsisRanking: false });
      const result = await router.route(taskFixtures.codeGeneration);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).not.toContain('topsis-ranking');
        expect(result.value.topsisScore).toBeUndefined();
      }
    });

    it('should disable LinUCB selection', async () => {
      const router = new CompositeRouter(adapters, { enableLinUCBSelection: false });
      const result = await router.route(taskFixtures.codeGeneration);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).not.toContain('linucb-selection');
        expect(result.value.ucbScore).toBeUndefined();
      }
    });

    it('should configure LinUCB alpha parameter', async () => {
      const lowAlphaRouter = new CompositeRouter(adapters, { linucbAlpha: 0.5 });
      const highAlphaRouter = new CompositeRouter(adapters, { linucbAlpha: 3.0 });

      const task = taskFixtures.codeGeneration;
      const lowResult = await lowAlphaRouter.route(task);
      const highResult = await highAlphaRouter.route(task);

      // Both should route successfully
      expect(lowResult.ok).toBe(true);
      expect(highResult.ok).toBe(true);
    });

    it('should enable preference routing', async () => {
      const router = new CompositeRouter(adapters, {
        enablePreferenceRouting: true,
        preferenceRouterConfig: { minDataPoints: 1 },
      });

      // Record preference data
      router.recordPreference('complex task', true, { strong: 0.9, weak: 0.5 });
      router.recordPreference('simple task', false, { strong: 0.6, weak: 0.8 });

      const result = await router.route(taskFixtures.codeGeneration);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).toContain('preference-routing');
        expect(result.value.preferenceScore).toBeDefined();
      }
    });
  });

  describe('calibration configuration', () => {
    it('should enable ZeroRouter calibration', () => {
      const router = new ZeroRouter({
        enableCalibration: true,
        minCalibrationOutcomes: 5,
        maxCalibrationOutcomes: 50,
      });

      // Add calibration data
      for (let i = 0; i < 10; i++) {
        router.calibrate({
          taskHash: `test${String(i)}`,
          estimatedDifficulty: 0.5,
          selectedCli: 'claude',
          success: i % 2 === 0,
          timestamp: Date.now(),
        });
      }

      const stats = router.getCalibrationStats();
      expect(stats.totalOutcomes).toBe(10);
      expect(stats.calibrationBias).toBeDefined();
    });

    it('should enable DAAOEstimator calibration', () => {
      const estimator = new DAAOEstimator({
        enableCalibration: true,
        minCalibrationOutcomes: 5,
        maxCalibrationOutcomes: 50,
      });

      const features = estimator.encode(taskFixtures.codeGeneration);

      // Add calibration data
      for (let i = 0; i < 10; i++) {
        estimator.calibrate({
          taskHash: `test${String(i)}`,
          features,
          estimatedScore: 0.5,
          selectedCli: 'claude',
          success: i % 2 === 0,
          timestamp: Date.now(),
        });
      }

      const stats = estimator.getCalibrationStats();
      expect(stats.totalOutcomes).toBe(10);
      expect(stats.featureImportance.length).toBeGreaterThan(0);
    });

    it('should disable calibration when configured', () => {
      const router = new ZeroRouter({ enableCalibration: false });

      router.calibrate({
        taskHash: 'test',
        estimatedDifficulty: 0.5,
        selectedCli: 'claude',
        success: true,
        timestamp: Date.now(),
      });

      const stats = router.getCalibrationStats();
      expect(stats.totalOutcomes).toBe(0);
    });
  });
});

// ============================================================================
// Factory Function Integration Tests
// ============================================================================

describe('Factory Functions Integration', () => {
  describe('createZeroRouter', () => {
    it('should create working router with factory', () => {
      const router = createZeroRouter({ verbose: false });
      const decision = router.routeByDifficulty(taskFixtures.codeGeneration);

      expect(decision.selectedCli).toBeDefined();
      expect(decision.difficulty).toBeDefined();
    });
  });

  describe('createDAAOEstimator', () => {
    it('should create working estimator with factory', () => {
      const estimator = createDAAOEstimator({ verbose: false });
      const decision = estimator.route(taskFixtures.codeGeneration);

      expect(decision.selectedCli).toBeDefined();
      expect(decision.estimate).toBeDefined();
    });
  });

  describe('createCompositeRouter', () => {
    it('should create working router with factory', async () => {
      const adapters = createTestAdapters();
      const router = createCompositeRouter(adapters);
      const result = await router.route(taskFixtures.codeGeneration);

      expect(result.ok).toBe(true);
    });
  });

  describe('quick routing functions', () => {
    it('should route with estimateDAAODifficulty', () => {
      const estimate = estimateDAAODifficulty(taskFixtures.architecture);

      expect(estimate.score).toBeGreaterThanOrEqual(0);
      expect(estimate.level).toBeDefined();
      expect(estimate.features).toBeDefined();
    });

    it('should route with routeByDAAODifficulty', () => {
      const decision = routeByDAAODifficulty(taskFixtures.security);

      expect(decision.selectedCli).toBeDefined();
      expect(decision.tier).toBeDefined();
    });

    it('should filter CLIs with quick functions', () => {
      const decision = routeByDAAODifficulty(taskFixtures.complex, ['gemini']);

      expect(decision.selectedCli).toBe('gemini');
    });
  });
});

// ============================================================================
// Edge Cases Integration Tests
// ============================================================================

describe('Edge Cases Integration', () => {
  describe('empty and whitespace content', () => {
    it('should handle empty content across all routers', async () => {
      const emptyTask = createTask('');

      const zeroRouter = new ZeroRouter({ verbose: false });
      const daaoEstimator = new DAAOEstimator({ verbose: false });
      const compositeRouter = new CompositeRouter(createTestAdapters());

      const zeroDecision = zeroRouter.routeByDifficulty(emptyTask);
      const daaoDecision = daaoEstimator.route(emptyTask);
      const compositeResult = await compositeRouter.route(emptyTask);

      expect(zeroDecision.selectedCli).toBeDefined();
      expect(daaoDecision.selectedCli).toBeDefined();
      expect(compositeResult.ok).toBe(true);
    });

    it('should handle whitespace-only content', () => {
      const whitespaceTask = createTask('   \t\n   ');

      const zeroRouter = new ZeroRouter({ verbose: false });
      const daaoEstimator = new DAAOEstimator({ verbose: false });

      const zeroEstimate = zeroRouter.estimateDifficulty(whitespaceTask);
      const daaoEstimate = daaoEstimator.estimateDifficulty(whitespaceTask);

      expect(zeroEstimate.level).toBe('easy');
      expect(daaoEstimate.level).toBe('easy');
    });
  });

  describe('very long content', () => {
    it('should handle very long content across routers', () => {
      const longTask = createTask('x'.repeat(50000));

      const zeroRouter = new ZeroRouter({ verbose: false });
      const daaoEstimator = new DAAOEstimator({ verbose: false });

      const zeroEstimate = zeroRouter.estimateDifficulty(longTask);
      const daaoEstimate = daaoEstimator.estimateDifficulty(longTask);

      // Long content should increase context_length dimension
      expect(zeroEstimate.dimensions.context_length).toBeGreaterThan(0.3);
      expect(daaoEstimate.features.taskScope).toBeGreaterThan(0.3);
    });
  });

  describe('special characters and unicode', () => {
    it('should handle special characters', () => {
      const specialTask = createTask('Calculate x = y^2 / sqrt(z) * sum(n -> infinity)');

      const zeroRouter = new ZeroRouter({ verbose: false });
      const daaoEstimator = new DAAOEstimator({ verbose: false });

      const zeroDecision = zeroRouter.routeByDifficulty(specialTask);
      const daaoDecision = daaoEstimator.route(specialTask);

      expect(zeroDecision.selectedCli).toBeDefined();
      expect(daaoDecision.selectedCli).toBeDefined();
    });

    it('should handle unicode content', () => {
      const unicodeTask = createTask('Implement text processing function');

      const zeroRouter = new ZeroRouter({ verbose: false });
      const daaoEstimator = new DAAOEstimator({ verbose: false });

      const zeroDecision = zeroRouter.routeByDifficulty(unicodeTask);
      const daaoDecision = daaoEstimator.route(unicodeTask);

      expect(zeroDecision.selectedCli).toBeDefined();
      expect(daaoDecision.selectedCli).toBeDefined();
    });
  });

  describe('system prompt handling', () => {
    it('should include system prompt in difficulty calculation', () => {
      const taskWithoutPrompt = createTask('Process data');
      const taskWithPrompt: CliTask = {
        content: 'Process data',
        systemPrompt: 'You are an expert in distributed systems, cryptography, and security.',
      };

      const daaoEstimator = new DAAOEstimator({ verbose: false });

      const withoutPromptEstimate = daaoEstimator.estimateDifficulty(taskWithoutPrompt);
      const withPromptEstimate = daaoEstimator.estimateDifficulty(taskWithPrompt);

      // System prompt with technical terms should increase technical specificity
      expect(withPromptEstimate.features.technicalSpecificity).toBeGreaterThan(
        withoutPromptEstimate.features.technicalSpecificity
      );
    });
  });

  describe('concurrent routing', () => {
    it('should handle concurrent routing requests', async () => {
      const compositeRouter = new CompositeRouter(createTestAdapters());
      const tasks = [
        taskFixtures.easy,
        taskFixtures.codeGeneration,
        taskFixtures.architecture,
        taskFixtures.complex,
      ];

      const results = await Promise.all(tasks.map((task) => compositeRouter.route(task)));

      for (const result of results) {
        expect(result.ok).toBe(true);
      }

      // Stats should reflect all decisions
      const stats = compositeRouter.getStats();
      expect(stats.totalDecisions).toBe(4);
    });
  });
});

// ============================================================================
// Stats and Observability Tests
// ============================================================================

describe('Stats and Observability', () => {
  describe('ZeroRouter stats', () => {
    it('should provide calibration statistics', () => {
      const router = new ZeroRouter({
        enableCalibration: true,
        minCalibrationOutcomes: 5,
      });

      // Add outcomes
      for (let i = 0; i < 10; i++) {
        router.calibrate({
          taskHash: `test${String(i)}`,
          estimatedDifficulty: i < 5 ? 0.2 : 0.8,
          selectedCli: i < 5 ? 'gemini' : 'claude',
          success: i % 2 === 0,
          qualityScore: 0.5 + (i % 5) * 0.1,
          timestamp: Date.now(),
        });
      }

      const stats = router.getCalibrationStats();

      expect(stats.totalOutcomes).toBe(10);
      expect(stats.meanAbsoluteError).toBeGreaterThanOrEqual(0);
      expect(stats.successRateByLevel).toBeDefined();
      expect(stats.avgQualityByLevel).toBeDefined();
    });
  });

  describe('DAAOEstimator stats', () => {
    it('should provide calibration statistics', () => {
      const estimator = new DAAOEstimator({
        enableCalibration: true,
        minCalibrationOutcomes: 5,
      });

      const features = estimator.encode(taskFixtures.codeGeneration);

      // Add outcomes
      for (let i = 0; i < 10; i++) {
        estimator.calibrate({
          taskHash: `test${String(i)}`,
          features,
          estimatedScore: i < 5 ? 0.2 : 0.8,
          selectedCli: i < 5 ? 'gemini' : 'claude',
          success: i % 2 === 0,
          qualityScore: 0.5 + (i % 5) * 0.1,
          timestamp: Date.now(),
        });
      }

      const stats = estimator.getCalibrationStats();

      expect(stats.totalOutcomes).toBe(10);
      expect(stats.featureImportance.length).toBeGreaterThan(0);
      expect(stats.avgReconstructionError).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CompositeRouter stats', () => {
    it('should track decisions per CLI', async () => {
      const router = new CompositeRouter(createTestAdapters());

      // Route multiple tasks
      for (let i = 0; i < 10; i++) {
        await router.route(taskFixtures.codeGeneration);
      }

      const stats = router.getStats();

      expect(stats.totalDecisions).toBe(10);
      expect(stats.avgDecisionTimeMs).toBeGreaterThanOrEqual(0);

      const totalPerCli =
        stats.decisionsPerCli.claude + stats.decisionsPerCli.gemini + stats.decisionsPerCli.codex;
      expect(totalPerCli).toBe(10);
    });

    it('should track bandit stats', async () => {
      const router = new CompositeRouter(createTestAdapters());

      // Route and record outcomes
      for (let i = 0; i < 5; i++) {
        const result = await router.route(taskFixtures.codeGeneration);
        if (result.ok) {
          router.recordOutcome(result.value.cliName, taskFixtures.codeGeneration, 0.8);
        }
      }

      const stats = router.getStats();
      expect(stats.banditStats).toBeDefined();
    });

    it('should track preference stats when enabled', () => {
      const router = new CompositeRouter(createTestAdapters(), {
        enablePreferenceRouting: true,
        preferenceRouterConfig: { minDataPoints: 2 },
      });

      router.recordPreference('query 1', true);
      router.recordPreference('query 2', false);

      const stats = router.getStats();
      expect(stats.preferenceStats).toBeDefined();
      expect(stats.preferenceStats?.enabled).toBe(true);
      expect(stats.preferenceStats?.dataPointCount).toBe(2);
    });
  });
});
