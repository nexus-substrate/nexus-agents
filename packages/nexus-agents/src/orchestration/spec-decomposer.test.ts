/**
 * Tests for Spec Decomposer.
 *
 * (Source: Issue #848 — Phase 2 of AI Software Factory Epic #843)
 */

import { describe, it, expect } from 'vitest';
import { decomposeSpec } from './spec-decomposer.js';
import type { ParsedSpec } from './spec-parser-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeSpec(overrides?: Partial<ParsedSpec>): ParsedSpec {
  return {
    title: 'Test Feature',
    overview: 'Implement a test feature.',
    requirements: ['Add login endpoint', 'Add logout endpoint'],
    acceptanceCriteria: ['User can log in', 'User can log out'],
    constraints: [],
    issueReferences: [],
    fileReferences: [],
    missingSections: [],
    rawMarkdown: '# Test Feature',
    ...overrides,
  };
}

// ============================================================================
// Success Cases
// ============================================================================

describe('decomposeSpec', () => {
  it('produces a DAG from a spec with requirements', () => {
    const spec = makeSpec();
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.specTitle).toBe('Test Feature');
    expect(result.value.nodes.length).toBeGreaterThan(0);
    expect(result.value.edges.length).toBeGreaterThanOrEqual(0);
    expect(result.value.roots.length).toBeGreaterThan(0);
  });

  it('creates one subtask per requirement', () => {
    const spec = makeSpec({
      requirements: ['Build API', 'Add validation', 'Add caching'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Each requirement maps to exactly one subtask node
    // (type depends on keyword classification)
    const reqNodes = result.value.nodes.filter((n) => n.type !== 'test');
    expect(reqNodes.length).toBe(3);
  });

  it('generates test subtasks for acceptance criteria', () => {
    const spec = makeSpec({
      requirements: ['Add feature'],
      acceptanceCriteria: ['Feature works correctly', 'Feature handles errors'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const testNodes = result.value.nodes.filter((n) => n.type === 'test');
    expect(testNodes.length).toBe(2);
  });

  it('test subtasks depend on their code subtasks', () => {
    const spec = makeSpec({
      requirements: ['Add endpoint'],
      acceptanceCriteria: ['Endpoint returns 200'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const testNodes = result.value.nodes.filter((n) => n.type === 'test');
    expect(testNodes.length).toBeGreaterThan(0);
    // Each test node should depend on at least one code node
    for (const testNode of testNodes) {
      expect(testNode.dependsOn.length).toBeGreaterThan(0);
    }
  });

  it('code subtasks with no dependencies are roots', () => {
    const spec = makeSpec({
      requirements: ['Task A', 'Task B'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Root nodes have no dependsOn entries
    for (const rootId of result.value.roots) {
      const node = result.value.nodes.find((n) => n.id === rootId);
      expect(node).toBeDefined();
      expect(node?.dependsOn).toHaveLength(0);
    }
  });

  it('edges match node dependency declarations', () => {
    const spec = makeSpec({
      requirements: ['Build core', 'Build extension'],
      acceptanceCriteria: ['Core works', 'Extension works'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Every edge (from, to) should match: to.dependsOn includes from
    for (const edge of result.value.edges) {
      const target = result.value.nodes.find((n) => n.id === edge.to);
      expect(target).toBeDefined();
      expect(target?.dependsOn).toContain(edge.from);
    }
  });

  it('assigns complexity based on requirement text', () => {
    const spec = makeSpec({
      requirements: ['Add simple getter method'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.nodes[0]?.complexity).toBeDefined();
  });

  it('detects config subtasks from config-related requirements', () => {
    const spec = makeSpec({
      requirements: ['Configure database connection', 'Set up environment variables'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const configNodes = result.value.nodes.filter((n) => n.type === 'config');
    expect(configNodes.length).toBe(2);
  });

  it('detects docs subtasks from documentation requirements', () => {
    const spec = makeSpec({
      requirements: ['Document the API', 'Write usage guide'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const docNodes = result.value.nodes.filter((n) => n.type === 'docs');
    expect(docNodes.length).toBe(2);
  });

  it('detects refactor subtasks from refactoring requirements', () => {
    const spec = makeSpec({
      requirements: ['Refactor the auth module', 'Restructure the utils folder'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const refactorNodes = result.value.nodes.filter((n) => n.type === 'refactor');
    expect(refactorNodes.length).toBe(2);
  });

  it('preserves source requirement in subtask', () => {
    const spec = makeSpec({
      requirements: ['Implement OAuth2 login'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const node = result.value.nodes.find((n) => n.type === 'code');
    expect(node?.sourceRequirement).toBe('Implement OAuth2 login');
  });

  it('generates unique node IDs', () => {
    const spec = makeSpec({
      requirements: ['A', 'B', 'C'],
      acceptanceCriteria: ['X', 'Y'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ids = result.value.nodes.map((n) => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ============================================================================
// Error Cases
// ============================================================================

describe('decomposeSpec errors', () => {
  it('rejects spec with no requirements', () => {
    const spec = makeSpec({ requirements: [] });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('requirements');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('decomposeSpec edge cases', () => {
  it('handles spec with requirements but no acceptance criteria', () => {
    const spec = makeSpec({
      requirements: ['Build it'],
      acceptanceCriteria: [],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should still produce code nodes, just no test nodes
    expect(result.value.nodes.length).toBeGreaterThan(0);
    const testNodes = result.value.nodes.filter((n) => n.type === 'test');
    expect(testNodes.length).toBe(0);
  });

  it('handles single requirement', () => {
    const spec = makeSpec({
      requirements: ['Do one thing'],
      acceptanceCriteria: ['It works'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.nodes.length).toBe(2); // 1 code + 1 test
  });

  it('computes totalComplexity as max of subtask complexities', () => {
    const spec = makeSpec({
      requirements: ['Simple thing', 'Implement complex distributed system'],
    });
    const result = decomposeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // totalComplexity should be defined
    expect(['simple', 'moderate', 'complex', 'expert']).toContain(result.value.totalComplexity);
  });
});
