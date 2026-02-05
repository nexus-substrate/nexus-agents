/**
 * Memory Benchmark Framework
 *
 * Evaluates memory system performance across metrics:
 * - Recall@K: Retrieval accuracy for known relevant memories
 * - Precision@K: Relevance of retrieved memories
 * - MRR: Mean Reciprocal Rank for ranking quality
 * - Latency: P50, P95, P99 for store/retrieve/query operations
 * - Storage: Bytes used per memory entry
 *
 * @module testing/memory-benchmark
 * (Source: Issue #748 - Memory evaluation framework)
 */

import type { ILogger } from '../core/index.js';
import { createLogger, getTimeProvider } from '../core/index.js';
import type {
  IMemoryBackend,
  MemoryEntry,
  MemoryMetadata,
} from '../context/memory-backend-types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a memory benchmark run.
 */
export interface MemoryBenchmarkResult {
  /** Recall at various K values (e.g., { 1: 0.6, 5: 0.85, 10: 0.95 }) */
  readonly recallAtK: Readonly<Record<number, number>>;
  /** Precision at various K values */
  readonly precisionAtK: Readonly<Record<number, number>>;
  /** Mean Reciprocal Rank (higher is better) */
  readonly mrr: number;
  /** P50 latency in milliseconds */
  readonly latencyP50Ms: number;
  /** P95 latency in milliseconds */
  readonly latencyP95Ms: number;
  /** P99 latency in milliseconds */
  readonly latencyP99Ms: number;
  /** Total storage used in bytes (estimated) */
  readonly storageBytes: number;
  /** Number of entries benchmarked */
  readonly entryCount: number;
  /** Memory coherence score (0-1, 1 = fully coherent) */
  readonly coherenceScore: number;
  /** Timestamp of benchmark run */
  readonly timestamp: Date;
  /** Duration of benchmark in milliseconds */
  readonly durationMs: number;
  /** Average bytes per entry (capacity efficiency) */
  readonly avgBytesPerEntry: number;
  /** Number of orphaned references detected (coherence detail) */
  readonly orphanedRefCount: number;
}

/**
 * A test case for memory retrieval.
 */
export interface RetrievalTestCase {
  /** Query to execute */
  readonly query: string;
  /** Set of keys that are considered relevant */
  readonly relevantKeys: ReadonlySet<string>;
  /** Optional expected rank order (first key is most relevant) */
  readonly expectedRankOrder?: readonly string[];
}

/**
 * A cross-reference between memory entries to validate.
 */
export interface CrossReference {
  /** Source memory key */
  readonly sourceKey: string;
  /** Target memory key that must exist */
  readonly targetKey: string;
}

/**
 * Configuration for coherence checking.
 */
export interface CoherenceConfig {
  /** List of cross-references to validate */
  readonly crossReferences?: readonly CrossReference[];
  /** Additional backend to check target keys against (for cross-backend refs) */
  readonly targetBackend?: IMemoryBackend;
}

/**
 * Configuration for benchmark execution.
 */
export interface BenchmarkConfig {
  /** K values to compute metrics for (default: [1, 5, 10]) */
  readonly kValues?: readonly number[];
  /** Number of iterations for latency measurement (default: 100) */
  readonly latencyIterations?: number;
  /** Whether to run quick mode (fewer iterations) */
  readonly quickMode?: boolean;
  /** Logger instance */
  readonly logger?: ILogger;
  /** Coherence checking configuration */
  readonly coherenceConfig?: CoherenceConfig;
}

/**
 * Latency measurement results.
 */
interface LatencyMeasurement {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly samples: readonly number[];
}

/** Retrieval quality metrics. */
interface RetrievalMetrics {
  readonly recallAtK: Record<number, number>;
  readonly precisionAtK: Record<number, number>;
  readonly mrr: number;
}

