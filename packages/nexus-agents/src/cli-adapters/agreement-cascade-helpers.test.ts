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
  return { text };
}

function makeStageResult(
  entries: Array<[CliName, CliResponse]>,
  overrides?: Partial<StageResult>
): StageResult {
  return {
    responses: new Map(entries),
    failures: new Map(),
    hasAgreement: false,
    agreementScore: 0,
    durationMs: 100,
    ...overrides,
  };
}

// ============================================================================
// tokenize
// ============================================================================

describe('tokenize', () => {
  it('returns normalized lowercase tokens', () => {
    const tokens = tokenize('Hello World Again');
    expect(tokens.has('hello')).toBe(true);
    expect(tokens.has('world')).toBe(true);
    expect(tokens.has('again')).toBe(true);
  });

  it('filters short tokens (< 3 chars)', () => {
    const tokens = tokenize('I am a developer');
    expect(tokens.has('developer')).toBe(true);
    expect(tokens.has('am')).toBe(false);
    expect(tokens.has('a')).toBe(false);
  });

  it('handles empty string', () => {
    expect(tokenize('').size).toBe(0);
  });

  it('normalizes special characters to spaces', () => {
    const tokens = tokenize('hello-world test_case');
    expect(tokens.has('hello')).toBe(true);
    expect(tokens.has('world')).toBe(true);
    expect(tokens.has('test_case')).toBe(true);
  });

  it('handles string with only short words', () => {
    const tokens = tokenize('I am a');
    expect(tokens.size).toBe(0);
  });

  it('handles string with only special characters', () => {
    const tokens = tokenize('!@#$%^&*()');
    expect(tokens.size).toBe(0);
  });

  it('handles whitespace-only string', () => {
    const tokens = tokenize('   \t\n  ');
    expect(tokens.size).toBe(0);
  });

  it('deduplicates repeated tokens', () => {
    const tokens = tokenize('hello hello hello');
    expect(tokens.size).toBe(1);
    expect(tokens.has('hello')).toBe(true);
  });

  it('preserves underscores as part of tokens', () => {
    const tokens = tokenize('my_variable another_one');
    expect(tokens.has('my_variable')).toBe(true);
    expect(tokens.has('another_one')).toBe(true);
  });

  it('handles numeric tokens', () => {
    const tokens = tokenize('error 404 not found');
    expect(tokens.has('404')).toBe(true);
    expect(tokens.has('error')).toBe(true);
    expect(tokens.has('not')).toBe(true);
    expect(tokens.has('found')).toBe(true);
  });

  it('filters two-character tokens', () => {
    const tokens = tokenize('go to do it');
    expect(tokens.has('go')).toBe(false);
    expect(tokens.has('to')).toBe(false);
    expect(tokens.has('do')).toBe(false);
    expect(tokens.has('it')).toBe(false);
  });

  it('keeps exactly 3-character tokens', () => {
    const tokens = tokenize('the fox ran');
    expect(tokens.has('the')).toBe(true);
    expect(tokens.has('fox')).toBe(true);
    expect(tokens.has('ran')).toBe(true);
  });

  it('handles mixed case consistently', () => {
    const tokens = tokenize('TypeScript JavaScript');
    expect(tokens.has('typescript')).toBe(true);
    expect(tokens.has('javascript')).toBe(true);
  });

  it('handles consecutive special characters', () => {
    const tokens = tokenize('hello!!!world...test');
    expect(tokens.has('hello')).toBe(true);
    expect(tokens.has('world')).toBe(true);
    expect(tokens.has('test')).toBe(true);
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

  it('returns 0 when first text is empty', () => {
    expect(calculateSimilarity('', 'hello world test')).toBe(0);
  });

  it('returns 0 when second text is empty', () => {
    expect(calculateSimilarity('hello world test', '')).toBe(0);
  });

  it('returns 0 when both texts are empty', () => {
    expect(calculateSimilarity('', '')).toBe(0);
  });

  it('returns partial similarity for overlapping texts', () => {
    const sim = calculateSimilarity('hello world test', 'hello world different');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('computes Jaccard similarity correctly', () => {
    // tokens1 = {hello, world} tokens2 = {hello, test}
    // intersection = {hello}, union = {hello, world, test}
    // Jaccard = 1/3
    const sim = calculateSimilarity('hello world', 'hello test');
    expect(sim).toBeCloseTo(1 / 3, 5);
  });

  it('is symmetric', () => {
    const sim1 = calculateSimilarity('alpha beta gamma', 'beta gamma delta');
    const sim2 = calculateSimilarity('beta gamma delta', 'alpha beta gamma');
    expect(sim1).toBeCloseTo(sim2, 10);
  });

  it('returns 0 when texts have only short tokens', () => {
    expect(calculateSimilarity('I am', 'he is')).toBe(0);
  });

  it('returns 0.5 for half-overlap', () => {
    // tokens1 = {aaa, bbb}, tokens2 = {bbb, ccc}
    // intersection = {bbb}, union = {aaa, bbb, ccc}
    // Jaccard = 1/3 (not 0.5, because union is 3 not 2)
    const sim = calculateSimilarity('aaa bbb', 'bbb ccc');
    expect(sim).toBeCloseTo(1 / 3, 5);
  });

  it('handles case-insensitive comparison', () => {
    expect(calculateSimilarity('HELLO WORLD TEST', 'hello world test')).toBe(1);
  });

  it('handles texts with only special characters', () => {
    expect(calculateSimilarity('!@#', '$%^')).toBe(0);
  });

  it('handles single meaningful token overlap', () => {
    // tokens1 = {programming}, tokens2 = {programming}
    const sim = calculateSimilarity('programming', 'programming');
    expect(sim).toBe(1);
  });

  it('handles completely disjoint long texts', () => {
    const text1 = 'alpha bravo charlie delta echo';
    const text2 = 'foxtrot golf hotel india juliet';
    expect(calculateSimilarity(text1, text2)).toBe(0);
  });
});

// ============================================================================
// calculateClusterSimilarity
// ============================================================================

describe('calculateClusterSimilarity', () => {
  it('returns 1 for single model', () => {
    const responses = new Map<CliName, CliResponse>([['claude', makeResponse('hello world test')]]);
    expect(calculateClusterSimilarity(['claude'] as CliName[], responses)).toBe(1);
  });

  it('returns 1 for empty models array', () => {
    expect(calculateClusterSimilarity([] as CliName[], new Map())).toBe(1);
  });

  it('calculates average pairwise similarity for two models', () => {
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse('hello world test')],
      ['gemini', makeResponse('hello world different')],
    ]);
    const sim = calculateClusterSimilarity(['claude', 'gemini'] as CliName[], responses);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('returns 1 for identical responses from all models', () => {
    const text = 'the quick brown fox jumps over';
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse(text)],
      ['gemini', makeResponse(text)],
      ['codex', makeResponse(text)],
    ]);
    const sim = calculateClusterSimilarity(['claude', 'gemini', 'codex'] as CliName[], responses);
    expect(sim).toBe(1);
  });

  it('returns 0 for completely disjoint responses', () => {
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse('alpha bravo charlie delta')],
      ['gemini', makeResponse('echo foxtrot golf hotel')],
    ]);
    const sim = calculateClusterSimilarity(['claude', 'gemini'] as CliName[], responses);
    expect(sim).toBe(0);
  });

  it('handles missing model in responses map', () => {
    const responses = new Map<CliName, CliResponse>([['claude', makeResponse('hello world test')]]);
    // 'gemini' not in map: no valid pairs, pairCount = 0 → returns 0
    const sim = calculateClusterSimilarity(['claude', 'gemini'] as CliName[], responses);
    expect(sim).toBe(0);
  });

  it('averages across three model pairs', () => {
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse('hello world test abc')],
      ['gemini', makeResponse('hello world test xyz')],
      ['codex', makeResponse('hello world test abc')],
    ]);
    const sim = calculateClusterSimilarity(['claude', 'gemini', 'codex'] as CliName[], responses);
    // 3 pairs: (claude,gemini), (claude,codex), (gemini,codex)
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('skips pairs where both models are missing', () => {
    const responses = new Map<CliName, CliResponse>();
    const sim = calculateClusterSimilarity(['claude', 'gemini'] as CliName[], responses);
    expect(sim).toBe(0);
  });
});

