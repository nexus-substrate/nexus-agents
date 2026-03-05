/**
 * Tests for SWE-bench memory enrichment.
 *
 * @module swe-bench/memory-enrichment.test
 */

import { describe, it, expect } from 'vitest';
import type { SessionLearning } from '../context/session-memory-types.js';
import type { SWEBenchInstance } from './types.js';
import {
  buildEnrichedPrompt,
  extractRepoName,
  extractPastSuccessRates,
} from './memory-enrichment.js';
import { SWE_BENCH_SYSTEM_PROMPT } from './prompt-template.js';

const makeInstance = (id: string): SWEBenchInstance => ({
  instance_id: id,
  repo: 'django/django',
  base_commit: 'abc123',
  problem_statement: 'Test problem',
  created_at: '2024-01-01',
});

describe('extractRepoName', () => {
  it('extracts repo from standard instance ID', () => {
    expect(extractRepoName('django__django-12345')).toBe('django/django');
  });

  it('handles multi-hyphen instance IDs', () => {
    expect(extractRepoName('scikit__learn-api-42')).toBe('scikit/learn-api');
  });
});

describe('buildEnrichedPrompt', () => {
  const instance = makeInstance('django__django-12345');

  it('returns base prompt when no learnings', () => {
    const result = buildEnrichedPrompt([], instance);
    expect(result).toBe(SWE_BENCH_SYSTEM_PROMPT);
  });

  it('enriches prompt with matching repo learnings', () => {
    const learnings: SessionLearning[] = [
      {
        pattern: 'Django models need migrations after field changes',
        context: 'django/django',
        confidence: 0.9,
      },
    ];

    const result = buildEnrichedPrompt(learnings, instance);
    expect(result).toContain('Learnings from Prior Runs');
    expect(result).toContain('Django models need migrations');
    expect(result).toContain(SWE_BENCH_SYSTEM_PROMPT);
  });

  it('includes general swe-bench learnings', () => {
    const learnings: SessionLearning[] = [
      {
        pattern: 'Always check test files for expected behavior',
        context: 'swe-bench',
        confidence: 0.8,
      },
    ];

    const result = buildEnrichedPrompt(learnings, instance);
    expect(result).toContain('Always check test files');
  });

  it('filters out unrelated repo learnings', () => {
    const learnings: SessionLearning[] = [
      { pattern: 'Flask uses Werkzeug routing', context: 'pallets/flask', confidence: 0.9 },
    ];

    const result = buildEnrichedPrompt(learnings, instance);
    expect(result).toBe(SWE_BENCH_SYSTEM_PROMPT);
  });

  it('limits to 10 learnings max', () => {
    const learnings: SessionLearning[] = Array.from({ length: 15 }, (_, i) => ({
      pattern: `Learning ${String(i)}`,
      context: 'django/django',
      confidence: 0.8,
    }));

    const result = buildEnrichedPrompt(learnings, instance);
    expect(result).toContain('Learning 9');
    expect(result).not.toContain('Learning 10');
  });
});

describe('extractPastSuccessRates', () => {
  it('extracts success from solved learnings', () => {
    const learnings: SessionLearning[] = [
      {
        pattern: 'Instance django__django-12345 solved in 30s with 5000 tokens',
        context: 'django/django',
        confidence: 0.8,
      },
    ];
    const rates = extractPastSuccessRates(learnings);
    expect(rates.get('django__django-12345')).toBe(1.0);
  });

  it('extracts failure from non-solved learnings', () => {
    const learnings: SessionLearning[] = [
      {
        pattern: 'Instance django__django-99999 timed out after 300s',
        context: 'django/django',
        confidence: 0.5,
      },
    ];
    const rates = extractPastSuccessRates(learnings);
    expect(rates.get('django__django-99999')).toBe(0.0);
  });

  it('returns empty map for no instance learnings', () => {
    const learnings: SessionLearning[] = [
      { pattern: 'General learning about Django', context: 'swe-bench', confidence: 0.8 },
    ];
    const rates = extractPastSuccessRates(learnings);
    expect(rates.size).toBe(0);
  });

  it('handles multiple instances', () => {
    const learnings: SessionLearning[] = [
      {
        pattern: 'Instance pallets__flask-100 solved in 10s with 2000 tokens',
        context: 'pallets/flask',
        confidence: 0.8,
      },
      {
        pattern: 'Instance sympy__sympy-200 failed with timeout',
        context: 'sympy/sympy',
        confidence: 0.5,
      },
      {
        pattern: 'Instance django__django-300 solved in 45s with 8000 tokens',
        context: 'django/django',
        confidence: 0.8,
      },
    ];
    const rates = extractPastSuccessRates(learnings);
    expect(rates.size).toBe(3);
    expect(rates.get('pallets__flask-100')).toBe(1.0);
    expect(rates.get('sympy__sympy-200')).toBe(0.0);
    expect(rates.get('django__django-300')).toBe(1.0);
  });
});