/** Parsed benchmark config with defaults. */
interface ParsedBenchmarkConfig {
  readonly logger: ILogger;
  readonly kValues: readonly number[];
  readonly iterations: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_K_VALUES = [1, 5, 10] as const;
const DEFAULT_LATENCY_ITERATIONS = 100;
const QUICK_MODE_ITERATIONS = 10;

// ============================================================================
// Helper Functions
// ============================================================================

/** Parse config with defaults applied. */
function parseConfig(config?: BenchmarkConfig): ParsedBenchmarkConfig {
  const quickMode = config?.quickMode === true;
  return {
    logger: config?.logger ?? createLogger({ component: 'MemoryBenchmark' }),
    kValues: config?.kValues ?? DEFAULT_K_VALUES,
    iterations: quickMode
      ? QUICK_MODE_ITERATIONS
      : (config?.latencyIterations ?? DEFAULT_LATENCY_ITERATIONS),
  };
}

/** Calculate percentile from sorted array. */
function percentile(sortedValues: readonly number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] ?? 0;
}

/** Estimate storage size for a memory entry. */
function estimateStorageBytes(entry: MemoryEntry): number {
  const keyBytes = Buffer.byteLength(entry.key, 'utf8');
  const valueBytes = Buffer.byteLength(JSON.stringify(entry.value), 'utf8');
  const metadataBytes = Buffer.byteLength(JSON.stringify(entry.metadata), 'utf8');
  const overhead = 64;
  return keyBytes + valueBytes + metadataBytes + overhead;
}

/** Calculate recall at K: proportion of relevant items retrieved in top K. */
function calculateRecallAtK(
  retrievedKeys: readonly string[],
  relevantKeys: ReadonlySet<string>,
  k: number
): number {
  if (relevantKeys.size === 0) return 1.0;
  const topK = retrievedKeys.slice(0, k);
  const relevantInTopK = topK.filter((key) => relevantKeys.has(key)).length;
  return relevantInTopK / relevantKeys.size;
}

/** Calculate precision at K: proportion of top K items that are relevant. */
function calculatePrecisionAtK(
  retrievedKeys: readonly string[],
  relevantKeys: ReadonlySet<string>,
  k: number
): number {
  const topK = retrievedKeys.slice(0, k);
  if (topK.length === 0) return 0;
  const relevantInTopK = topK.filter((key) => relevantKeys.has(key)).length;
  return relevantInTopK / topK.length;
}

