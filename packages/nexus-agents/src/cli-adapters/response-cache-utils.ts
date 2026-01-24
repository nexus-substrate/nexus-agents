/**
 * nexus-agents/cli-adapters - Response Cache Utilities
 *
 * Utility functions for cache key generation and size estimation.
 *
 * @module cli-adapters/response-cache-utils
 * (Source: Issue #358)
 */

import { createHash } from 'node:crypto';
import type { CacheKeyOptions } from './response-cache-types.js';

/**
 * Estimates the size of a value in bytes.
 * Uses JSON serialization for approximation.
 */
export function estimateSize(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    // Rough estimate: 2 bytes per character (UTF-16) + overhead
    return json.length * 2 + 64;
  } catch {
    // Fallback for circular references or non-serializable
    return 1024;
  }
}

/**
 * Generates a deterministic cache key from adapter, prompt, and options.
 * Uses SHA-256 hash for consistent key generation.
 */
export function generateCacheKey(options: CacheKeyOptions): string {
  const { adapter, prompt, options: opts } = options;

  // Normalize options by sorting keys for deterministic hashing
  const normalizedOptions = opts !== undefined ? sortObjectKeys(opts) : {};

  const content = JSON.stringify({
    adapter,
    prompt,
    options: normalizedOptions,
  });

  const hash = createHash('sha256').update(content).digest('hex');
  return `${adapter}:${hash.slice(0, 16)}`;
}

/**
 * Recursively sorts object keys for deterministic serialization.
 */
export function sortObjectKeys(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sortObjectKeys(item));
  }

  const record = obj as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(record).sort();
  for (const key of keys) {
    sorted[key] = sortObjectKeys(record[key]);
  }
  return sorted;
}
