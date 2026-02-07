/**
 * Tests for Scenario Validator.
 *
 * (Source: Issue #850 — Phase 3 of AI Software Factory Epic #843)
 */

import { describe, it, expect } from 'vitest';
import { validateScenario } from './scenario-validator.js';
import type { ParsedSpec } from './spec-parser-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeSpec(overrides?: Partial<ParsedSpec>): ParsedSpec {
  return {
    title: 'Test Feature',
    overview: 'A test feature.',
    requirements: ['Build it'],
    acceptanceCriteria: ['User can log in', 'Session persists'],
    constraints: [],
    issueReferences: [],
    fileReferences: [],
    missingSections: [],
    rawMarkdown: '# Test',
    ...overrides,
  };
}

// ============================================================================
// Success Cases
// ============================================================================

describe('validateScenario', () => {
  it('returns full satisfaction when all criteria are met', () => {
    const spec = makeSpec({
      acceptanceCriteria: ['User can log in', 'Session persists'],
    });
    const results = ['[code] User can log in via OAuth', '[test] Session persists across reloads'];

    const result = validateScenario(spec, results);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.satisfaction).toBe(1);
    expect(result.value.allMet).toBe(true);
    expect(result.value.metCount).toBe(2);
    expect(result.value.totalCriteria).toBe(2);
  });

  it('returns partial satisfaction when some criteria met', () => {
    const spec = makeSpec({
      acceptanceCriteria: ['Database migrated successfully', 'Cache layer invalidated'],
    });
    const results = ['[code] Database migrated successfully to v3'];

    const result = validateScenario(spec, results);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.satisfaction).toBe(0.5);
    expect(result.value.allMet).toBe(false);
    expect(result.value.metCount).toBe(1);
  });

  it('returns zero satisfaction when no criteria met', () => {
    const spec = makeSpec({
      acceptanceCriteria: ['Database migrated', 'Cache invalidated'],
    });
    const results = ['[code] Added login form'];

    const result = validateScenario(spec, results);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.satisfaction).toBe(0);
    expect(result.value.allMet).toBe(false);
    expect(result.value.metCount).toBe(0);
  });

  it('includes matched results for each criterion', () => {
    const spec = makeSpec({
      acceptanceCriteria: ['User can log in'],
    });
    const results = ['[code] User can log in via Google', '[test] User login works'];

    const result = validateScenario(spec, results);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const criterion = result.value.criteria[0];
    expect(criterion?.met).toBe(true);
    expect(criterion?.matchedResults.length).toBeGreaterThanOrEqual(1);
  });

  it('matches case-insensitively', () => {
    const spec = makeSpec({
      acceptanceCriteria: ['USER CAN LOG IN'],
    });
    const results = ['[code] user can log in'];

    const result = validateScenario(spec, results);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.criteria[0]?.met).toBe(true);
  });

  it('matches on significant keywords, not exact string', () => {
    const spec = makeSpec({
      acceptanceCriteria: ['Session token persists after navigation'],
    });
    const results = ['[test] Verified session token persists correctly'];

    const result = validateScenario(spec, results);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.criteria[0]?.met).toBe(true);
  });
});

// ============================================================================
// Error Cases
// ============================================================================

describe('validateScenario errors', () => {
  it('rejects spec with no acceptance criteria', () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const result = validateScenario(spec, ['some result']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('acceptance criteria');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('validateScenario edge cases', () => {
  it('handles empty results array', () => {
    const spec = makeSpec({
      acceptanceCriteria: ['Something works'],
    });
    const result = validateScenario(spec, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.satisfaction).toBe(0);
    expect(result.value.allMet).toBe(false);
  });

  it('handles single criterion', () => {
    const spec = makeSpec({
      acceptanceCriteria: ['It works'],
    });
    const results = ['[code] It works perfectly'];
    const result = validateScenario(spec, results);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.satisfaction).toBe(1);
    expect(result.value.totalCriteria).toBe(1);
  });
});
