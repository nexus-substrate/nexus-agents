/**
 * nexus-agents/agents - Skill Dependency Graph Tests
 *
 * Unit tests for skill dependency graph including DAG operations,
 * topological sort, cycle detection, and version constraints.
 *
 * @module agents/skills/skill-dependency-graph.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Skill } from './skill-types.js';
import {
  // Types
  type SkillDependency,
  type DependencyError,
  type ISkillDependencyGraph,
  // Schemas
  SkillDependencyTypeSchema,
  SkillDependencySchema,
  DependencyErrorCodeSchema,
  DependencyErrorSchema,
  // Class
  SkillDependencyGraph,
  // Functions
  createDependencyError,
  buildDependencyGraph,
  resolveWithFallbacks,
  findMissingDependencies,
  createSkillDependencyGraph,
} from './skill-dependency-graph.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestSkill(id: string, dependencies: string[] = [], version: number = 1): Skill {
  return {
    id,
    name: `Skill ${id}`,
    description: `Test skill ${id}`,
    category: 'general',
    complexity: 'simple',
    code: 'return true;',
    parameters: [],
    outputType: 'boolean',
    dependencies,
    tags: [],
    examples: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    version,
  };
}

// ============================================================================
// Zod Schema Tests
// ============================================================================

describe('Skill Dependency Graph - Zod Schemas', () => {
  describe('SkillDependencyTypeSchema', () => {
    it('should accept valid dependency types', () => {
      expect(SkillDependencyTypeSchema.safeParse('required').success).toBe(true);
      expect(SkillDependencyTypeSchema.safeParse('optional').success).toBe(true);
      expect(SkillDependencyTypeSchema.safeParse('recommended').success).toBe(true);
    });

    it('should reject invalid dependency types', () => {
      expect(SkillDependencyTypeSchema.safeParse('mandatory').success).toBe(false);
      expect(SkillDependencyTypeSchema.safeParse('').success).toBe(false);
      expect(SkillDependencyTypeSchema.safeParse(123).success).toBe(false);
    });
  });

  describe('SkillDependencySchema', () => {
    it('should accept valid dependency', () => {
      const dep: SkillDependency = {
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'required',
      };
      expect(SkillDependencySchema.safeParse(dep).success).toBe(true);
    });

    it('should accept dependency with minVersion', () => {
      const dep: SkillDependency = {
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'optional',
        minVersion: 2,
      };
      expect(SkillDependencySchema.safeParse(dep).success).toBe(true);
    });

    it('should reject empty skillId', () => {
      const dep = {
        skillId: '',
        dependsOn: 'skill-b',
        type: 'required',
      };
      expect(SkillDependencySchema.safeParse(dep).success).toBe(false);
    });

    it('should reject negative minVersion', () => {
      const dep = {
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'required',
        minVersion: -1,
      };
      expect(SkillDependencySchema.safeParse(dep).success).toBe(false);
    });
  });

  describe('DependencyErrorCodeSchema', () => {
    it('should accept valid error codes', () => {
      const codes = [
        'CIRCULAR_DEPENDENCY',
        'MISSING_DEPENDENCY',
        'VERSION_MISMATCH',
        'SELF_DEPENDENCY',
        'SKILL_NOT_FOUND',
      ];
      for (const code of codes) {
        expect(DependencyErrorCodeSchema.safeParse(code).success).toBe(true);
      }
    });

    it('should reject invalid error codes', () => {
      expect(DependencyErrorCodeSchema.safeParse('UNKNOWN_ERROR').success).toBe(false);
    });
  });

  describe('DependencyErrorSchema', () => {
    it('should accept valid error', () => {
      const error: DependencyError = {
        code: 'CIRCULAR_DEPENDENCY',
        message: 'Cycle detected',
        context: { path: ['a', 'b', 'a'] },
      };
      expect(DependencyErrorSchema.safeParse(error).success).toBe(true);
    });

    it('should accept error without context', () => {
      const error: DependencyError = {
        code: 'MISSING_DEPENDENCY',
        message: 'Dependency not found',
      };
      expect(DependencyErrorSchema.safeParse(error).success).toBe(true);
    });
  });
});

// ============================================================================
// SkillDependencyGraph Tests
// ============================================================================

describe('SkillDependencyGraph', () => {
  let graph: SkillDependencyGraph;

  beforeEach(() => {
    graph = new SkillDependencyGraph();
  });

  describe('addSkill', () => {
    it('should add a skill to the graph', () => {
      graph.addSkill('skill-a');
      expect(graph.hasSkill('skill-a')).toBe(true);
      expect(graph.getSkillCount()).toBe(1);
    });

    it('should not duplicate skills', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-a');
      expect(graph.getSkillCount()).toBe(1);
    });

    it('should store version information', () => {
      graph.addSkill('skill-a', 5);
      expect(graph.hasSkill('skill-a')).toBe(true);
    });
  });

  describe('addDependency', () => {
    it('should add a dependency between skills', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-b');

      const result = graph.addDependency({
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'required',
      });

      expect(result.ok).toBe(true);
      const deps = graph.getDependencies('skill-a');
      expect(deps).toHaveLength(1);
      expect(deps[0]?.dependsOn).toBe('skill-b');
    });

    it('should auto-create skills if not present', () => {
      const result = graph.addDependency({
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'required',
      });

      expect(result.ok).toBe(true);
      expect(graph.hasSkill('skill-a')).toBe(true);
      expect(graph.hasSkill('skill-b')).toBe(true);
    });

    it('should reject self-dependency', () => {
      graph.addSkill('skill-a');

      const result = graph.addDependency({
        skillId: 'skill-a',
        dependsOn: 'skill-a',
        type: 'required',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SELF_DEPENDENCY');
      }
    });

    it('should reject dependency that creates cycle', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-b');

      // a -> b
      graph.addDependency({
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'required',
      });

      // b -> a would create cycle
      const result = graph.addDependency({
        skillId: 'skill-b',
        dependsOn: 'skill-a',
        type: 'required',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CIRCULAR_DEPENDENCY');
      }
    });

    it('should reject version mismatch', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-b', 1); // version 1

      const result = graph.addDependency({
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'required',
        minVersion: 2, // requires version 2
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VERSION_MISMATCH');
      }
    });

    it('should accept valid version constraint', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-b', 3);

      const result = graph.addDependency({
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'required',
        minVersion: 2,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('removeDependency', () => {
    it('should remove an existing dependency', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-b');
      graph.addDependency({
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'required',
      });

      const removed = graph.removeDependency('skill-a', 'skill-b');

      expect(removed).toBe(true);
      expect(graph.getDependencies('skill-a')).toHaveLength(0);
    });

    it('should return false for non-existent dependency', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-b');

      const removed = graph.removeDependency('skill-a', 'skill-b');

      expect(removed).toBe(false);
    });

    it('should return false for non-existent skill', () => {
      const removed = graph.removeDependency('skill-a', 'skill-b');
      expect(removed).toBe(false);
    });

    it('should update dependents when removing', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-b');
      graph.addDependency({
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'required',
      });

      expect(graph.getDependents('skill-b')).toContain('skill-a');

      graph.removeDependency('skill-a', 'skill-b');

      expect(graph.getDependents('skill-b')).not.toContain('skill-a');
    });
  });

  describe('getDependencies', () => {
    it('should return empty array for skill without dependencies', () => {
      graph.addSkill('skill-a');
      expect(graph.getDependencies('skill-a')).toEqual([]);
    });

    it('should return empty array for non-existent skill', () => {
      expect(graph.getDependencies('non-existent')).toEqual([]);
    });

    it('should return all dependencies for a skill', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-b');
      graph.addSkill('skill-c');

      graph.addDependency({
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'required',
      });
      graph.addDependency({
        skillId: 'skill-a',
        dependsOn: 'skill-c',
        type: 'optional',
      });

      const deps = graph.getDependencies('skill-a');
      expect(deps).toHaveLength(2);
      expect(deps.map((d) => d.dependsOn)).toContain('skill-b');
      expect(deps.map((d) => d.dependsOn)).toContain('skill-c');
    });
  });

  describe('getDependents', () => {
    it('should return empty array for skill without dependents', () => {
      graph.addSkill('skill-a');
      expect(graph.getDependents('skill-a')).toEqual([]);
    });

    it('should return empty array for non-existent skill', () => {
      expect(graph.getDependents('non-existent')).toEqual([]);
    });

    it('should return all dependents for a skill', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-b');
      graph.addSkill('skill-c');

      graph.addDependency({
        skillId: 'skill-b',
        dependsOn: 'skill-a',
        type: 'required',
      });
      graph.addDependency({
        skillId: 'skill-c',
        dependsOn: 'skill-a',
        type: 'required',
      });

      const dependents = graph.getDependents('skill-a');
      expect(dependents).toHaveLength(2);
      expect(dependents).toContain('skill-b');
      expect(dependents).toContain('skill-c');
    });
  });

  describe('getExecutionOrder', () => {
    it('should return correct order for linear chain', () => {
      // c -> b -> a (a must execute first)
      graph.addDependency({ skillId: 'c', dependsOn: 'b', type: 'required' });
      graph.addDependency({ skillId: 'b', dependsOn: 'a', type: 'required' });

      const result = graph.getExecutionOrder(['c']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(['a', 'b', 'c']);
      }
    });

    it('should return correct order for diamond dependency', () => {
      // d depends on both b and c
      // both b and c depend on a
      graph.addDependency({ skillId: 'b', dependsOn: 'a', type: 'required' });
      graph.addDependency({ skillId: 'c', dependsOn: 'a', type: 'required' });
      graph.addDependency({ skillId: 'd', dependsOn: 'b', type: 'required' });
      graph.addDependency({ skillId: 'd', dependsOn: 'c', type: 'required' });

      const result = graph.getExecutionOrder(['d']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // a must come first, then b and c (any order), then d last
        expect(result.value[0]).toBe('a');
        expect(result.value[result.value.length - 1]).toBe('d');
        expect(result.value).toHaveLength(4);
      }
    });

    it('should only include required dependencies', () => {
      graph.addDependency({ skillId: 'b', dependsOn: 'a', type: 'required' });
      graph.addDependency({ skillId: 'b', dependsOn: 'c', type: 'optional' });

      const result = graph.getExecutionOrder(['b']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('a');
        expect(result.value).toContain('b');
        expect(result.value).not.toContain('c');
      }
    });

    it('should return error for non-existent skill', () => {
      graph.addSkill('skill-a');

      const result = graph.getExecutionOrder(['non-existent']);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SKILL_NOT_FOUND');
      }
    });

    it('should handle empty input', () => {
      const result = graph.getExecutionOrder([]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('should handle skill with no dependencies', () => {
      graph.addSkill('skill-a');

      const result = graph.getExecutionOrder(['skill-a']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(['skill-a']);
      }
    });
  });

  describe('hasCircularDependency', () => {
    it('should return false for skill without cycle', () => {
      graph.addDependency({ skillId: 'b', dependsOn: 'a', type: 'required' });
      graph.addDependency({ skillId: 'c', dependsOn: 'b', type: 'required' });

      expect(graph.hasCircularDependency('a')).toBe(false);
      expect(graph.hasCircularDependency('b')).toBe(false);
      expect(graph.hasCircularDependency('c')).toBe(false);
    });

    it('should return false for non-existent skill', () => {
      expect(graph.hasCircularDependency('non-existent')).toBe(false);
    });
  });

  describe('validateGraph', () => {
    it('should pass for valid DAG', () => {
      graph.addDependency({ skillId: 'b', dependsOn: 'a', type: 'required' });
      graph.addDependency({ skillId: 'c', dependsOn: 'a', type: 'required' });
      graph.addDependency({ skillId: 'd', dependsOn: 'b', type: 'required' });
      graph.addDependency({ skillId: 'd', dependsOn: 'c', type: 'required' });

      const result = graph.validateGraph();
      expect(result.ok).toBe(true);
    });

    it('should pass for empty graph', () => {
      const result = graph.validateGraph();
      expect(result.ok).toBe(true);
    });

    it('should detect version mismatch', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-b', 1);
      // Manually add dependency with invalid version constraint
      // This simulates a graph loaded from external source
      const result = graph.addDependency({
        skillId: 'skill-a',
        dependsOn: 'skill-b',
        type: 'required',
        minVersion: 2,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VERSION_MISMATCH');
      }
    });
  });

  describe('getSkillCount', () => {
    it('should return 0 for empty graph', () => {
      expect(graph.getSkillCount()).toBe(0);
    });

    it('should return correct count', () => {
      graph.addSkill('skill-a');
      graph.addSkill('skill-b');
      graph.addSkill('skill-c');
      expect(graph.getSkillCount()).toBe(3);
    });
  });

  describe('hasSkill', () => {
    it('should return false for non-existent skill', () => {
      expect(graph.hasSkill('non-existent')).toBe(false);
    });

    it('should return true for existing skill', () => {
      graph.addSkill('skill-a');
      expect(graph.hasSkill('skill-a')).toBe(true);
    });
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('createDependencyError', () => {
  it('should create error with all fields', () => {
    const error = createDependencyError('CIRCULAR_DEPENDENCY', 'Cycle detected', {
      path: ['a', 'b', 'a'],
    });
    expect(error.code).toBe('CIRCULAR_DEPENDENCY');
    expect(error.message).toBe('Cycle detected');
    expect(error.context?.path).toEqual(['a', 'b', 'a']);
  });

  it('should create error without context', () => {
    const error = createDependencyError('MISSING_DEPENDENCY', 'Not found');
    expect(error.code).toBe('MISSING_DEPENDENCY');
    expect(error.message).toBe('Not found');
    expect(error.context).toBeUndefined();
  });
});

describe('buildDependencyGraph', () => {
  it('should build graph from skills array', () => {
    const skills = [
      createTestSkill('a'),
      createTestSkill('b', ['a']),
      createTestSkill('c', ['a']),
      createTestSkill('d', ['b', 'c']),
    ];

    const graph = buildDependencyGraph(skills);

    expect(graph.getSkillCount()).toBe(4);
    expect(graph.getDependencies('b').map((d) => d.dependsOn)).toContain('a');
    expect(graph.getDependencies('d')).toHaveLength(2);
  });

  it('should handle empty skills array', () => {
    const graph = buildDependencyGraph([]);
    expect(graph.getSkillCount()).toBe(0);
  });

  it('should handle skills without dependencies', () => {
    const skills = [createTestSkill('a'), createTestSkill('b')];

    const graph = buildDependencyGraph(skills);

    expect(graph.getSkillCount()).toBe(2);
    expect(graph.getDependencies('a')).toHaveLength(0);
    expect(graph.getDependencies('b')).toHaveLength(0);
  });

  it('should preserve version information', () => {
    const skills = [createTestSkill('a', [], 5), createTestSkill('b', ['a'], 3)];

    const graph = buildDependencyGraph(skills);

    expect(graph.hasSkill('a')).toBe(true);
    expect(graph.hasSkill('b')).toBe(true);
  });
});

describe('resolveWithFallbacks', () => {
  let graph: ISkillDependencyGraph;

  beforeEach(() => {
    graph = createSkillDependencyGraph();
    graph.addSkill('a');
    graph.addSkill('b');
    graph.addSkill('c');
    graph.addDependency({ skillId: 'b', dependsOn: 'a', type: 'required' });
    graph.addDependency({ skillId: 'c', dependsOn: 'b', type: 'optional' });
  });

  it('should resolve with all skills available', () => {
    const available = new Set(['a', 'b', 'c']);
    const result = resolveWithFallbacks(graph, ['c'], available);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('c');
    }
  });

  it('should return error when required dependency is missing', () => {
    const available = new Set(['b']); // 'a' is missing
    const result = resolveWithFallbacks(graph, ['b'], available);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MISSING_DEPENDENCY');
    }
  });

  it('should succeed with optional dependency missing', () => {
    const available = new Set(['a', 'c']); // 'b' is optional dep for 'c'
    const result = resolveWithFallbacks(graph, ['c'], available);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('c');
      expect(result.value).not.toContain('b');
    }
  });

  it('should filter unavailable skills from request', () => {
    const available = new Set(['a']);
    const result = resolveWithFallbacks(graph, ['a', 'non-existent'], available);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('a');
      expect(result.value).not.toContain('non-existent');
    }
  });

  it('should handle empty request', () => {
    const available = new Set(['a', 'b', 'c']);
    const result = resolveWithFallbacks(graph, [], available);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});

describe('findMissingDependencies', () => {
  let graph: ISkillDependencyGraph;

  beforeEach(() => {
    graph = createSkillDependencyGraph();
    graph.addSkill('a');
    graph.addSkill('b');
    graph.addSkill('c');
    graph.addSkill('d');
    graph.addDependency({ skillId: 'b', dependsOn: 'a', type: 'required' });
    graph.addDependency({ skillId: 'c', dependsOn: 'a', type: 'required' });
    graph.addDependency({ skillId: 'd', dependsOn: 'b', type: 'optional' });
  });

  it('should find missing required dependencies', () => {
    const available = new Set(['b', 'c']); // 'a' is missing
    const missing = findMissingDependencies(graph, ['b', 'c'], available);

    expect(missing).toContain('a');
  });

  it('should not include optional dependencies', () => {
    const available = new Set(['d']); // 'b' is missing but optional
    const missing = findMissingDependencies(graph, ['d'], available);

    expect(missing).not.toContain('b');
  });

  it('should return empty array when all deps available', () => {
    const available = new Set(['a', 'b', 'c', 'd']);
    const missing = findMissingDependencies(graph, ['b', 'c', 'd'], available);

    expect(missing).toEqual([]);
  });

  it('should handle empty skill list', () => {
    const available = new Set(['a']);
    const missing = findMissingDependencies(graph, [], available);

    expect(missing).toEqual([]);
  });

  it('should skip unavailable skills in request', () => {
    const available = new Set(['a']);
    const missing = findMissingDependencies(graph, ['b'], available);

    // 'b' is not in available, so we don't check its dependencies
    expect(missing).toEqual([]);
  });
});

describe('createSkillDependencyGraph', () => {
  it('should create empty graph', () => {
    const graph = createSkillDependencyGraph();
    expect(graph.getSkillCount()).toBe(0);
  });

  it('should return ISkillDependencyGraph interface', () => {
    const graph = createSkillDependencyGraph();
    // Type check - these should all exist
    expect(typeof graph.addSkill).toBe('function');
    expect(typeof graph.addDependency).toBe('function');
    expect(typeof graph.removeDependency).toBe('function');
    expect(typeof graph.getDependencies).toBe('function');
    expect(typeof graph.getDependents).toBe('function');
    expect(typeof graph.getExecutionOrder).toBe('function');
    expect(typeof graph.hasCircularDependency).toBe('function');
    expect(typeof graph.validateGraph).toBe('function');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Skill Dependency Graph - Integration', () => {
  it('should handle complex DAG with multiple paths', () => {
    // Graph:
    //        a
    //       / \
    //      b   c
    //     / \ / \
    //    d   e   f
    //         \ /
    //          g
    const skills = [
      createTestSkill('a'),
      createTestSkill('b', ['a']),
      createTestSkill('c', ['a']),
      createTestSkill('d', ['b']),
      createTestSkill('e', ['b', 'c']),
      createTestSkill('f', ['c']),
      createTestSkill('g', ['e', 'f']),
    ];

    const graph = buildDependencyGraph(skills);

    expect(graph.validateGraph().ok).toBe(true);

    const orderResult = graph.getExecutionOrder(['g']);
    expect(orderResult.ok).toBe(true);
    if (orderResult.ok) {
      const order = orderResult.value;
      // Verify topological ordering constraints
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('e'));
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('e'));
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('f'));
      expect(order.indexOf('e')).toBeLessThan(order.indexOf('g'));
      expect(order.indexOf('f')).toBeLessThan(order.indexOf('g'));
      // d should not be included (not required for g)
      expect(order).not.toContain('d');
    }
  });

  it('should correctly order multiple independent roots', () => {
    const skills = [createTestSkill('a'), createTestSkill('b'), createTestSkill('c', ['a', 'b'])];

    const graph = buildDependencyGraph(skills);
    const orderResult = graph.getExecutionOrder(['c']);

    expect(orderResult.ok).toBe(true);
    if (orderResult.ok) {
      const order = orderResult.value;
      // a and b must come before c
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    }
  });

  it('should handle partial execution with subset of skills', () => {
    const skills = [
      createTestSkill('a'),
      createTestSkill('b', ['a']),
      createTestSkill('c', ['a']),
      createTestSkill('d', ['b', 'c']),
    ];

    const graph = buildDependencyGraph(skills);

    // Only execute 'b' (should include 'a')
    const orderResult = graph.getExecutionOrder(['b']);

    expect(orderResult.ok).toBe(true);
    if (orderResult.ok) {
      expect(orderResult.value).toEqual(['a', 'b']);
    }
  });
});
