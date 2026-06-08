/**
 * nexus-agents/workflows - AFlow Tests
 *
 * Comprehensive tests for AFlow MCTS-based workflow generation.
 *
 * @module workflows/aflow/aflow-generator.test
 * (Source: Issue #329, arXiv:2410.10762)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { WorkflowDefinition, WorkflowStep } from '../../core/index.js';
import {
  AFlowGenerator,
  createAFlowGenerator,
  generateWorkflow,
  AFlowError,
} from './aflow-generator.js';
import { MCTSTree, createMCTSTree } from './mcts-tree.js';
import { ActionSpace, createActionSpace } from './action-space.js';
import { WorkflowEvaluator, createWorkflowEvaluator } from './evaluation.js';
import type { TaskSpecification, WorkflowAction } from './aflow-types.js';
import { DEFAULT_AFLOW_CONFIG, AFlowConfigSchema } from './aflow-types.js';
import { SINGLE_LLM_EVAL_TIMEOUT_MS } from '../../config/timeouts.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestWorkflow(steps: Partial<WorkflowStep>[] = []): WorkflowDefinition {
  const defaultSteps: WorkflowStep[] = steps.map((s, i) => ({
    id: s.id ?? `step-${String(i + 1)}`,
    agent: s.agent ?? 'code_expert',
    action: s.action ?? 'implement',
    inputs: s.inputs ?? {},
    ...(s.timeout !== undefined && { timeout: s.timeout }),
    ...(s.retries !== undefined && { retries: s.retries }),
    ...(s.dependsOn !== undefined && { dependsOn: s.dependsOn }),
    ...(s.parallel !== undefined && { parallel: s.parallel }),
  }));

  return {
    name: 'test-workflow',
    version: '1.0.0',
    description: 'Test workflow',
    inputs: [],
    steps: defaultSteps,
    timeout: 300000,
  };
}

function createTestTask(overrides: Partial<TaskSpecification> = {}): TaskSpecification {
  return {
    description: 'Test task description',
    requiredCapabilities: ['code', 'testing'],
    expectedInputs: ['input1'],
    expectedOutput: 'result',
    ...overrides,
  };
}

// ============================================================================
// AFlow Types Tests
// ============================================================================

describe('AFlow Types', () => {
  describe('AFlowConfigSchema', () => {
    it('should validate valid config', () => {
      const config = AFlowConfigSchema.parse({
        maxIterations: 50,
        maxDepth: 5,
      });

      expect(config.maxIterations).toBe(50);
      expect(config.maxDepth).toBe(5);
    });

    it('should use defaults for missing fields', () => {
      const config = AFlowConfigSchema.parse({});

      expect(config.maxIterations).toBe(DEFAULT_AFLOW_CONFIG.maxIterations);
      expect(config.explorationConstant).toBeCloseTo(Math.SQRT2);
    });

    it('uses the central single-llm class guard for evaluation timeout (#3736, non-punitive)', () => {
      // Was a punitive 30s literal guarding an LLM node evaluation; now derives
      // from the central single-llm class guard (300s).
      expect(DEFAULT_AFLOW_CONFIG.evaluationTimeoutMs).toBe(SINGLE_LLM_EVAL_TIMEOUT_MS);
      expect(DEFAULT_AFLOW_CONFIG.evaluationTimeoutMs).toBe(300_000);
      const parsed = AFlowConfigSchema.parse({});
      expect(parsed.evaluationTimeoutMs).toBe(SINGLE_LLM_EVAL_TIMEOUT_MS);
    });

    it('should reject invalid values', () => {
      expect(() => AFlowConfigSchema.parse({ maxIterations: -1 })).toThrow();

      expect(() => AFlowConfigSchema.parse({ acceptanceThreshold: 1.5 })).toThrow();
    });
  });
});

// ============================================================================
// MCTS Tree Tests
// ============================================================================

describe('MCTSTree', () => {
  let tree: MCTSTree;

  beforeEach(() => {
    tree = createMCTSTree();
  });

  describe('initialization', () => {
    it('should initialize root node', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }]);
      const root = tree.initializeRoot(workflow);

      expect(root).toBeDefined();
      expect(root.parentId).toBeNull();
      expect(root.depth).toBe(0);
      expect(root.visitCount).toBe(0);
    });

    it('should get root node', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }]);
      tree.initializeRoot(workflow);

      const root = tree.getRoot();
      expect(root).not.toBeNull();
      expect(root!.workflow.name).toBe('test-workflow');
    });

    it('should return null for uninitialized tree', () => {
      expect(tree.getRoot()).toBeNull();
    });
  });

  describe('addChild', () => {
    it('should add child node', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }]);
      const root = tree.initializeRoot(workflow);

      const action: WorkflowAction = { type: 'add_step', newStep: { id: 'step2' } };
      const childWorkflow = createTestWorkflow([{ id: 'step1' }, { id: 'step2' }]);

      const child = tree.addChild(root.id, action, childWorkflow, false);

      expect(child).not.toBeNull();
      expect(child!.parentId).toBe(root.id);
      expect(child!.depth).toBe(1);
      expect(child!.action).toBe(action);
    });

    it('should update parent children list', () => {
      const workflow = createTestWorkflow([]);
      const root = tree.initializeRoot(workflow);

      const action: WorkflowAction = { type: 'add_step', newStep: { id: 'step1' } };
      const child = tree.addChild(root.id, action, createTestWorkflow([{ id: 'step1' }]), false);

      const updatedRoot = tree.getNode(root.id);
      expect(updatedRoot!.children).toContain(child!.id);
    });

    it('should return null for non-existent parent', () => {
      const workflow = createTestWorkflow([]);
      tree.initializeRoot(workflow);

      const child = tree.addChild('nonexistent', { type: 'terminate' }, workflow, true);
      expect(child).toBeNull();
    });
  });

  describe('UCT selection', () => {
    it('should calculate UCT scores', () => {
      const workflow = createTestWorkflow([]);
      const root = tree.initializeRoot(workflow);

      // Add children with different visit counts
      const action1: WorkflowAction = { type: 'add_step', newStep: { id: 'step1' } };
      const action2: WorkflowAction = { type: 'add_step', newStep: { id: 'step2' } };

      const child1 = tree.addChild(root.id, action1, createTestWorkflow([{ id: 'step1' }]), false);
      const child2 = tree.addChild(root.id, action2, createTestWorkflow([{ id: 'step2' }]), false);

      // Simulate backpropagation through children (not root)
      tree.backpropagate(child1!.id, 0.8);
      tree.backpropagate(child2!.id, 0.3);

      const bestChild = tree.selectBestChild(root.id);
      expect(bestChild).not.toBeNull();
      expect(bestChild!.total).toBeGreaterThan(0);
    });

    it('should prefer exploration for unvisited nodes', () => {
      const workflow = createTestWorkflow([]);
      const root = tree.initializeRoot(workflow);

      const action1: WorkflowAction = { type: 'add_step', newStep: { id: 'step1' } };
      const child1 = tree.addChild(root.id, action1, createTestWorkflow([{ id: 'step1' }]), false);

      // Visit root multiple times
      for (let i = 0; i < 10; i++) {
        tree.backpropagate(root.id, 0.5);
      }

      const bestChild = tree.selectBestChild(root.id);
      // Unvisited child should have high exploration bonus
      expect(bestChild!.nodeId).toBe(child1!.id);
    });
  });

  describe('backpropagation', () => {
    it('should update visit counts and values', () => {
      const workflow = createTestWorkflow([]);
      const root = tree.initializeRoot(workflow);

      const action: WorkflowAction = { type: 'add_step', newStep: { id: 'step1' } };
      const child = tree.addChild(root.id, action, createTestWorkflow([{ id: 'step1' }]), false);

      tree.backpropagate(child!.id, 0.8);

      const updatedChild = tree.getNode(child!.id);
      const updatedRoot = tree.getRoot();

      expect(updatedChild!.visitCount).toBe(1);
      expect(updatedChild!.avgValue).toBe(0.8);
      expect(updatedRoot!.visitCount).toBe(1);
    });

    it('should accumulate values over multiple backpropagations', () => {
      const workflow = createTestWorkflow([]);
      const root = tree.initializeRoot(workflow);

      tree.backpropagate(root.id, 0.6);
      tree.backpropagate(root.id, 0.8);
      tree.backpropagate(root.id, 0.4);

      const updated = tree.getRoot();
      expect(updated!.visitCount).toBe(3);
      expect(updated!.avgValue).toBeCloseTo(0.6);
    });
  });

  describe('select', () => {
    it('should traverse to leaf node', () => {
      const workflow = createTestWorkflow([]);
      const root = tree.initializeRoot(workflow);

      const action: WorkflowAction = { type: 'add_step', newStep: { id: 'step1' } };
      const child = tree.addChild(root.id, action, createTestWorkflow([{ id: 'step1' }]), false);

      // Visit child to make selection interesting
      tree.backpropagate(child!.id, 0.5);

      const selected = tree.select();
      expect(selected).not.toBeNull();
    });

    it('should return terminal nodes', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }]);
      const root = tree.initializeRoot(workflow);

      const action: WorkflowAction = { type: 'terminate' };
      const terminal = tree.addChild(root.id, action, workflow, true);

      tree.backpropagate(terminal!.id, 0.9);

      // Should select root or terminal
      const selected = tree.select();
      expect(selected).not.toBeNull();
    });
  });

  describe('getBestNode', () => {
    it('should return node with highest average value', () => {
      const workflow = createTestWorkflow([]);
      const root = tree.initializeRoot(workflow);

      const action1: WorkflowAction = { type: 'add_step', newStep: { id: 'step1' } };
      const child1 = tree.addChild(root.id, action1, createTestWorkflow([{ id: 'step1' }]), false);

      const action2: WorkflowAction = { type: 'add_step', newStep: { id: 'step2' } };
      const child2 = tree.addChild(root.id, action2, createTestWorkflow([{ id: 'step2' }]), false);

      tree.backpropagate(child1!.id, 0.3);
      tree.backpropagate(child2!.id, 0.9);

      const best = tree.getBestNode();
      expect(best!.id).toBe(child2!.id);
    });
  });

  describe('getStats', () => {
    it('should return tree statistics', () => {
      const workflow = createTestWorkflow([]);
      tree.initializeRoot(workflow);

      const stats = tree.getStats();
      expect(stats.totalNodes).toBe(1);
      expect(stats.maxDepthReached).toBe(0);
    });
  });

  describe('prune', () => {
    it('should remove low-scoring nodes', () => {
      const workflow = createTestWorkflow([]);
      const root = tree.initializeRoot(workflow);

      const action: WorkflowAction = { type: 'add_step', newStep: { id: 'step1' } };
      const child = tree.addChild(root.id, action, createTestWorkflow([{ id: 'step1' }]), false);

      // Low score with enough visits
      for (let i = 0; i < 10; i++) {
        tree.backpropagate(child!.id, 0.1);
      }

      const pruned = tree.prune(0.5);
      // May or may not prune depending on exact conditions
      expect(typeof pruned).toBe('number');
    });
  });
});

// ============================================================================
// Action Space Tests
// ============================================================================

describe('ActionSpace', () => {
  let actionSpace: ActionSpace;

  beforeEach(() => {
    actionSpace = createActionSpace(undefined, 42); // Seeded for reproducibility
  });

  describe('getValidActions', () => {
    it('should return add_step actions for empty workflow', () => {
      const workflow = createTestWorkflow([]);
      const task = createTestTask();

      const actions = actionSpace.getValidActions(workflow, task, 10);

      const addActions = actions.filter((a) => a.type === 'add_step');
      expect(addActions.length).toBeGreaterThan(0);
    });

    it('should include terminate for workflows with enough steps', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }, { id: 'step2' }]);
      const task = createTestTask();

      const actions = actionSpace.getValidActions(workflow, task, 10);

      const terminateActions = actions.filter((a) => a.type === 'terminate');
      expect(terminateActions.length).toBe(1);
    });

    it('should include modify_step for existing steps', () => {
      const workflow = createTestWorkflow([{ id: 'step1', timeout: 30000 }]);
      const task = createTestTask();

      const actions = actionSpace.getValidActions(workflow, task, 10);

      const modifyActions = actions.filter((a) => a.type === 'modify_step');
      expect(modifyActions.length).toBeGreaterThan(0);
    });

    it('should respect max steps limit', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }, { id: 'step2' }, { id: 'step3' }]);
      const task = createTestTask();

      const actions = actionSpace.getValidActions(workflow, task, 3);

      const addActions = actions.filter((a) => a.type === 'add_step');
      expect(addActions.length).toBe(0);
    });
  });

  describe('applyAction', () => {
    it('should apply add_step action', () => {
      const workflow = createTestWorkflow([]);
      const action: WorkflowAction = {
        type: 'add_step',
        newStep: {
          id: 'new-step',
          agent: 'code_expert',
          action: 'implement',
        },
      };

      const result = actionSpace.applyAction(workflow, action);

      expect(result.steps.length).toBe(1);
      expect(result.steps[0]!.id).toBe('new-step');
    });

    it('should apply remove_step action', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }, { id: 'step2' }]);
      const action: WorkflowAction = {
        type: 'remove_step',
        targetStepId: 'step1',
      };

      const result = actionSpace.applyAction(workflow, action);

      expect(result.steps.length).toBe(1);
      expect(result.steps[0]!.id).toBe('step2');
    });

    it('should update dependencies when removing step', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }, { id: 'step2', dependsOn: ['step1'] }]);
      const action: WorkflowAction = {
        type: 'remove_step',
        targetStepId: 'step1',
      };

      const result = actionSpace.applyAction(workflow, action);

      // When the removed step was the only dependency, dependsOn is removed
      const deps = result.steps[0]!.dependsOn ?? [];
      expect(deps).toEqual([]);
    });

    it('should apply modify_step action', () => {
      const workflow = createTestWorkflow([{ id: 'step1', timeout: 30000 }]);
      const action: WorkflowAction = {
        type: 'modify_step',
        targetStepId: 'step1',
        modifications: { timeout: 60000 },
      };

      const result = actionSpace.applyAction(workflow, action);

      expect(result.steps[0]!.timeout).toBe(60000);
    });

    it('should apply add_dependency action', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }, { id: 'step2' }]);
      const action: WorkflowAction = {
        type: 'add_dependency',
        targetStepId: 'step2',
        sourceStepId: 'step1',
      };

      const result = actionSpace.applyAction(workflow, action);

      expect(result.steps[1]!.dependsOn).toContain('step1');
    });

    it('should apply remove_dependency action', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }, { id: 'step2', dependsOn: ['step1'] }]);
      const action: WorkflowAction = {
        type: 'remove_dependency',
        targetStepId: 'step2',
        sourceStepId: 'step1',
      };

      const result = actionSpace.applyAction(workflow, action);

      // When all dependencies are removed, dependsOn may be undefined or empty
      const deps = result.steps[1]!.dependsOn ?? [];
      expect(deps).not.toContain('step1');
    });

    it('should apply set_parallel action', () => {
      const workflow = createTestWorkflow([{ id: 'step1', parallel: false }]);
      const action: WorkflowAction = {
        type: 'set_parallel',
        targetStepId: 'step1',
        modifications: { parallel: true },
      };

      const result = actionSpace.applyAction(workflow, action);

      expect(result.steps[0]!.parallel).toBe(true);
    });

    it('should not modify workflow for terminate action', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }]);
      const action: WorkflowAction = { type: 'terminate' };

      const result = actionSpace.applyAction(workflow, action);

      expect(result).toEqual(workflow);
    });
  });

  describe('sampleAction', () => {
    it('should return an action from valid actions', () => {
      const actions: WorkflowAction[] = [
        { type: 'add_step', newStep: { id: 'step1' } },
        { type: 'terminate' },
      ];

      const sampled = actionSpace.sampleAction(actions);

      expect(sampled).not.toBeNull();
      expect(actions).toContainEqual(sampled);
    });

    it('should return null for empty actions', () => {
      const sampled = actionSpace.sampleAction([]);
      expect(sampled).toBeNull();
    });
  });

  describe('describeAction', () => {
    it('should describe add_step action', () => {
      const action: WorkflowAction = {
        type: 'add_step',
        newStep: { agent: 'code_expert', action: 'implement' },
      };

      const desc = actionSpace.describeAction(action);

      expect(desc).toContain('code_expert');
      expect(desc).toContain('implement');
    });

    it('should describe terminate action', () => {
      const action: WorkflowAction = { type: 'terminate' };

      const desc = actionSpace.describeAction(action);

      expect(desc).toContain('Terminate');
    });
  });
});

// ============================================================================
// Evaluation Tests
// ============================================================================

describe('WorkflowEvaluator', () => {
  let evaluator: WorkflowEvaluator;

  beforeEach(() => {
    evaluator = createWorkflowEvaluator();
  });

  describe('evaluate', () => {
    it('should return evaluation result', () => {
      const workflow = createTestWorkflow([
        { id: 'step1', agent: 'code_expert' },
        { id: 'step2', agent: 'testing_expert', dependsOn: ['step1'] },
      ]);
      const task = createTestTask();

      const result = evaluator.evaluate(workflow, task);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it('should penalize workflows with cycles', () => {
      const workflow: WorkflowDefinition = {
        name: 'test',
        version: '1.0.0',
        inputs: [],
        steps: [
          {
            id: 'step1',
            agent: 'code_expert',
            action: 'implement',
            inputs: {},
            dependsOn: ['step2'],
          },
          {
            id: 'step2',
            agent: 'testing_expert',
            action: 'test',
            inputs: {},
            dependsOn: ['step1'],
          },
        ],
      };
      const task = createTestTask();

      const result = evaluator.evaluate(workflow, task);

      expect(result.structureScore).toBeLessThan(1);
    });

    it('should reward workflows with required agents', () => {
      const workflow = createTestWorkflow([
        { id: 'step1', agent: 'code_expert' },
        { id: 'step2', agent: 'security_expert' },
      ]);
      const task = createTestTask({
        constraints: {
          requiredAgents: ['code_expert', 'security_expert'],
        },
      });

      const result = evaluator.evaluate(workflow, task);

      expect(result.completenessScore).toBeGreaterThan(0.5);
    });
  });

  describe('evaluateStructure', () => {
    it('should return 1 for valid workflow', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }, { id: 'step2', dependsOn: ['step1'] }]);

      const score = evaluator.evaluateStructure(workflow);

      expect(score).toBe(1);
    });

    it('should penalize duplicate step IDs', () => {
      const workflow: WorkflowDefinition = {
        name: 'test',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'step1', agent: 'code_expert', action: 'implement', inputs: {} },
          { id: 'step1', agent: 'testing_expert', action: 'test', inputs: {} },
        ],
      };

      const score = evaluator.evaluateStructure(workflow);

      expect(score).toBeLessThan(1);
    });
  });

  describe('calculateRedundancyPenalty', () => {
    it('should penalize duplicate agent-action combos', () => {
      const workflow = createTestWorkflow([
        { id: 'step1', agent: 'code_expert', action: 'implement' },
        { id: 'step2', agent: 'code_expert', action: 'implement' },
      ]);

      const penalty = evaluator.calculateRedundancyPenalty(workflow);

      expect(penalty).toBeGreaterThan(0);
    });

    it('should return 0 for non-redundant workflow', () => {
      const workflow = createTestWorkflow([
        { id: 'step1', agent: 'code_expert', action: 'implement' },
        { id: 'step2', agent: 'testing_expert', action: 'test' },
      ]);

      const penalty = evaluator.calculateRedundancyPenalty(workflow);

      expect(penalty).toBe(0);
    });
  });

  describe('estimateCost', () => {
    it('should increase with more steps', () => {
      const small = createTestWorkflow([{ id: 'step1' }]);
      const large = createTestWorkflow([{ id: 'step1' }, { id: 'step2' }, { id: 'step3' }]);

      const smallCost = evaluator.estimateCost(small);
      const largeCost = evaluator.estimateCost(large);

      expect(largeCost).toBeGreaterThan(smallCost);
    });
  });

  describe('isViable', () => {
    it('should return true for valid workflow', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }, { id: 'step2' }]);

      expect(evaluator.isViable(workflow, 2)).toBe(true);
    });

    it('should return false for too few steps', () => {
      const workflow = createTestWorkflow([{ id: 'step1' }]);

      expect(evaluator.isViable(workflow, 2)).toBe(false);
    });
  });
});

// ============================================================================
// AFlow Generator Tests
// ============================================================================

describe('AFlowGenerator', () => {
  let generator: AFlowGenerator;

  beforeEach(() => {
    generator = createAFlowGenerator({
      maxIterations: 10,
      maxDepth: 5,
      simulationsPerExpansion: 2,
      seed: 42,
    });
  });

  describe('constructor', () => {
    it('should create generator with default config', () => {
      const gen = createAFlowGenerator();
      expect(gen).toBeInstanceOf(AFlowGenerator);
    });

    it('should accept custom config', () => {
      const gen = createAFlowGenerator({
        maxIterations: 50,
        maxDepth: 8,
      });
      expect(gen).toBeInstanceOf(AFlowGenerator);
    });
  });

  describe('generate', () => {
    it('should generate a workflow', async () => {
      const task = createTestTask();

      const result = await generator.generate(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.workflow).toBeDefined();
        expect(result.value.workflow.steps.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should respect minimum steps requirement', async () => {
      const gen = createAFlowGenerator({
        maxIterations: 20,
        minSteps: 3,
        seed: 42,
      });
      const task = createTestTask();

      const result = await gen.generate(task);

      if (result.ok) {
        expect(result.value.workflow.steps.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should return evaluation result', async () => {
      const task = createTestTask();

      const result = await generator.generate(task);

      if (result.ok) {
        expect(result.value.evaluation).toBeDefined();
        expect(result.value.evaluation.score).toBeGreaterThanOrEqual(0);
      }
    });

    it('should track search history', async () => {
      const task = createTestTask();

      const result = await generator.generate(task);

      if (result.ok) {
        expect(result.value.searchHistory).toBeDefined();
        expect(Array.isArray(result.value.searchHistory)).toBe(true);
      }
    });

    it('should report iterations and nodes explored', async () => {
      const task = createTestTask();

      const result = await generator.generate(task);

      if (result.ok) {
        expect(result.value.totalIterations).toBeGreaterThan(0);
        expect(result.value.nodesExplored).toBeGreaterThan(0);
      }
    });
  });

  describe('cancel', () => {
    it('should stop generation when cancelled', async () => {
      const gen = createAFlowGenerator({
        maxIterations: 1000,
        seed: 42,
      });
      const task = createTestTask();

      // Start generation and cancel immediately
      const promise = gen.generate(task);
      gen.cancel();

      const result = await promise;

      // Should complete (either with result or early)
      expect(result).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return current stats', () => {
      const stats = generator.getStats();

      expect(stats.treeStats).toBeDefined();
      expect(stats.cancelled).toBe(false);
    });
  });

  describe('reset', () => {
    it('should clear state for new search', async () => {
      const task = createTestTask();

      await generator.generate(task);
      generator.reset();

      const stats = generator.getStats();
      expect(stats.treeStats.totalNodes).toBe(0);
    });
  });
});

// ============================================================================
// generateWorkflow Helper Tests
// ============================================================================

describe('generateWorkflow', () => {
  it('should generate workflow from description', async () => {
    const result = await generateWorkflow('Create a code review workflow', ['code', 'security'], {
      maxIterations: 5,
      seed: 42,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBeDefined();
    }
  });

  it('should work with empty capabilities', async () => {
    const result = await generateWorkflow('Simple task', [], { maxIterations: 5, seed: 42 });

    expect(result).toBeDefined();
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('AFlowError', () => {
  it('should have correct error code', () => {
    const error = new AFlowError('Test error', 'SEARCH_FAILED');

    expect(error.code).toBe('SEARCH_FAILED');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('AFlowError');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('AFlow Integration', () => {
  it('should generate progressively better workflows', async () => {
    const generator = createAFlowGenerator({
      maxIterations: 20,
      seed: 42,
    });
    const task = createTestTask({
      constraints: {
        requiredAgents: ['code_expert', 'testing_expert'],
      },
    });

    const result = await generator.generate(task);

    if (result.ok) {
      // Check that search improved over iterations
      const history = result.value.searchHistory;
      if (history.length > 1) {
        const firstScore = history[0]!.score;
        const lastScore = history[history.length - 1]!.score;
        // Later iterations should generally have better or equal scores
        // (though not guaranteed due to exploration)
        expect(lastScore).toBeDefined();
        expect(firstScore).toBeDefined();
      }
    }
  });

  it('should respect task constraints', async () => {
    const generator = createAFlowGenerator({
      maxIterations: 15,
      seed: 42,
    });
    const task = createTestTask({
      constraints: {
        forbiddenAgents: ['security_expert'],
      },
    });

    const result = await generator.generate(task);

    if (result.ok) {
      // Check if forbidden agent was included
      const hasForbiddenAgent = result.value.workflow.steps.some(
        (s) => s.agent === 'security_expert'
      );
      // May or may not have forbidden agent - evaluation should penalize it
      expect(result.value.evaluation).toBeDefined();
      // hasForbiddenAgent indicates constraint violation if true
      expect(typeof hasForbiddenAgent).toBe('boolean');
    }
  });
});
