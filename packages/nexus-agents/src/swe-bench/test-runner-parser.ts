/**
 * nexus-agents/swe-bench - Test Runner Parser
 *
 * Parses test execution output to extract structured results.
 * Supports pytest JSON output and fallback stdout parsing.
 *
 * @module swe-bench/test-runner-parser
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { TestCaseResult } from './evaluation-harness-types.js';
import type { TestSuiteResult } from './test-runner-types.js';

// ============================================================================
// JSON Result Parsing
// ============================================================================

/**
 * Reads pytest JSON results file from the working directory.
 */
export async function readJsonResults(workDir: string): Promise<Record<string, unknown> | null> {
  const jsonPath = path.join(workDir, 'test-results.json');
  try {
    const content = await fs.readFile(jsonPath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Maps pytest outcome string to TestCaseResult status.
 */
function mapPytestOutcome(outcome: string): TestCaseResult['status'] {
  const outcomeMap: Record<string, TestCaseResult['status']> = {
    passed: 'passed',
    failed: 'failed',
    skipped: 'skipped',
    error: 'error',
    xfailed: 'skipped',
    xpassed: 'passed',
  };
  return outcomeMap[outcome] ?? 'error';
}

/**
 * Extracts summary counts from pytest JSON.
 */
function extractSummaryCounts(summary: Record<string, number> | undefined): {
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
} {
  return {
    passed: summary?.['passed'] ?? 0,
    failed: summary?.['failed'] ?? 0,
    skipped: summary?.['skipped'] ?? 0,
    errored: summary?.['error'] ?? 0,
  };
}

/**
 * Safely converts a value to string, handling objects properly.
 */
function safeToString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Transforms a single pytest test result to TestCaseResult.
 */
function transformTestResult(t: Record<string, unknown>): TestCaseResult {
  const nodeid = t['nodeid'];
  const outcome = t['outcome'];
  const duration = t['duration'];
  const longrepr = t['longrepr'];

  const testName = nodeid !== undefined && nodeid !== null ? safeToString(nodeid) : 'unknown';
  const outcomeStr = outcome !== undefined && outcome !== null ? safeToString(outcome) : 'error';

  const base: TestCaseResult = {
    testName: testName || 'unknown',
    status: mapPytestOutcome(outcomeStr || 'error'),
    durationMs: Math.round(Number(duration ?? 0) * 1000),
  };

  if (longrepr !== undefined && longrepr !== null) {
    return { ...base, errorMessage: safeToString(longrepr) };
  }
  return base;
}

/**
 * Parses pytest JSON results into TestSuiteResult.
 */
export function parseJsonResults(
  json: Record<string, unknown>,
  output: string,
  durationMs: number
): TestSuiteResult {
  const summary = json['summary'] as Record<string, number> | undefined;
  const tests = json['tests'] as Array<Record<string, unknown>> | undefined;

  const counts = extractSummaryCounts(summary);
  const total = counts.passed + counts.failed + counts.skipped + counts.errored;
  const testResults: TestCaseResult[] = (tests ?? []).map(transformTestResult);

  return {
    success: counts.failed === 0 && counts.errored === 0,
    status: counts.failed > 0 || counts.errored > 0 ? 'failed' : 'passed',
    tests: testResults,
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    errored: counts.errored,
    total,
    durationMs,
    output,
  };
}

// ============================================================================
// Stdout Result Parsing
// ============================================================================

/**
 * Parses test results from pytest stdout output (fallback).
 */
export function parseStdoutResults(output: string, durationMs: number): TestSuiteResult {
  // Parse pytest-style summary line: "X passed, Y failed, Z skipped"
  const summaryMatch = output.match(
    /(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?/
  );

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  if (summaryMatch) {
    passed = parseInt(summaryMatch[1] ?? '0', 10);
    failed = parseInt(summaryMatch[2] ?? '0', 10);
    skipped = parseInt(summaryMatch[3] ?? '0', 10);
  }

  const total = passed + failed + skipped;
  const success = failed === 0 && total > 0;

  return {
    success,
    status: success ? 'passed' : 'failed',
    tests: [],
    passed,
    failed,
    skipped,
    errored: 0,
    total,
    durationMs,
    output,
  };
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parses test results from output, trying JSON first, then stdout.
 */
export async function parseTestResults(
  output: string,
  startTime: number,
  workDir: string
): Promise<TestSuiteResult> {
  const durationMs = Date.now() - startTime;

  // Try to read JSON results file
  const jsonResults = await readJsonResults(workDir);
  if (jsonResults !== null) {
    return parseJsonResults(jsonResults, output, durationMs);
  }

  // Fallback to parsing stdout
  return parseStdoutResults(output, durationMs);
}
