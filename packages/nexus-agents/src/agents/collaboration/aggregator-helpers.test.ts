/**
 * Tests for Aggregator Helpers
 * @module agents/collaboration/aggregator-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { ExpertResult } from './aggregator-types.js';
import {
  defaultConflictResolver,
  defaultQualityScorer,
  determineStrategy,
  areAllStrings,
  areAllObjects,
  areAllArrays,
  mergeStrings,
  mergeArrays,
  deepEquals,
  mergeObjects,
  selectBest,
  buildConsensus,
  chainSequential,
} from './aggregator-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeResult(overrides: Partial<ExpertResult> = {}): ExpertResult {
  return {
    expertId: 'expert-1',
    result: { output: 'test output', durationMs: 100, status: 'success' },
    confidence: 0.8,
    ...overrides,
  } as ExpertResult;
}

// ============================================================================
// defaultConflictResolver
// ============================================================================

describe('defaultConflictResolver', () => {
  it('prefers higher confidence', () => {
    const r1 = makeResult({ confidence: 0.9 });
    const r2 = makeResult({ confidence: 0.7 });
    const conflict = {
      expert1Id: 'a',
      expert2Id: 'b',
      field: 'x',
      description: 'd',
      resolution: 'unresolved',
    };
    expect(defaultConflictResolver(conflict, r1, r2)).toBe('expert1');
  });

  it('returns expert2 when it has higher confidence', () => {
    const r1 = makeResult({ confidence: 0.3 });
    const r2 = makeResult({ confidence: 0.8 });
    const conflict = {
      expert1Id: 'a',
      expert2Id: 'b',
      field: 'x',
      description: 'd',
      resolution: 'unresolved',
    };
    expect(defaultConflictResolver(conflict, r1, r2)).toBe('expert2');
  });

  it('prefers expert1 on tie', () => {
    const r1 = makeResult({ confidence: 0.5 });
    const r2 = makeResult({ confidence: 0.5 });
    const conflict = {
      expert1Id: 'a',
      expert2Id: 'b',
      field: 'x',
      description: 'd',
      resolution: 'unresolved',
    };
    expect(defaultConflictResolver(conflict, r1, r2)).toBe('expert1');
  });
});

// ============================================================================
// defaultQualityScorer
// ============================================================================

describe('defaultQualityScorer', () => {
  it('returns 0 for empty results', () => {
    expect(defaultQualityScorer([], null)).toBe(0);
  });

  it('scores based on confidence and output presence', () => {
    const results = [makeResult({ confidence: 0.8 })];
    const score = defaultQualityScorer(results, 'some output');
    expect(score).toBeCloseTo(0.9); // (0.8 + 1) / 2
  });

  it('reduces score for null output', () => {
    const results = [makeResult({ confidence: 0.8 })];
    const score = defaultQualityScorer(results, null);
    expect(score).toBeCloseTo(0.4); // (0.8 + 0) / 2
  });
});

// ============================================================================
// determineStrategy
// ============================================================================

describe('determineStrategy', () => {
  it('maps sequential to sequential_chain', () => {
    expect(determineStrategy('sequential')).toBe('sequential_chain');
  });

  it('maps parallel to merge', () => {
    expect(determineStrategy('parallel')).toBe('merge');
  });

  it('maps review to select_best', () => {
    expect(determineStrategy('review')).toBe('select_best');
  });

  it('maps consensus to consensus', () => {
    expect(determineStrategy('consensus')).toBe('consensus');
  });
});

// ============================================================================
// Type guards
// ============================================================================

describe('areAllStrings', () => {
  it('returns true for string array', () => {
    expect(areAllStrings(['a', 'b'])).toBe(true);
  });

  it('returns false for mixed array', () => {
    expect(areAllStrings(['a', 1])).toBe(false);
  });

  it('returns true for empty array', () => {
    expect(areAllStrings([])).toBe(true);
  });
});

describe('areAllObjects', () => {
  it('returns true for object array', () => {
    expect(areAllObjects([{ a: 1 }, { b: 2 }])).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(areAllObjects([[1]])).toBe(false);
  });

  it('returns false for null', () => {
    expect(areAllObjects([null])).toBe(false);
  });
});

describe('areAllArrays', () => {
  it('returns true for nested arrays', () => {
    expect(areAllArrays([[1], [2]])).toBe(true);
  });

  it('returns false for non-arrays', () => {
    expect(areAllArrays([{ a: 1 }])).toBe(false);
  });
});

// ============================================================================
// mergeStrings
// ============================================================================

describe('mergeStrings', () => {
  it('deduplicates lines', () => {
    const result = mergeStrings(['line1\nline2', 'line2\nline3']);
    expect(result).toContain('line1');
    expect(result).toContain('line3');
    expect(result.split('\n')).toHaveLength(3);
  });

  it('trims lines', () => {
    const result = mergeStrings(['  hello  ']);
    expect(result).toBe('hello');
  });

  it('filters empty lines', () => {
    const result = mergeStrings(['a\n\nb']);
    expect(result).toBe('a\nb');
  });
});

// ============================================================================
// mergeArrays
// ============================================================================

describe('mergeArrays', () => {
  it('deduplicates items by JSON key', () => {
    const result = mergeArrays([
      [1, 2],
      [2, 3],
    ]);
    expect(result).toEqual([1, 2, 3]);
  });

  it('handles objects', () => {
    const result = mergeArrays([[{ a: 1 }], [{ a: 1 }, { b: 2 }]]);
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// deepEquals
// ============================================================================

describe('deepEquals', () => {
  it('returns true for identical values', () => {
    expect(deepEquals(1, 1)).toBe(true);
    expect(deepEquals('a', 'a')).toBe(true);
  });

  it('returns false for different types', () => {
    expect(deepEquals(1, '1')).toBe(false);
  });

  it('compares objects deeply', () => {
    expect(deepEquals({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEquals({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it('returns false for different key counts', () => {
    expect(deepEquals({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('handles null', () => {
    expect(deepEquals(null, null)).toBe(true);
    expect(deepEquals(null, {})).toBe(false);
  });
});

// ============================================================================
// mergeObjects
// ============================================================================

describe('mergeObjects', () => {
  it('merges non-conflicting keys', () => {
    const results = [makeResult({ expertId: 'e1' }), makeResult({ expertId: 'e2' })];
    const outputs = [{ a: 1 }, { b: 2 }];
    const { output, conflicts } = mergeObjects(results, outputs, defaultConflictResolver);
    expect(output).toEqual({ a: 1, b: 2 });
    expect(conflicts).toHaveLength(0);
  });

  it('detects conflicts', () => {
    const results = [makeResult({ expertId: 'e1' }), makeResult({ expertId: 'e2' })];
    const outputs = [{ a: 1 }, { a: 2 }];
    const { conflicts } = mergeObjects(results, outputs, defaultConflictResolver);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.field).toBe('a');
  });

  it('skips identical values (no conflict)', () => {
    const results = [makeResult({ expertId: 'e1' }), makeResult({ expertId: 'e2' })];
    const outputs = [{ a: 1 }, { a: 1 }];
    const { conflicts } = mergeObjects(results, outputs, defaultConflictResolver);
    expect(conflicts).toHaveLength(0);
  });
});

// ============================================================================
// selectBest
// ============================================================================

describe('selectBest', () => {
  it('returns single result output', () => {
    const results = [
      makeResult({ result: { output: 'only', durationMs: 100, status: 'success' } }),
    ];
    expect(selectBest(results)).toBe('only');
  });

  it('returns highest confidence result', () => {
    const results = [
      makeResult({
        expertId: 'low',
        confidence: 0.3,
        result: { output: 'low', durationMs: 100, status: 'success' },
      }),
      makeResult({
        expertId: 'high',
        confidence: 0.9,
        result: { output: 'high', durationMs: 100, status: 'success' },
      }),
    ];
    expect(selectBest(results)).toBe('high');
  });

  it('uses approved review when available', () => {
    const results = [
      makeResult({
        expertId: 'e1',
        result: { output: 'from e1', durationMs: 100, status: 'success' },
      }),
      makeResult({
        expertId: 'e2',
        result: { output: 'from e2', durationMs: 100, status: 'success' },
      }),
    ];
    const reviews = [{ requesterId: 'e1', approved: true, feedback: '' }];
    expect(selectBest(results, reviews as never)).toBe('from e1');
  });
});

// ============================================================================
// buildConsensus
// ============================================================================

describe('buildConsensus', () => {
  it('falls back to selectBest without votes', () => {
    const results = [
      makeResult({ result: { output: 'test', durationMs: 100, status: 'success' } }),
    ];
    expect(buildConsensus(results)).toBe('test');
  });

  it('returns approved when more approve votes', () => {
    const results = [makeResult()];
    const votes = [
      { expertId: 'e1', decision: 'approve', reasoning: 'good' },
      { expertId: 'e2', decision: 'approve', reasoning: 'ok' },
      { expertId: 'e3', decision: 'reject', reasoning: 'bad' },
    ];
    const result = buildConsensus(results, votes as never) as Record<string, unknown>;
    expect(result.decision).toBe('approved');
    expect(result.approveCount).toBe(2);
    expect(result.rejectCount).toBe(1);
  });
});

// ============================================================================
// chainSequential
// ============================================================================

describe('chainSequential', () => {
  it('returns single result output directly', () => {
    const results = [
      makeResult({ result: { output: 'only output', durationMs: 100, status: 'success' } }),
    ];
    expect(chainSequential(results)).toBe('only output');
  });

  it('chains multiple results by order', () => {
    const results = [
      makeResult({
        expertId: 'e2',
        order: 2,
        result: { output: 'second', durationMs: 100, status: 'success' },
      }),
      makeResult({
        expertId: 'e1',
        order: 1,
        result: { output: 'first', durationMs: 100, status: 'success' },
      }),
    ];
    const result = chainSequential(results) as Record<string, unknown>;
    expect(result.finalOutput).toBe('second');
    expect((result.chain as Array<{ step: number }>)[0]!.step).toBe(1);
  });
});