/** Calculate Mean Reciprocal Rank. */
function calculateMRR(retrievedKeys: readonly string[], relevantKeys: ReadonlySet<string>): number {
  for (let i = 0; i < retrievedKeys.length; i++) {
    if (relevantKeys.has(retrievedKeys[i] ?? '')) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

// ============================================================================
// Retrieval Quality Measurement
// ============================================================================

/** Accumulators for retrieval metrics. */
interface MetricAccumulators {
  recallSums: Record<number, number>;
  precisionSums: Record<number, number>;
  mrrSum: number;
}

/** Create initialized accumulators for K values. */
function createAccumulators(kValues: readonly number[]): MetricAccumulators {
  const recallSums: Record<number, number> = {};
  const precisionSums: Record<number, number> = {};
  for (const k of kValues) {
    recallSums[k] = 0;
    precisionSums[k] = 0;
  }
  return { recallSums, precisionSums, mrrSum: 0 };
}

/** Update accumulators with metrics from a single test case. */
function updateAccumulators(
  acc: MetricAccumulators,
  retrievedKeys: readonly string[],
  relevantKeys: ReadonlySet<string>,
  kValues: readonly number[]
): void {
  for (const k of kValues) {
    acc.recallSums[k] =
      (acc.recallSums[k] ?? 0) + calculateRecallAtK(retrievedKeys, relevantKeys, k);
    acc.precisionSums[k] =
      (acc.precisionSums[k] ?? 0) + calculatePrecisionAtK(retrievedKeys, relevantKeys, k);
  }
  acc.mrrSum += calculateMRR(retrievedKeys, relevantKeys);
}

/** Average the accumulated metrics. */
function averageMetrics(
  acc: MetricAccumulators,
  kValues: readonly number[],
  numCases: number
): RetrievalMetrics {
  const recallAtK: Record<number, number> = {};
  const precisionAtK: Record<number, number> = {};
  for (const k of kValues) {
    recallAtK[k] = (acc.recallSums[k] ?? 0) / numCases;
    precisionAtK[k] = (acc.precisionSums[k] ?? 0) / numCases;
  }
  return { recallAtK, precisionAtK, mrr: acc.mrrSum / numCases };
}

/** Measure retrieval quality metrics for test cases. */
async function measureRetrievalQuality(
  backend: IMemoryBackend,
  testCases: readonly RetrievalTestCase[],
  kValues: readonly number[],
  logger: ILogger
): Promise<RetrievalMetrics> {
  const acc = createAccumulators(kValues);
  const maxK = Math.max(...kValues);

  for (const testCase of testCases) {
    const searchResult = await backend.search(testCase.query, maxK);
    if (!searchResult.ok) {
      logger.warn('Search failed during benchmark', { query: testCase.query });
      continue;
    }
    const retrievedKeys = searchResult.value.map((e) => e.key);
    updateAccumulators(acc, retrievedKeys, testCase.relevantKeys, kValues);
  }

  return averageMetrics(acc, kValues, testCases.length || 1);
}

// ============================================================================
// Latency Measurement
// ============================================================================

/** Measure latency for store/retrieve operations. */
async function measureLatency(
  backend: IMemoryBackend,
  iterations: number
): Promise<LatencyMeasurement> {
  const samples: number[] = [];
  const testKey = `benchmark-latency-${String(Date.now())}`;
  const testValue = { data: 'benchmark test value', timestamp: Date.now() };
  const testMetadata: MemoryMetadata = { importance: 'low', tags: ['benchmark'] };

  for (let i = 0; i < iterations; i++) {
    const key = `${testKey}-${String(i)}`;

    const storeStart = getTimeProvider().now();
    await backend.store(key, testValue, testMetadata);
    samples.push(getTimeProvider().now() - storeStart);

    const retrieveStart = getTimeProvider().now();
    await backend.retrieve(key);
    samples.push(getTimeProvider().now() - retrieveStart);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    samples: sorted,
  };
}

/** Estimate total storage used by entries. */
async function measureStorage(
  backend: IMemoryBackend
): Promise<{ storageBytes: number; entryCount: number }> {
  const allEntries = await backend.search('', 1000);
  const entries = allEntries.ok ? allEntries.value : [];
  const storageBytes = entries.reduce((sum, entry) => sum + estimateStorageBytes(entry), 0);
  return { storageBytes, entryCount: entries.length };
}

// ============================================================================
// Coherence Measurement (Phase 2)
// ============================================================================

/** Coherence measurement result. */
interface CoherenceMeasurement {
  readonly score: number;
  readonly totalRefs: number;
  readonly validRefs: number;
  readonly orphanedRefs: number;
}

/** Build coherence result from counts. */
function buildCoherenceResult(validCount: number, totalCount: number): CoherenceMeasurement {
  return {
    score: totalCount > 0 ? validCount / totalCount : 1.0,
    totalRefs: totalCount,
    validRefs: validCount,
    orphanedRefs: totalCount - validCount,
  };
}

/** Self-consistency check: validate all entries can be retrieved. */
async function measureSelfConsistency(backend: IMemoryBackend): Promise<CoherenceMeasurement> {
  const allEntries = await backend.search('', 1000);
  if (!allEntries.ok) return buildCoherenceResult(0, 0);

  let validCount = 0;
  for (const entry of allEntries.value) {
    const retrieved = await backend.retrieve(entry.key);
    if (retrieved.ok) validCount++;
  }
  return buildCoherenceResult(validCount, allEntries.value.length);
}

/** Validate explicit cross-references exist in target backend. */
async function validateCrossRefs(
  refs: readonly CrossReference[],
  targetBackend: IMemoryBackend,
  logger?: ILogger
): Promise<CoherenceMeasurement> {
  let validCount = 0;
  for (const ref of refs) {
    const result = await targetBackend.retrieve(ref.targetKey);
    if (result.ok) validCount++;
    else logger?.debug('Orphaned reference', { source: ref.sourceKey, target: ref.targetKey });
  }
  return buildCoherenceResult(validCount, refs.length);
}

/** Measure memory coherence by validating cross-references. */
async function measureCoherence(
  backend: IMemoryBackend,
  config?: CoherenceConfig,
  logger?: ILogger
): Promise<CoherenceMeasurement> {
  const refs = config?.crossReferences ?? [];
  if (refs.length === 0) return measureSelfConsistency(backend);
  return validateCrossRefs(refs, config?.targetBackend ?? backend, logger);
}

// ============================================================================
// Benchmark Runner
// ============================================================================

/**
 * Run memory benchmarks on a memory backend.
 *
 * @param backend - Memory backend to benchmark
 * @param testCases - Test cases with queries and known relevant keys
 * @param config - Benchmark configuration
 * @returns Benchmark results
 */
export async function runMemoryBenchmark(
  backend: IMemoryBackend,
  testCases: readonly RetrievalTestCase[],
  config?: BenchmarkConfig
): Promise<MemoryBenchmarkResult> {
  const { logger, kValues, iterations } = parseConfig(config);
  const startTime = getTimeProvider().now();
  logger.info('Starting memory benchmark', { testCases: testCases.length, iterations });

  const quality = await measureRetrievalQuality(backend, testCases, kValues, logger);
  const latency = await measureLatency(backend, iterations);
  const storage = await measureStorage(backend);
  const coherence = await measureCoherence(backend, config?.coherenceConfig, logger);
  const durationMs = getTimeProvider().now() - startTime;

  logger.info('Memory benchmark complete', {
    mrr: quality.mrr,
    latencyP50Ms: latency.p50,
    latencyP95Ms: latency.p95,
    entryCount: storage.entryCount,
    coherenceScore: coherence.score,
    orphanedRefs: coherence.orphanedRefs,
    durationMs,
  });

  const avgBytesPerEntry = storage.entryCount > 0 ? storage.storageBytes / storage.entryCount : 0;

  return {
    recallAtK: quality.recallAtK,
    precisionAtK: quality.precisionAtK,
    mrr: quality.mrr,
    latencyP50Ms: latency.p50,
    latencyP95Ms: latency.p95,
    latencyP99Ms: latency.p99,
    storageBytes: storage.storageBytes,
    entryCount: storage.entryCount,
    coherenceScore: coherence.score,
    timestamp: new Date(),
    durationMs,
    avgBytesPerEntry,
    orphanedRefCount: coherence.orphanedRefs,
  };
}

// ============================================================================
// Synthetic Test Data Generation
// ============================================================================

/**
 * Generate synthetic test cases for benchmarking.
 *
 * @param backend - Backend to populate with test data
 * @param count - Number of test entries to create
 * @returns Array of retrieval test cases
 */
export async function generateSyntheticTestCases(
  backend: IMemoryBackend,
  count: number = 50
): Promise<RetrievalTestCase[]> {
  const testCases: RetrievalTestCase[] = [];
  const topics = ['typescript', 'react', 'nodejs', 'testing', 'security', 'performance'];
  const entriesPerTopic = Math.ceil(count / topics.length);

  for (const topic of topics) {
    const relevantKeys = new Set<string>();

    for (let i = 0; i < entriesPerTopic; i++) {
      const key = `synth-${topic}-${String(i)}`;
      const value = {
        topic,
        content: `This is synthetic test content about ${topic}. Entry ${String(i)}.`,
        keywords: [topic, 'test', 'benchmark'],
      };
      const metadata: MemoryMetadata = {
        importance: i % 3 === 0 ? 'high' : 'medium',
        tags: [topic, 'synthetic'],
      };

      await backend.store(key, value, metadata);
      relevantKeys.add(key);
    }

    testCases.push({ query: topic, relevantKeys });
  }

  return testCases;
}

// ============================================================================
// Result Formatting
// ============================================================================

/** Format benchmark results as a human-readable string. */
export function formatBenchmarkResult(result: MemoryBenchmarkResult): string {
  const lines: string[] = [
    '╔════════════════════════════════════════╗',
    '║     Memory Benchmark Results           ║',
    '╠════════════════════════════════════════╣',
    '',
    '▸ Retrieval Quality',
  ];

  for (const [k, recall] of Object.entries(result.recallAtK)) {
    const precision = result.precisionAtK[Number(k)] ?? 0;
    lines.push(
      `  Recall@${k}: ${(recall * 100).toFixed(1)}%  |  Precision@${k}: ${(precision * 100).toFixed(1)}%`
    );
  }

  lines.push(`  MRR: ${result.mrr.toFixed(3)}`);
  lines.push('');
  lines.push('▸ Latency (ms)');
  lines.push(
    `  P50: ${result.latencyP50Ms.toFixed(2)}ms  |  P95: ${result.latencyP95Ms.toFixed(2)}ms  |  P99: ${result.latencyP99Ms.toFixed(2)}ms`
  );
  lines.push('');
  lines.push('▸ Storage & Efficiency');
  lines.push(
    `  Entries: ${String(result.entryCount)}  |  Size: ${(result.storageBytes / 1024).toFixed(2)} KB`
  );
  lines.push(`  Avg bytes/entry: ${result.avgBytesPerEntry.toFixed(0)} bytes`);
  lines.push('');
  lines.push('▸ Coherence');
  lines.push(`  Score: ${(result.coherenceScore * 100).toFixed(1)}%`);
  if (result.orphanedRefCount > 0) {
    lines.push(`  ⚠ Orphaned refs: ${String(result.orphanedRefCount)}`);
  }
  lines.push('');
  lines.push(`Duration: ${String(result.durationMs)}ms  |  ${result.timestamp.toISOString()}`);
  lines.push('╚════════════════════════════════════════╝');

  return lines.join('\n');
}

// ============================================================================
// Threshold Validation
// ============================================================================

/** Check if benchmark results meet thresholds. */
export interface BenchmarkThresholds {
  readonly minRecallAt5?: number;
  readonly minPrecisionAt5?: number;
  readonly minMrr?: number;
  readonly maxLatencyP95Ms?: number;
  readonly minCoherenceScore?: number;
}

/** Helper to check a single threshold condition. */
function checkThreshold(
  value: number,
  threshold: number | undefined,
  comparison: 'min' | 'max',
  label: string,
  format: (v: number) => string
): string | null {
  if (threshold === undefined) return null;
  const failed = comparison === 'min' ? value < threshold : value > threshold;
  if (!failed) return null;
  const op = comparison === 'min' ? '<' : '>';
  return `${label} ${format(value)} ${op} ${format(threshold)}`;
}

/** Validate benchmark results against thresholds. */
export function validateBenchmarkResults(
  result: MemoryBenchmarkResult,
  thresholds: BenchmarkThresholds
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const dec = (v: number): string => v.toFixed(3);
  const ms = (v: number): string => `${v.toFixed(2)}ms`;

  const checks = [
    checkThreshold(result.recallAtK[5] ?? 0, thresholds.minRecallAt5, 'min', 'Recall@5', pct),
    checkThreshold(
      result.precisionAtK[5] ?? 0,
      thresholds.minPrecisionAt5,
      'min',
      'Precision@5',
      pct
    ),
    checkThreshold(result.mrr, thresholds.minMrr, 'min', 'MRR', dec),
    checkThreshold(result.latencyP95Ms, thresholds.maxLatencyP95Ms, 'max', 'P95 latency', ms),
    checkThreshold(result.coherenceScore, thresholds.minCoherenceScore, 'min', 'Coherence', pct),
  ];

  for (const check of checks) {
    if (check !== null) failures.push(check);
  }

  return { pass: failures.length === 0, failures };
}
