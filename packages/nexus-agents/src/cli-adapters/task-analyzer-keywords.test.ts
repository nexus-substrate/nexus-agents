/**
 * nexus-agents/cli-adapters - Task Analyzer Keywords Tests
 *
 * Tests for keyword constants used in task type classification.
 */

import { describe, it, expect } from 'vitest';
import {
  type TaskType,
  TASK_TYPE_KEYWORDS,
  HIGH_COMPLEXITY_KEYWORDS,
  CODE_GENERATION_KEYWORDS,
  MULTIMODAL_KEYWORDS,
  PARALLELIZABLE_KEYWORDS,
  BUDGET_SENSITIVE_KEYWORDS,
  IMAGE_EXTENSIONS,
  TYPE_COMPLEXITY,
} from './task-analyzer-keywords.js';

describe('TASK_TYPE_KEYWORDS', () => {
  const ALL_TASK_TYPES: TaskType[] = [
    'architecture',
    'code_implementation',
    'code_review',
    'test_generation',
    'documentation',
    'large_codebase',
    'bulk_operations',
    'general',
  ];

  it('has all 8 TaskType keys', () => {
    const keys = Object.keys(TASK_TYPE_KEYWORDS);
    expect(keys).toHaveLength(8);
    expect(keys.sort()).toEqual(ALL_TASK_TYPES.sort());
  });

  it('each type (except general) has keywords', () => {
    for (const taskType of ALL_TASK_TYPES) {
      if (taskType === 'general') {
        continue;
      }
      const keywords = TASK_TYPE_KEYWORDS[taskType];
      expect(keywords.length).toBeGreaterThan(0);
    }
  });

  it('general type has empty array', () => {
    expect(TASK_TYPE_KEYWORDS.general).toEqual([]);
  });

  it('keywords within each type are unique', () => {
    for (const taskType of ALL_TASK_TYPES) {
      const keywords = TASK_TYPE_KEYWORDS[taskType];
      const unique = new Set(keywords);
      expect(unique.size).toBe(keywords.length);
    }
  });

  it('all keywords are lowercase', () => {
    for (const taskType of ALL_TASK_TYPES) {
      const keywords = TASK_TYPE_KEYWORDS[taskType];
      for (const keyword of keywords) {
        expect(keyword).toBe(keyword.toLowerCase());
      }
    }
  });

  it('specific keywords are in expected types', () => {
    expect(TASK_TYPE_KEYWORDS.code_implementation).toContain('implement');
    expect(TASK_TYPE_KEYWORDS.test_generation).toContain('test');
    expect(TASK_TYPE_KEYWORDS.code_review).toContain('review');
    expect(TASK_TYPE_KEYWORDS.architecture).toContain('architecture');
    expect(TASK_TYPE_KEYWORDS.documentation).toContain('document');
  });
});