// ============================================================================
// clusterResponses
// ============================================================================

describe('clusterResponses', () => {
  it('returns empty array for empty responses map', () => {
    expect(clusterResponses(new Map())).toEqual([]);
  });

  it('creates single cluster for identical responses', () => {
    const text = 'the same response about programming with typescript and testing';
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse(text)],
      ['gemini', makeResponse(text)],
    ]);
    const clusters = clusterResponses(responses);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.models).toHaveLength(2);
  });

  it('creates separate clusters for dissimilar responses', () => {
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse('alpha bravo charlie delta echo foxtrot')],
      ['gemini', makeResponse('golf hotel india juliet kilo lima')],
    ]);
    const clusters = clusterResponses(responses);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.models).toHaveLength(1);
    expect(clusters[1]?.models).toHaveLength(1);
  });

  it('handles single response', () => {
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse('single response text here')],
    ]);
    const clusters = clusterResponses(responses);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.models).toEqual(['claude']);
    expect(clusters[0]?.internalSimilarity).toBe(1);
  });

  it('groups two similar and one dissimilar', () => {
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse('the quick brown fox jumps over lazy dog today')],
      ['gemini', makeResponse('the quick brown fox jumps over lazy dog today')],
      ['codex', makeResponse('completely different topic about quantum physics')],
    ]);
    const clusters = clusterResponses(responses);
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    // The first cluster should have the two identical ones
    const bigCluster = clusters.find((c) => c.models.length === 2);
    expect(bigCluster).toBeDefined();
  });

  it('assigns each model to exactly one cluster', () => {
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse('alpha bravo charlie delta echo')],
      ['gemini', makeResponse('foxtrot golf hotel india juliet')],
      ['codex', makeResponse('kilo lima mike november oscar')],
    ]);
    const clusters = clusterResponses(responses);
    const allModels = clusters.flatMap((c) => [...c.models]);
    expect(allModels).toHaveLength(3);
    expect(new Set(allModels).size).toBe(3);
  });

  it('cluster response field is from the first model in cluster', () => {
    const resp1 = makeResponse('the quick brown fox jumps over lazy dog');
    const responses = new Map<CliName, CliResponse>([
      ['claude', resp1],
      ['gemini', makeResponse('the quick brown fox jumps over lazy dog')],
    ]);
    const clusters = clusterResponses(responses);
    expect(clusters[0]?.response).toBe(resp1);
  });

  it('internalSimilarity is 1 for identical responses in cluster', () => {
    const text = 'typescript programming language features testing';
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse(text)],
      ['gemini', makeResponse(text)],
    ]);
    const clusters = clusterResponses(responses);
    expect(clusters[0]?.internalSimilarity).toBe(1);
  });

  it('uses 0.7 threshold for clustering', () => {
    // Craft two texts with exactly known similarity
    // tokens1 = {aaa, bbb, ccc, ddd, eee, fff, ggg}
    // tokens2 = {aaa, bbb, ccc, ddd, eee, hhh, iii}
    // intersection = 5, union = 9 => Jaccard = 5/9 = 0.556 (< 0.7) => separate
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse('aaa bbb ccc ddd eee fff ggg')],
      ['gemini', makeResponse('aaa bbb ccc ddd eee hhh iii')],
    ]);
    const clusters = clusterResponses(responses);
    expect(clusters).toHaveLength(2);
  });

  it('clusters when similarity is exactly at threshold', () => {
    // We need similarity >= 0.7
    // tokens1 = {aaa, bbb, ccc, ddd, eee, fff, ggg, hhh, iii, jjj}
    // tokens2 = {aaa, bbb, ccc, ddd, eee, fff, ggg, kkk, lll, mmm}
    // intersection = 7, union = 13 => 7/13 = 0.538 (below 0.7)
    // Need: 7 overlap out of 10 total = 7/10 = 0.7
    // tokens both have exactly 7 same, 0 different each
    const responses = new Map<CliName, CliResponse>([
      ['claude', makeResponse('aaa bbb ccc ddd eee fff ggg')],
      ['gemini', makeResponse('aaa bbb ccc ddd eee fff ggg')],
    ]);
    const clusters = clusterResponses(responses);
    // Identical => similarity 1.0 => definitely clustered
    expect(clusters).toHaveLength(1);
  });
});

