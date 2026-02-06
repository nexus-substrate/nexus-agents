/**
 * Tests for latts-verifier.ts
 *
 * Covers HeuristicVerifier: verify for failed, skipped, no-output,
 * and successful results with error/warning pattern detection.
 */

import { describe, it, expect } from 'vitest';
import { HeuristicVerifier } from './latts-verifier.js';
import type { StepResult } from '../core/index.js';
import type { VerifierContext } from './latts-types.js';

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeContext(overrides: Partial<VerifierContext> = {}) {
  return {
    stepId: 'step-1',
    taskDescription: 'test task',
    previousAttempts: [],
    stepResults: new Map(),
    totalAttempts: 0,
    ...overrides,
  } as VerifierContext;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeResult(overrides: Partial<StepResult> = {}) {
  return {
    stepId: 'step-1',
    output: 'clean output',
    durationMs: 100,
    status: 'success' as const,
    ...overrides,
  } as StepResult;
}

// ============================================================================
// HeuristicVerifier - failed results
// ============================================================================

describe('HeuristicVerifier - failed results', () => {
  const verifier = new HeuristicVerifier();

  it('rejects failed step', async () => {
    const result = await verifier.verify(
      makeResult({ status: 'failed', error: 'timeout' }),
      makeContext()
    );
    expect(result.accepted).toBe(false);
    expect(result.qualityScore).toBe(0);
  });

  it('includes error message in reason', async () => {
    const result = await verifier.verify(
      makeResult({ status: 'failed', error: 'connection refused' }),
      makeContext()
    );
    expect(result.reason).toContain('connection refused');
  });

  it('has high confidence for failures', async () => {
    const result = await verifier.verify(makeResult({ status: 'failed' }), makeContext());
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('handles missing error message', async () => {
    const result = await verifier.verify(
      makeResult({ status: 'failed', error: undefined }),
      makeContext()
    );
    expect(result.reason).toContain('Unknown error');
  });
});

// ============================================================================
// HeuristicVerifier - skipped results
// ============================================================================

describe('HeuristicVerifier - skipped results', () => {
  const verifier = new HeuristicVerifier();

  it('accepts skipped step', async () => {
    const result = await verifier.verify(makeResult({ status: 'skipped' }), makeContext());
    expect(result.accepted).toBe(true);
    expect(result.qualityScore).toBe(1.0);
    expect(result.confidence).toBe(1.0);
  });
});

// ============================================================================
// HeuristicVerifier - no output
// ============================================================================

describe('HeuristicVerifier - no output', () => {
  const verifier = new HeuristicVerifier();

  it('rejects null output', async () => {
    const result = await verifier.verify(makeResult({ output: null }), makeContext());
    expect(result.accepted).toBe(false);
    expect(result.issues).toContain('No output produced');
  });

  it('rejects undefined output', async () => {
    const result = await verifier.verify(makeResult({ output: undefined }), makeContext());
    expect(result.accepted).toBe(false);
  });
});

// ============================================================================
// HeuristicVerifier - successful output
// ============================================================================

describe('HeuristicVerifier - successful output', () => {
  const verifier = new HeuristicVerifier();

  it('accepts clean output', async () => {
    const result = await verifier.verify(
      makeResult({ output: 'All tests passed successfully' }),
      makeContext()
    );
    expect(result.accepted).toBe(true);
    expect(result.qualityScore).toBe(1);
  });

  it('rejects output with error patterns', async () => {
    const result = await verifier.verify(
      makeResult({ output: 'Error: undefined is not a function' }),
      makeContext()
    );
    expect(result.accepted).toBe(false);
    expect(result.qualityScore).toBeLessThan(1);
  });

  it('detects warning patterns', async () => {
    const result = await verifier.verify(
      makeResult({ output: 'TODO: fix this later' }),
      makeContext()
    );
    expect(result.issues).toBeDefined();
    expect(result.issues?.some((i) => i.includes('Warning'))).toBe(true);
  });

  it('detects multiple error patterns', async () => {
    const result = await verifier.verify(
      makeResult({ output: 'Error: failed with exception' }),
      makeContext()
    );
    // 'error', 'failed', 'exception' all match
    expect(result.qualityScore).toBeLessThan(0.5);
  });

  it('handles non-string output', async () => {
    const result = await verifier.verify(
      makeResult({ output: { status: 'ok', data: [1, 2, 3] } }),
      makeContext()
    );
    expect(result.accepted).toBe(true);
  });

  it('reduces confidence with previous attempts', async () => {
    const withAttempts = makeContext({
      previousAttempts: [
        { action: 'execute', outcome: 'fail' },
        { action: 'execute', outcome: 'fail' },
      ] as never,
    });
    const noAttempts = makeContext();

    const result1 = await verifier.verify(makeResult(), withAttempts);
    const result2 = await verifier.verify(makeResult(), noAttempts);

    expect(result1.confidence).toBeLessThan(result2.confidence);
  });

  it('confidence does not go below 0.5', async () => {
    const manyAttempts = makeContext({
      previousAttempts: Array.from({ length: 20 }, () => ({
        action: 'execute',
        outcome: 'fail',
      })) as never,
    });
    const result = await verifier.verify(makeResult(), manyAttempts);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('reports no issues for clean output', async () => {
    const result = await verifier.verify(makeResult({ output: 'clean result' }), makeContext());
    expect(result.issues).toBeUndefined();
  });
});
