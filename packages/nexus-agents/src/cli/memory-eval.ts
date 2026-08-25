/**
 * Comparative memory evaluation benchmark.
 *
 * Compares reflective retrieval (MemR3) against direct keyword search
 * baseline using a synthetic evaluation dataset of query-memory pairs.
 *
 * @module cli/memory-eval
 * (Source: Issue #1034 — Comparative memory evaluation benchmark)
 */

// ============================================================================
// Types
// ============================================================================

/** A query-memory evaluation pair with expected relevance. */
export interface EvalPair {
  readonly query: string;
  readonly memoryKey: string;
  readonly memoryContent: string;
  readonly source: 'session' | 'belief' | 'agentic' | 'typed';
  readonly expectedRelevant: boolean;
}

/** Metrics for a single evaluation run. */
export interface EvalMetrics {
  readonly recallAt5: number;
  readonly precisionAt5: number;
  readonly mrr: number;
  readonly avgLatencyMs: number;
  readonly p95LatencyMs: number;
  readonly totalQueries: number;
  /**
   * Queries the recall mean was actually taken over (#4850).
   *
   * A query with no relevant memory cannot measure recall. Such a query is
   * excluded rather than credited 1.0, so this can be lower than
   * `totalQueries` — and when it is, `recallAt5` describes a subset.
   */
  readonly recallQueries: number;
}

/** Comparative evaluation report. */
export interface MemoryEvalReport {
  readonly baseline: EvalMetrics;
  readonly reflective: EvalMetrics;
  readonly improvement: EvalImprovement;
  readonly datasetSize: number;
  readonly details: readonly string[];
}

/** Improvement metrics (reflective vs baseline). */
export interface EvalImprovement {
  readonly recallDelta: number;
  readonly precisionDelta: number;
  readonly mrrDelta: number;
  readonly latencyDeltaMs: number;
}

// ============================================================================
// Evaluation Dataset
// ============================================================================

/** Rank cut for recall@k / precision@k. */
const TOP_K = 5;

/** Generate synthetic evaluation dataset. */
export function generateEvalDataset(size: number = 50): readonly EvalPair[] {
  const pairs: EvalPair[] = [];
  const sources: EvalPair['source'][] = ['session', 'belief', 'agentic', 'typed'];
  const topics = [
    { query: 'TypeScript error handling', content: 'Use Result types for fallible operations' },
    { query: 'model routing decisions', content: 'CompositeRouter chains TOPSIS and LinUCB' },
    { query: 'authentication flow', content: 'JWT token validation with expiry check' },
    { query: 'database migration strategy', content: 'Use Prisma migrate for schema changes' },
    { query: 'caching layer design', content: 'LRU cache with TTL for hot-path data' },
    { query: 'API rate limiting', content: 'Token bucket algorithm at gateway level' },
    { query: 'test coverage requirements', content: 'Minimum 80% line coverage for modules' },
    { query: 'deployment pipeline', content: 'CI builds, tests, then deploys to staging' },
    { query: 'logging best practices', content: 'Structured JSON logs with correlation IDs' },
    { query: 'security vulnerability scan', content: 'Dependabot and CodeQL automated scans' },
  ];

  // Distinct queries are capped so that every query group holds more than
  // TOP_K memories. A group that fits inside the top-k cut is returned whole
  // however it is ordered, and ordering is the only thing a scorer controls
  // (#4850).
  const queryCount = Math.max(1, Math.min(topics.length, Math.floor(size / (TOP_K * 2))));

  for (let i = 0; i < size; i++) {
    const topicIdx = i % queryCount;
    const topic = topics[topicIdx];
    const source = sources[i % sources.length] ?? 'session';
    const isRelevant = i % 3 !== 0; // ~67% relevant, ~33% irrelevant

    // An irrelevant memory answers the SAME query with ANOTHER topic's
    // content. Giving it a query of its own instead — as this did — made
    // every group homogeneous, so no scorer could change any metric.
    const offset = 1 + (i % (topics.length - 1));
    const contentTopic = isRelevant ? topic : topics[(topicIdx + offset) % topics.length];

    if (topic !== undefined && contentTopic !== undefined) {
      pairs.push({
        query: topic.query,
        memoryKey: `mem-${String(i)}-${source}`,
        memoryContent: contentTopic.content,
        source,
        expectedRelevant: isRelevant,
      });
    }
  }
  return pairs;
}