describe('HIGH_COMPLEXITY_KEYWORDS', () => {
  it('is non-empty', () => {
    expect(HIGH_COMPLEXITY_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('has exactly 17 keywords', () => {
    expect(HIGH_COMPLEXITY_KEYWORDS.length).toBe(17);
  });

  it('all elements are strings', () => {
    for (const keyword of HIGH_COMPLEXITY_KEYWORDS) {
      expect(typeof keyword).toBe('string');
      expect(keyword.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicates', () => {
    const unique = new Set(HIGH_COMPLEXITY_KEYWORDS);
    expect(unique.size).toBe(HIGH_COMPLEXITY_KEYWORDS.length);
  });
});

describe('CODE_GENERATION_KEYWORDS', () => {
  it('is non-empty', () => {
    expect(CODE_GENERATION_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('has exactly 14 keywords', () => {
    expect(CODE_GENERATION_KEYWORDS.length).toBe(14);
  });

  it('all elements are strings', () => {
    for (const keyword of CODE_GENERATION_KEYWORDS) {
      expect(typeof keyword).toBe('string');
      expect(keyword.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicates', () => {
    const unique = new Set(CODE_GENERATION_KEYWORDS);
    expect(unique.size).toBe(CODE_GENERATION_KEYWORDS.length);
  });
});

describe('MULTIMODAL_KEYWORDS', () => {
  it('is non-empty', () => {
    expect(MULTIMODAL_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('has exactly 11 keywords', () => {
    expect(MULTIMODAL_KEYWORDS.length).toBe(11);
  });

  it('all elements are strings', () => {
    for (const keyword of MULTIMODAL_KEYWORDS) {
      expect(typeof keyword).toBe('string');
      expect(keyword.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicates', () => {
    const unique = new Set(MULTIMODAL_KEYWORDS);
    expect(unique.size).toBe(MULTIMODAL_KEYWORDS.length);
  });
});

describe('PARALLELIZABLE_KEYWORDS', () => {
  it('is non-empty', () => {
    expect(PARALLELIZABLE_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('has exactly 10 keywords', () => {
    expect(PARALLELIZABLE_KEYWORDS.length).toBe(10);
  });

  it('all elements are strings', () => {
    for (const keyword of PARALLELIZABLE_KEYWORDS) {
      expect(typeof keyword).toBe('string');
      expect(keyword.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicates', () => {
    const unique = new Set(PARALLELIZABLE_KEYWORDS);
    expect(unique.size).toBe(PARALLELIZABLE_KEYWORDS.length);
  });
});

describe('BUDGET_SENSITIVE_KEYWORDS', () => {
  it('is non-empty', () => {
    expect(BUDGET_SENSITIVE_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('has exactly 10 keywords', () => {
    expect(BUDGET_SENSITIVE_KEYWORDS.length).toBe(10);
  });

  it('all elements are strings', () => {
    for (const keyword of BUDGET_SENSITIVE_KEYWORDS) {
      expect(typeof keyword).toBe('string');
      expect(keyword.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicates', () => {
    const unique = new Set(BUDGET_SENSITIVE_KEYWORDS);
    expect(unique.size).toBe(BUDGET_SENSITIVE_KEYWORDS.length);
  });
});

describe('IMAGE_EXTENSIONS', () => {
  it('all extensions start with dot', () => {
    for (const ext of IMAGE_EXTENSIONS) {
      expect(ext.startsWith('.')).toBe(true);
    }
  });

  it('includes common formats', () => {
    expect(IMAGE_EXTENSIONS).toContain('.png');
    expect(IMAGE_EXTENSIONS).toContain('.jpg');
    expect(IMAGE_EXTENSIONS).toContain('.jpeg');
    expect(IMAGE_EXTENSIONS).toContain('.gif');
    expect(IMAGE_EXTENSIONS).toContain('.svg');
    expect(IMAGE_EXTENSIONS).toContain('.webp');
  });

  it('has exactly 6 extensions', () => {
    expect(IMAGE_EXTENSIONS.length).toBe(6);
  });

  it('has no duplicates', () => {
    const unique = new Set(IMAGE_EXTENSIONS);
    expect(unique.size).toBe(IMAGE_EXTENSIONS.length);
  });
});

describe('TYPE_COMPLEXITY', () => {
  const ALL_TASK_TYPES: TaskType[] = [
    'architecture',
    'code_implementation',
    'code_review',
    'test_generation',
    'documentation',
    'large_codebase',
    'bulk_operations',
    'general',
  ];

  it('has all 8 TaskType keys', () => {
    const keys = Object.keys(TYPE_COMPLEXITY);
    expect(keys).toHaveLength(8);
    expect(keys.sort()).toEqual(ALL_TASK_TYPES.sort());
  });

  it('all values are positive numbers', () => {
    for (const taskType of ALL_TASK_TYPES) {
      const complexity = TYPE_COMPLEXITY[taskType];
      expect(typeof complexity).toBe('number');
      expect(complexity).toBeGreaterThan(0);
    }
  });

  it('architecture has highest complexity score', () => {
    const architectureScore = TYPE_COMPLEXITY.architecture;
    expect(architectureScore).toBe(8);

    for (const taskType of ALL_TASK_TYPES) {
      if (taskType === 'architecture') {
        continue;
      }
      expect(TYPE_COMPLEXITY[taskType]).toBeLessThanOrEqual(architectureScore);
    }
  });

  it('complexity ordering is correct', () => {
    expect(TYPE_COMPLEXITY.architecture).toBeGreaterThan(TYPE_COMPLEXITY.code_review);
    expect(TYPE_COMPLEXITY.code_review).toBeGreaterThan(TYPE_COMPLEXITY.code_implementation);
    expect(TYPE_COMPLEXITY.code_implementation).toBeGreaterThan(TYPE_COMPLEXITY.test_generation);
    expect(TYPE_COMPLEXITY.test_generation).toBeGreaterThan(TYPE_COMPLEXITY.documentation);
  });

  it('specific complexity values match expected', () => {
    expect(TYPE_COMPLEXITY.architecture).toBe(8);
    expect(TYPE_COMPLEXITY.code_review).toBe(6);
    expect(TYPE_COMPLEXITY.large_codebase).toBe(6);
    expect(TYPE_COMPLEXITY.code_implementation).toBe(5);
    expect(TYPE_COMPLEXITY.test_generation).toBe(4);
    expect(TYPE_COMPLEXITY.general).toBe(4);
    expect(TYPE_COMPLEXITY.documentation).toBe(3);
    expect(TYPE_COMPLEXITY.bulk_operations).toBe(3);
  });
});

describe('Cross-array validation', () => {
  it('major keyword arrays do not overlap excessively', () => {
    const highComplexity = new Set(HIGH_COMPLEXITY_KEYWORDS);
    const codeGeneration = new Set(CODE_GENERATION_KEYWORDS);

    // Some overlap is expected (e.g., "architecture" in both),
    // but should not be excessive
    const overlap = [...highComplexity].filter((k) => codeGeneration.has(k));

    // Allow small overlap but flag if more than 30%
    const overlapRatio =
      overlap.length / Math.min(HIGH_COMPLEXITY_KEYWORDS.length, CODE_GENERATION_KEYWORDS.length);
    expect(overlapRatio).toBeLessThan(0.3);
  });

  it('all keyword arrays contain only non-empty strings', () => {
    const allArrays = [
      HIGH_COMPLEXITY_KEYWORDS,
      CODE_GENERATION_KEYWORDS,
      MULTIMODAL_KEYWORDS,
      PARALLELIZABLE_KEYWORDS,
      BUDGET_SENSITIVE_KEYWORDS,
    ];

    for (const arr of allArrays) {
      for (const keyword of arr) {
        expect(typeof keyword).toBe('string');
        expect(keyword.length).toBeGreaterThan(0);
      }
    }
  });
});
