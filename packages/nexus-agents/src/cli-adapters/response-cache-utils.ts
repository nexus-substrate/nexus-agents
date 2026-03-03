/**
 * nexus-agents/cli-adapters - Response Cache Utilities
 *
 * Utility functions for cache key generation and size estimation.
 *
 * @module cli-adapters/response-cache-utils
 * (Source: Issue #358)
 */

import { createHash } from 'node:crypto';
import { createLogger } from '../core/index.js';
import type { CacheKeyOptions } from './response-cache-types.js';

const logger = createLogger({ component: 'ResponseCacheUtils' });

/** Bytes per UTF-16 character for size estimation. */
const BYTES_PER_CHAR = 2;

/** Fixed overhead bytes added to serialized size estimate. */
const SERIALIZATION_OVERHEAD = 64;

/** Fallback size in bytes when value cannot be serialized. */
const FALLBACK_SIZE_BYTES = 1024;

/**
 * Estimates the size of a value in bytes.
 * Uses JSON serialization for approximation.
 */
export function estimateSize(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json.length * BYTES_PER_CHAR + SERIALIZATION_OVERHEAD;
  } catch (error: unknown) {
    logger.debug('Size estimation failed, using fallback', { error: String(error) });
    return FALLBACK_SIZE_BYTES;
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
