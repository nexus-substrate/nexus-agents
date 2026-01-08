/**
 * Tests for Self-Eval CLI command.
 * (Source: Issue #140)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseOptions, evaluateCommand } from './self-eval.js';

// Mock the logger to prevent output contamination
vi.mock('../core/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/index.js')>();
  return {
    ...actual,
    createLogger: () => ({
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    }),
  };
});

// ============================================================================
// Test Setup
// ============================================================================

// Mock stdout/stderr
const mockStdout: string[] = [];
const mockStderr: string[] = [];

beforeEach(() => {
  mockStdout.length = 0;
  mockStderr.length = 0;

  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    if (typeof chunk === 'string') {
      mockStdout.push(chunk);
    }
    return true;
  });

  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    if (typeof chunk === 'string') {
      mockStderr.push(chunk);
    }
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// parseOptions Tests
// ============================================================================

describe('parseOptions', () => {
  it('should return defaults with no arguments', () => {
    const options = parseOptions([]);

    expect(options.target).toBe('src/adapters/');
    expect(options.verbose).toBe(false);
    expect(options.json).toBe(false);
    expect(options.timeout).toBe(120_000);
  });

  it('should parse --target option', () => {
    const options = parseOptions(['--target', 'src/core/']);

    expect(options.target).toBe('src/core/');
  });

  it('should parse --verbose flag', () => {
    const options = parseOptions(['--verbose']);

    expect(options.verbose).toBe(true);
  });

  it('should parse --json flag', () => {
    const options = parseOptions(['--json']);

    expect(options.json).toBe(true);
  });

  it('should parse --timeout option', () => {
    const options = parseOptions(['--timeout', '60000']);

    expect(options.timeout).toBe(60000);
  });

  it('should handle multiple options', () => {
    const options = parseOptions(['--target', 'src/agents/', '--verbose', '--timeout', '30000']);

    expect(options.target).toBe('src/agents/');
    expect(options.verbose).toBe(true);
    expect(options.timeout).toBe(30000);
  });

  it('should ignore invalid timeout values', () => {
    const options = parseOptions(['--timeout', 'invalid']);

    expect(options.timeout).toBe(120_000); // Default
  });

  it('should ignore negative timeout values', () => {
    const options = parseOptions(['--timeout', '-1000']);

    expect(options.timeout).toBe(120_000); // Default
  });
});

// ============================================================================
// evaluateCommand Tests
// ============================================================================

describe('evaluateCommand', () => {
  it('should return exit code 0 on success with no deprecations', async () => {
    // Target the self-eval directory which has clean code
    const exitCode = await evaluateCommand(['--target', 'src/self-eval/', '--timeout', '10000']);

    expect(exitCode).toBe(0);
    expect(mockStdout.join('')).toContain('Self-Evaluation Report');
  });

  it('should output JSON when --json flag is set', async () => {
    const exitCode = await evaluateCommand([
      '--target',
      'src/self-eval/',
      '--json',
      '--timeout',
      '10000',
    ]);

    expect(exitCode).toBe(0);
    const output = mockStdout.join('');
    const parsed = JSON.parse(output) as unknown;
    expect(parsed).toHaveProperty('results');
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('notice');
  });

  it('should include recommendation notice in output', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--timeout', '10000']);

    const output = mockStdout.join('');
    expect(output).toContain('RECOMMENDATIONS');
    expect(output).toContain('human review');
  });

  it('should include recommendation notice in JSON output', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--json', '--timeout', '10000']);

    const output = mockStdout.join('');
    const parsed = JSON.parse(output) as { notice: string };
    expect(parsed.notice).toContain('RECOMMENDATIONS');
  });

  it('should handle non-existent directory gracefully', async () => {
    const exitCode = await evaluateCommand(['--target', 'non-existent-dir/', '--timeout', '5000']);

    expect(exitCode).toBe(2); // Error
    expect(mockStderr.join('')).toContain('Error');
  });

  it('should show verbose output when --verbose is set', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--verbose', '--timeout', '10000']);

    const output = mockStdout.join('');
    expect(output).toContain('Verbose');
    expect(output).toContain('Audit Trail');
  });

  it('should show summary statistics', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--timeout', '10000']);

    const output = mockStdout.join('');
    expect(output).toContain('Summary');
    expect(output).toContain('Retain');
    expect(output).toContain('Confidence');
  });

  it('should respect timeout', async () => {
    // Very short timeout should complete with partial results
    const exitCode = await evaluateCommand(['--target', 'src/', '--timeout', '100']);

    // Should still complete without error
    expect([0, 1]).toContain(exitCode);
  });
});

// ============================================================================
// Output Format Tests
// ============================================================================

describe('output formatting', () => {
  it('should show component count in summary', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--timeout', '10000']);

    const output = mockStdout.join('');
    // Account for ANSI color codes in output
    expect(output).toContain('Scanned:');
    expect(output).toContain('components');
  });

  it('should show duration in summary', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--timeout', '10000']);

    const output = mockStdout.join('');
    // Account for ANSI color codes in output
    expect(output).toContain('Duration:');
    expect(output).toContain('ms');
  });

  it('should show total lines in summary', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--timeout', '10000']);

    const output = mockStdout.join('');
    // Account for ANSI color codes in output
    expect(output).toContain('Total Lines:');
  });

  it('JSON output should be valid and parseable', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--json', '--timeout', '10000']);

    const output = mockStdout.join('');
    let didParse = true;
    try {
      JSON.parse(output) as unknown;
    } catch {
      didParse = false;
    }
    expect(didParse).toBe(true);

    const parsed = JSON.parse(output) as {
      results: unknown[];
      summary: { retain: number; review: number; refactor: number; deprecate: number };
    };
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.summary).toHaveProperty('retain');
    expect(parsed.summary).toHaveProperty('review');
    expect(parsed.summary).toHaveProperty('refactor');
    expect(parsed.summary).toHaveProperty('deprecate');
  });

  it('JSON output should include isRecommendation flag', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--json', '--timeout', '10000']);

    const output = mockStdout.join('');
    const parsed = JSON.parse(output) as { results: Array<{ isRecommendation: boolean }> };

    for (const result of parsed.results) {
      expect(result.isRecommendation).toBe(true);
    }
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('end-to-end evaluation', () => {
  it('should evaluate component-scanner.ts', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--json', '--timeout', '15000']);

    const output = mockStdout.join('');
    const parsed = JSON.parse(output) as { results: Array<{ component: string }> };

    const components = parsed.results.map((r) => r.component);
    expect(components.some((c) => c.includes('component-scanner'))).toBe(true);
  });

  it('should provide votes from all three evaluators', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--json', '--timeout', '15000']);

    const output = mockStdout.join('');
    const parsed = JSON.parse(output) as { results: Array<{ votes: Array<{ agent: string }> }> };

    if (parsed.results.length > 0) {
      const firstResult = parsed.results[0];
      expect(firstResult?.votes.length).toBe(3);
      const agents = firstResult?.votes.map((v) => v.agent).sort();
      expect(agents).toEqual(['architecture-fit', 'code-quality', 'practical-value']);
    }
  });

  it('should calculate confidence correctly', async () => {
    await evaluateCommand(['--target', 'src/self-eval/', '--json', '--timeout', '15000']);

    const output = mockStdout.join('');
    const parsed = JSON.parse(output) as { results: Array<{ confidence: number }> };

    for (const result of parsed.results) {
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});
