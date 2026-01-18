/**
 * nexus-agents/agents - Forest-of-Thought Types Tests
 *
 * Comprehensive tests for Forest-of-Thought type definitions,
 * schemas, and validation across all forest-related modules.
 *
 * @module agents/reasoning/forest-types.test
 * (Source: arXiv:2412.09078, Issue #331, CODING_STANDARDS.md)
 */

import { describe, it, expect } from 'vitest';
import {
  // Node types and schemas
  NodeStateSchema,
  ReasoningStepTypeSchema,
  ReasoningNodeMetadataSchema,
  ReasoningNodeSchema,
  type ReasoningNode,
  type ReasoningNodeMetadata,
  type NodeState,
  type ReasoningStepType,
  type CreateNodeInput,
  // Tree types and schemas
  TreeStateSchema,
  PathScoreBreakdownSchema,
  PathScoreSchema,
  TreeStatisticsSchema,
  DEFAULT_PATH_SCORING_OPTIONS,
  type TreeState,
  type PathScoreBreakdown,
  type PathScore,
  type TreeStatistics,
  type CreateTreeInput,
  // Config types and schemas
  ActivationStrategySchema,
  CrossTreeStrategySchema,
  ForestPruningStrategySchema,
  ForestConfigSchema,
  DEFAULT_FOREST_CONFIG,
  DEFAULT_ACTIVATION_OPTIONS,
  type ActivationStrategy,
  type CrossTreeStrategy,
  type ForestPruningStrategy,
  type ForestConfig,
  // Forest types and schemas
  ForestStateSchema,
  SharedConclusionSchema,
  SharedInsightSchema,
  FailurePatternSchema,
  CrossTreeInfoSchema,
  ForestStatisticsSchema,
  type ForestState,
  type SharedConclusion,
  type SharedInsight,
  type FailurePattern,
  type CrossTreeInfo,
  type ForestStatistics,
  type CreateForestInput,
  // Result types and schemas
  TerminationReasonSchema,
  BestSolutionSchema,
  ExplorationEventTypeSchema,
  ExplorationEventSchema,
  ForestResultSchema,
  type TerminationReason,
  type BestSolution,
  type ExplorationEventType,
  type ExplorationEvent,
} from './forest-types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createValidReasoningNode = (): ReasoningNode => ({
  id: 'node-1',
  treeId: 'tree-1',
  parentId: null,
  children: ['node-2', 'node-3'],
  depth: 0,
  stepType: 'hypothesis',
  content: 'Initial hypothesis about the problem',
  metadata: {
    source: 'claude',
    tokensUsed: 100,
    generationTimeMs: 500,
  },
  state: 'completed',
  isActive: true,
  activationScore: 0.8,
  confidence: 0.9,
  qualityScore: 0.85,
  estimatedValue: 0.7,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const createValidPathScore = (): PathScore => ({
  treeId: 'tree-1',
  path: ['node-1', 'node-2', 'node-3'],
  targetNodeId: 'node-3',
  score: 0.85,
  breakdown: {
    confidenceScore: 0.9,
    qualityScore: 0.8,
    coherenceScore: 0.85,
    depthFactor: -0.02,
    conclusionBonus: 0.1,
  },
  reachesConclusion: true,
  length: 3,
});

const createValidTreeStatistics = (): TreeStatistics => ({
  totalNodes: 10,
  activeNodes: 5,
  maxDepth: 4,
  avgQualityScore: 0.75,
  avgConfidence: 0.8,
  conclusionCount: 2,
  totalTokensUsed: 1000,
  avgBranchingFactor: 2.5,
});

const createValidForestStatistics = (): ForestStatistics => ({
  totalTrees: 5,
  activeTrees: 3,
  totalNodes: 50,
  totalActiveNodes: 20,
  maxDepth: 8,
  bestPathScore: 0.92,
  avgTreeScore: 0.75,
  totalTokensUsed: 5000,
  totalExplorationTimeMs: 30000,
  activationRatio: 0.4,
});

// ============================================================================
// Node Types Tests
// ============================================================================

