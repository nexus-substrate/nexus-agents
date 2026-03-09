/**
 * Tests for shouldRefine refinement decision logic.
 *
 * @module mcp/tools/orchestrate-dispatch-refinement.test
 * (Source: Issue #1389, #1504)
 */

import { describe, it, expect } from 'vitest';
import { shouldRefine, type RefinementSignals } from './orchestrate-dispatch.js';

describe('shouldRefine', () => {
  const base: RefinementSignals = {
    errorCount: 0,
    successCount: 3,
    conflictCount: 0,
  };

  it('returns false when all workers succeed', () => {
    expect(shouldRefine(base)).toBe(false);
  });

  it('returns true when no workers succeed', () => {
    expect(shouldRefine({ ...base, successCount: 0 })).toBe(true);
  });

  it('returns true when errors exist', () => {
    expect(shouldRefine({ ...base, errorCount: 1 })).toBe(true);
  });

  it('returns true when synthesis fell back to concatenation', () => {
    expect(shouldRefine({ ...base, synthesisSource: 'fallback' })).toBe(true);
  });

  it('returns false when synthesis was LLM-based and all succeeded', () => {
    expect(shouldRefine({ ...base, synthesisSource: 'llm' })).toBe(false);
  });

  it('skips refinement when all errors are rate_limit', () => {
    expect(
      shouldRefine({
        ...base,
        errorCount: 3,
        successCount: 0,
        allErrorsRateLimit: true,
      })
    ).toBe(false);
  });

  it('still refines when mixed error types (not all rate_limit)', () => {
    expect(
      shouldRefine({
        ...base,
        errorCount: 2,
        allErrorsRateLimit: false,
      })
    ).toBe(true);
  });
});
