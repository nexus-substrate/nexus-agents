/**
 * Tests for Spec Executor.
 *
 * (Source: Issue #851 — Phase 3 of AI Software Factory Epic #843)
 */

import { describe, it, expect } from 'vitest';
import { executeSpec } from './spec-executor.js';

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