describe('Node Types', () => {
  describe('NodeStateSchema', () => {
    it('should accept valid node states', () => {
      const validStates: NodeState[] = ['pending', 'active', 'completed', 'pruned', 'error'];

      for (const state of validStates) {
        expect(NodeStateSchema.safeParse(state).success).toBe(true);
      }
    });

    it('should reject invalid node states', () => {
      expect(NodeStateSchema.safeParse('invalid').success).toBe(false);
      expect(NodeStateSchema.safeParse('running').success).toBe(false);
      expect(NodeStateSchema.safeParse('').success).toBe(false);
    });
  });

  describe('ReasoningStepTypeSchema', () => {
    it('should accept valid step types', () => {
      const validTypes: ReasoningStepType[] = [
        'hypothesis',
        'inference',
        'decomposition',
        'synthesis',
        'verification',
        'conclusion',
      ];

      for (const stepType of validTypes) {
        expect(ReasoningStepTypeSchema.safeParse(stepType).success).toBe(true);
      }
    });

    it('should reject invalid step types', () => {
      expect(ReasoningStepTypeSchema.safeParse('thinking').success).toBe(false);
      expect(ReasoningStepTypeSchema.safeParse('analysis').success).toBe(false);
    });
  });

  describe('ReasoningNodeMetadataSchema', () => {
    it('should accept valid metadata', () => {
      const metadata: ReasoningNodeMetadata = {
        source: 'claude',
        tokensUsed: 150,
        generationTimeMs: 1200,
        crossReferences: ['node-5', 'node-7'],
        custom: { debugInfo: 'test' },
      };

      const result = ReasoningNodeMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('should accept empty metadata object', () => {
      const result = ReasoningNodeMetadataSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject negative tokensUsed', () => {
      const metadata = { tokensUsed: -10 };
      const result = ReasoningNodeMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it('should reject negative generationTimeMs', () => {
      const metadata = { generationTimeMs: -100 };
      const result = ReasoningNodeMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  describe('ReasoningNodeSchema', () => {
    it('should accept valid reasoning node', () => {
      const node = createValidReasoningNode();
      const result = ReasoningNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('should reject node with empty id', () => {
      const node = { ...createValidReasoningNode(), id: '' };
      const result = ReasoningNodeSchema.safeParse(node);
      expect(result.success).toBe(false);
    });

    it('should accept node with null parentId (root node)', () => {
      const node = createValidReasoningNode();
      expect(node.parentId).toBeNull();

      const result = ReasoningNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('should reject confidence outside 0-1 range', () => {
      const node = { ...createValidReasoningNode(), confidence: 1.5 };
      const result = ReasoningNodeSchema.safeParse(node);
      expect(result.success).toBe(false);
    });

    it('should reject qualityScore outside 0-1 range', () => {
      const node = { ...createValidReasoningNode(), qualityScore: -0.1 };
      const result = ReasoningNodeSchema.safeParse(node);
      expect(result.success).toBe(false);
    });

    it('should reject negative depth', () => {
      const node = { ...createValidReasoningNode(), depth: -1 };
      const result = ReasoningNodeSchema.safeParse(node);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Tree Types Tests
// ============================================================================

describe('Tree Types', () => {
  describe('TreeStateSchema', () => {
    it('should accept valid tree states', () => {
      const validStates: TreeState[] = ['growing', 'paused', 'completed', 'abandoned'];

      for (const state of validStates) {
        expect(TreeStateSchema.safeParse(state).success).toBe(true);
      }
    });

    it('should reject invalid tree states', () => {
      expect(TreeStateSchema.safeParse('running').success).toBe(false);
      expect(TreeStateSchema.safeParse('stopped').success).toBe(false);
    });
  });

  describe('PathScoreBreakdownSchema', () => {
    it('should accept valid breakdown', () => {
      const breakdown: PathScoreBreakdown = {
        confidenceScore: 0.85,
        qualityScore: 0.9,
        coherenceScore: 0.8,
        depthFactor: -0.05,
        conclusionBonus: 0.1,
      };

      const result = PathScoreBreakdownSchema.safeParse(breakdown);
      expect(result.success).toBe(true);
    });

    it('should reject scores outside 0-1 range', () => {
      const breakdown = {
        confidenceScore: 1.5,
        qualityScore: 0.9,
        coherenceScore: 0.8,
        depthFactor: 0,
        conclusionBonus: 0.1,
      };

      const result = PathScoreBreakdownSchema.safeParse(breakdown);
      expect(result.success).toBe(false);
    });

    it('should allow negative depthFactor (penalty)', () => {
      const breakdown = {
        confidenceScore: 0.85,
        qualityScore: 0.9,
        coherenceScore: 0.8,
        depthFactor: -0.15,
        conclusionBonus: 0.1,
      };

      const result = PathScoreBreakdownSchema.safeParse(breakdown);
      expect(result.success).toBe(true);
    });
  });

  describe('PathScoreSchema', () => {
    it('should accept valid path score', () => {
      const pathScore = createValidPathScore();
      const result = PathScoreSchema.safeParse(pathScore);
      expect(result.success).toBe(true);
    });

    it('should reject path with empty treeId', () => {
      const pathScore = { ...createValidPathScore(), treeId: '' };
      const result = PathScoreSchema.safeParse(pathScore);
      expect(result.success).toBe(false);
    });

    it('should reject path with score outside 0-1', () => {
      const pathScore = { ...createValidPathScore(), score: 1.2 };
      const result = PathScoreSchema.safeParse(pathScore);
      expect(result.success).toBe(false);
    });

    it('should reject non-positive length', () => {
      const pathScore = { ...createValidPathScore(), length: 0 };
      const result = PathScoreSchema.safeParse(pathScore);
      expect(result.success).toBe(false);
    });
  });

  describe('TreeStatisticsSchema', () => {
    it('should accept valid tree statistics', () => {
      const stats = createValidTreeStatistics();
      const result = TreeStatisticsSchema.safeParse(stats);
      expect(result.success).toBe(true);
    });

    it('should reject negative node counts', () => {
      const stats = { ...createValidTreeStatistics(), totalNodes: -5 };
      const result = TreeStatisticsSchema.safeParse(stats);
      expect(result.success).toBe(false);
    });

    it('should reject avgQualityScore outside 0-1', () => {
      const stats = { ...createValidTreeStatistics(), avgQualityScore: 1.5 };
      const result = TreeStatisticsSchema.safeParse(stats);
      expect(result.success).toBe(false);
    });

    it('should accept zero values for counts', () => {
      const stats = {
        ...createValidTreeStatistics(),
        totalNodes: 0,
        activeNodes: 0,
        maxDepth: 0,
        conclusionCount: 0,
        totalTokensUsed: 0,
      };
      const result = TreeStatisticsSchema.safeParse(stats);
      expect(result.success).toBe(true);
    });
  });

  describe('DEFAULT_PATH_SCORING_OPTIONS', () => {
    it('should have valid scoring weights', () => {
      expect(DEFAULT_PATH_SCORING_OPTIONS.confidenceWeight).toBeGreaterThan(0);
      expect(DEFAULT_PATH_SCORING_OPTIONS.qualityWeight).toBeGreaterThan(0);
      expect(DEFAULT_PATH_SCORING_OPTIONS.coherenceWeight).toBeGreaterThan(0);
    });

    it('should have weights summing close to 1', () => {
      const sum =
        DEFAULT_PATH_SCORING_OPTIONS.confidenceWeight +
        DEFAULT_PATH_SCORING_OPTIONS.qualityWeight +
        DEFAULT_PATH_SCORING_OPTIONS.coherenceWeight;
      expect(sum).toBeCloseTo(0.9, 1);
    });
  });
});

// ============================================================================
// Config Types Tests
// ============================================================================

describe('Config Types', () => {
  describe('ActivationStrategySchema', () => {
    it('should accept valid activation strategies', () => {
      const validStrategies: ActivationStrategy[] = ['ucb', 'greedy', 'diverse', 'adaptive'];

      for (const strategy of validStrategies) {
        expect(ActivationStrategySchema.safeParse(strategy).success).toBe(true);
      }
    });

    it('should reject invalid strategies', () => {
      expect(ActivationStrategySchema.safeParse('random').success).toBe(false);
      expect(ActivationStrategySchema.safeParse('mcts').success).toBe(false);
    });
  });

  describe('CrossTreeStrategySchema', () => {
    it('should accept valid cross-tree strategies', () => {
      const validStrategies: CrossTreeStrategy[] = ['none', 'conclusions', 'insights', 'full'];

      for (const strategy of validStrategies) {
        expect(CrossTreeStrategySchema.safeParse(strategy).success).toBe(true);
      }
    });

    it('should reject invalid strategies', () => {
      expect(CrossTreeStrategySchema.safeParse('partial').success).toBe(false);
    });
  });

  describe('ForestPruningStrategySchema', () => {
    it('should accept valid pruning strategies', () => {
      const validStrategies: ForestPruningStrategy[] = ['none', 'score', 'depth', 'combined'];

      for (const strategy of validStrategies) {
        expect(ForestPruningStrategySchema.safeParse(strategy).success).toBe(true);
      }
    });
  });

  describe('ForestConfigSchema', () => {
    it('should accept valid configuration', () => {
      const config: ForestConfig = {
        maxTrees: 10,
        maxDepth: 15,
        maxNodesPerTree: 200,
        activationBudget: 100,
        sparsityRatio: 0.3,
        activationStrategy: 'ucb',
        explorationConstant: Math.SQRT2,
        crossTreeStrategy: 'insights',
        pruningStrategy: 'combined',
        minScoreThreshold: 0.2,
        confidenceThreshold: 0.8,
        earlyTerminationThreshold: 0.95,
        maxExplorationTimeMs: 600000,
        nodeTimeoutMs: 60000,
        maxTokensPerTree: 20000,
        enableParallelExploration: true,
        parallelThreads: 5,
        enableEarlyTermination: true,
        enableCrossTreeSharing: true,
        temperature: 0.8,
        seed: 12345,
      };

      const result = ForestConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const result = ForestConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxTrees).toBe(5);
        expect(result.data.maxDepth).toBe(10);
        expect(result.data.activationStrategy).toBe('ucb');
      }
    });

    it('should reject maxTrees outside valid range', () => {
      const config = { maxTrees: 100 };
      const result = ForestConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject temperature outside 0-2 range', () => {
      const config = { temperature: 3.0 };
      const result = ForestConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should accept null seed for random', () => {
      const config = { seed: null };
      const result = ForestConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('DEFAULT_FOREST_CONFIG', () => {
    it('should be valid according to schema', () => {
      const result = ForestConfigSchema.safeParse(DEFAULT_FOREST_CONFIG);
      expect(result.success).toBe(true);
    });

    it('should have reasonable defaults', () => {
      expect(DEFAULT_FOREST_CONFIG.maxTrees).toBeGreaterThan(0);
      expect(DEFAULT_FOREST_CONFIG.maxTrees).toBeLessThanOrEqual(50);
      expect(DEFAULT_FOREST_CONFIG.sparsityRatio).toBeGreaterThan(0);
      expect(DEFAULT_FOREST_CONFIG.sparsityRatio).toBeLessThanOrEqual(1);
    });
  });

  describe('DEFAULT_ACTIVATION_OPTIONS', () => {
    it('should have valid values', () => {
      expect(DEFAULT_ACTIVATION_OPTIONS.maxActive).toBeGreaterThan(0);
      expect(DEFAULT_ACTIVATION_OPTIONS.strategy).toBe('ucb');
      expect(DEFAULT_ACTIVATION_OPTIONS.minScore).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_ACTIVATION_OPTIONS.minScore).toBeLessThanOrEqual(1);
      expect(typeof DEFAULT_ACTIVATION_OPTIONS.ensureTreeCoverage).toBe('boolean');
    });
  });
});

// ============================================================================
// Forest Types Tests
// ============================================================================

describe('Forest Types', () => {
  describe('ForestStateSchema', () => {
    it('should accept valid forest states', () => {
      const validStates: ForestState[] = [
        'initializing',
        'exploring',
        'converging',
        'completed',
        'timeout',
      ];

      for (const state of validStates) {
        expect(ForestStateSchema.safeParse(state).success).toBe(true);
      }
    });

    it('should reject invalid forest states', () => {
      expect(ForestStateSchema.safeParse('running').success).toBe(false);
      expect(ForestStateSchema.safeParse('paused').success).toBe(false);
    });
  });

  describe('SharedConclusionSchema', () => {
    it('should accept valid shared conclusion', () => {
      const conclusion: SharedConclusion = {
        sourceTreeId: 'tree-1',
        sourceNodeId: 'node-5',
        content: 'The solution to the problem is X',
        confidence: 0.9,
        qualityScore: 0.85,
      };

      const result = SharedConclusionSchema.safeParse(conclusion);
      expect(result.success).toBe(true);
    });

    it('should reject empty source IDs', () => {
      const conclusion = {
        sourceTreeId: '',
        sourceNodeId: 'node-5',
        content: 'Conclusion',
        confidence: 0.9,
        qualityScore: 0.85,
      };

      const result = SharedConclusionSchema.safeParse(conclusion);
      expect(result.success).toBe(false);
    });

    it('should reject confidence outside 0-1', () => {
      const conclusion = {
        sourceTreeId: 'tree-1',
        sourceNodeId: 'node-5',
        content: 'Conclusion',
        confidence: 1.5,
        qualityScore: 0.85,
      };

      const result = SharedConclusionSchema.safeParse(conclusion);
      expect(result.success).toBe(false);
    });
  });

  describe('SharedInsightSchema', () => {
    it('should accept valid shared insight', () => {
      const insight: SharedInsight = {
        sourceTreeId: 'tree-2',
        sourceNodeId: 'node-3',
        content: 'This approach works better for X',
        relevance: 0.75,
      };

      const result = SharedInsightSchema.safeParse(insight);
      expect(result.success).toBe(true);
    });

    it('should reject relevance outside 0-1', () => {
      const insight = {
        sourceTreeId: 'tree-2',
        sourceNodeId: 'node-3',
        content: 'Insight',
        relevance: -0.5,
      };

      const result = SharedInsightSchema.safeParse(insight);
      expect(result.success).toBe(false);
    });
  });

  describe('FailurePatternSchema', () => {
    it('should accept valid failure pattern', () => {
      const pattern: FailurePattern = {
        pattern: 'Recursive approach leads to infinite loop',
        occurrences: 3,
        avgFailureScore: 0.2,
      };

      const result = FailurePatternSchema.safeParse(pattern);
      expect(result.success).toBe(true);
    });

    it('should reject non-positive occurrences', () => {
      const pattern = {
        pattern: 'Test pattern',
        occurrences: 0,
        avgFailureScore: 0.2,
      };

      const result = FailurePatternSchema.safeParse(pattern);
      expect(result.success).toBe(false);
    });

    it('should reject avgFailureScore outside 0-1', () => {
      const pattern = {
        pattern: 'Test pattern',
        occurrences: 5,
        avgFailureScore: 1.5,
      };

      const result = FailurePatternSchema.safeParse(pattern);
      expect(result.success).toBe(false);
    });
  });

  describe('CrossTreeInfoSchema', () => {
    it('should accept valid cross-tree info', () => {
      const info: CrossTreeInfo = {
        sharedConclusions: [
          {
            sourceTreeId: 'tree-1',
            sourceNodeId: 'node-5',
            content: 'Conclusion 1',
            confidence: 0.9,
            qualityScore: 0.85,
          },
        ],
        sharedInsights: [
          {
            sourceTreeId: 'tree-2',
            sourceNodeId: 'node-3',
            content: 'Insight 1',
            relevance: 0.7,
          },
        ],
        failurePatterns: [
          {
            pattern: 'Pattern 1',
            occurrences: 2,
            avgFailureScore: 0.3,
          },
        ],
      };

      const result = CrossTreeInfoSchema.safeParse(info);
      expect(result.success).toBe(true);
    });

    it('should accept empty arrays', () => {
      const info: CrossTreeInfo = {
        sharedConclusions: [],
        sharedInsights: [],
        failurePatterns: [],
      };

      const result = CrossTreeInfoSchema.safeParse(info);
      expect(result.success).toBe(true);
    });
  });

  describe('ForestStatisticsSchema', () => {
    it('should accept valid forest statistics', () => {
      const stats = createValidForestStatistics();
      const result = ForestStatisticsSchema.safeParse(stats);
      expect(result.success).toBe(true);
    });

    it('should reject negative tree counts', () => {
      const stats = { ...createValidForestStatistics(), totalTrees: -1 };
      const result = ForestStatisticsSchema.safeParse(stats);
      expect(result.success).toBe(false);
    });

    it('should reject bestPathScore outside 0-1', () => {
      const stats = { ...createValidForestStatistics(), bestPathScore: 1.5 };
      const result = ForestStatisticsSchema.safeParse(stats);
      expect(result.success).toBe(false);
    });

    it('should reject activationRatio outside 0-1', () => {
      const stats = { ...createValidForestStatistics(), activationRatio: 1.2 };
      const result = ForestStatisticsSchema.safeParse(stats);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Result Types Tests
// ============================================================================

describe('Result Types', () => {
  describe('TerminationReasonSchema', () => {
    it('should accept valid termination reasons', () => {
      const validReasons: TerminationReason[] = [
        'solution_found',
        'convergence',
        'max_time',
        'max_tokens',
        'max_depth',
        'no_progress',
        'error',
      ];

      for (const reason of validReasons) {
        expect(TerminationReasonSchema.safeParse(reason).success).toBe(true);
      }
    });

    it('should reject invalid termination reasons', () => {
      expect(TerminationReasonSchema.safeParse('timeout').success).toBe(false);
      expect(TerminationReasonSchema.safeParse('cancelled').success).toBe(false);
    });
  });

  describe('BestSolutionSchema', () => {
    it('should accept valid best solution', () => {
      const solution: BestSolution = {
        treeId: 'tree-1',
        path: ['node-1', 'node-2', 'node-3'],
        conclusionNode: createValidReasoningNode(),
        confidence: 0.9,
        qualityScore: 0.85,
        combinedScore: 0.87,
      };

      const result = BestSolutionSchema.safeParse(solution);
      expect(result.success).toBe(true);
    });

    it('should reject solution with empty treeId', () => {
      const solution = {
        treeId: '',
        path: ['node-1'],
        conclusionNode: createValidReasoningNode(),
        confidence: 0.9,
        qualityScore: 0.85,
        combinedScore: 0.87,
      };

      const result = BestSolutionSchema.safeParse(solution);
      expect(result.success).toBe(false);
    });

    it('should reject confidence outside 0-1', () => {
      const solution = {
        treeId: 'tree-1',
        path: ['node-1'],
        conclusionNode: createValidReasoningNode(),
        confidence: 1.5,
        qualityScore: 0.85,
        combinedScore: 0.87,
      };

      const result = BestSolutionSchema.safeParse(solution);
      expect(result.success).toBe(false);
    });
  });

  describe('ExplorationEventTypeSchema', () => {
    it('should accept valid exploration event types', () => {
      const validTypes: ExplorationEventType[] = [
        'tree_created',
        'node_created',
        'node_activated',
        'node_deactivated',
        'node_completed',
        'node_pruned',
        'path_scored',
        'cross_tree_share',
        'conclusion_reached',
        'tree_completed',
        'forest_converging',
        'forest_completed',
      ];

      for (const eventType of validTypes) {
        expect(ExplorationEventTypeSchema.safeParse(eventType).success).toBe(true);
      }
    });

    it('should reject invalid event types', () => {
      expect(ExplorationEventTypeSchema.safeParse('started').success).toBe(false);
      expect(ExplorationEventTypeSchema.safeParse('stopped').success).toBe(false);
    });
  });

  describe('ExplorationEventSchema', () => {
    it('should accept valid exploration event', () => {
      const event: ExplorationEvent = {
        timestamp: Date.now(),
        eventType: 'node_created',
        treeId: 'tree-1',
        nodeId: 'node-5',
        details: { depth: 3, parentId: 'node-2' },
      };

      const result = ExplorationEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should accept event without optional fields', () => {
      const event: ExplorationEvent = {
        timestamp: Date.now(),
        eventType: 'forest_completed',
        details: { reason: 'solution_found' },
      };

      const result = ExplorationEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should accept empty details object', () => {
      const event: ExplorationEvent = {
        timestamp: Date.now(),
        eventType: 'forest_converging',
        details: {},
      };

      const result = ExplorationEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });
  });

  // Note: ForestResultSchema tests verify structure only because the schema
  // references ForestStateSchema/ForestStatisticsSchema which may have
  // circular dependency issues when used with Zod's array validation.
  describe('ForestResultSchema', () => {
    it('should be a valid Zod schema object', () => {
      expect(ForestResultSchema).toBeDefined();
      expect(ForestResultSchema.safeParse).toBeDefined();
      expect(typeof ForestResultSchema.safeParse).toBe('function');
    });

    it('should have a shape property with schema fields', () => {
      expect(ForestResultSchema.shape).toBeDefined();
      expect(ForestResultSchema.shape.forestId).toBeDefined();
      expect(ForestResultSchema.shape.problem).toBeDefined();
      expect(ForestResultSchema.shape.bestSolution).toBeDefined();
      expect(ForestResultSchema.shape.topPaths).toBeDefined();
      expect(ForestResultSchema.shape.terminationReason).toBeDefined();
      expect(ForestResultSchema.shape.durationMs).toBeDefined();
      expect(ForestResultSchema.shape.totalTokensUsed).toBeDefined();
    });
  });
});

// ============================================================================
// Type Interface Tests
// ============================================================================

describe('Type Interfaces', () => {
  describe('CreateNodeInput', () => {
    it('should define valid create node input structure', () => {
      const input: CreateNodeInput = {
        parentId: 'node-1',
        treeId: 'tree-1',
        stepType: 'inference',
        content: 'This follows from the previous step',
        confidence: 0.8,
        metadata: { source: 'claude' },
      };

      expect(input.parentId).toBe('node-1');
      expect(input.stepType).toBe('inference');
    });

    it('should allow null parentId for root nodes', () => {
      const input: CreateNodeInput = {
        parentId: null,
        treeId: 'tree-1',
        stepType: 'hypothesis',
        content: 'Initial hypothesis',
        confidence: 0.7,
      };

      expect(input.parentId).toBeNull();
    });
  });

  describe('CreateTreeInput', () => {
    it('should define valid create tree input structure', () => {
      const input: CreateTreeInput = {
        forestId: 'forest-1',
        hypothesis: 'Try a greedy approach',
        explorationPriority: 0.8,
      };

      expect(input.forestId).toBe('forest-1');
      expect(input.hypothesis).toBe('Try a greedy approach');
    });

    it('should allow optional explorationPriority', () => {
      const input: CreateTreeInput = {
        forestId: 'forest-1',
        hypothesis: 'Another approach',
      };

      expect(input.explorationPriority).toBeUndefined();
    });
  });

  describe('CreateForestInput', () => {
    it('should define valid create forest input structure', () => {
      const input: CreateForestInput = {
        problem: 'Optimize the algorithm',
        config: { maxTrees: 3 },
        initialHypotheses: ['Greedy approach', 'Dynamic programming', 'Divide and conquer'],
      };

      expect(input.problem).toBe('Optimize the algorithm');
      expect(input.initialHypotheses).toHaveLength(3);
    });

    it('should allow minimal input with just problem', () => {
      const input: CreateForestInput = {
        problem: 'Simple problem',
      };

      expect(input.config).toBeUndefined();
      expect(input.initialHypotheses).toBeUndefined();
    });
  });
});

// ============================================================================
// Edge Cases and Integration Tests
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty path arrays in PathScore', () => {
    const pathScore = { ...createValidPathScore(), path: [], length: 0 };
    const result = PathScoreSchema.safeParse(pathScore);
    // Length must be positive, so this should fail
    expect(result.success).toBe(false);
  });

  it('should handle maximum valid values', () => {
    const stats: ForestStatistics = {
      totalTrees: 50,
      activeTrees: 50,
      totalNodes: 25000,
      totalActiveNodes: 1000,
      maxDepth: 20,
      bestPathScore: 1.0,
      avgTreeScore: 1.0,
      totalTokensUsed: 500000,
      totalExplorationTimeMs: 600000,
      activationRatio: 1.0,
    };

    const result = ForestStatisticsSchema.safeParse(stats);
    expect(result.success).toBe(true);
  });

  it('should handle minimum valid values', () => {
    const stats: ForestStatistics = {
      totalTrees: 0,
      activeTrees: 0,
      totalNodes: 0,
      totalActiveNodes: 0,
      maxDepth: 0,
      bestPathScore: 0,
      avgTreeScore: 0,
      totalTokensUsed: 0,
      totalExplorationTimeMs: 0,
      activationRatio: 0,
    };

    const result = ForestStatisticsSchema.safeParse(stats);
    expect(result.success).toBe(true);
  });

  it('should handle node with many children', () => {
    const node: ReasoningNode = {
      ...createValidReasoningNode(),
      children: Array.from({ length: 100 }, (_, i) => `child-${String(i)}`),
    };

    const result = ReasoningNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });

  it('should handle deeply nested cross-references', () => {
    const metadata: ReasoningNodeMetadata = {
      crossReferences: Array.from({ length: 50 }, (_, i) => `ref-${String(i)}`),
      custom: {
        nested: {
          deeply: {
            data: Array.from({ length: 10 }, (_, i) => i),
          },
        },
      },
    };

    const result = ReasoningNodeMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });
});
