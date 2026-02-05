/**
 * Tests for Forest-of-Thought Helper Functions
 * @module agents/reasoning/forest-engine-helpers.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReasoningNode, TreeId } from './forest-node-types.js';
import type { ReasoningTree } from './forest-tree-types.js';
import type { ForestConfig } from './forest-config-types.js';
import { DEFAULT_FOREST_CONFIG } from './forest-config-types.js';
import type { TerminationReason } from './forest-result-types.js';
import type { BuildResultParams } from './forest-engine-helpers.js';
import {
  extractText,
  parseHypothesisResponse,
  parseReasoningStepResponse,
  buildPathContent,
  calculateQualityScore,
  buildCrossTreeContext,
  calculatePathBreakdown,
  buildForestResult,
  parseForestConfig,
  buildReasoningNode,
  shouldTerminateEarly,
  checkEarlyTermination,
} from './forest-engine-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

vi.mock('../../core/index.js', () => ({
  getTimeProvider: () => ({ now: () => 1000000 }),
  getRandomProvider: () => ({ randomString: () => 'abc123' }),
}));

vi.mock('./forest-engine-ids.js', () => ({
  generateNodeId: (treeIdx: number, nodeIdx: number) =>
    `node-${String(treeIdx)}-${String(nodeIdx)}-test`,
}));

function makeNode(overrides: Partial<ReasoningNode> = {}): ReasoningNode {
  return {
    id: 'node-0-0',
    treeId: 'tree-0',
    parentId: null,
    children: [],
    depth: 0,
    stepType: 'hypothesis',
    content: 'Test content',
    metadata: {},
    state: 'active',
    isActive: true,
    activationScore: 0.5,
    confidence: 0.8,
    qualityScore: 0.7,
    estimatedValue: 0.6,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeTree(overrides: Partial<ReasoningTree> = {}): ReasoningTree {
  const rootNode = makeNode({ id: 'root-0', treeId: 'tree-0' });
  return {
    id: 'tree-0',
    forestId: 'forest-0',
    rootId: 'root-0',
    nodes: new Map([['root-0', rootNode]]),
    state: 'growing',
    overallScore: 0.5,
    explorationPriority: 1.0,
    hypothesis: 'Test hypothesis',
    bestPaths: [],
    statistics: {
      totalNodes: 1,
      activeNodes: 1,
      maxDepth: 0,
      avgQualityScore: 0.7,
      avgConfidence: 0.8,
      conclusionCount: 0,
      totalTokensUsed: 100,
      avgBranchingFactor: 0,
    },
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

// ============================================================================
// extractText
// ============================================================================

describe('extractText', () => {
  it('returns string content directly', () => {
    expect(extractText('hello world')).toBe('hello world');
  });

  it('returns empty string content', () => {
    expect(extractText('')).toBe('');
  });

  it('extracts text from array of text blocks', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ];
    expect(extractText(content)).toBe('Hello world');
  });

  it('skips non-text blocks in array', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'image', url: 'http://example.com' },
      { type: 'text', text: ' world' },
    ];
    expect(extractText(content)).toBe('Hello world');
  });

  it('handles empty array', () => {
    expect(extractText([])).toBe('');
  });

  it('handles array with only non-text blocks', () => {
    const content = [{ type: 'image', url: 'http://example.com' }];
    expect(extractText(content)).toBe('');
  });

  it('converts non-string non-array to string', () => {
    expect(extractText(42)).toBe('42');
    expect(extractText(null)).toBe('null');
    expect(extractText(undefined)).toBe('undefined');
  });

  it('handles blocks with missing text property', () => {
    const content = [{ type: 'text' }];
    expect(extractText(content)).toBe('');
  });

  it('handles non-object array elements', () => {
    const content = ['plain string', 42, null];
    expect(extractText(content)).toBe('');
  });
});

// ============================================================================
// parseHypothesisResponse
// ============================================================================

describe('parseHypothesisResponse', () => {
  it('parses valid JSON hypothesis', () => {
    const text =
      '{"hypothesis": "The sky is blue", "reasoning": "Rayleigh scattering", "confidence": 0.9}';
    const result = parseHypothesisResponse(text);
    expect(result).toEqual({
      hypothesis: 'The sky is blue',
      reasoning: 'Rayleigh scattering',
      confidence: 0.9,
    });
  });

  it('extracts JSON from surrounding text', () => {
    const text =
      'Here is my analysis: {"hypothesis": "Test", "reasoning": "Because", "confidence": 0.7} - end';
    const result = parseHypothesisResponse(text);
    expect(result).not.toBeNull();
    expect(result?.hypothesis).toBe('Test');
  });

  it('defaults reasoning to empty string when missing', () => {
    const text = '{"hypothesis": "Test", "confidence": 0.5}';
    const result = parseHypothesisResponse(text);
    expect(result?.reasoning).toBe('');
  });

  it('defaults confidence to 0.5 when missing', () => {
    const text = '{"hypothesis": "Test"}';
    const result = parseHypothesisResponse(text);
    expect(result?.confidence).toBe(0.5);
  });

  it('defaults confidence to 0.5 when not a number', () => {
    const text = '{"hypothesis": "Test", "confidence": "high"}';
    const result = parseHypothesisResponse(text);
    expect(result?.confidence).toBe(0.5);
  });

  it('returns null for missing hypothesis field', () => {
    const text = '{"reasoning": "Because", "confidence": 0.5}';
    expect(parseHypothesisResponse(text)).toBeNull();
  });

  it('returns null for non-string hypothesis', () => {
    const text = '{"hypothesis": 42, "reasoning": "Because"}';
    expect(parseHypothesisResponse(text)).toBeNull();
  });

  it('returns null for text without JSON', () => {
    expect(parseHypothesisResponse('no json here')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseHypothesisResponse('{invalid json}')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseHypothesisResponse('')).toBeNull();
  });
});

// ============================================================================
// parseReasoningStepResponse
// ============================================================================

describe('parseReasoningStepResponse', () => {
  it('parses valid reasoning step', () => {
    const text =
      '{"stepType": "inference", "content": "Therefore X", "confidence": 0.85, "isConclusion": false}';
    const result = parseReasoningStepResponse(text);
    expect(result).toEqual({
      stepType: 'inference',
      content: 'Therefore X',
      confidence: 0.85,
      isConclusion: false,
      conclusionContent: undefined,
    });
  });

  it('parses conclusion step with conclusionContent', () => {
    const text =
      '{"stepType": "conclusion", "content": "Final", "confidence": 0.9, "isConclusion": true, "conclusionContent": "The answer is X"}';
    const result = parseReasoningStepResponse(text);
    expect(result?.isConclusion).toBe(true);
    expect(result?.conclusionContent).toBe('The answer is X');
  });

  it('accepts all valid step types', () => {
    const stepTypes = ['inference', 'decomposition', 'synthesis', 'verification', 'conclusion'];
    for (const stepType of stepTypes) {
      const text = `{"stepType": "${stepType}", "content": "test", "confidence": 0.5}`;
      const result = parseReasoningStepResponse(text);
      expect(result).not.toBeNull();
      expect(result?.stepType).toBe(stepType);
    }
  });

  it('rejects invalid step type', () => {
    const text = '{"stepType": "invalid", "content": "test", "confidence": 0.5}';
    expect(parseReasoningStepResponse(text)).toBeNull();
  });

  it('rejects hypothesis step type', () => {
    // hypothesis is not in the valid list for reasoning steps
    const text = '{"stepType": "hypothesis", "content": "test", "confidence": 0.5}';
    expect(parseReasoningStepResponse(text)).toBeNull();
  });

  it('defaults confidence to 0.5 when missing', () => {
    const text = '{"stepType": "inference", "content": "test"}';
    const result = parseReasoningStepResponse(text);
    expect(result?.confidence).toBe(0.5);
  });

  it('isConclusion defaults to false when not true', () => {
    const text = '{"stepType": "inference", "content": "test"}';
    const result = parseReasoningStepResponse(text);
    expect(result?.isConclusion).toBe(false);
  });

  it('returns null when stepType missing', () => {
    const text = '{"content": "test", "confidence": 0.5}';
    expect(parseReasoningStepResponse(text)).toBeNull();
  });

  it('returns null when content missing', () => {
    const text = '{"stepType": "inference", "confidence": 0.5}';
    expect(parseReasoningStepResponse(text)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseReasoningStepResponse('not json')).toBeNull();
  });

  it('omits conclusionContent when not a string', () => {
    const text = '{"stepType": "conclusion", "content": "test", "conclusionContent": 42}';
    const result = parseReasoningStepResponse(text);
    expect(result?.conclusionContent).toBeUndefined();
  });
});

// ============================================================================
// buildPathContent
// ============================================================================

describe('buildPathContent', () => {
  it('builds single-node path', () => {
    const node = makeNode({
      id: 'n1',
      parentId: null,
      stepType: 'hypothesis',
      content: 'Root hypothesis',
    });
    const tree = makeTree({ nodes: new Map([['n1', node]]) });
    const result = buildPathContent(tree, node);
    expect(result).toBe('[hypothesis] Root hypothesis');
  });

  it('builds multi-node path with arrows', () => {
    const root = makeNode({ id: 'root', parentId: null, stepType: 'hypothesis', content: 'Start' });
    const child = makeNode({
      id: 'child',
      parentId: 'root',
      stepType: 'inference',
      content: 'Middle',
    });
    const leaf = makeNode({
      id: 'leaf',
      parentId: 'child',
      stepType: 'conclusion',
      content: 'End',
    });
    const nodes = new Map([
      ['root', root],
      ['child', child],
      ['leaf', leaf],
    ]);
    const tree = makeTree({ nodes });

    const result = buildPathContent(tree, leaf);
    expect(result).toBe('[hypothesis] Start\n→ [inference] Middle\n→ [conclusion] End');
  });

  it('truncates long content to 100 characters', () => {
    const longContent = 'A'.repeat(200);
    const node = makeNode({ id: 'n1', parentId: null, content: longContent });
    const tree = makeTree({ nodes: new Map([['n1', node]]) });
    const result = buildPathContent(tree, node);
    expect(result).toContain('A'.repeat(100));
    expect(result).not.toContain('A'.repeat(101));
  });
});

// ============================================================================
// calculateQualityScore
// ============================================================================

describe('calculateQualityScore', () => {
  it('returns confidence for generic step type', () => {
    const score = calculateQualityScore('inference', 0.8, 0);
    expect(score).toBe(0.8);
  });

  it('adds 0.1 bonus for conclusion step', () => {
    const score = calculateQualityScore('conclusion', 0.8, 0);
    expect(score).toBe(0.9);
  });

  it('adds 0.05 bonus for verification step', () => {
    const score = calculateQualityScore('verification', 0.8, 0);
    expect(score).toBeCloseTo(0.85);
  });

  it('subtracts 0.02 per depth level', () => {
    const score = calculateQualityScore('inference', 0.8, 5);
    expect(score).toBeCloseTo(0.7);
  });

  it('clamps result to [0, 1]', () => {
    // conclusion bonus + high confidence should clamp to 1
    expect(calculateQualityScore('conclusion', 0.95, 0)).toBe(1);
    // deep depth with low confidence should clamp to 0
    expect(calculateQualityScore('inference', 0.1, 10)).toBe(0);
  });

  it('handles zero confidence and zero depth', () => {
    expect(calculateQualityScore('inference', 0, 0)).toBe(0);
  });
});

// ============================================================================
// buildCrossTreeContext
// ============================================================================

describe('buildCrossTreeContext', () => {
  it('returns empty string when no other trees', () => {
    const trees = new Map<TreeId, ReasoningTree>([['tree-0', makeTree()]]);
    expect(buildCrossTreeContext(trees, 'tree-0')).toBe('');
  });

  it('excludes the specified tree', () => {
    const trees = new Map<TreeId, ReasoningTree>([['tree-0', makeTree({ id: 'tree-0' })]]);
    expect(buildCrossTreeContext(trees, 'tree-0')).toBe('');
  });

  it('includes conclusions from other trees', () => {
    const conclusionNode = makeNode({
      id: 'c1',
      treeId: 'tree-1',
      stepType: 'conclusion',
      content: 'Important conclusion',
      confidence: 0.5,
    });
    const tree1 = makeTree({
      id: 'tree-1',
      nodes: new Map([['c1', conclusionNode]]),
    });
    const trees = new Map<TreeId, ReasoningTree>([
      ['tree-0', makeTree()],
      ['tree-1', tree1],
    ]);

    const result = buildCrossTreeContext(trees, 'tree-0');
    expect(result).toContain('Insights from other reasoning paths');
    expect(result).toContain('Important conclusion');
  });

  it('includes high-confidence nodes (>=0.8) even if not conclusions', () => {
    const highConfNode = makeNode({
      id: 'h1',
      treeId: 'tree-1',
      stepType: 'inference',
      content: 'High confidence insight',
      confidence: 0.9,
    });
    const tree1 = makeTree({
      id: 'tree-1',
      nodes: new Map([['h1', highConfNode]]),
    });
    const trees = new Map<TreeId, ReasoningTree>([
      ['tree-0', makeTree()],
      ['tree-1', tree1],
    ]);

    const result = buildCrossTreeContext(trees, 'tree-0');
    expect(result).toContain('High confidence insight');
  });

  it('excludes low-confidence non-conclusion nodes', () => {
    const lowNode = makeNode({
      id: 'l1',
      treeId: 'tree-1',
      stepType: 'inference',
      content: 'Low confidence thought',
      confidence: 0.3,
    });
    const tree1 = makeTree({
      id: 'tree-1',
      nodes: new Map([['l1', lowNode]]),
    });
    const trees = new Map<TreeId, ReasoningTree>([
      ['tree-0', makeTree()],
      ['tree-1', tree1],
    ]);

    expect(buildCrossTreeContext(trees, 'tree-0')).toBe('');
  });

  it('limits to 3 insights maximum', () => {
    const nodes = new Map<string, ReasoningNode>();
    for (let i = 0; i < 5; i++) {
      nodes.set(
        `c${String(i)}`,
        makeNode({
          id: `c${String(i)}`,
          treeId: 'tree-1',
          stepType: 'conclusion',
          content: `Conclusion ${String(i)}`,
        })
      );
    }
    const tree1 = makeTree({ id: 'tree-1', nodes });
    const trees = new Map<TreeId, ReasoningTree>([
      ['tree-0', makeTree()],
      ['tree-1', tree1],
    ]);

    const result = buildCrossTreeContext(trees, 'tree-0');
    const insightLines = result.split('\n').filter((l) => l.startsWith('[From tree'));
    expect(insightLines).toHaveLength(3);
  });
});

// ============================================================================
// calculatePathBreakdown
// ============================================================================

describe('calculatePathBreakdown', () => {
  it('returns correct breakdown from node properties', () => {
    const node = makeNode({ confidence: 0.85, qualityScore: 0.9, depth: 3 });
    const breakdown = calculatePathBreakdown(node);
    expect(breakdown.confidenceScore).toBe(0.85);
    expect(breakdown.qualityScore).toBe(0.9);
    expect(breakdown.coherenceScore).toBe(0.7);
    expect(breakdown.depthFactor).toBe(-0.06);
    expect(breakdown.conclusionBonus).toBe(0.1);
  });

  it('handles root node (depth 0)', () => {
    const node = makeNode({ depth: 0 });
    const breakdown = calculatePathBreakdown(node);
    expect(breakdown.depthFactor).toBeCloseTo(0);
  });
});

// ============================================================================
// parseForestConfig
// ============================================================================

describe('parseForestConfig', () => {
  it('returns default config when undefined', () => {
    const config = parseForestConfig(undefined);
    expect(config).toEqual(DEFAULT_FOREST_CONFIG);
  });

  it('returns default config for empty object', () => {
    const config = parseForestConfig({});
    expect(config).toEqual(DEFAULT_FOREST_CONFIG);
  });

  it('merges partial config with defaults', () => {
    const config = parseForestConfig({ maxTrees: 10, maxDepth: 5 });
    expect(config.maxTrees).toBe(10);
    expect(config.maxDepth).toBe(5);
    expect(config.activationBudget).toBe(DEFAULT_FOREST_CONFIG.activationBudget);
  });

  it('returns default config for invalid values', () => {
    // maxTrees max is 50, passing 100 should fail validation
    const config = parseForestConfig({ maxTrees: 100 });
    expect(config).toEqual(DEFAULT_FOREST_CONFIG);
  });

  it('handles strategy overrides', () => {
    const config = parseForestConfig({
      activationStrategy: 'greedy',
      crossTreeStrategy: 'full',
    });
    expect(config.activationStrategy).toBe('greedy');
    expect(config.crossTreeStrategy).toBe('full');
  });

  it('handles boolean overrides', () => {
    const config = parseForestConfig({
      enableEarlyTermination: false,
      enableCrossTreeSharing: false,
    });
    expect(config.enableEarlyTermination).toBe(false);
    expect(config.enableCrossTreeSharing).toBe(false);
  });
});

// ============================================================================
// shouldTerminateEarly
// ============================================================================

describe('shouldTerminateEarly', () => {
  const config: ForestConfig = { ...DEFAULT_FOREST_CONFIG, earlyTerminationThreshold: 0.9 };

  it('returns true when early termination enabled and score meets threshold', () => {
    expect(shouldTerminateEarly(config, 0.95)).toBe(true);
  });

  it('returns true when score equals threshold exactly', () => {
    expect(shouldTerminateEarly(config, 0.9)).toBe(true);
  });

  it('returns false when score below threshold', () => {
    expect(shouldTerminateEarly(config, 0.5)).toBe(false);
  });

  it('returns false when early termination disabled', () => {
    const disabled = { ...config, enableEarlyTermination: false };
    expect(shouldTerminateEarly(disabled, 0.99)).toBe(false);
  });
});

// ============================================================================
// checkEarlyTermination
// ============================================================================

describe('checkEarlyTermination', () => {
  const config: ForestConfig = {
    ...DEFAULT_FOREST_CONFIG,
    enableEarlyTermination: true,
    earlyTerminationThreshold: 0.9,
  };

  it('returns unchanged bestScore when res is null', () => {
    const result = checkEarlyTermination(config, null, 0.5);
    expect(result).toEqual({ newBestScore: 0.5, reason: null });
  });

  it('returns unchanged bestScore when score not better', () => {
    const result = checkEarlyTermination(config, { score: 0.3 }, 0.5);
    expect(result).toEqual({ newBestScore: 0.5, reason: null });
  });

  it('returns unchanged bestScore when score equals current best', () => {
    const result = checkEarlyTermination(config, { score: 0.5 }, 0.5);
    expect(result).toEqual({ newBestScore: 0.5, reason: null });
  });

  it('updates bestScore when new score is better but below threshold', () => {
    const result = checkEarlyTermination(config, { score: 0.7 }, 0.5);
    expect(result).toEqual({ newBestScore: 0.7, reason: null });
  });

  it('returns solution_found when new score meets threshold', () => {
    const result = checkEarlyTermination(config, { score: 0.95 }, 0.5);
    expect(result).toEqual({ newBestScore: 0.95, reason: 'solution_found' });
  });

  it('returns no reason when early termination disabled even with high score', () => {
    const disabled = { ...config, enableEarlyTermination: false };
    const result = checkEarlyTermination(disabled, { score: 0.99 }, 0.5);
    expect(result).toEqual({ newBestScore: 0.99, reason: null });
  });
});

// ============================================================================
// buildReasoningNode
// ============================================================================

describe('buildReasoningNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a reasoning node from parsed step', () => {
    const parentNode = makeNode({ id: 'parent', depth: 1 });
    const node = buildReasoningNode({
      parsed: {
        stepType: 'inference',
        content: 'New reasoning',
        confidence: 0.85,
        isConclusion: false,
      },
      parentNode,
      treeId: 'tree-0',
      treeNodesSize: 5,
      tokensUsed: 200,
    });

    expect(node.id).toBe('node-0-5-test');
    expect(node.treeId).toBe('tree-0');
    expect(node.parentId).toBe('parent');
    expect(node.depth).toBe(2);
    expect(node.stepType).toBe('inference');
    expect(node.content).toBe('New reasoning');
    expect(node.confidence).toBe(0.85);
    expect(node.isActive).toBe(true);
    expect(node.activationScore).toBe(0.85);
    expect(node.metadata.tokensUsed).toBe(200);
  });

  it('sets isActive false for conclusion nodes', () => {
    const parentNode = makeNode({ depth: 0 });
    const node = buildReasoningNode({
      parsed: {
        stepType: 'conclusion',
        content: 'Final answer',
        confidence: 0.9,
        isConclusion: true,
        conclusionContent: 'The answer is 42',
      },
      parentNode,
      treeId: 'tree-0',
      treeNodesSize: 3,
      tokensUsed: 150,
    });

    expect(node.isActive).toBe(false);
    expect(node.activationScore).toBe(0);
    expect(node.metadata.custom).toEqual({ conclusionContent: 'The answer is 42' });
  });

  it('omits custom metadata when no conclusionContent', () => {
    const parentNode = makeNode({ depth: 0 });
    const node = buildReasoningNode({
      parsed: {
        stepType: 'inference',
        content: 'Step',
        confidence: 0.7,
        isConclusion: false,
      },
      parentNode,
      treeId: 'tree-0',
      treeNodesSize: 1,
      tokensUsed: 100,
    });

    expect(node.metadata.custom).toBeUndefined();
  });

  it('computes estimatedValue as weighted combination', () => {
    const parentNode = makeNode({ depth: 0 });
    const node = buildReasoningNode({
      parsed: {
        stepType: 'inference',
        content: 'Test',
        confidence: 0.8,
        isConclusion: false,
      },
      parentNode,
      treeId: 'tree-0',
      treeNodesSize: 0,
      tokensUsed: 50,
    });

    // estimatedValue = confidence * 0.7 + qualityScore * 0.3
    const expectedQuality = calculateQualityScore('inference', 0.8, 0);
    const expectedValue = 0.8 * 0.7 + expectedQuality * 0.3;
    expect(node.estimatedValue).toBeCloseTo(expectedValue);
  });

  it('extracts tree index from treeId for node ID generation', () => {
    const parentNode = makeNode({ depth: 0 });
    const node = buildReasoningNode({
      parsed: {
        stepType: 'inference',
        content: 'Test',
        confidence: 0.5,
        isConclusion: false,
      },
      parentNode,
      treeId: 'tree-3',
      treeNodesSize: 7,
      tokensUsed: 50,
    });

    expect(node.id).toBe('node-3-7-test');
  });
});

// ============================================================================
// buildForestResult
// ============================================================================

describe('buildForestResult', () => {
  it('builds result with no conclusions', () => {
    const trees = new Map<TreeId, ReasoningTree>([['tree-0', makeTree()]]);
    const params: BuildResultParams = {
      forestId: 'forest-1',
      problem: 'Test problem',
      trees,
      terminationReason: 'max_time' as TerminationReason,
      tokensUsed: 500,
      durationMs: 10000,
      explorationHistory: [],
    };

    const result = buildForestResult(params);
    expect(result.forestId).toBe('forest-1');
    expect(result.problem).toBe('Test problem');
    expect(result.bestSolution).toBeNull();
    expect(result.topPaths).toEqual([]);
    expect(result.conclusions).toEqual([]);
    expect(result.finalState).toBe('converging');
    expect(result.terminationReason).toBe('max_time');
    expect(result.durationMs).toBe(10000);
    expect(result.totalTokensUsed).toBe(500);
    expect(result.statistics.totalTrees).toBe(1);
  });

  it('builds result with conclusion nodes', () => {
    const root = makeNode({
      id: 'root',
      treeId: 'tree-0',
      parentId: null,
      stepType: 'hypothesis',
      content: 'Start',
    });
    const conclusion = makeNode({
      id: 'conc',
      treeId: 'tree-0',
      parentId: 'root',
      stepType: 'conclusion',
      content: 'Final answer',
      confidence: 0.9,
      qualityScore: 0.85,
      depth: 1,
    });
    const nodes = new Map([
      ['root', root],
      ['conc', conclusion],
    ]);
    const tree = makeTree({
      id: 'tree-0',
      nodes,
      statistics: {
        totalNodes: 2,
        activeNodes: 1,
        maxDepth: 1,
        avgQualityScore: 0.75,
        avgConfidence: 0.85,
        conclusionCount: 1,
        totalTokensUsed: 200,
        avgBranchingFactor: 1,
      },
    });

    const params: BuildResultParams = {
      forestId: 'forest-1',
      problem: 'Test',
      trees: new Map([['tree-0', tree]]),
      terminationReason: 'solution_found',
      tokensUsed: 200,
      durationMs: 5000,
      explorationHistory: [],
    };

    const result = buildForestResult(params);
    expect(result.bestSolution).not.toBeNull();
    expect(result.bestSolution?.conclusionNode.id).toBe('conc');
    expect(result.conclusions).toHaveLength(1);
    expect(result.topPaths).toHaveLength(1);
    expect(result.finalState).toBe('completed');
  });

  it('ranks top paths by score (highest first)', () => {
    const root = makeNode({ id: 'root', parentId: null, stepType: 'hypothesis', content: 'Start' });
    const conc1 = makeNode({
      id: 'conc1',
      parentId: 'root',
      stepType: 'conclusion',
      content: 'Low quality',
      confidence: 0.5,
      qualityScore: 0.3,
      depth: 1,
    });
    const conc2 = makeNode({
      id: 'conc2',
      parentId: 'root',
      stepType: 'conclusion',
      content: 'High quality',
      confidence: 0.95,
      qualityScore: 0.9,
      depth: 1,
    });
    const nodes = new Map([
      ['root', root],
      ['conc1', conc1],
      ['conc2', conc2],
    ]);
    const tree = makeTree({
      nodes,
      statistics: {
        totalNodes: 3,
        activeNodes: 1,
        maxDepth: 1,
        avgQualityScore: 0.6,
        avgConfidence: 0.7,
        conclusionCount: 2,
        totalTokensUsed: 300,
        avgBranchingFactor: 2,
      },
    });

    const params: BuildResultParams = {
      forestId: 'forest-1',
      problem: 'Test',
      trees: new Map([['tree-0', tree]]),
      terminationReason: 'solution_found',
      tokensUsed: 300,
      durationMs: 5000,
      explorationHistory: [],
    };

    const result = buildForestResult(params);
    expect(result.topPaths.length).toBe(2);
    expect(result.topPaths[0]!.score).toBeGreaterThan(result.topPaths[1]!.score);
    expect(result.bestSolution?.conclusionNode.id).toBe('conc2');
  });

  it('limits topPaths to 5 entries', () => {
    const root = makeNode({ id: 'root', parentId: null, stepType: 'hypothesis', content: 'Start' });
    const nodeEntries: Array<[string, ReasoningNode]> = [['root', root]];
    for (let i = 0; i < 7; i++) {
      nodeEntries.push([
        `conc${String(i)}`,
        makeNode({
          id: `conc${String(i)}`,
          parentId: 'root',
          stepType: 'conclusion',
          content: `Conclusion ${String(i)}`,
          depth: 1,
        }),
      ]);
    }
    const tree = makeTree({
      nodes: new Map(nodeEntries),
      statistics: {
        totalNodes: 8,
        activeNodes: 1,
        maxDepth: 1,
        avgQualityScore: 0.7,
        avgConfidence: 0.8,
        conclusionCount: 7,
        totalTokensUsed: 800,
        avgBranchingFactor: 7,
      },
    });

    const params: BuildResultParams = {
      forestId: 'forest-1',
      problem: 'Test',
      trees: new Map([['tree-0', tree]]),
      terminationReason: 'convergence',
      tokensUsed: 800,
      durationMs: 15000,
      explorationHistory: [],
    };

    const result = buildForestResult(params);
    expect(result.topPaths).toHaveLength(5);
    expect(result.conclusions).toHaveLength(7);
  });

  it('computes statistics correctly', () => {
    const tree1 = makeTree({
      id: 'tree-0',
      state: 'growing',
      statistics: {
        totalNodes: 5,
        activeNodes: 3,
        maxDepth: 2,
        avgQualityScore: 0.7,
        avgConfidence: 0.8,
        conclusionCount: 0,
        totalTokensUsed: 500,
        avgBranchingFactor: 2,
      },
    });
    const tree2 = makeTree({
      id: 'tree-1',
      state: 'completed',
      statistics: {
        totalNodes: 8,
        activeNodes: 2,
        maxDepth: 4,
        avgQualityScore: 0.6,
        avgConfidence: 0.7,
        conclusionCount: 0,
        totalTokensUsed: 800,
        avgBranchingFactor: 2,
      },
    });
    const trees = new Map([
      ['tree-0', tree1],
      ['tree-1', tree2],
    ]);

    const params: BuildResultParams = {
      forestId: 'forest-1',
      problem: 'Test',
      trees,
      terminationReason: 'max_time',
      tokensUsed: 1300,
      durationMs: 20000,
      explorationHistory: [],
    };

    const result = buildForestResult(params);
    expect(result.statistics.totalTrees).toBe(2);
    expect(result.statistics.activeTrees).toBe(1); // only tree-0 is growing
    expect(result.statistics.totalNodes).toBe(13);
    expect(result.statistics.totalActiveNodes).toBe(5);
    expect(result.statistics.maxDepth).toBe(4);
    expect(result.statistics.totalTokensUsed).toBe(1300);
    expect(result.statistics.totalExplorationTimeMs).toBe(20000);
  });

  it('sets finalState to completed for solution_found termination', () => {
    const params: BuildResultParams = {
      forestId: 'forest-1',
      problem: 'Test',
      trees: new Map([['tree-0', makeTree()]]),
      terminationReason: 'solution_found',
      tokensUsed: 100,
      durationMs: 1000,
      explorationHistory: [],
    };
    expect(buildForestResult(params).finalState).toBe('completed');
  });

  it('sets finalState to converging for non-solution termination', () => {
    const reasons: TerminationReason[] = [
      'convergence',
      'max_time',
      'max_tokens',
      'max_depth',
      'no_progress',
      'error',
    ];
    for (const reason of reasons) {
      const params: BuildResultParams = {
        forestId: 'forest-1',
        problem: 'Test',
        trees: new Map([['tree-0', makeTree()]]),
        terminationReason: reason,
        tokensUsed: 100,
        durationMs: 1000,
        explorationHistory: [],
      };
      expect(buildForestResult(params).finalState).toBe('converging');
    }
  });
});
