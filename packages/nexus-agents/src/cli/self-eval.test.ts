/**
 * Tests for Self-Eval CLI command.
 * (Source: Issue #140)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { parseOptions, evaluateCommand, type OutcomeSink } from './self-eval.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';

/** Absolute path to the package root (resolves CWD ambiguity in Vitest). */
const PACKAGE_ROOT = join(import.meta.dirname, '..', '..');

/** Absolute target path for self-eval tests. */
const SELF_EVAL_TARGET = join(PACKAGE_ROOT, 'src', 'self-eval');

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

/** Timeout for integration tests that scan the filesystem (generous for CI contention). */
const INTEGRATION_TIMEOUT = 20_000;

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
  it(
    'should return exit code 0 on success with no deprecations',
    { timeout: INTEGRATION_TIMEOUT },
    async () => {
      // Target the self-eval directory which has clean code
      const exitCode = await evaluateCommand(['--target', SELF_EVAL_TARGET, '--timeout', '10000']);

      expect(exitCode).toBe(0);
      expect(mockStdout.join('')).toContain('Self-Evaluation Report');
    }
  );

  it('should output JSON when --json flag is set', { timeout: INTEGRATION_TIMEOUT }, async () => {
    const exitCode = await evaluateCommand([
      '--target',
      SELF_EVAL_TARGET,
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

  it(
    'should include recommendation notice in output',
    { timeout: INTEGRATION_TIMEOUT },
    async () => {
      await evaluateCommand(['--target', SELF_EVAL_TARGET, '--timeout', '10000']);

      const output = mockStdout.join('');
      expect(output).toContain('RECOMMENDATIONS');
      expect(output).toContain('human review');
    }
  );

  it(
    'should include recommendation notice in JSON output',
    { timeout: INTEGRATION_TIMEOUT },
    async () => {
      await evaluateCommand(['--target', SELF_EVAL_TARGET, '--json', '--timeout', '10000']);

      const output = mockStdout.join('');
      const parsed = JSON.parse(output) as { notice: string };
      expect(parsed.notice).toContain('RECOMMENDATIONS');
    }
  );

  it('should handle non-existent directory gracefully', async () => {
    const exitCode = await evaluateCommand(['--target', 'non-existent-dir/', '--timeout', '5000']);

    expect(exitCode).toBe(2); // Error
    expect(mockStderr.join('')).toContain('Error');
  });

  it(
    'should show verbose output when --verbose is set',
    { timeout: INTEGRATION_TIMEOUT },
    async () => {
      await evaluateCommand(['--target', SELF_EVAL_TARGET, '--verbose', '--timeout', '10000']);

      const output = mockStdout.join('');
      expect(output).toContain('Verbose');
      expect(output).toContain('Audit Trail');
    }
  );

  it('should show summary statistics', { timeout: INTEGRATION_TIMEOUT }, async () => {
    await evaluateCommand(['--target', SELF_EVAL_TARGET, '--timeout', '10000']);

    const output = mockStdout.join('');
    expect(output).toContain('Summary');
    expect(output).toContain('Retain');
    expect(output).toContain('Confidence');
  });

  it('should respect timeout', { timeout: INTEGRATION_TIMEOUT }, async () => {
    // Very short timeout should complete with partial results
    const exitCode = await evaluateCommand(['--target', 'src/', '--timeout', '100']);

    // Should still complete — 0=pass, 1=fail, 2=timeout/error
    expect([0, 1, 2]).toContain(exitCode);
  });
});

// ============================================================================
// Output Format Tests
// ============================================================================

describe('output formatting', () => {
  it('should show component count in summary', { timeout: INTEGRATION_TIMEOUT }, async () => {
    await evaluateCommand(['--target', SELF_EVAL_TARGET, '--timeout', '10000']);

    const output = mockStdout.join('');
    // Account for ANSI color codes in output
    expect(output).toContain('Scanned:');
    expect(output).toContain('components');
  });

  it('should show duration in summary', { timeout: INTEGRATION_TIMEOUT }, async () => {
    await evaluateCommand(['--target', SELF_EVAL_TARGET, '--timeout', '10000']);

    const output = mockStdout.join('');
    // Account for ANSI color codes in output
    expect(output).toContain('Duration:');
    expect(output).toContain('ms');
  });

  it('should show total lines in summary', { timeout: INTEGRATION_TIMEOUT }, async () => {
    await evaluateCommand(['--target', SELF_EVAL_TARGET, '--timeout', '10000']);

    const output = mockStdout.join('');
    // Account for ANSI color codes in output
    expect(output).toContain('Total Lines:');
  });

  it('JSON output should be valid and parseable', { timeout: INTEGRATION_TIMEOUT }, async () => {
    await evaluateCommand(['--target', SELF_EVAL_TARGET, '--json', '--timeout', '10000']);

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

  it(
    'JSON output should include isRecommendation flag',
    { timeout: INTEGRATION_TIMEOUT },
    async () => {
      await evaluateCommand(['--target', SELF_EVAL_TARGET, '--json', '--timeout', '10000']);

      const output = mockStdout.join('');
      const parsed = JSON.parse(output) as { results: Array<{ isRecommendation: boolean }> };

      for (const result of parsed.results) {
        expect(result.isRecommendation).toBe(true);
      }
    }
  );
});

// ============================================================================
// OutcomeStore Persistence (#3219, #3235, #3241)
// ============================================================================

describe('outcome persistence', () => {
  it(
    'appends one outcome per result to the injected store',
    { timeout: INTEGRATION_TIMEOUT },
    async () => {
      const appended: TaskOutcome[] = [];
      const store: OutcomeSink = {
        append: (o) => {
          appended.push(o);
        },
      };

      await evaluateCommand(['--target', SELF_EVAL_TARGET, '--json', '--timeout', '15000'], store);

      // One outcome per result reported in the JSON output.
      const parsed = JSON.parse(mockStdout.join('')) as { results: unknown[] };
      expect(appended.length).toBe(parsed.results.length);
      expect(appended.length).toBeGreaterThan(0);
      // Every appended outcome is a self-eval-sourced record.
      for (const outcome of appended) {
        expect(outcome.id.startsWith('self-eval-')).toBe(true);
        expect(outcome.source).toBe('manual');
        expect(outcome.qualitySignals).toContain('self-eval');
      }
    }
  );

  it(
    'does not crash the eval when the store throws',
    { timeout: INTEGRATION_TIMEOUT },
    async () => {
      const store: OutcomeSink = {
        append: () => {
          throw new Error('store unavailable');
        },
      };

      const exitCode = await evaluateCommand(
        ['--target', SELF_EVAL_TARGET, '--timeout', '15000'],
        store
      );

      // Eval still completes (0 = pass, 1 = deprecations found).
      expect([0, 1]).toContain(exitCode);
    }
  );
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('end-to-end evaluation', () => {
  it('should evaluate component-scanner.ts', { timeout: INTEGRATION_TIMEOUT }, async () => {
    await evaluateCommand(['--target', SELF_EVAL_TARGET, '--json', '--timeout', '15000']);

    const output = mockStdout.join('');
    const parsed = JSON.parse(output) as { results: Array<{ component: string }> };

    const components = parsed.results.map((r) => r.component);
    expect(components.some((c) => c.includes('component-scanner'))).toBe(true);
  });

  it(
    'should provide votes from all three evaluators',
    { timeout: INTEGRATION_TIMEOUT },
    async () => {
      await evaluateCommand(['--target', SELF_EVAL_TARGET, '--json', '--timeout', '15000']);

      const output = mockStdout.join('');
      const parsed = JSON.parse(output) as { results: Array<{ votes: Array<{ agent: string }> }> };

      if (parsed.results.length > 0) {
        const firstResult = parsed.results[0];
        expect(firstResult?.votes.length).toBe(3);
        const agents = firstResult?.votes.map((v) => v.agent).sort();
        expect(agents).toEqual(['architecture-fit', 'code-quality', 'practical-value']);
      }
    }
  );

  it('should calculate confidence correctly', { timeout: INTEGRATION_TIMEOUT }, async () => {
    await evaluateCommand(['--target', SELF_EVAL_TARGET, '--json', '--timeout', '15000']);

    const output = mockStdout.join('');
    const parsed = JSON.parse(output) as { results: Array<{ confidence: number }> };

    for (const result of parsed.results) {
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});
