/* eslint-disable @typescript-eslint/explicit-function-return-type -- test factory helpers */
/**
 * Tests for Skill Dependency Graph Helpers
 * @module agents/skills/skill-dependency-graph-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Skill } from './skill-types.js';
import type { TopologicalSortNode, KahnContext } from './skill-dependency-graph-helpers.js';
import {
  createDependencyError,
  initializeInDegrees,
  findZeroInDegreeNodes,
  processKahnNode,
  executeKahnTraversal,
  buildSkillDependencies,
} from './skill-dependency-graph-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeNode(
  id: string,
  deps: Array<[string, 'required' | 'optional']> = [],
  dependents: string[] = []
): TopologicalSortNode {
  const dependencies = new Map<string, { type: 'required' | 'optional' }>();
  for (const [depId, type] of deps) {
    dependencies.set(depId, { type });
  }
  return { id, dependencies, dependents: new Set(dependents) } as unknown as TopologicalSortNode;
}

function makeNodes(
  entries: Array<{
    id: string;
    deps?: Array<[string, 'required' | 'optional']>;
    dependents?: string[];
  }>
): Map<string, TopologicalSortNode> {
  const map = new Map<string, TopologicalSortNode>();
  for (const entry of entries) {
    map.set(entry.id, makeNode(entry.id, entry.deps ?? [], entry.dependents ?? []));
  }
  return map;
}

// ============================================================================
// createDependencyError
// ============================================================================

describe('createDependencyError', () => {
  it('creates error without context', () => {
    const error = createDependencyError('CIRCULAR_DEPENDENCY', 'Cycle detected');
    expect(error.code).toBe('CIRCULAR_DEPENDENCY');
    expect(error.message).toBe('Cycle detected');
    expect(error.context).toBeUndefined();
  });

  it('creates error with context', () => {
    const error = createDependencyError('MISSING_DEPENDENCY', 'Missing dep', { skillId: 'a' });
    expect(error.code).toBe('MISSING_DEPENDENCY');
    expect(error.context).toEqual({ skillId: 'a' });
  });
});

// ============================================================================
// initializeInDegrees
// ============================================================================

describe('initializeInDegrees', () => {
  it('initializes all nodes to 0 for no dependencies', () => {
    const nodes = makeNodes([{ id: 'a' }, { id: 'b' }]);
    const getNode = (id: string) => nodes.get(id);
    const degrees = initializeInDegrees(new Set(['a', 'b']), getNode);
    expect(degrees.get('a')).toBe(0);
    expect(degrees.get('b')).toBe(0);
  });

  it('calculates in-degrees for required deps', () => {
    const nodes = makeNodes([{ id: 'a' }, { id: 'b', deps: [['a', 'required']] }]);
    const getNode = (id: string) => nodes.get(id);
    const degrees = initializeInDegrees(new Set(['a', 'b']), getNode);
    expect(degrees.get('a')).toBe(0);
    expect(degrees.get('b')).toBe(1);
  });

  it('ignores optional dependencies', () => {
    const nodes = makeNodes([{ id: 'a' }, { id: 'b', deps: [['a', 'optional']] }]);
    const getNode = (id: string) => nodes.get(id);
    const degrees = initializeInDegrees(new Set(['a', 'b']), getNode);
    expect(degrees.get('b')).toBe(0);
  });

  it('ignores deps outside the skillIds set', () => {
    const nodes = makeNodes([{ id: 'a' }, { id: 'b', deps: [['c', 'required']] }]);
    const getNode = (id: string) => nodes.get(id);
    const degrees = initializeInDegrees(new Set(['a', 'b']), getNode);
    expect(degrees.get('b')).toBe(0);
  });
});

// ============================================================================
// findZeroInDegreeNodes
// ============================================================================

describe('findZeroInDegreeNodes', () => {
  it('finds all zero-degree nodes', () => {
    const degrees = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 0],
    ]);
    const result = findZeroInDegreeNodes(degrees);
    expect(result).toContain('a');
    expect(result).toContain('c');
    expect(result).not.toContain('b');
  });

  it('returns empty when no zero-degree nodes', () => {
    const degrees = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    expect(findZeroInDegreeNodes(degrees)).toEqual([]);
  });
});

// ============================================================================
// processKahnNode
// ============================================================================

describe('processKahnNode', () => {
  it('decrements in-degree for dependents', () => {
    const nodes = makeNodes([
      { id: 'a', dependents: ['b'] },
      { id: 'b', deps: [['a', 'required']] },
    ]);
    const getNode = (id: string) => nodes.get(id);
    const context: KahnContext = {
      inDegree: new Map([
        ['a', 0],
        ['b', 1],
      ]),
      queue: [],
      sorted: [],
    };
    processKahnNode('a', new Set(['a', 'b']), context, getNode);
    expect(context.inDegree.get('b')).toBe(0);
    expect(context.queue).toContain('b');
  });

  it('skips dependents not in skill set', () => {
    const nodes = makeNodes([{ id: 'a', dependents: ['c'] }]);
    const getNode = (id: string) => nodes.get(id);
    const context: KahnContext = {
      inDegree: new Map([['a', 0]]),
      queue: [],
      sorted: [],
    };
    processKahnNode('a', new Set(['a']), context, getNode);
    expect(context.queue).toEqual([]);
  });

  it('does nothing for unknown node', () => {
    const context: KahnContext = {
      inDegree: new Map(),
      queue: [],
      sorted: [],
    };
    processKahnNode('unknown', new Set(), context, () => undefined);
    expect(context.queue).toEqual([]);
  });
});

// ============================================================================
// executeKahnTraversal
// ============================================================================

describe('executeKahnTraversal', () => {
  it('returns sorted order for linear chain', () => {
    const nodes = makeNodes([
      { id: 'a', dependents: ['b'] },
      { id: 'b', deps: [['a', 'required']], dependents: ['c'] },
      { id: 'c', deps: [['b', 'required']] },
    ]);
    const getNode = (id: string) => nodes.get(id);
    const skillIds = new Set(['a', 'b', 'c']);
    const context: KahnContext = {
      inDegree: new Map([
        ['a', 0],
        ['b', 1],
        ['c', 1],
      ]),
      queue: ['a'],
      sorted: [],
    };
    const result = executeKahnTraversal(skillIds, context, getNode);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['a', 'b', 'c']);
    }
  });

  it('detects cycles', () => {
    // a -> b -> a (cycle)
    const nodes = makeNodes([
      { id: 'a', deps: [['b', 'required']], dependents: ['b'] },
      { id: 'b', deps: [['a', 'required']], dependents: ['a'] },
    ]);
    const getNode = (id: string) => nodes.get(id);
    const skillIds = new Set(['a', 'b']);
    const context: KahnContext = {
      inDegree: new Map([
        ['a', 1],
        ['b', 1],
      ]),
      queue: [],
      sorted: [],
    };
    const result = executeKahnTraversal(skillIds, context, getNode);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CIRCULAR_DEPENDENCY');
    }
  });

  it('handles independent nodes', () => {
    const nodes = makeNodes([{ id: 'a' }, { id: 'b' }]);
    const getNode = (id: string) => nodes.get(id);
    const skillIds = new Set(['a', 'b']);
    const context: KahnContext = {
      inDegree: new Map([
        ['a', 0],
        ['b', 0],
      ]),
      queue: ['a', 'b'],
      sorted: [],
    };
    const result = executeKahnTraversal(skillIds, context, getNode);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });
});

// ============================================================================
// buildSkillDependencies
// ============================================================================

describe('buildSkillDependencies', () => {
  it('builds dependencies from skill', () => {
    const skill = {
      id: 'skill-a',
      dependencies: ['dep-1', 'dep-2'],
    } as unknown as Skill;
    const deps = buildSkillDependencies(skill);
    expect(deps).toHaveLength(2);
    expect(deps[0]!.skillId).toBe('skill-a');
    expect(deps[0]!.dependsOn).toBe('dep-1');
    expect(deps[0]!.type).toBe('required');
  });

  it('returns empty for no dependencies', () => {
    const skill = { id: 'skill-a', dependencies: [] } as unknown as Skill;
    expect(buildSkillDependencies(skill)).toEqual([]);
  });
});