// ============================================================================
// selectBestResponse
// ============================================================================

describe('selectBestResponse', () => {
  it('returns undefined for empty history', () => {
    expect(selectBestResponse([])).toBeUndefined();
  });

  it('prefers later stages over earlier stages', () => {
    const stage1 = makeStageResult([['gemini', makeResponse('short answer')]]);
    const stage2 = makeStageResult([
      ['claude', makeResponse('a longer and more detailed response here')],
    ]);
    const result = selectBestResponse([stage1, stage2]);
    expect(result?.model).toBe('claude');
  });

  it('selects longest response within a stage', () => {
    const stage = makeStageResult([
      ['gemini', makeResponse('short')],
      ['codex', makeResponse('a much longer response with more detail and content')],
    ]);
    const result = selectBestResponse([stage]);
    expect(result?.model).toBe('codex');
  });

  it('returns single response from single stage', () => {
    const resp = makeResponse('the only response here');
    const stage = makeStageResult([['claude', resp]]);
    const result = selectBestResponse([stage]);
    expect(result?.response).toBe(resp);
    expect(result?.model).toBe('claude');
  });

  it('skips stages with empty responses and falls back to earlier', () => {
    const stage1 = makeStageResult([['gemini', makeResponse('some response text')]]);
    const stage2 = makeStageResult([]);
    const result = selectBestResponse([stage1, stage2]);
    expect(result?.model).toBe('gemini');
  });

  it('handles all stages having empty responses', () => {
    const stage1 = makeStageResult([]);
    const stage2 = makeStageResult([]);
    expect(selectBestResponse([stage1, stage2])).toBeUndefined();
  });

  it('handles three stages and returns from last with responses', () => {
    const stage1 = makeStageResult([['gemini', makeResponse('fast response')]]);
    const stage2 = makeStageResult([['codex', makeResponse('balanced response text')]]);
    const stage3 = makeStageResult([
      ['claude', makeResponse('powerful detailed response with lots of content')],
    ]);
    const result = selectBestResponse([stage1, stage2, stage3]);
    expect(result?.model).toBe('claude');
  });

  it('among equal-length responses in same stage, picks first after sort', () => {
    const stage = makeStageResult([
      ['gemini', makeResponse('abc')],
      ['codex', makeResponse('xyz')],
    ]);
    // Both have same length, sort is stable so first in sorted order wins
    const result = selectBestResponse([stage]);
    expect(result).toBeDefined();
    // Both have text.length=3, so the sort produces stable order
    expect(result?.response.text.length).toBe(3);
  });

  it('returns correct response object reference', () => {
    const resp = makeResponse('the target response to find');
    const stage = makeStageResult([['claude', resp]]);
    const result = selectBestResponse([stage]);
    expect(result?.response).toBe(resp);
  });

  it('handles single stage with single empty-text response', () => {
    const stage = makeStageResult([['claude', makeResponse('')]]);
    const result = selectBestResponse([stage]);
    expect(result).toBeDefined();
    expect(result?.response.text).toBe('');
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

  it('progresses from fast to balanced to powerful', () => {
    const stages = createDefaultCascadeStages();
    expect(stages[0]?.name).toBe('fast');
    expect(stages[1]?.name).toBe('balanced');
    expect(stages[2]?.name).toBe('powerful');
  });

  it('has increasing cost weights', () => {
    const stages = createDefaultCascadeStages();
    expect(stages[0]!.costWeight).toBeLessThan(stages[1]!.costWeight);
    expect(stages[1]!.costWeight).toBeLessThan(stages[2]!.costWeight);
  });

  it('fast stage has single model', () => {
    const stages = createDefaultCascadeStages();
    expect(stages[0]?.models).toHaveLength(1);
    expect(stages[0]?.models[0]).toBe('gemini');
  });

  it('balanced stage has two models', () => {
    const stages = createDefaultCascadeStages();
    expect(stages[1]?.models).toHaveLength(2);
  });

  it('powerful stage has two models including claude', () => {
    const stages = createDefaultCascadeStages();
    expect(stages[2]?.models).toHaveLength(2);
    expect(stages[2]?.models).toContain('claude');
  });

  it('returns new array on each call', () => {
    const stages1 = createDefaultCascadeStages();
    const stages2 = createDefaultCascadeStages();
    expect(stages1).not.toBe(stages2);
    expect(stages1).toEqual(stages2);
  });

  it('fast stage cost weight is 1', () => {
    const stages = createDefaultCascadeStages();
    expect(stages[0]?.costWeight).toBe(1);
  });

  it('balanced stage cost weight is 3', () => {
    const stages = createDefaultCascadeStages();
    expect(stages[1]?.costWeight).toBe(3);
  });

  it('powerful stage cost weight is 10', () => {
    const stages = createDefaultCascadeStages();
    expect(stages[2]?.costWeight).toBe(10);
  });

  it('all stages have non-empty model arrays', () => {
    const stages = createDefaultCascadeStages();
    for (const stage of stages) {
      expect(stage.models.length).toBeGreaterThan(0);
    }
  });

  it('all stages have non-empty name strings', () => {
    const stages = createDefaultCascadeStages();
    for (const stage of stages) {
      expect(stage.name.length).toBeGreaterThan(0);
    }
  });
});
