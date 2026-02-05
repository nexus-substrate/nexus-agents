/**
 * Tests for task-analysis-keywords.ts
 *
 * Validates keyword registries: regex patterns compile, weights are valid,
 * and all expected task type categories have entries.
 */

import { describe, it, expect } from 'vitest';
import {
  REASONING_PATTERNS,
  KNOWLEDGE_PATTERNS,
  TASK_TYPE_KEYWORDS,
  HIGH_COMPLEXITY_KEYWORDS,
  CODE_GEN_KEYWORDS,
  MULTIMODAL_KEYWORDS,
  PARALLEL_KEYWORDS,
} from './task-analysis-keywords.js';

// ============================================================================
// REASONING_PATTERNS
// ============================================================================

describe('REASONING_PATTERNS', () => {
  it('is a non-empty array', () => {
    expect(REASONING_PATTERNS.length).toBeGreaterThan(0);
  });

  it('all patterns have valid regex', () => {
    for (const entry of REASONING_PATTERNS) {
      expect(entry.pattern).toBeInstanceOf(RegExp);
      expect(() => entry.pattern.test('test')).not.toThrow();
    }
  });

  it('all weights are positive and <= 1', () => {
    for (const entry of REASONING_PATTERNS) {
      expect(entry.weight).toBeGreaterThan(0);
      expect(entry.weight).toBeLessThanOrEqual(1);
    }
  });

  it('all entries have non-empty names', () => {
    for (const entry of REASONING_PATTERNS) {
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it('includes causal-question pattern', () => {
    const causal = REASONING_PATTERNS.find((p) => p.name === 'causal-question');
    expect(causal).toBeDefined();
    expect(causal?.pattern.test('why does this fail')).toBe(true);
  });

  it('includes problem-solving pattern', () => {
    const solving = REASONING_PATTERNS.find((p) => p.name === 'problem-solving');
    expect(solving).toBeDefined();
    expect(solving?.pattern.test('solve this equation')).toBe(true);
  });
});

// ============================================================================
// KNOWLEDGE_PATTERNS
// ============================================================================

describe('KNOWLEDGE_PATTERNS', () => {
  it('is a non-empty array', () => {
    expect(KNOWLEDGE_PATTERNS.length).toBeGreaterThan(0);
  });

  it('all patterns have valid regex', () => {
    for (const entry of KNOWLEDGE_PATTERNS) {
      expect(entry.pattern).toBeInstanceOf(RegExp);
    }
  });

  it('all weights are positive and <= 1', () => {
    for (const entry of KNOWLEDGE_PATTERNS) {
      expect(entry.weight).toBeGreaterThan(0);
      expect(entry.weight).toBeLessThanOrEqual(1);
    }
  });

  it('includes factual-question pattern', () => {
    const factual = KNOWLEDGE_PATTERNS.find((p) => p.name === 'factual-question');
    expect(factual).toBeDefined();
    expect(factual?.pattern.test('what is a monad')).toBe(true);
  });

  it('includes definition-request pattern', () => {
    const def = KNOWLEDGE_PATTERNS.find((p) => p.name === 'definition-request');
    expect(def).toBeDefined();
    expect(def?.pattern.test('define idempotency')).toBe(true);
  });
});

// ============================================================================
// TASK_TYPE_KEYWORDS
// ============================================================================

describe('TASK_TYPE_KEYWORDS', () => {
  it('has all 8 task type categories', () => {
    const categories = Object.keys(TASK_TYPE_KEYWORDS);
    expect(categories).toContain('architecture');
    expect(categories).toContain('code_implementation');
    expect(categories).toContain('code_review');
    expect(categories).toContain('test_generation');
    expect(categories).toContain('documentation');
    expect(categories).toContain('large_codebase');
    expect(categories).toContain('bulk_operations');
    expect(categories).toContain('general');
  });

  it('general category has empty keywords', () => {
    expect(TASK_TYPE_KEYWORDS.general).toHaveLength(0);
  });

  it('non-general categories have keywords', () => {
    for (const [category, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
      if (category !== 'general') {
        expect(keywords.length).toBeGreaterThan(0);
      }
    }
  });

  it('architecture keywords include expected terms', () => {
    expect(TASK_TYPE_KEYWORDS.architecture).toContain('architecture');
    expect(TASK_TYPE_KEYWORDS.architecture).toContain('scalability');
  });

  it('test_generation keywords include expected terms', () => {
    expect(TASK_TYPE_KEYWORDS.test_generation).toContain('unit test');
    expect(TASK_TYPE_KEYWORDS.test_generation).toContain('vitest');
  });

  it('all keywords are non-empty strings', () => {
    for (const keywords of Object.values(TASK_TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        expect(typeof keyword).toBe('string');
        expect(keyword.length).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================================
// Keyword arrays
// ============================================================================

describe('HIGH_COMPLEXITY_KEYWORDS', () => {
  it('is a non-empty array of strings', () => {
    expect(HIGH_COMPLEXITY_KEYWORDS.length).toBeGreaterThan(0);
    for (const kw of HIGH_COMPLEXITY_KEYWORDS) {
      expect(typeof kw).toBe('string');
    }
  });

  it('includes expected complexity indicators', () => {
    expect(HIGH_COMPLEXITY_KEYWORDS).toContain('complex');
    expect(HIGH_COMPLEXITY_KEYWORDS).toContain('race condition');
    expect(HIGH_COMPLEXITY_KEYWORDS).toContain('memory leak');
  });
});

describe('CODE_GEN_KEYWORDS', () => {
  it('is a non-empty array of strings', () => {
    expect(CODE_GEN_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('includes expected generation verbs', () => {
    expect(CODE_GEN_KEYWORDS).toContain('implement');
    expect(CODE_GEN_KEYWORDS).toContain('generate');
    expect(CODE_GEN_KEYWORDS).toContain('test');
  });
});

describe('MULTIMODAL_KEYWORDS', () => {
  it('is a non-empty array of strings', () => {
    expect(MULTIMODAL_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('includes visual and audio indicators', () => {
    expect(MULTIMODAL_KEYWORDS).toContain('image');
    expect(MULTIMODAL_KEYWORDS).toContain('audio');
    expect(MULTIMODAL_KEYWORDS).toContain('diagram');
  });
});

describe('PARALLEL_KEYWORDS', () => {
  it('is a non-empty array of strings', () => {
    expect(PARALLEL_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('includes parallelism indicators', () => {
    expect(PARALLEL_KEYWORDS).toContain('parallel');
    expect(PARALLEL_KEYWORDS).toContain('batch');
    expect(PARALLEL_KEYWORDS).toContain('concurrent');
  });
});
