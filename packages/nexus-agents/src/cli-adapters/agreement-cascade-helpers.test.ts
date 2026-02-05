/**
 * Tests for Agreement Cascade Helpers
 * @module cli-adapters/agreement-cascade-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { CliResponse, CliName } from './types.js';
import type { StageResult } from './agreement-cascade-types.js';
import {
  tokenize,
  calculateSimilarity,
  calculateClusterSimilarity,
  clusterResponses,
  selectBestResponse,
  createDefaultCascadeStages,
} from './agreement-cascade-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeResponse(text: string): CliResponse {
  return { text, tokenCount: text.split(/\s+/).length } as CliResponse;
}

// ============================================================================
// tokenize
// ============================================================================

describe('tokenize', () => {
  it('returns normalized tokens', () => {
    const tokens = tokenize('Hello World Again');
    expect(tokens.has('hello')).toBe(true);
    expect(tokens.has('world')).toBe(true);
    expect(tokens.has('again')).toBe(true);
  });

  it('filters short tokens (< 3 chars)', () => {
    const tokens = tokenize('I am a developer');
    expect(tokens.has('developer')).toBe(true);
    expect(tokens.has('am')).toBe(false);
  });

  it('handles empty string', () => {
    expect(tokenize('').size).toBe(0);
  });

  it('normalizes special characters', () => {
    const tokens = tokenize('hello-world test_case');
    expect(tokens.has('hello')).toBe(true);
    expect(tokens.has('world')).toBe(true);
    expect(tokens.has('test_case')).toBe(true);
  });
});

// ============================================================================
// calculateSimilarity
// ============================================================================

describe('calculateSimilarity', () => {
  it('returns 1 for identical texts', () => {
    expect(calculateSimilarity('hello world test', 'hello world test')).toBe(1);
  });

  it('returns 0 for completely different texts', () => {
    expect(calculateSimilarity('alpha beta gamma', 'delta epsilon zeta')).toBe(0);
  });

  it('returns 0 for empty texts', () => {
    expect(calculateSimilarity('', 'hello')).toBe(0);
  });

  it('returns partial similarity for overlapping texts', () => {
    const sim = calculateSimilarity('hello world test', 'hello world different');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

// ============================================================================
// calculateClusterSimilarity
// ============================================================================

describe('calculateClusterSimilarity', () => {
  it('returns 1 for single model', () => {
    const responses = new Map<CliName, CliResponse>([
      ['claude' as CliName, makeResponse('hello world test')],
    ]);
    expect(calculateClusterSimilarity(['claude'] as CliName[], responses)).toBe(1);
  });

  it('calculates average pairwise similarity', () => {
    const responses = new Map<CliName, CliResponse>([
      ['claude' as CliName, makeResponse('hello world test')],
      ['gemini' as CliName, makeResponse('hello world different')],
    ]);
    const sim = calculateClusterSimilarity(['claude', 'gemini'] as CliName[], responses);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('returns 0 for empty models', () => {
    expect(calculateClusterSimilarity([], new Map())).toBe(1);
  });
});

// ============================================================================
// clusterResponses
// ============================================================================

describe('clusterResponses', () => {
  it('groups similar responses', () => {
    const responses = new Map<CliName, CliResponse>([
      ['claude' as CliName, makeResponse('the quick brown fox jumps over lazy dog')],
      ['gemini' as CliName, makeResponse('the quick brown fox jumps over lazy dog')],
      [
        'codex' as CliName,
        makeResponse('completely different topic about something else entirely'),
      ],
    ]);
    const clusters = clusterResponses(responses);
    expect(clusters.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty responses', () => {
    expect(clusterResponses(new Map())).toEqual([]);
  });

  it('creates single cluster for identical responses', () => {
    const text = 'the same response about programming with typescript and testing';
    const responses = new Map<CliName, CliResponse>([
      ['claude' as CliName, makeResponse(text)],
      ['gemini' as CliName, makeResponse(text)],
    ]);
    const clusters = clusterResponses(responses);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.models).toHaveLength(2);
  });
});

// ============================================================================
// selectBestResponse
// ============================================================================

describe('selectBestResponse', () => {
  it('returns undefined for empty history', () => {
    expect(selectBestResponse([])).toBeUndefined();
  });

  it('prefers later stages', () => {
    const stage1: StageResult = {
      stage: { name: 'fast', models: ['gemini'] as CliName[], costWeight: 1 },
      responses: new Map([['gemini' as CliName, makeResponse('short')]]),
      clusters: [],
      agreed: false,
    };
    const stage2: StageResult = {
      stage: { name: 'powerful', models: ['claude'] as CliName[], costWeight: 10 },
      responses: new Map([
        ['claude' as CliName, makeResponse('a longer and more detailed response')],
      ]),
      clusters: [],
      agreed: true,
    };
    const result = selectBestResponse([stage1, stage2]);
    expect(result?.model).toBe('claude');
  });

  it('selects longest response within a stage', () => {
    const stage: StageResult = {
      stage: { name: 'balanced', models: ['gemini', 'codex'] as CliName[], costWeight: 3 },
      responses: new Map([
        ['gemini' as CliName, makeResponse('short')],
        ['codex' as CliName, makeResponse('a much longer response with more detail')],
      ]),
      clusters: [],
      agreed: false,
    };
    const result = selectBestResponse([stage]);
    expect(result?.model).toBe('codex');
  });
});

// ============================================================================
// createDefaultCascadeStages
// ============================================================================

describe('createDefaultCascadeStages', () => {
  it('returns 3 stages', () => {
    const stages = createDefaultCascadeStages();
    expect(stages).toHaveLength(3);
  });

  it('progresses from fast to powerful', () => {
    const stages = createDefaultCascadeStages();
    expect(stages[0]?.name).toBe('fast');
    expect(stages[1]?.name).toBe('balanced');
    expect(stages[2]?.name).toBe('powerful');
  });

  it('increases cost weight', () => {
    const stages = createDefaultCascadeStages();
    expect(stages[0]!.costWeight).toBeLessThan(stages[1]!.costWeight);
    expect(stages[1]!.costWeight).toBeLessThan(stages[2]!.costWeight);
  });
});
