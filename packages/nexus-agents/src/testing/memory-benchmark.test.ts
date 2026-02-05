/**
 * Tests for Memory Benchmark Framework
 *
 * @module testing/memory-benchmark.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  IMemoryBackend,
  MemoryEntry,
  MemoryMetadata,
} from '../context/memory-backend-types.js';
import { MemoryError } from '../context/memory-backend-types.js';
import {
  runMemoryBenchmark,
  generateSyntheticTestCases,
  formatBenchmarkResult,
  validateBenchmarkResults,
  type MemoryBenchmarkResult,
  type RetrievalTestCase,
  type BenchmarkThresholds,
} from './memory-benchmark.js';

// ============================================================================
// Mock Memory Backend
// ============================================================================

function createMockBackend(entries: Map<string, MemoryEntry>): IMemoryBackend {
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
// Tests
// ============================================================================

describe('memory-benchmark', () => {
  let mockBackend: IMemoryBackend;
  let entries: Map<string, MemoryEntry>;

  beforeEach(() => {
    entries = new Map();
    mockBackend = createMockBackend(entries);
  });

  describe('runMemoryBenchmark', () => {
    it('should run benchmark with empty backend', async () => {
      const testCases: RetrievalTestCase[] = [{ query: 'test', relevantKeys: new Set(['key1']) }];

      const result = await runMemoryBenchmark(mockBackend, testCases, { quickMode: true });

      expect(result.recallAtK).toBeDefined();
      expect(result.precisionAtK).toBeDefined();
      expect(result.mrr).toBeDefined();
      expect(result.latencyP50Ms).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should calculate perfect recall when all relevant items are retrieved', async () => {
      // Setup: Add entries that will be found
      await mockBackend.store('key1', { content: 'test content' }, { importance: 'high' });
      await mockBackend.store('key2', { content: 'test data' }, { importance: 'medium' });

      const testCases: RetrievalTestCase[] = [
        { query: 'test', relevantKeys: new Set(['key1', 'key2']) },
      ];

      const result = await runMemoryBenchmark(mockBackend, testCases, { quickMode: true });

      expect(result.recallAtK[5]).toBe(1.0);
      expect(result.recallAtK[10]).toBe(1.0);
    });

    it('should calculate partial recall when some items are not retrieved', async () => {
      // Only add one of the two relevant items
      await mockBackend.store('key1', { content: 'test content' }, { importance: 'high' });

      const testCases: RetrievalTestCase[] = [
        { query: 'test', relevantKeys: new Set(['key1', 'key2']) },
      ];

      const result = await runMemoryBenchmark(mockBackend, testCases, { quickMode: true });

      expect(result.recallAtK[5]).toBe(0.5); // 1 of 2 relevant items
    });

    it('should calculate MRR correctly', async () => {
      // Add entries - relevant one will appear first due to matching
      await mockBackend.store(
        'relevant',
        { content: 'target search term' },
        { importance: 'high' }
      );
      await mockBackend.store('other', { content: 'other stuff' }, { importance: 'medium' });

      const testCases: RetrievalTestCase[] = [
        { query: 'target', relevantKeys: new Set(['relevant']) },
      ];

      const result = await runMemoryBenchmark(mockBackend, testCases, { quickMode: true });

      expect(result.mrr).toBe(1.0); // First result is relevant
    });

    it('should measure latency', async () => {
      const result = await runMemoryBenchmark(mockBackend, [], {
        quickMode: true,
        latencyIterations: 5,
      });

      expect(result.latencyP50Ms).toBeGreaterThanOrEqual(0);
      expect(result.latencyP95Ms).toBeGreaterThanOrEqual(result.latencyP50Ms);
      expect(result.latencyP99Ms).toBeGreaterThanOrEqual(result.latencyP95Ms);
    });

    it('should estimate storage size', async () => {
      await mockBackend.store('key1', { data: 'test value' }, { importance: 'high' });
      await mockBackend.store('key2', { data: 'another value' }, { importance: 'medium' });

      const result = await runMemoryBenchmark(mockBackend, [], { quickMode: true });

      // entryCount includes original entries + latency test entries
      expect(result.entryCount).toBeGreaterThanOrEqual(2);
      expect(result.storageBytes).toBeGreaterThan(0);
    });

    it('should handle multiple K values', async () => {
      await mockBackend.store('key1', { content: 'query match' }, { importance: 'high' });

      const testCases: RetrievalTestCase[] = [{ query: 'query', relevantKeys: new Set(['key1']) }];

      const result = await runMemoryBenchmark(mockBackend, testCases, {
        quickMode: true,
        kValues: [1, 3, 5, 10],
      });

      expect(Object.keys(result.recallAtK)).toEqual(['1', '3', '5', '10']);
      expect(Object.keys(result.precisionAtK)).toEqual(['1', '3', '5', '10']);
    });

    it('should detect orphaned cross-references', async () => {
      // Store one key but not the target
      await mockBackend.store('source-key', { data: 'source' }, { importance: 'high' });

      // Create cross-reference to non-existent target
      const result = await runMemoryBenchmark(mockBackend, [], {
        quickMode: true,
        coherenceConfig: {
          crossReferences: [
            { sourceKey: 'source-key', targetKey: 'valid-target' }, // Will fail
            { sourceKey: 'source-key', targetKey: 'missing-target' }, // Will fail
          ],
        },
      });

      // Both references are orphaned since targets don't exist
      expect(result.coherenceScore).toBe(0);
      expect(result.orphanedRefCount).toBe(2);
    });

    it('should calculate correct coherence with valid and invalid refs', async () => {
      // Store source and one valid target
      await mockBackend.store('source-key', { data: 'source' }, { importance: 'high' });
      await mockBackend.store('valid-target', { data: 'target' }, { importance: 'high' });

      const result = await runMemoryBenchmark(mockBackend, [], {
        quickMode: true,
        coherenceConfig: {
          crossReferences: [
            { sourceKey: 'source-key', targetKey: 'valid-target' }, // Valid
            { sourceKey: 'source-key', targetKey: 'missing-target' }, // Invalid
          ],
        },
      });

      expect(result.coherenceScore).toBe(0.5); // 1 out of 2 valid
      expect(result.orphanedRefCount).toBe(1);
    });

    it('should calculate avgBytesPerEntry', async () => {
      await mockBackend.store('key1', { data: 'test' }, { importance: 'high' });
      await mockBackend.store('key2', { data: 'test2' }, { importance: 'medium' });

      const result = await runMemoryBenchmark(mockBackend, [], { quickMode: true });

      expect(result.avgBytesPerEntry).toBeGreaterThan(0);
      expect(result.avgBytesPerEntry).toBe(result.storageBytes / result.entryCount);
    });
  });

  describe('generateSyntheticTestCases', () => {
    it('should create test entries in the backend', async () => {
      const testCases = await generateSyntheticTestCases(mockBackend, 30);

      expect(testCases.length).toBeGreaterThan(0);
      expect(entries.size).toBeGreaterThan(0);
    });

    it('should create test cases for each topic', async () => {
      const testCases = await generateSyntheticTestCases(mockBackend, 50);

      const queries = testCases.map((tc) => tc.query);
      expect(queries).toContain('typescript');
      expect(queries).toContain('react');
      expect(queries).toContain('nodejs');
    });

    it('should mark correct keys as relevant', async () => {
      const testCases = await generateSyntheticTestCases(mockBackend, 12);

      for (const testCase of testCases) {
        expect(testCase.relevantKeys.size).toBeGreaterThan(0);
        // All relevant keys should start with 'synth-{topic}'
        for (const key of testCase.relevantKeys) {
          expect(key).toMatch(/^synth-\w+-\d+$/);
        }
      }
    });
  });

  describe('formatBenchmarkResult', () => {
    it('should format results as string', () => {
      const result: MemoryBenchmarkResult = {
        recallAtK: { 1: 0.8, 5: 0.9, 10: 0.95 },
        precisionAtK: { 1: 0.7, 5: 0.6, 10: 0.5 },
        mrr: 0.85,
        latencyP50Ms: 1.5,
        latencyP95Ms: 5.2,
        latencyP99Ms: 10.1,
        storageBytes: 10240,
        entryCount: 100,
        coherenceScore: 0.98,
        timestamp: new Date('2026-02-04T12:00:00Z'),
        durationMs: 500,
        avgBytesPerEntry: 102.4,
        orphanedRefCount: 0,
        growthRateBytesPerOp: 256,
        decayConsistencyScore: 1.0,
      };

      const formatted = formatBenchmarkResult(result);

      expect(formatted).toContain('Memory Benchmark Results');
      expect(formatted).toContain('Recall@5: 90.0%');
      expect(formatted).toContain('MRR: 0.850');
      expect(formatted).toContain('P50: 1.50ms');
      expect(formatted).toContain('P95: 5.20ms');
      expect(formatted).toContain('Entries: 100');
      expect(formatted).toContain('Score: 98.0%');
      expect(formatted).toContain('Avg bytes/entry: 102 bytes');
    });
  });

  describe('validateBenchmarkResults', () => {
    const baseResult: MemoryBenchmarkResult = {
      recallAtK: { 1: 0.8, 5: 0.9, 10: 0.95 },
      precisionAtK: { 1: 0.7, 5: 0.75, 10: 0.7 },
      mrr: 0.85,
      latencyP50Ms: 1.5,
      latencyP95Ms: 5.2,
      latencyP99Ms: 10.1,
      storageBytes: 10240,
      entryCount: 100,
      coherenceScore: 0.98,
      timestamp: new Date(),
      durationMs: 500,
      avgBytesPerEntry: 102.4,
      orphanedRefCount: 0,
      growthRateBytesPerOp: 256,
      decayConsistencyScore: 1.0,
    };

    it('should pass when all thresholds are met', () => {
      const thresholds: BenchmarkThresholds = {
        minRecallAt5: 0.8,
        minPrecisionAt5: 0.7,
        minMrr: 0.8,
        maxLatencyP95Ms: 10,
        minCoherenceScore: 0.95,
      };

      const validation = validateBenchmarkResults(baseResult, thresholds);

      expect(validation.pass).toBe(true);
      expect(validation.failures).toEqual([]);
    });

    it('should fail when recall is below threshold', () => {
      const thresholds: BenchmarkThresholds = {
        minRecallAt5: 0.95, // Higher than actual 0.9
      };

      const validation = validateBenchmarkResults(baseResult, thresholds);

      expect(validation.pass).toBe(false);
      expect(validation.failures).toHaveLength(1);
      expect(validation.failures[0]).toContain('Recall@5');
    });

    it('should fail when latency exceeds threshold', () => {
      const thresholds: BenchmarkThresholds = {
        maxLatencyP95Ms: 3, // Lower than actual 5.2
      };

      const validation = validateBenchmarkResults(baseResult, thresholds);

      expect(validation.pass).toBe(false);
      expect(validation.failures).toHaveLength(1);
      expect(validation.failures[0]).toContain('P95 latency');
    });

    it('should report multiple failures', () => {
      const thresholds: BenchmarkThresholds = {
        minRecallAt5: 0.95,
        minMrr: 0.9,
        maxLatencyP95Ms: 3,
      };

      const validation = validateBenchmarkResults(baseResult, thresholds);

      expect(validation.pass).toBe(false);
      expect(validation.failures.length).toBeGreaterThanOrEqual(2);
    });

    it('should pass with empty thresholds', () => {
      const validation = validateBenchmarkResults(baseResult, {});

      expect(validation.pass).toBe(true);
      expect(validation.failures).toEqual([]);
    });
  });
});
