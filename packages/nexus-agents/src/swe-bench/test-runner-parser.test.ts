/**
 * Tests for test-runner-parser.ts
 *
 * Covers pytest JSON parsing, stdout fallback parsing,
 * outcome mapping, and summary extraction.
 */

import { describe, it, expect } from 'vitest';
import { parseJsonResults, parseStdoutResults } from './test-runner-parser.js';

// ============================================================================
// parseJsonResults
// ============================================================================

describe('parseJsonResults', () => {
  it('parses JSON with all passing tests', () => {
    const json = {
      summary: { passed: 3 },
      tests: [
        { nodeid: 'test_a.py::test_one', outcome: 'passed', duration: 0.5 },
        { nodeid: 'test_a.py::test_two', outcome: 'passed', duration: 0.3 },
        { nodeid: 'test_a.py::test_three', outcome: 'passed', duration: 0.1 },
      ],
    };
    const result = parseJsonResults(json, 'output text', 1000);
    expect(result.success).toBe(true);
    expect(result.status).toBe('passed');
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.total).toBe(3);
    expect(result.tests).toHaveLength(3);
  });

  it('parses JSON with failures', () => {
    const json = {
      summary: { passed: 1, failed: 2 },
      tests: [
        { nodeid: 'test_a.py::test_ok', outcome: 'passed', duration: 0.1 },
        {
          nodeid: 'test_a.py::test_fail',
          outcome: 'failed',
          duration: 0.2,
          longrepr: 'AssertionError',
        },
        { nodeid: 'test_a.py::test_err', outcome: 'failed', duration: 0.1, longrepr: 'TypeError' },
      ],
    };
    const result = parseJsonResults(json, '', 500);
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
  });

  it('includes error messages from longrepr', () => {
    const json = {
      summary: { failed: 1 },
      tests: [
        {
          nodeid: 'test.py::test_x',
          outcome: 'failed',
          duration: 0.1,
          longrepr: 'AssertionError: expected 1 to be 2',
        },
      ],
    };
    const result = parseJsonResults(json, '', 100);
    expect(result.tests[0]?.errorMessage).toContain('AssertionError');
  });

  it('handles skipped and errored tests', () => {
    const json = {
      summary: { passed: 1, skipped: 2, error: 1 },
      tests: [
        { nodeid: 'test.py::test_a', outcome: 'passed', duration: 0.1 },
        { nodeid: 'test.py::test_b', outcome: 'skipped', duration: 0 },
        { nodeid: 'test.py::test_c', outcome: 'skipped', duration: 0 },
        { nodeid: 'test.py::test_d', outcome: 'error', duration: 0.01 },
      ],
    };
    const result = parseJsonResults(json, '', 200);
    expect(result.success).toBe(false);
    expect(result.skipped).toBe(2);
    expect(result.errored).toBe(1);
  });

  it('maps xfailed to skipped and xpassed to passed', () => {
    const json = {
      summary: {},
      tests: [
        { nodeid: 'test.py::test_xf', outcome: 'xfailed', duration: 0 },
        { nodeid: 'test.py::test_xp', outcome: 'xpassed', duration: 0 },
      ],
    };
    const result = parseJsonResults(json, '', 100);
    expect(result.tests[0]?.status).toBe('skipped');
    expect(result.tests[1]?.status).toBe('passed');
  });

  it('handles missing summary', () => {
    const json = { tests: [] };
    const result = parseJsonResults(json, '', 100);
    expect(result.total).toBe(0);
    expect(result.success).toBe(true);
  });

  it('handles missing tests array', () => {
    const json = { summary: { passed: 5 } };
    const result = parseJsonResults(json, '', 100);
    expect(result.passed).toBe(5);
    expect(result.tests).toHaveLength(0);
  });

  it('converts duration from seconds to milliseconds', () => {
    const json = {
      summary: { passed: 1 },
      tests: [{ nodeid: 'test.py::test_a', outcome: 'passed', duration: 1.5 }],
    };
    const result = parseJsonResults(json, '', 100);
    expect(result.tests[0]?.durationMs).toBe(1500);
  });

  it('uses overall durationMs from parameter', () => {
    const result = parseJsonResults({ summary: {}, tests: [] }, '', 42);
    expect(result.durationMs).toBe(42);
  });

  it('handles unknown outcome as error', () => {
    const json = {
      tests: [{ nodeid: 'test.py::test_a', outcome: 'broken' }],
    };
    const result = parseJsonResults(json, '', 100);
    expect(result.tests[0]?.status).toBe('error');
  });

  it('handles missing nodeid gracefully', () => {
    const json = {
      tests: [{ outcome: 'passed', duration: 0.1 }],
    };
    const result = parseJsonResults(json, '', 100);
    expect(result.tests[0]?.testName).toBe('unknown');
  });
});

// ============================================================================
// parseStdoutResults
// ============================================================================

describe('parseStdoutResults', () => {
  it('parses standard pytest summary line', () => {
    const output = '=== 10 passed, 2 failed, 1 skipped in 5.5s ===';
    const result = parseStdoutResults(output, 5500);
    expect(result.passed).toBe(10);
    expect(result.failed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.total).toBe(13);
    expect(result.success).toBe(false);
  });

  it('parses passed-only summary', () => {
    const output = '=== 5 passed in 1.0s ===';
    const result = parseStdoutResults(output, 1000);
    expect(result.passed).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.success).toBe(true);
  });

  it('returns empty results for unparseable output', () => {
    const result = parseStdoutResults('no test info here', 100);
    expect(result.total).toBe(0);
    expect(result.success).toBe(false);
  });

  it('uses provided durationMs', () => {
    const result = parseStdoutResults('5 passed', 1234);
    expect(result.durationMs).toBe(1234);
  });

  it('returns empty tests array', () => {
    const result = parseStdoutResults('3 passed', 100);
    expect(result.tests).toEqual([]);
  });

  it('preserves original output', () => {
    const output = 'some test output\n5 passed in 1s';
    const result = parseStdoutResults(output, 100);
    expect(result.output).toBe(output);
  });

  it('handles passed and failed without skipped', () => {
    const output = '3 passed, 1 failed in 2.0s';
    const result = parseStdoutResults(output, 2000);
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
  });
});
