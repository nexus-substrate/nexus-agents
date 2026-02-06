/**
 * Tests for dependency-graph.ts
 *
 * Covers DependencyGraph class, buildDependencyGraph, validateDependencyGraph,
 * and getTopologicalOrder functions.
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowStep, WorkflowDefinition } from '../core/index.js';
import {
  DependencyGraph,
  buildDependencyGraph,
  validateDependencyGraph,
  getTopologicalOrder,
} from './dependency-graph.js';

// ============================================================================
// Helpers
// ============================================================================

function makeStep(id: string, dependsOn?: string[]): WorkflowStep {
  return {
    id,
    action: `action-${id}`,
    agent: 'test-agent',
    dependsOn,
  } as unknown as WorkflowStep;
}

function makeWorkflow(steps: WorkflowStep[]): WorkflowDefinition {
  return {
    name: 'test-workflow',
    version: '1.0.0',
    steps,
  } as WorkflowDefinition;
}

// ============================================================================
// DependencyGraph class
// ============================================================================

describe('DependencyGraph', () => {
  describe('addStep / getStepIds / getNode', () => {
    it('adds a step and retrieves it', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('a'));
      expect(graph.getStepIds()).toEqual(['a']);
      expect(graph.getNode('a')).toBeDefined();
    });

    it('returns undefined for non-existent node', () => {
      const graph = new DependencyGraph();
      expect(graph.getNode('missing')).toBeUndefined();
    });

    it('tracks dependencies from step definition', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('b', ['a']));
      const node = graph.getNode('b');
      expect(node?.dependencies.has('a')).toBe(true);
    });

    it('handles step with no dependencies', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('a'));
      const node = graph.getNode('a');
      expect(node?.dependencies.size).toBe(0);
    });
  });

  describe('buildReverseLinks', () => {
    it('populates dependents correctly', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('a'));
      graph.addStep(makeStep('b', ['a']));
      graph.buildReverseLinks();

      expect(graph.getNode('a')?.dependents.has('b')).toBe(true);
    });

    it('handles missing dependency node gracefully', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('b', ['nonexistent']));
      graph.buildReverseLinks();
      // Should not throw
      expect(graph.getNode('b')).toBeDefined();
    });
  });

  describe('validateReferences', () => {
    it('returns ok for valid references', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('a'));
      graph.addStep(makeStep('b', ['a']));
      const result = graph.validateReferences();
      expect(result.ok).toBe(true);
    });

    it('returns error for missing dependency reference', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('b', ['missing']));
      const result = graph.validateReferences();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('missing');
      }
    });

    it('reports multiple missing references', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('c', ['x', 'y']));
      const result = graph.validateReferences();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('x');
        expect(result.error.message).toContain('y');
      }
    });
  });

  describe('validateUniqueIds', () => {
    it('returns ok for unique step IDs', () => {
      const steps = [makeStep('a'), makeStep('b')];
      const result = DependencyGraph.validateUniqueIds(steps);
      expect(result.ok).toBe(true);
    });

    it('returns error for duplicate step IDs', () => {
      const steps = [makeStep('a'), makeStep('a')];
      const result = DependencyGraph.validateUniqueIds(steps);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Duplicate');
      }
    });
  });

  describe('detectCycles', () => {
    it('returns topological order for acyclic graph', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('a'));
      graph.addStep(makeStep('b', ['a']));
      graph.addStep(makeStep('c', ['a', 'b']));
      graph.buildReverseLinks();

      const result = graph.detectCycles();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.indexOf('a')).toBeLessThan(result.value.indexOf('b'));
        expect(result.value.indexOf('b')).toBeLessThan(result.value.indexOf('c'));
      }
    });

    it('detects simple two-node cycle', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('a', ['b']));
      graph.addStep(makeStep('b', ['a']));
      graph.buildReverseLinks();

      const result = graph.detectCycles();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Circular');
      }
    });

    it('detects three-node cycle', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('a', ['c']));
      graph.addStep(makeStep('b', ['a']));
      graph.addStep(makeStep('c', ['b']));
      graph.buildReverseLinks();

      const result = graph.detectCycles();
      expect(result.ok).toBe(false);
    });

    it('handles single node with no dependencies', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('solo'));
      graph.buildReverseLinks();

      const result = graph.detectCycles();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(['solo']);
      }
    });

    it('handles empty graph', () => {
      const graph = new DependencyGraph();
      const result = graph.detectCycles();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getExecutionOrder', () => {
    it('returns same result as detectCycles', () => {
      const graph = new DependencyGraph();
      graph.addStep(makeStep('a'));
      graph.addStep(makeStep('b', ['a']));
      graph.buildReverseLinks();

      const result = graph.getExecutionOrder();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(['a', 'b']);
      }
    });
  });
});

// ============================================================================
// buildDependencyGraph
// ============================================================================

describe('buildDependencyGraph', () => {
  it('builds graph from workflow definition', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('b', ['a'])]);
    const graph = buildDependencyGraph(workflow);
    expect(graph.getStepIds()).toEqual(['a', 'b']);
    expect(graph.getNode('a')?.dependents.has('b')).toBe(true);
  });

  it('handles workflow with no steps', () => {
    const workflow = makeWorkflow([]);
    const graph = buildDependencyGraph(workflow);
    expect(graph.getStepIds()).toEqual([]);
  });
});

// ============================================================================
// validateDependencyGraph
// ============================================================================

describe('validateDependencyGraph', () => {
  it('returns ok for valid workflow', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('b', ['a']), makeStep('c', ['b'])]);
    const result = validateDependencyGraph(workflow);
    expect(result.ok).toBe(true);
  });

  it('returns error for duplicate step IDs', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('a')]);
    const result = validateDependencyGraph(workflow);
    expect(result.ok).toBe(false);
  });

  it('returns error for missing references', () => {
    const workflow = makeWorkflow([makeStep('b', ['missing'])]);
    const result = validateDependencyGraph(workflow);
    expect(result.ok).toBe(false);
  });

  it('returns error for circular dependencies', () => {
    const workflow = makeWorkflow([makeStep('a', ['b']), makeStep('b', ['a'])]);
    const result = validateDependencyGraph(workflow);
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// getTopologicalOrder
// ============================================================================

describe('getTopologicalOrder', () => {
  it('returns sorted step IDs', () => {
    const workflow = makeWorkflow([makeStep('c', ['b']), makeStep('b', ['a']), makeStep('a')]);
    const result = getTopologicalOrder(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['a', 'b', 'c']);
    }
  });

  it('returns error for invalid references', () => {
    const workflow = makeWorkflow([makeStep('a', ['missing'])]);
    const result = getTopologicalOrder(workflow);
    expect(result.ok).toBe(false);
  });

  it('returns error for cycles', () => {
    const workflow = makeWorkflow([makeStep('a', ['b']), makeStep('b', ['a'])]);
    const result = getTopologicalOrder(workflow);
    expect(result.ok).toBe(false);
  });

  it('handles parallel steps with no dependencies', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('b'), makeStep('c')]);
    const result = getTopologicalOrder(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);
    }
  });

  it('handles diamond dependency pattern', () => {
    const workflow = makeWorkflow([
      makeStep('a'),
      makeStep('b', ['a']),
      makeStep('c', ['a']),
      makeStep('d', ['b', 'c']),
    ]);
    const result = getTopologicalOrder(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.indexOf('a')).toBe(0);
      expect(result.value.indexOf('d')).toBe(3);
    }
  });

  it('handles single step workflow', () => {
    const workflow = makeWorkflow([makeStep('single')]);
    const result = getTopologicalOrder(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['single']);
    }
  });

  it('handles empty workflow', () => {
    const workflow = makeWorkflow([]);
    const result = getTopologicalOrder(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('handles step with many dependencies', () => {
    const graph = new DependencyGraph();
    graph.addStep(makeStep('a'));
    graph.addStep(makeStep('b'));
    graph.addStep(makeStep('c'));
    graph.addStep(makeStep('d', ['a', 'b', 'c']));
    graph.buildReverseLinks();

    const result = graph.detectCycles();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const dIndex = result.value.indexOf('d');
      expect(result.value.indexOf('a')).toBeLessThan(dIndex);
      expect(result.value.indexOf('b')).toBeLessThan(dIndex);
      expect(result.value.indexOf('c')).toBeLessThan(dIndex);
    }
  });

  it('detects self-cycle', () => {
    const graph = new DependencyGraph();
    graph.addStep(makeStep('self', ['self']));
    graph.buildReverseLinks();

    const result = graph.detectCycles();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Circular');
    }
  });

  it('handles disconnected components', () => {
    const graph = new DependencyGraph();
    graph.addStep(makeStep('a1'));
    graph.addStep(makeStep('a2', ['a1']));
    graph.addStep(makeStep('b1'));
    graph.addStep(makeStep('b2', ['b1']));
    graph.buildReverseLinks();

    const result = graph.detectCycles();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(4);
      expect(result.value.indexOf('a1')).toBeLessThan(result.value.indexOf('a2'));
      expect(result.value.indexOf('b1')).toBeLessThan(result.value.indexOf('b2'));
    }
  });

  it('maintains reverse link integrity with multiple dependents', () => {
    const graph = new DependencyGraph();
    graph.addStep(makeStep('root'));
    graph.addStep(makeStep('child1', ['root']));
    graph.addStep(makeStep('child2', ['root']));
    graph.addStep(makeStep('child3', ['root']));
    graph.buildReverseLinks();

    const root = graph.getNode('root');
    expect(root?.dependents.size).toBe(3);
    expect(root?.dependents.has('child1')).toBe(true);
    expect(root?.dependents.has('child2')).toBe(true);
    expect(root?.dependents.has('child3')).toBe(true);
  });
});
