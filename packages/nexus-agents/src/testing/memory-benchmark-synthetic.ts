/**
 * Memory Benchmark Synthetic Data Generation
 *
 * Generates synthetic test data for memory benchmark evaluation.
 *
 * @module testing/memory-benchmark-synthetic
 * (Source: Issue #748 - Memory evaluation framework)
 */

import type { IMemoryBackend, MemoryMetadata } from '../context/memory-backend-types.js';
import type { RetrievalTestCase } from './memory-benchmark.js';

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
