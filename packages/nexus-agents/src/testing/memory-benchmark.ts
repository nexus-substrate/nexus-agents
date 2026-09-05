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
  IContextMemoryBackend,
  MemoryEntry,
  MemoryMetadata,
} from '../context/memory-backend-types.js';
import {
  measurePromotionEffectiveness,
  measureDecayAppropriateness,
} from './memory-benchmark-phase3.js';

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
  /** Memory coherence score (0-1, 1 = fully coherent), or null when unmeasured (#5664) */
  readonly coherenceScore: number | null;
  /** Timestamp of benchmark run */
  readonly timestamp: Date;
  /** Duration of benchmark in milliseconds */
  readonly durationMs: number;
  /** Average bytes per entry (capacity efficiency) */
  readonly avgBytesPerEntry: number;
  /** Number of orphaned references detected (coherence detail) */
  readonly orphanedRefCount: number;
  /** Growth rate: bytes per operation during load test (Phase 2) */
  readonly growthRateBytesPerOp: number;
  /**
   * Decay consistency: ratio of items correctly decayed (Phase 2, 0-1), or
   * `null` when the measurement could not be taken (#5260).
   *
   * `null` covers a failed backend search and an empty store. It is not zero.
   */
  readonly decayConsistencyScore: number | null;
  /**
   * How many items the decay check actually examined.
   *
   * This existed inside `DecayMeasurement` and was discarded at this boundary,
   * so the one number distinguishing "measured, perfect" from "could not
   * measure" never reached a reader. The denominator now travels with the
   * score.
   */
  readonly decayItemsChecked: number;
  /** Promotion effectiveness: retention rate of promoted memories (Phase 3, 0-1), or null when unmeasured (#5664) */
  readonly promotionRetentionRate: number | null;
  /** Decay appropriateness: regret score for premature decay (Phase 3, 0-1 lower is better), or null when unmeasured (#5664) */
  readonly decayRegretScore: number | null;
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
  readonly targetBackend?: IContextMemoryBackend;
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
// Constants & Helpers
// ============================================================================

const DEFAULT_K_VALUES = [1, 5, 10] as const;
const DEFAULT_LATENCY_ITERATIONS = 100;
const QUICK_MODE_ITERATIONS = 10;

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
  backend: IContextMemoryBackend,
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
  backend: IContextMemoryBackend,
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
  backend: IContextMemoryBackend
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
  readonly score: number | null;
  readonly totalRefs: number;
  readonly validRefs: number;
  readonly orphanedRefs: number;
}

/** Build coherence result from counts. */
function buildCoherenceResult(validCount: number, totalCount: number): CoherenceMeasurement {
  return {
    score: totalCount > 0 ? validCount / totalCount : null,
    totalRefs: totalCount,
    validRefs: validCount,
    orphanedRefs: totalCount - validCount,
  };
}

/** Self-consistency check: validate all entries can be retrieved. */
async function measureSelfConsistency(
  backend: IContextMemoryBackend
): Promise<CoherenceMeasurement> {
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
  targetBackend: IContextMemoryBackend,
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
  backend: IContextMemoryBackend,
  config?: CoherenceConfig,
  logger?: ILogger
): Promise<CoherenceMeasurement> {
  const refs = config?.crossReferences ?? [];
  if (refs.length === 0) return measureSelfConsistency(backend);
  return validateCrossRefs(refs, config?.targetBackend ?? backend, logger);
}

// ============================================================================
// Phase 2 Metrics: Growth Rate & Decay Consistency (Issue #748)
// ============================================================================

/** Growth rate measurement result. */
interface GrowthMeasurement {
  readonly bytesPerOperation: number;
  readonly operationsExecuted: number;
}

/** Measure storage growth rate under load (bytes per operation). */
async function measureGrowthRate(
  backend: IContextMemoryBackend,
  operationCount: number = 50,
  logger?: ILogger
): Promise<GrowthMeasurement> {
  // Measure initial storage
  const initialEntries = await backend.search('', 10000);
  let initialBytes = 0;
  if (initialEntries.ok) {
    initialBytes = initialEntries.value.reduce((sum, e) => sum + estimateStorageBytes(e), 0);
  }

  // Perform N store operations
  const metadata: MemoryMetadata = { importance: 'medium', tags: ['growth-test'] };
  for (let i = 0; i < operationCount; i++) {
    const key = `growth-test-${String(getTimeProvider().now())}-${String(i)}`;
    const value = { index: i, data: `Growth test data ${String(i)}`.repeat(10) };
    await backend.store(key, value, metadata);
  }

  // Measure final storage
  const finalEntries = await backend.search('', 10000);
  let finalBytes = 0;
  if (finalEntries.ok) {
    finalBytes = finalEntries.value.reduce((sum, e) => sum + estimateStorageBytes(e), 0);
  }

  const bytesPerOp = operationCount > 0 ? (finalBytes - initialBytes) / operationCount : 0;
  logger?.debug('Growth rate measured', { initialBytes, finalBytes, bytesPerOp });

  return { bytesPerOperation: bytesPerOp, operationsExecuted: operationCount };
}

