/**
 * nexus-agents/cli - Memory Benchmark Command
 *
 * CLI command for running memory system benchmarks.
 * Evaluates memory performance, retrieval quality, and efficiency metrics.
 *
 * @module cli/memory-benchmark-command
 * (Source: Issue #748 - Memory evaluation framework)
 */

import type { ParsedCliArgs } from '../cli-types.js';
import { colors, symbols } from './ansi-output.js';
import {
  runMemoryBenchmark,
  generateSyntheticTestCases,
  formatBenchmarkResult,
  validateBenchmarkResults,
  type MemoryBenchmarkResult,
  type BenchmarkThresholds,
} from '../testing/memory-benchmark.js';
import type {
  IMemoryBackend,
  MemoryEntry,
  MemoryMetadata,
} from '../context/memory-backend-types.js';
import { MemoryError } from '../context/memory-backend-types.js';
import { getErrorMessage, getTimeProvider } from '../core/index.js';

// ============================================================================
// Types
// ============================================================================

/** Memory benchmark command options. */
interface MemoryBenchmarkOptions {
  readonly quick: boolean;
  readonly format: 'text' | 'json';
  readonly validate: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Default benchmark thresholds for CI validation. */
const DEFAULT_THRESHOLDS: BenchmarkThresholds = {
  minRecallAt5: 0.7,
  minPrecisionAt5: 0.5,
  minMrr: 0.5,
  maxLatencyP95Ms: 50,
  minCoherenceScore: 0.9,
  maxGrowthRateBytesPerOp: 2048,
  minDecayConsistencyScore: 0.95,
  // Phase 3 thresholds
  minPromotionRetentionRate: 0.9,
  maxDecayRegretScore: 0.3,
};

// ============================================================================
// Mock Backend for Benchmarking
// ============================================================================

/** Creates a simple in-memory backend for benchmarking. */
function createBenchmarkBackend(): IMemoryBackend {
  const entries = new Map<string, MemoryEntry>();
  return {
    store(key: string, value: unknown, metadata: MemoryMetadata) {
      entries.set(key, {
        key,
        value,
        metadata,
        createdAt: new Date(),
        accessedAt: new Date(),
      });
      return Promise.resolve({ ok: true as const, value: undefined });
    },
    retrieve(key: string) {
      const entry = entries.get(key);
      if (entry === undefined) {
        return Promise.resolve({ ok: false as const, error: new MemoryError('Not found') });
      }
      entry.accessedAt = new Date();
      return Promise.resolve({ ok: true as const, value: entry.value });
    },
    search(query: string, limit: number) {
      const results: MemoryEntry[] = [];
      for (const entry of entries.values()) {
        const content = JSON.stringify(entry.value).toLowerCase();
        if (query === '' || content.includes(query.toLowerCase())) {
          results.push(entry);
          if (results.length >= limit) break;
        }
      }
      return Promise.resolve({ ok: true as const, value: results });
    },
    prune(olderThan: Date) {
      let pruned = 0;
      for (const [key, entry] of entries) {
        if (entry.accessedAt < olderThan) {
          entries.delete(key);
          pruned++;
        }
      }
      return Promise.resolve({ ok: true as const, value: pruned });
    },
  };
}

// ============================================================================
// Output Helpers
// ============================================================================

/** Writes a line to stdout. */
function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

/** Prints the header for text output. */
function printHeader(isQuick: boolean): void {
  writeLine(`\n${colors.bold}nexus-agents memory-benchmark${colors.reset}`);
  writeLine('='.repeat(40));
  writeLine(`Mode: ${isQuick ? 'quick' : 'full'}\n`);
}

/** Prints "Running benchmark..." message. */
function printRunning(): void {
  writeLine(`${colors.cyan}Running benchmark...${colors.reset}\n`);
}

/** Prints the elapsed time footer. */
function printFooter(elapsed: number): void {
  writeLine(`\n${colors.dim}Total time: ${String(elapsed)}ms${colors.reset}`);
}

/** Prints benchmark results to console. */
function printResults(result: MemoryBenchmarkResult, format: 'text' | 'json'): void {
  if (format === 'json') {
    writeLine(JSON.stringify(result, null, 2));
    return;
  }
  writeLine(formatBenchmarkResult(result));
}

/** Validates benchmark results and prints failures. Returns true if passed. */
function validateAndPrint(result: MemoryBenchmarkResult): boolean {
  const { pass, failures } = validateBenchmarkResults(result, DEFAULT_THRESHOLDS);
  if (pass) {
    writeLine(`\n${colors.green}${symbols.check} All thresholds passed${colors.reset}`);
    return true;
  }
  writeLine(`\n${colors.red}${symbols.cross} Threshold validation failed:${colors.reset}`);
  for (const failure of failures) {
    writeLine(`  ${colors.red}${symbols.bullet} ${failure}${colors.reset}`);
  }
  return false;
}

// ============================================================================
// Core Logic
// ============================================================================

/** Runs the memory benchmark and returns results. */
async function runBenchmark(options: MemoryBenchmarkOptions): Promise<MemoryBenchmarkResult> {
  const backend = createBenchmarkBackend();
  const testCases = await generateSyntheticTestCases(backend, options.quick ? 20 : 50);
  return runMemoryBenchmark(backend, testCases, {
    quickMode: options.quick,
    latencyIterations: options.quick ? 10 : 100,
  });
}

/** Parses options from CLI args. */
function parseOptions(args: ParsedCliArgs): MemoryBenchmarkOptions {
  return {
    quick: args.subcommand === 'quick' || args.options.dryRun,
    format: args.options.format === 'json' ? 'json' : 'text',
    validate: args.subcommand === 'validate' || args.positionals.includes('--validate'),
  };
}

// ============================================================================
// Command Handler
// ============================================================================

/**
 * Handles the memory-benchmark command.
 *
 * Usage:
 *   nexus-agents memory-benchmark           # Run full benchmark
 *   nexus-agents memory-benchmark quick     # Run quick smoke test
 *   nexus-agents memory-benchmark validate  # Validate against thresholds
 *   nexus-agents memory-benchmark --format json # Output as JSON
 */
export async function handleMemoryBenchmarkCommand(args: ParsedCliArgs): Promise<void> {
  const options = parseOptions(args);
  const startTime = getTimeProvider().now();

  if (options.format === 'text') {
    printHeader(options.quick);
    printRunning();
  }

  try {
    const result = await runBenchmark(options);
    printResults(result, options.format);

    if (options.validate && !validateAndPrint(result)) {
      process.exitCode = 1;
    }

    if (options.format === 'text') {
      printFooter(getTimeProvider().now() - startTime);
    }
  } catch (error) {
    const message = getErrorMessage(error);
    process.stderr.write(
      `${colors.red}${symbols.cross} Benchmark failed: ${message}${colors.reset}\n`
    );
    process.exitCode = 1;
  }
}
