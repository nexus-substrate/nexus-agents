/**
 * Tests for MemR3 Reflective Memory Retriever
 *
 * @module mcp/tools/reflective-retriever.test
 * (Source: Issue #988)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ReflectiveRetriever,
  ReflectionCache,
  ReflectionCriteriaSchema,
  isReflectiveMemoryEnabled,
  isReflectiveShadowMode,
} from './reflective-retriever.js';
import type { IModelAdapter } from '../../core/index.js';
import { createLogger } from '../../core/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

const silentLogger = createLogger({ component: 'test', level: 'silent' });

function createMockAdapter(response: string, delay = 0): IModelAdapter {
  return {
    modelId: 'test-model',
    providerId: 'test',

    complete: vi.fn(async () => {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return {
        ok: true as const,
        value: {
          content: response,
          model: 'test-model',
          usage: { inputTokens: 10, outputTokens: 20 },
        },
      };
    }),
  } as unknown as IModelAdapter;
}

function createFailingAdapter(errorMessage: string): IModelAdapter {
  return {
    modelId: 'test-model',
    providerId: 'test',
    // eslint-disable-next-line @typescript-eslint/require-await
    complete: vi.fn(async () => ({
      ok: false as const,
      error: { message: errorMessage, code: 'TEST_ERROR' },
    })),
  } as unknown as IModelAdapter;
}

// Valid reflection response
const VALID_REFLECTION = JSON.stringify({
  keywords: ['routing', 'model', 'selection', 'performance', 'latency'],
  context: 'Past experiences with model routing and performance optimization',
});

// ============================================================================
// ReflectionCriteriaSchema
// ============================================================================

describe('ReflectionCriteriaSchema', () => {
  it('should parse valid criteria', () => {
    const result = ReflectionCriteriaSchema.safeParse({
      keywords: ['routing', 'model'],
      context: 'About routing',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty keywords', () => {
    const result = ReflectionCriteriaSchema.safeParse({
      keywords: [],
      context: 'About routing',
    });
    expect(result.success).toBe(false);
  });

  it('should reject too many keywords', () => {
    const result = ReflectionCriteriaSchema.safeParse({
      keywords: Array.from({ length: 11 }, (_, i) => `kw${String(i)}`),
      context: 'Too many',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing context', () => {
    const result = ReflectionCriteriaSchema.safeParse({
      keywords: ['test'],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// ReflectionCache
// ============================================================================

describe('ReflectionCache', () => {
  it('should store and retrieve criteria', () => {
    const cache = new ReflectionCache();
    const criteria = { keywords: ['test'], context: 'test context' };
    cache.set('my query', criteria);
    expect(cache.get('my query')).toEqual(criteria);
  });

  it('should normalize keys (case-insensitive, trimmed)', () => {
    const cache = new ReflectionCache();
    const criteria = { keywords: ['test'], context: 'ctx' };
    cache.set('  My Query  ', criteria);
    expect(cache.get('my query')).toEqual(criteria);
    expect(cache.get('MY QUERY')).toEqual(criteria);
  });

  it('should return undefined for cache miss', () => {
    const cache = new ReflectionCache();
    expect(cache.get('unknown')).toBeUndefined();
  });

  it('should evict oldest entry when full', () => {
    const cache = new ReflectionCache(2);
    const c1 = { keywords: ['a'], context: 'a' };
    const c2 = { keywords: ['b'], context: 'b' };
    const c3 = { keywords: ['c'], context: 'c' };
    cache.set('q1', c1);
    cache.set('q2', c2);
    cache.set('q3', c3); // Should evict q1
    expect(cache.get('q1')).toBeUndefined();
    expect(cache.get('q2')).toEqual(c2);
    expect(cache.get('q3')).toEqual(c3);
  });

  it('should expire entries after TTL', () => {
    vi.useFakeTimers();
    const cache = new ReflectionCache(50, 1000); // 1s TTL
    cache.set('q', { keywords: ['x'], context: 'x' });
    expect(cache.get('q')).toBeDefined();
    vi.advanceTimersByTime(1001);
    expect(cache.get('q')).toBeUndefined();
    vi.useRealTimers();
  });

  it('should track size correctly', () => {
    const cache = new ReflectionCache();
    expect(cache.size).toBe(0);
    cache.set('q1', { keywords: ['a'], context: 'a' });
    expect(cache.size).toBe(1);
    cache.set('q2', { keywords: ['b'], context: 'b' });
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

// ============================================================================
// ReflectiveRetriever
// ============================================================================

describe('ReflectiveRetriever', () => {
  it('should enhance query with LLM reflection', async () => {
    const adapter = createMockAdapter(VALID_REFLECTION);
    const retriever = new ReflectiveRetriever({
      adapter,
      logger: silentLogger,
    });

    const result = await retriever.enhance('optimize model routing performance');

    expect(result.reflected).toBe(true);
    expect(result.source).toBe('llm');
    expect(result.keywords.length).toBeGreaterThan(3);
    // Should contain original keywords
    expect(result.keywords).toContain('optimize');
    expect(result.keywords).toContain('model');
    // Should contain expanded keywords
    expect(result.keywords).toContain('selection');
    expect(result.keywords).toContain('latency');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should use cache on repeated queries', async () => {
    const adapter = createMockAdapter(VALID_REFLECTION);
    const retriever = new ReflectiveRetriever({
      adapter,
      logger: silentLogger,
    });

    await retriever.enhance('test query');
    const result = await retriever.enhance('test query');

    expect(result.source).toBe('cache');
    expect(result.reflected).toBe(true);
    // Adapter should only be called once
    expect(adapter.complete).toHaveBeenCalledTimes(1);
  });

  it('should fall back on adapter failure', async () => {
    const adapter = createFailingAdapter('Connection failed');
    const retriever = new ReflectiveRetriever({
      adapter,
      logger: silentLogger,
    });

    const result = await retriever.enhance('test query here');

    expect(result.reflected).toBe(false);
    expect(result.source).toBe('fallback');
    // Should return original keywords
    expect(result.keywords).toContain('test');
    expect(result.keywords).toContain('query');
    expect(result.keywords).toContain('here');
  });

  it('should fall back on invalid JSON response', async () => {
    const adapter = createMockAdapter('This is not JSON at all');
    const retriever = new ReflectiveRetriever({
      adapter,
      logger: silentLogger,
    });

    const result = await retriever.enhance('test query');

    expect(result.reflected).toBe(false);
    expect(result.source).toBe('fallback');
  });

  it('should fall back on timeout', async () => {
    const adapter = createMockAdapter(VALID_REFLECTION, 5000); // 5s delay
    const retriever = new ReflectiveRetriever({
      adapter,
      logger: silentLogger,
      timeoutMs: 100, // 100ms timeout
    });

    const result = await retriever.enhance('test query');

    expect(result.reflected).toBe(false);
    expect(result.source).toBe('fallback');
  });

  it('should handle markdown-fenced JSON in response', async () => {
    const fenced = '```json\n' + VALID_REFLECTION + '\n```';
    const adapter = createMockAdapter(fenced);
    const retriever = new ReflectiveRetriever({
      adapter,
      logger: silentLogger,
    });

    const result = await retriever.enhance('test query');

    expect(result.reflected).toBe(true);
    expect(result.source).toBe('llm');
  });

  it('should deduplicate merged keywords', async () => {
    const response = JSON.stringify({
      keywords: ['test', 'query', 'new_keyword'],
      context: 'Relevant context',
    });
    const adapter = createMockAdapter(response);
    const retriever = new ReflectiveRetriever({
      adapter,
      logger: silentLogger,
    });

    const result = await retriever.enhance('test query');

    // 'test' and 'query' should not be duplicated
    const unique = new Set(result.keywords);
    expect(unique.size).toBe(result.keywords.length);
  });

  it('should filter short keywords from expansion', async () => {
    const response = JSON.stringify({
      keywords: ['ab', 'routing', 'x', 'performance'],
      context: 'Context',
    });
    const adapter = createMockAdapter(response);
    const retriever = new ReflectiveRetriever({
      adapter,
      logger: silentLogger,
    });

    const result = await retriever.enhance('test query');

    // 'ab' and 'x' should be filtered (length <= 2)
    expect(result.keywords).not.toContain('ab');
    expect(result.keywords).not.toContain('x');
    expect(result.keywords).toContain('routing');
  });

  describe('shadow mode', () => {
    it('should log comparison but return original keywords', async () => {
      const adapter = createMockAdapter(VALID_REFLECTION);
      const retriever = new ReflectiveRetriever({
        adapter,
        logger: silentLogger,
        shadowMode: true,
      });

      const result = await retriever.enhance('optimize routing');

      expect(result.reflected).toBe(false);
      expect(result.source).toBe('fallback');
      // Should return only original keywords
      expect(result.keywords).toContain('optimize');
      expect(result.keywords).toContain('routing');
      expect(result.keywords).not.toContain('latency');
      // LLM should still have been called
      expect(adapter.complete).toHaveBeenCalledTimes(1);
    });

    it('should cache criteria even in shadow mode', async () => {
      const adapter = createMockAdapter(VALID_REFLECTION);
      const cache = new ReflectionCache();
      const retriever = new ReflectiveRetriever({
        adapter,
        logger: silentLogger,
        shadowMode: true,
        cache,
      });

      await retriever.enhance('test query');

      // Criteria should be cached for later non-shadow use
      expect(cache.get('test query')).toBeDefined();
    });
  });
});

// ============================================================================
// Feature Flags
// ============================================================================

describe('feature flags', () => {
  const originalEnv = process.env.NEXUS_REFLECTIVE_MEMORY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXUS_REFLECTIVE_MEMORY = originalEnv;
    } else {
      delete process.env.NEXUS_REFLECTIVE_MEMORY;
    }
  });

  it('should be disabled by default', () => {
    delete process.env.NEXUS_REFLECTIVE_MEMORY;
    expect(isReflectiveMemoryEnabled()).toBe(false);
    expect(isReflectiveShadowMode()).toBe(false);
  });

  it('should be enabled when set to true', () => {
    process.env.NEXUS_REFLECTIVE_MEMORY = 'true';
    expect(isReflectiveMemoryEnabled()).toBe(true);
    expect(isReflectiveShadowMode()).toBe(false);
  });

  it('should detect shadow mode', () => {
    process.env.NEXUS_REFLECTIVE_MEMORY = 'shadow';
    expect(isReflectiveMemoryEnabled()).toBe(false);
    expect(isReflectiveShadowMode()).toBe(true);
  });
});