/** Decay consistency measurement result. */
interface DecayMeasurement {
  /**
   * `null` means UNMEASURED (#5260) — either the backend search failed or the
   * store was empty. It never means "no consistency"; that would be `0`.
   */
  readonly consistencyScore: number | null;
  readonly itemsChecked: number;
}

/** Measure decay consistency (ratio of items correctly pruned). */
async function measureDecayConsistency(
  backend: IContextMemoryBackend,
  logger?: ILogger
): Promise<DecayMeasurement> {
  // For now, check that prune operation doesn't corrupt existing entries
  const beforePrune = await backend.search('', 10000);
  if (!beforePrune.ok) {
    // Was `consistencyScore: 1.0` — a perfect score returned on the line
    // directly below a log saying the measurement could not be taken (#5260).
    logger?.debug('Cannot measure decay consistency - search failed');
    return { consistencyScore: null, itemsChecked: 0 };
  }

  const beforeCount = beforePrune.value.length;
  if (beforeCount === 0) {
    // An empty store is a different fact from a failed search, and neither is
    // a perfect consistency score.
    return { consistencyScore: null, itemsChecked: 0 };
  }

  // Sample some entries to verify they remain retrievable
  const sampleSize = Math.min(10, beforeCount);
  const samples = beforePrune.value.slice(0, sampleSize);
  let retrievable = 0;

  for (const entry of samples) {
    const result = await backend.retrieve(entry.key);
    if (result.ok) retrievable++;
  }

  const score = sampleSize > 0 ? retrievable / sampleSize : 1.0;
  logger?.debug('Decay consistency measured', { sampleSize, retrievable, score });

  return { consistencyScore: score, itemsChecked: sampleSize };
}

// ============================================================================
// Benchmark Runner
// ============================================================================
/** Intermediate measurements collected during benchmark. */
interface BenchmarkMeasurements {
  quality: RetrievalMetrics;
  latency: LatencyMeasurement;
  storage: { storageBytes: number; entryCount: number };
  coherence: CoherenceMeasurement;
  growth: GrowthMeasurement;
  decay: DecayMeasurement;
  promotion: { retentionRate: number | null };
  appropriateness: { regretScore: number | null };
  durationMs: number;
}

/** Build final result from measurements. */
function buildBenchmarkResult(m: BenchmarkMeasurements): MemoryBenchmarkResult {
  const avgBytesPerEntry =
    m.storage.entryCount > 0 ? m.storage.storageBytes / m.storage.entryCount : 0;
  return {
    recallAtK: m.quality.recallAtK,
    precisionAtK: m.quality.precisionAtK,
    mrr: m.quality.mrr,
    latencyP50Ms: m.latency.p50,
    latencyP95Ms: m.latency.p95,
    latencyP99Ms: m.latency.p99,
    storageBytes: m.storage.storageBytes,
    entryCount: m.storage.entryCount,
    coherenceScore: m.coherence.score,
    timestamp: new Date(),
    durationMs: m.durationMs,
    avgBytesPerEntry,
    orphanedRefCount: m.coherence.orphanedRefs,
    growthRateBytesPerOp: m.growth.bytesPerOperation,
    decayConsistencyScore: m.decay.consistencyScore,
    decayItemsChecked: m.decay.itemsChecked,
    promotionRetentionRate: m.promotion.retentionRate,
    decayRegretScore: m.appropriateness.regretScore,
  };
}

/**
 * Run memory benchmarks on a memory backend.
 */
export async function runMemoryBenchmark(
  backend: IContextMemoryBackend,
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
  const growthIterations = config?.quickMode === true ? 10 : 50;
  const growth = await measureGrowthRate(backend, growthIterations, logger);
  const decay = await measureDecayConsistency(backend, logger);
  const promotion = await measurePromotionEffectiveness(backend, logger);
  const appropriateness = await measureDecayAppropriateness(backend, logger);
  const durationMs = getTimeProvider().now() - startTime;

  logger.info('Memory benchmark complete', { mrr: quality.mrr, durationMs });
  return buildBenchmarkResult({
    quality,
    latency,
    storage,
    coherence,
    growth,
    decay,
    promotion,
    appropriateness,
    durationMs,
  });
}

// Re-export from helper modules
export { generateSyntheticTestCases } from './memory-benchmark-synthetic.js';
export {
  formatBenchmarkResult,
  validateBenchmarkResults,
  type BenchmarkThresholds,
} from './memory-benchmark-output.js';
