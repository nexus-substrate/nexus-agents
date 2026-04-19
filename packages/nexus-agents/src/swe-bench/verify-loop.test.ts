/**
 * Tests for post-patch verification loop (#2032).
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_VERIFY_RETRIES,
  buildRetryHint,
  buildVerifyOutcome,
  classifyPatchFailure,
  shouldRetry,
} from './verify-loop.js';

describe('classifyPatchFailure', () => {
  it('recognizes patch_not_applicable from git/patch output', () => {
    const r = classifyPatchFailure('error: patch does not apply', '');
    expect(r.category).toBe('patch_not_applicable');
    expect(r.summary).toContain('does not apply');
  });

  it('recognizes syntax_error with the Python message', () => {
    const r = classifyPatchFailure(
      '',
      '  File "foo.py", line 12\n    def foo(:\n           ^\nSyntaxError: invalid syntax'
    );
    expect(r.category).toBe('syntax_error');
    expect(r.summary).toContain('invalid syntax');
  });

  it('recognizes timeout', () => {
    const r = classifyPatchFailure('Test timed out after 300s', '');
    expect(r.category).toBe('timeout');
  });

  it('recognizes missing dependency and extracts module name', () => {
    const r = classifyPatchFailure("ModuleNotFoundError: No module named 'requests'", '');
    expect(r.category).toBe('missing_dependency');
    expect(r.summary).toContain('requests');
  });

  it('recognizes generic runtime error', () => {
    const r = classifyPatchFailure('TypeError: unsupported operand type(s)', '');
    expect(r.category).toBe('runtime_error');
    expect(r.summary).toContain('TypeError');
  });

  it('recognizes pytest test failures and extracts test ids', () => {
    const stdout = 'FAILED tests/test_foo.py::test_bar\nFAILED tests/test_foo.py::test_baz';
    const r = classifyPatchFailure('', stdout);
    expect(r.category).toBe('test_failure');
    expect(r.affectedTests).toContain('tests/test_foo.py::test_bar');
    expect(r.affectedTests).toContain('tests/test_foo.py::test_baz');
  });

  it('falls back to unknown when no pattern matches', () => {
    const r = classifyPatchFailure('strange error', 'more output');
    expect(r.category).toBe('unknown');
    expect(r.summary).toContain('strange error');
  });

  it('handles completely empty output', () => {
    const r = classifyPatchFailure('', '');
    expect(r.category).toBe('unknown');
    expect(r.summary).toBe('No failure details captured');
  });
});

describe('shouldRetry', () => {
  it('respects the hard retry cap', () => {
    expect(shouldRetry('test_failure', 2, 2)).toBe(false);
    expect(shouldRetry('test_failure', 5, 2)).toBe(false);
  });

  it('allows retry on recoverable categories', () => {
    for (const cat of [
      'patch_not_applicable',
      'syntax_error',
      'missing_dependency',
      'test_failure',
      'runtime_error',
      'incomplete_fix',
    ] as const) {
      expect(shouldRetry(cat, 0, 2)).toBe(true);
      expect(shouldRetry(cat, 1, 2)).toBe(true);
    }
  });

  it('refuses retry on timeout', () => {
    expect(shouldRetry('timeout', 0, 2)).toBe(false);
  });

  it('gives exactly one retry for uncertain categories', () => {
    expect(shouldRetry('wrong_file_modified', 0, 2)).toBe(true);
    expect(shouldRetry('wrong_file_modified', 1, 2)).toBe(false);
    expect(shouldRetry('unknown', 0, 2)).toBe(true);
    expect(shouldRetry('unknown', 1, 2)).toBe(false);
  });

  it('uses DEFAULT_MAX_VERIFY_RETRIES when cap is not provided', () => {
    expect(DEFAULT_MAX_VERIFY_RETRIES).toBe(2);
    expect(shouldRetry('test_failure', 1)).toBe(true);
    expect(shouldRetry('test_failure', 2)).toBe(false);
  });
});

describe('buildRetryHint', () => {
  it('includes category, summary, and iteration counter', () => {
    const hint = buildRetryHint(
      {
        category: 'test_failure',
        summary: 'Tests still failing: test_add',
        affectedTests: ['test_math.py::test_add'],
      },
      0,
      2
    );
    expect(hint).toContain('Verification attempt 1/3 failed');
    expect(hint).toContain('Category: test_failure');
    expect(hint).toContain('Summary: Tests still failing: test_add');
    expect(hint).toContain('test_math.py::test_add');
    expect(hint).toContain('Fix the root cause');
  });

  it('truncates affected-test list to 5 with ellipsis', () => {
    const tests = Array.from({ length: 10 }, (_, i) => `t::case${String(i)}`);
    const hint = buildRetryHint(
      { category: 'test_failure', summary: 's', affectedTests: tests },
      0
    );
    expect(hint).toContain('Affected tests (10):');
    expect(hint).toContain('...');
  });

  it('omits affected-tests line when there are none', () => {
    const hint = buildRetryHint({ category: 'timeout', summary: 'too slow', affectedTests: [] }, 0);
    expect(hint).not.toContain('Affected tests');
  });
});

describe('buildVerifyOutcome', () => {
  it('returns ok=true with no classification on pass', () => {
    const outcome = buildVerifyOutcome({
      passed: true,
      iteration: 0,
      stderr: '',
      stdout: 'PASSED',
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.willRetry).toBe(false);
    expect(outcome.classification).toBeUndefined();
    expect(outcome.retryHint).toBeUndefined();
  });

  it('classifies and schedules retry on failure with room left', () => {
    const outcome = buildVerifyOutcome({
      passed: false,
      iteration: 0,
      stderr: 'patch does not apply',
      stdout: '',
      maxRetries: 2,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.classification?.category).toBe('patch_not_applicable');
    expect(outcome.willRetry).toBe(true);
    expect(outcome.retryHint).toContain('patch_not_applicable');
  });

  it('classifies but does NOT retry when cap reached', () => {
    const outcome = buildVerifyOutcome({
      passed: false,
      iteration: 2,
      stderr: 'FAILED tests/test_x.py::test_y',
      stdout: '',
      maxRetries: 2,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.willRetry).toBe(false);
    expect(outcome.retryHint).toBeDefined();
  });

  it('never retries timeout even at iteration 0', () => {
    const outcome = buildVerifyOutcome({
      passed: false,
      iteration: 0,
      stderr: 'Test timed out after 300s',
      stdout: '',
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.classification?.category).toBe('timeout');
    expect(outcome.willRetry).toBe(false);
  });
});
