/**
 * Tests for SWE-bench instance priority sorting.
 *
 * Sorts instances by estimated difficulty to maximize early throughput:
 * - Smaller repos (Flask, Requests) before larger ones (Django, CPython)
 * - Shorter problem statements (simpler issues) first
 * - Past success rates from memory (when available)
 *
 * @module swe-bench/instance-sorter.test
 * (Source: Issue #1407 - SWE-bench parallel execution)
 */

import { describe, it, expect } from 'vitest';
import type { SWEBenchInstance } from './types.js';
import { sortByPriority, estimateDifficulty, REPO_COMPLEXITY } from './instance-sorter.js';

function makeInstance(
  overrides: Partial<SWEBenchInstance> & { instance_id: string }
): SWEBenchInstance {
  return {
    repo: 'django/django',
    base_commit: 'abc123',
    problem_statement: 'Fix the bug',
    created_at: '2024-01-01',
    ...overrides,
  };
}

describe('REPO_COMPLEXITY', () => {
  it('assigns lower scores to simpler repos', () => {
    const flask = REPO_COMPLEXITY['pallets/flask'];
    const django = REPO_COMPLEXITY['django/django'];
    const requests = REPO_COMPLEXITY['psf/requests'];
    const sympy = REPO_COMPLEXITY['sympy/sympy'];
    expect(flask).toBeDefined();
    expect(django).toBeDefined();
    expect(requests).toBeDefined();
    expect(sympy).toBeDefined();
    expect(flask!).toBeLessThan(django!);
    expect(requests!).toBeLessThan(sympy!);
  });

  it('covers all SWE-bench Lite repos', () => {
    const liteRepos = [
      'astropy/astropy',
      'django/django',
      'matplotlib/matplotlib',
      'mwaskom/seaborn',
      'pallets/flask',
      'psf/requests',
      'pydata/xarray',
      'pylint-dev/pylint',
      'pytest-dev/pytest',
      'scikit-learn/scikit-learn',
      'sphinx-doc/sphinx',
      'sympy/sympy',
    ];
    for (const repo of liteRepos) {
      expect(REPO_COMPLEXITY[repo]).toBeDefined();
    }
  });
});

describe('estimateDifficulty', () => {
  it('returns lower score for simpler repos', () => {
    const flask = makeInstance({ instance_id: 'pallets__flask-1234', repo: 'pallets/flask' });
    const django = makeInstance({ instance_id: 'django__django-5678', repo: 'django/django' });
    expect(estimateDifficulty(flask)).toBeLessThan(estimateDifficulty(django));
  });

  it('penalizes longer problem statements', () => {
    const short = makeInstance({
      instance_id: 'pallets__flask-100',
      repo: 'pallets/flask',
      problem_statement: 'Short bug description',
    });
    const long = makeInstance({
      instance_id: 'pallets__flask-101',
      repo: 'pallets/flask',
      problem_statement: 'A '.repeat(500) + 'very long description with lots of context',
    });
    expect(estimateDifficulty(short)).toBeLessThan(estimateDifficulty(long));
  });

  it('uses default complexity for unknown repos', () => {
    const unknown = makeInstance({
      instance_id: 'unknown__repo-123',
      repo: 'unknown/repo',
    });
    const score = estimateDifficulty(unknown);
    expect(score).toBeGreaterThan(0);
  });
});

describe('sortByPriority', () => {
  it('sorts easiest instances first', () => {
    const instances = [
      makeInstance({
        instance_id: 'django__django-9999',
        repo: 'django/django',
        problem_statement: 'Complex issue',
      }),
      makeInstance({
        instance_id: 'pallets__flask-100',
        repo: 'pallets/flask',
        problem_statement: 'Short',
      }),
      makeInstance({
        instance_id: 'sympy__sympy-5555',
        repo: 'sympy/sympy',
        problem_statement: 'Math problem',
      }),
    ];

    const sorted = sortByPriority(instances);
    expect(sorted[0]!.instance_id).toBe('pallets__flask-100');
    expect(sorted[2]!.instance_id).toBe('sympy__sympy-5555');
  });

  it('returns a new array without modifying input', () => {
    const instances = [
      makeInstance({ instance_id: 'django__django-1', repo: 'django/django' }),
      makeInstance({ instance_id: 'pallets__flask-1', repo: 'pallets/flask' }),
    ];
    const sorted = sortByPriority(instances);
    expect(sorted).not.toBe(instances);
    expect(instances[0]!.instance_id).toBe('django__django-1');
  });

  it('handles empty array', () => {
    expect(sortByPriority([])).toEqual([]);
  });

  it('handles single instance', () => {
    const instances = [makeInstance({ instance_id: 'a-1' })];
    expect(sortByPriority(instances)).toHaveLength(1);
  });

  it('incorporates past success rates when provided', () => {
    const instances = [
      makeInstance({ instance_id: 'django__django-100', repo: 'django/django' }),
      makeInstance({ instance_id: 'django__django-200', repo: 'django/django' }),
    ];

    // Instance 200 has past success, should sort first
    const successRates = new Map([['django__django-200', 1.0]]);
    const sorted = sortByPriority(instances, { pastSuccessRates: successRates });
    expect(sorted[0]!.instance_id).toBe('django__django-200');
  });

  it('deprioritizes instances with past failures', () => {
    const instances = [
      makeInstance({ instance_id: 'pallets__flask-100', repo: 'pallets/flask' }),
      makeInstance({ instance_id: 'pallets__flask-200', repo: 'pallets/flask' }),
    ];

    // Instance 100 failed before — sort it later
    const successRates = new Map([['pallets__flask-100', 0.0]]);
    const sorted = sortByPriority(instances, { pastSuccessRates: successRates });
    expect(sorted[0]!.instance_id).toBe('pallets__flask-200');
  });
});
