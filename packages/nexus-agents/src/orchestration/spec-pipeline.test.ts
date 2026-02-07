/**
 * Tests for Spec Pipeline.
 *
 * (Source: Issue #849 — Phase 2 of AI Software Factory Epic #843)
 */

import { describe, it, expect, vi } from 'vitest';
import { compileSpecToGraph, createDryRunHandler } from './spec-pipeline.js';
import type { NodeHandlerFactory } from './spec-pipeline-types.js';
import type { SubtaskNode } from './spec-decomposer-types.js';

// ============================================================================
// Success Cases
// ============================================================================

describe('compileSpecToGraph', () => {
  const VALID_SPEC = `# Add User Auth

## Overview
Implement OAuth2 login.

## Requirements
- Add login endpoint
- Add logout endpoint

## Acceptance Criteria
- [ ] User can log in
- [ ] User can log out
`;

  it('compiles a valid spec into a graph', () => {
    const result = compileSpecToGraph(VALID_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.nodes.size).toBeGreaterThan(0);
    expect(result.value.edges.length).toBeGreaterThan(0);
  });

  it('creates graph nodes matching subtask count', () => {
    const spec = `# Feature

## Requirements
- Build API
- Add validation

## Acceptance Criteria
- [ ] API works
`;
    const result = compileSpecToGraph(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 2 code nodes + 1 test node = 3 subtask nodes + START→roots + leaves→END
    // GraphBuilder adds nodes for each subtask
    expect(result.value.nodes.size).toBe(3);
  });

  it('creates edges for test dependencies', () => {
    const spec = `# Feature

## Requirements
- Build core module

## Acceptance Criteria
- [ ] Module works correctly
`;
    const result = compileSpecToGraph(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should have: START→code, code→test, test→END = 3 edges
    expect(result.value.edges.length).toBe(3);
  });

  it('handles spec with no acceptance criteria', () => {
    const spec = `# Feature

## Requirements
- Do something
- Do another thing
`;
    const result = compileSpecToGraph(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 2 code nodes, both roots → START→each, each→END = 4 edges
    expect(result.value.nodes.size).toBe(2);
  });

  it('graph state schema includes results field', () => {
    const result = compileSpecToGraph(VALID_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stateSchema).toBeDefined();
    expect(result.value.stateSchema['results']).toBeDefined();
  });
});

// ============================================================================
// Error Cases
// ============================================================================

// ============================================================================
// Custom Handler Factory
// ============================================================================

describe('compileSpecToGraph with custom handler factory', () => {
  const SIMPLE_SPEC = `# Feature

## Requirements
- Build API

## Acceptance Criteria
- [ ] API works
`;

  it('uses custom handler factory when provided', () => {
    const factory: NodeHandlerFactory = vi.fn(
      (node: SubtaskNode) => () => Promise.resolve({ results: [`custom:${node.id}`] })
    );

    const result = compileSpecToGraph(SIMPLE_SPEC, { handlerFactory: factory });

    expect(result.ok).toBe(true);
    expect(factory).toHaveBeenCalled();
  });

  it('uses dry-run handler by default', () => {
    const result = compileSpecToGraph(SIMPLE_SPEC);

    expect(result.ok).toBe(true);
  });

  it('createDryRunHandler returns placeholder output', async () => {
    const node = {
      id: 'test-1',
      type: 'code' as const,
      description: 'Build API',
      complexity: 'simple' as const,
      capabilities: [],
      dependsOn: [],
      sourceRequirement: 'Build API',
    };
    const handler = createDryRunHandler(node);
    const state = await handler({ results: [] });

    expect(state.results).toEqual(['[code] Build API']);
  });
});

// ============================================================================
// Error Cases
// ============================================================================

describe('compileSpecToGraph errors', () => {
  it('returns parse error for empty input', () => {
    const result = compileSpecToGraph('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.stage).toBe('parse');
    expect(result.error.message).toContain('empty');
  });

  it('returns parse error for headingless input', () => {
    const result = compileSpecToGraph('Just some text');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.stage).toBe('parse');
  });

  it('returns decompose error for spec with no requirements', () => {
    const spec = `# Title Only

## Overview
No requirements here.
`;
    const result = compileSpecToGraph(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.stage).toBe('decompose');
    expect(result.error.message).toContain('requirements');
  });
});
