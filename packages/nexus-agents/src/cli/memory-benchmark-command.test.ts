/**
 * Unit tests for memory-benchmark-command.ts
 *
 * @module cli/memory-benchmark-command.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleMemoryBenchmarkCommand } from './memory-benchmark-command.js';
import type { ParsedCliArgs } from '../cli-types.js';
import { MemoryError } from '../context/memory-backend-types.js';
import {
  runMemoryBenchmark,
  generateSyntheticTestCases,
  formatBenchmarkResult,
  validateBenchmarkResults,
} from '../testing/memory-benchmark.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('./ansi-output.js', () => ({
  colors: {
    bold: '',
    reset: '',
    cyan: '',
    dim: '',
    green: '',
    red: '',
  },
  symbols: {
    check: '✓',
    cross: '✗',
    bullet: '•',
  },
}));

vi.mock('../core/index.js', () => ({
  getTimeProvider: vi.fn(() => ({
    now: vi.fn(() => 1000),
  })),
}));

vi.mock('../testing/memory-benchmark.js', () => ({
  runMemoryBenchmark: vi.fn(),
  generateSyntheticTestCases: vi.fn(),
  formatBenchmarkResult: vi.fn(),
  validateBenchmarkResults: vi.fn(),
}));

// ============================================================================
// Test Helpers
// ============================================================================

function createMockArgs(overrides: Partial<ParsedCliArgs> = {}): ParsedCliArgs {
  return {
    command: 'memory-benchmark',
    subcommand: undefined,
    positionals: [],
    options: {},
    flags: {},
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockBenchmarkResult() {
  return {
    recall_at_5: 0.85,
    precision_at_5: 0.75,
    mrr: 0.7,
    latency_p95_ms: 35,
    coherence_score: 0.95,
    growth_rate_bytes_per_op: 1500,
    decay_consistency_score: 0.97,
    promotion_retention_rate: 0.92,
    decay_regret_score: 0.2,
    timestamp: '2026-02-06T12:00:00Z',
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('memory-benchmark-command', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = 0;

    vi.mocked(generateSyntheticTestCases).mockImplementation(() =>
      Promise.resolve([{ query: 'test', relevantKeys: ['key1'] }])
    );
    vi.mocked(runMemoryBenchmark).mockImplementation(() =>
      Promise.resolve(createMockBenchmarkResult())
    );
    vi.mocked(formatBenchmarkResult).mockReturnValue('Formatted results');
    vi.mocked(validateBenchmarkResults).mockReturnValue({ pass: true, failures: [] });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('handleMemoryBenchmarkCommand', () => {
    it('should run full benchmark by default', async () => {
      const args = createMockArgs();

      await handleMemoryBenchmarkCommand(args);

      expect(vi.mocked(generateSyntheticTestCases)).toHaveBeenCalledWith(expect.anything(), 50);
      expect(vi.mocked(runMemoryBenchmark)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ latencyIterations: 100 })
      );
    });

    it('should run quick benchmark when subcommand is quick', async () => {
      const args = createMockArgs({ subcommand: 'quick' });

      await handleMemoryBenchmarkCommand(args);

      expect(vi.mocked(generateSyntheticTestCases)).toHaveBeenCalledWith(expect.anything(), 20);
      expect(vi.mocked(runMemoryBenchmark)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { quickMode: true, latencyIterations: 10 }
      );
    });

    it('should run quick benchmark when dryRun option is set', async () => {
      const args = createMockArgs({ options: { dryRun: true } });

      await handleMemoryBenchmarkCommand(args);

      expect(vi.mocked(runMemoryBenchmark)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { quickMode: true, latencyIterations: 10 }
      );
    });

    it('should output text format by default', async () => {
      const args = createMockArgs();

      await handleMemoryBenchmarkCommand(args);

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('nexus-agents memory-benchmark')
      );
      expect(vi.mocked(formatBenchmarkResult)).toHaveBeenCalled();
    });

    it('should output JSON format when requested', async () => {
      const args = createMockArgs({ options: { format: 'json' } });
      const mockResult = createMockBenchmarkResult();
      vi.mocked(runMemoryBenchmark).mockImplementation(() => Promise.resolve(mockResult));

      await handleMemoryBenchmarkCommand(args);

      const jsonOutput = stdoutSpy.mock.calls.find((call) =>
        String(call[0]).includes('"recall_at_5"')
      );
      expect(jsonOutput).toBeDefined();
      expect(vi.mocked(formatBenchmarkResult)).not.toHaveBeenCalled();
    });

    it('should validate results when validate subcommand used', async () => {
      const args = createMockArgs({ subcommand: 'validate' });

      await handleMemoryBenchmarkCommand(args);

      expect(vi.mocked(validateBenchmarkResults)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          minRecallAt5: 0.7,
          minPrecisionAt5: 0.5,
        })
      );
    });

    it('should validate when --validate positional present', async () => {
      const args = createMockArgs({ positionals: ['--validate'] });

      await handleMemoryBenchmarkCommand(args);

      expect(vi.mocked(validateBenchmarkResults)).toHaveBeenCalled();
    });

    it('should set exitCode 1 when validation fails', async () => {
      const args = createMockArgs({ subcommand: 'validate' });
      vi.mocked(validateBenchmarkResults).mockReturnValue({
        pass: false,
        failures: ['recall too low'],
      });

      await handleMemoryBenchmarkCommand(args);

      expect(process.exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('Threshold validation failed')
      );
    });

    it('should print validation success message', async () => {
      const args = createMockArgs({ subcommand: 'validate' });
      vi.mocked(validateBenchmarkResults).mockReturnValue({ pass: true, failures: [] });

      await handleMemoryBenchmarkCommand(args);

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('All thresholds passed'));
    });

    it('should print validation failures', async () => {
      const args = createMockArgs({ subcommand: 'validate' });
      vi.mocked(validateBenchmarkResults).mockReturnValue({
        pass: false,
        failures: ['recall < 0.7', 'mrr < 0.5'],
      });

      await handleMemoryBenchmarkCommand(args);

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('recall < 0.7'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('mrr < 0.5'));
    });

    it('should print header, running, and footer in text mode', async () => {
      const args = createMockArgs();

      await handleMemoryBenchmarkCommand(args);

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('nexus-agents memory-benchmark')
      );
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Mode: full'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Running benchmark...'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Total time: 0ms'));
    });

    it('should print quick mode in header', async () => {
      const args = createMockArgs({ subcommand: 'quick' });

      await handleMemoryBenchmarkCommand(args);

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Mode: quick'));
    });

    it('should not print header/footer in JSON mode', async () => {
      const args = createMockArgs({ options: { format: 'json' } });

      await handleMemoryBenchmarkCommand(args);

      const calls = stdoutSpy.mock.calls.map((call) => String(call[0]));
      const hasHeader = calls.some((c) => c.includes('nexus-agents memory-benchmark'));
      const hasFooter = calls.some((c) => c.includes('Total time'));

      expect(hasHeader).toBe(false);
      expect(hasFooter).toBe(false);
    });

    it('should handle benchmark errors gracefully', async () => {
      const args = createMockArgs();
      vi.mocked(runMemoryBenchmark).mockImplementation(() =>
        Promise.reject(new Error('Benchmark failed'))
      );

      await handleMemoryBenchmarkCommand(args);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Benchmark failed: Benchmark failed')
      );
      expect(process.exitCode).toBe(1);
    });

    it('should handle non-Error exceptions', async () => {
      const args = createMockArgs();
      vi.mocked(runMemoryBenchmark).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        () => Promise.reject('String error')
      );

      await handleMemoryBenchmarkCommand(args);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Benchmark failed: String error')
      );
    });

    it('should handle MemoryError exceptions', async () => {
      const args = createMockArgs();
      vi.mocked(runMemoryBenchmark).mockImplementation(() =>
        Promise.reject(new MemoryError('Memory error'))
      );

      await handleMemoryBenchmarkCommand(args);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Benchmark failed: Memory error')
      );
    });

    it('should pass correct backend to test case generator', async () => {
      const args = createMockArgs();

      await handleMemoryBenchmarkCommand(args);

      const backend = vi.mocked(generateSyntheticTestCases).mock.calls[0][0];
      expect(backend).toHaveProperty('store');
      expect(backend).toHaveProperty('retrieve');
      expect(backend).toHaveProperty('search');
      expect(backend).toHaveProperty('prune');
    });

    it('should create functional benchmark backend', async () => {
      const args = createMockArgs();

      await handleMemoryBenchmarkCommand(args);

      const backend = vi.mocked(generateSyntheticTestCases).mock.calls[0][0];

      // Test store
      const storeResult = await backend.store('key1', 'value1', {
        tags: [],
        importance: 1,
      });
      expect(storeResult.ok).toBe(true);

      // Test retrieve
      const retrieveResult = await backend.retrieve('key1');
      expect(retrieveResult.ok).toBe(true);
      if (retrieveResult.ok) {
        expect(retrieveResult.value).toBe('value1');
      }

      // Test search
      const searchResult = await backend.search('value', 10);
      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) {
        expect(searchResult.value.length).toBeGreaterThan(0);
      }

      // Test prune
      const pruneResult = await backend.prune(new Date(Date.now() + 1000));
      expect(pruneResult.ok).toBe(true);
    });

    it('should handle retrieve on non-existent key', async () => {
      const args = createMockArgs();

      await handleMemoryBenchmarkCommand(args);

      const backend = vi.mocked(generateSyntheticTestCases).mock.calls[0][0];
      const retrieveResult = await backend.retrieve('nonexistent');

      expect(retrieveResult.ok).toBe(false);
    });

    it('should limit search results', async () => {
      const args = createMockArgs();

      await handleMemoryBenchmarkCommand(args);

      const backend = vi.mocked(generateSyntheticTestCases).mock.calls[0][0];

      // Store multiple entries
      await backend.store('key1', 'test value 1', { tags: [], importance: 1 });
      await backend.store('key2', 'test value 2', { tags: [], importance: 1 });
      await backend.store('key3', 'test value 3', { tags: [], importance: 1 });

      const searchResult = await backend.search('test', 2);
      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) {
        expect(searchResult.value.length).toBe(2);
      }
    });
  });
});