// ============================================================================
// Scoring
// ============================================================================

/** Simple keyword-based relevance scoring (baseline). */
function baselineScore(query: string, content: string): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();
  let matches = 0;
  for (const word of queryWords) {
    if (word.length > 2 && contentLower.includes(word)) matches++;
  }
  return queryWords.length > 0 ? matches / queryWords.length : 0;
}

/** Reflective scoring with keyword expansion. */
function reflectiveScore(query: string, content: string): number {
  const base = baselineScore(query, content);
  const expanded = expandKeywords(query);
  const contentLower = content.toLowerCase();
  let bonusMatches = 0;
  for (const keyword of expanded) {
    if (contentLower.includes(keyword.toLowerCase())) bonusMatches++;
  }
  const bonus = expanded.length > 0 ? (bonusMatches / expanded.length) * 0.3 : 0;
  return Math.min(1, base + bonus);
}

/** Simulates keyword expansion (reflective retrieval). */
function expandKeywords(query: string): readonly string[] {
  const expansions: Record<string, readonly string[]> = {
    error: ['exception', 'failure', 'fault', 'Result'],
    routing: ['dispatch', 'selection', 'TOPSIS', 'LinUCB'],
    auth: ['token', 'JWT', 'session', 'credential'],
    database: ['schema', 'migration', 'ORM', 'Prisma'],
    cache: ['LRU', 'TTL', 'memoize', 'invalidation'],
    rate: ['throttle', 'bucket', 'limit', 'backoff'],
    test: ['coverage', 'assertion', 'vitest', 'mock'],
    deploy: ['CI', 'pipeline', 'staging', 'rollback'],
    log: ['structured', 'trace', 'correlation', 'JSON'],
    security: ['vulnerability', 'CVE', 'scan', 'audit'],
  };

  const words = query.toLowerCase().split(/\s+/);
  const result: string[] = [];
  for (const word of words) {
    const found = expansions[word];
    if (found !== undefined) result.push(...found);
  }
  return result;
}

// ============================================================================
// Evaluation Runner
// ============================================================================

/** Run evaluation for a single scorer against the dataset. */
function evaluateScorer(
  dataset: readonly EvalPair[],
  scorer: (q: string, c: string) => number
): EvalMetrics {
  const k = TOP_K;
  let totalRecall = 0;
  let recallQueries = 0;
  let totalPrecision = 0;
  let totalMrr = 0;
  const latencies: number[] = [];

  // Group by unique queries
  const queryGroups = groupByQuery(dataset);

  for (const [query, pairs] of queryGroups) {
    const start = performance.now();

    // Score all memories for this query
    const scored = pairs.map((p) => ({
      key: p.memoryKey,
      score: scorer(query, p.memoryContent),
      relevant: p.expectedRelevant,
    }));
    scored.sort((a, b) => b.score - a.score);

    const elapsed = performance.now() - start;
    latencies.push(elapsed);

    // Top-K results
    const topK = scored.slice(0, k);
    const relevantInTopK = topK.filter((s) => s.relevant).length;
    const totalRelevant = pairs.filter((p) => p.expectedRelevant).length;

    // A query with nothing relevant cannot measure recall. Crediting it 1.0
    // put a free perfect score into the mean for every such query (#4850);
    // it is excluded from both numerator and denominator instead.
    if (totalRelevant > 0) {
      totalRecall += relevantInTopK / totalRelevant;
      recallQueries += 1;
    }
    totalPrecision += topK.length > 0 ? relevantInTopK / topK.length : 0;

    // MRR: rank of first relevant
    const firstRelevantIdx = scored.findIndex((s) => s.relevant);
    totalMrr += firstRelevantIdx >= 0 ? 1 / (firstRelevantIdx + 1) : 0;
  }

  const n = queryGroups.size;
  latencies.sort((a, b) => a - b);
  const p95Idx = Math.floor(latencies.length * 0.95);

  return {
    recallAt5: recallQueries > 0 ? round(totalRecall / recallQueries) : 0,
    precisionAt5: n > 0 ? round(totalPrecision / n) : 0,
    mrr: n > 0 ? round(totalMrr / n) : 0,
    avgLatencyMs: round(average(latencies)),
    p95LatencyMs: round(latencies[p95Idx] ?? 0),
    totalQueries: n,
    recallQueries,
  };
}

