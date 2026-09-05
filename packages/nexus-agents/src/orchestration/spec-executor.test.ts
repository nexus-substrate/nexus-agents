/**
 * Tests for Spec Executor.
 *
 * (Source: Issue #851 — Phase 3 of AI Software Factory Epic #843)
 */

import { describe, it, expect } from 'vitest';
import { executeSpec } from './spec-executor.js';
import type { NodeHandlerFactory } from './spec-pipeline-types.js';

// ============================================================================
// Success Cases
// ============================================================================

describe('executeSpec', () => {
  const FULL_SPEC = `# Add Auth

## Overview
Implement OAuth2 login for the app.

## Requirements
- Add login endpoint
- Add logout endpoint

## Acceptance Criteria
- [ ] User can log in
- [ ] User can log out
`;

  it('executes a full spec end-to-end', async () => {
    const result = await executeSpec(FULL_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.dag.nodes.length).toBeGreaterThan(0);
    expect(result.value.outputs.length).toBeGreaterThan(0);
    expect(result.value.validation).toBeDefined();
    expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.value.executed).toBe(false);
  });

  it('returns DAG with correct spec title', async () => {
    const result = await executeSpec(FULL_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.dag.specTitle).toBe('Add Auth');
  });

  it('produces outputs for each graph node', async () => {
    const spec = `# Feature

## Requirements
- Build API

## Acceptance Criteria
- [ ] API responds
`;
    const result = await executeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 1 code node + 1 test node = 2 outputs
    expect(result.value.outputs.length).toBe(2);
  });

  it('validates results against acceptance criteria', async () => {
    const spec = `# Feature

## Requirements
- Add login endpoint

## Acceptance Criteria
- [ ] Login endpoint works
`;
    const result = await executeSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Node handler outputs include "[code] Add login endpoint"
    // Criterion "Login endpoint works" should match on "login" + "endpoint"
    expect(result.value.validation.totalCriteria).toBe(1);
  });

  it('reports that configured node handlers executed (#5505)', async () => {
    const handlerFactory: NodeHandlerFactory = (node) => () =>
      Promise.resolve({ results: [`Completed ${node.description}`] });
    const spec = `# Feature

## Requirements
- Build API

## Acceptance Criteria
- [ ] API completed
`;

    const result = await executeSpec(spec, { handlerFactory });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.executed).toBe(true);
  });
});

// ============================================================================
// Error Cases
// ============================================================================

describe('executeSpec errors', () => {
  it('returns parse error for empty input', async () => {
    const result = await executeSpec('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.stage).toBe('parse');
  });

  it('returns decompose error for spec with no requirements', async () => {
    const result = await executeSpec('# Title Only');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.stage).toBe('decompose');
  });
});

// ============================================================================
// A spec with no acceptance criteria cannot pass (#4826)
// ============================================================================

describe('executeSpec with no acceptance criteria (#4826)', () => {
  const NO_CRITERIA_SPEC = `# Add Auth

## Overview
Implement OAuth2 login for the app.

## Requirements
- Add login endpoint
- Add logout endpoint
`;

  it('does not report a spec with nothing to check as fully satisfied', async () => {
    // `## Acceptance Criteria` absent or misspelled yields an empty list from
    // the parser with no error, and the executor short-circuited it to
    // satisfaction 1 / allMet true — a perfect score for a spec that was
    // never checked against anything.
    const result = await executeSpec(NO_CRITERIA_SPEC);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.stage).toBe('validate');
    expect(result.error.message).toContain('acceptance criteria');
  });

  it('still validates a spec that does have acceptance criteria', async () => {
    // The pair: refusing everything would satisfy the test above.
    const result = await executeSpec(`# Add Auth

## Requirements
- Add login endpoint

## Acceptance Criteria
- [ ] User can log in
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.validation.totalCriteria).toBe(1);
  });
});