function groupByQuery(dataset: readonly EvalPair[]): Map<string, EvalPair[]> {
  const groups = new Map<string, EvalPair[]>();
  for (const pair of dataset) {
    const existing = groups.get(pair.query);
    if (existing !== undefined) {
      existing.push(pair);
    } else {
      groups.set(pair.query, [pair]);
    }
  }
  return groups;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function average(arr: readonly number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

// ============================================================================
// Public API
// ============================================================================

/** Run comparative memory evaluation. */
export function runMemoryEval(datasetSize: number = 50): MemoryEvalReport {
  const dataset = generateEvalDataset(datasetSize);
  const baseline = evaluateScorer(dataset, baselineScore);
  const reflective = evaluateScorer(dataset, reflectiveScore);

  const improvement: EvalImprovement = {
    recallDelta: round(reflective.recallAt5 - baseline.recallAt5),
    precisionDelta: round(reflective.precisionAt5 - baseline.precisionAt5),
    mrrDelta: round(reflective.mrr - baseline.mrr),
    latencyDeltaMs: round(reflective.avgLatencyMs - baseline.avgLatencyMs),
  };

  const details = formatEvalDetails(baseline, reflective, improvement, dataset.length);

  return { baseline, reflective, improvement, datasetSize: dataset.length, details };
}

/** Format evaluation report for CLI output. */
export function formatMemoryEvalReport(report: MemoryEvalReport): string {
  return ['\n=== Comparative Memory Evaluation ===\n', ...report.details].join('\n');
}

function formatEvalDetails(
  baseline: EvalMetrics,
  reflective: EvalMetrics,
  improvement: EvalImprovement,
  datasetSize: number
): string[] {
  const lines: string[] = [`Dataset: ${String(datasetSize)} query-memory pairs`];
  if (baseline.recallQueries < baseline.totalQueries) {
    // Recall is undefined for a query with no relevant memory, so those are
    // excluded from the mean. Printing the bare number would present a
    // partial measurement as a complete one (#4850).
    lines.push(
      `Recall measured over ${String(baseline.recallQueries)} of ` +
        `${String(baseline.totalQueries)} queries — the rest had no relevant memory.`
    );
  }

  lines.push('\nBaseline (keyword search):');
  lines.push(`  Recall@5:    ${baseline.recallAt5.toFixed(3)}`);
  lines.push(`  Precision@5: ${baseline.precisionAt5.toFixed(3)}`);
  lines.push(`  MRR:         ${baseline.mrr.toFixed(3)}`);
  lines.push(`  Avg latency: ${baseline.avgLatencyMs.toFixed(2)}ms`);

  lines.push('\nReflective (MemR3 enhanced):');
  lines.push(`  Recall@5:    ${reflective.recallAt5.toFixed(3)}`);
  lines.push(`  Precision@5: ${reflective.precisionAt5.toFixed(3)}`);
  lines.push(`  MRR:         ${reflective.mrr.toFixed(3)}`);
  lines.push(`  Avg latency: ${reflective.avgLatencyMs.toFixed(2)}ms`);

  lines.push('\nImprovement (reflective - baseline):');
  const fmtDelta = (v: number): string => (v >= 0 ? `+${v.toFixed(3)}` : v.toFixed(3));
  lines.push(`  Recall@5:    ${fmtDelta(improvement.recallDelta)}`);
  lines.push(`  Precision@5: ${fmtDelta(improvement.precisionDelta)}`);
  lines.push(`  MRR:         ${fmtDelta(improvement.mrrDelta)}`);
  lines.push(`  Latency:     ${fmtDelta(improvement.latencyDeltaMs)}ms`);

  return lines;
}
