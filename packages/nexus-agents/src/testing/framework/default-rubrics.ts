/**
 * nexus-agents/testing/framework - Default Rubrics
 *
 * Default evaluation rubrics for common task categories.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import type { EvaluationRubric } from './types.js';

/**
 * Configuration for pattern matching scoring.
 */
interface PatternMatchConfig {
  readonly patterns?: readonly string[];
  readonly caseSensitive?: boolean;
  readonly matchAll?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Configuration for keyword presence scoring.
 */
interface KeywordPresenceConfig {
  readonly keywords?: readonly string[];
  readonly minCount?: number;
  readonly caseSensitive?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Configuration for length check scoring.
 */
interface LengthCheckConfig {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly targetLength?: number;
  readonly [key: string]: unknown;
}

/**
 * Default evaluation rubrics for common task categories.
 */
export const DEFAULT_RUBRICS: readonly EvaluationRubric[] = [
  {
    id: 'code-generation',
    categories: ['code_generation', 'refactoring'],
    criteria: [
      {
        id: 'syntax-correctness',
        description: 'Code has correct syntax',
        weight: 0.3,
        scoringFunction: 'keyword_presence',
        config: {
          keywords: ['function', 'const', 'let', 'class', 'return', 'async', '=>'],
          minCount: 2,
        } as KeywordPresenceConfig,
      },
      {
        id: 'pattern-coverage',
        description: 'Response includes expected patterns',
        weight: 0.4,
        scoringFunction: 'pattern_match',
        config: { matchAll: false } as PatternMatchConfig,
      },
      {
        id: 'response-length',
        description: 'Response has appropriate length',
        weight: 0.3,
        scoringFunction: 'length_check',
        config: { minLength: 50, maxLength: 10000 } as LengthCheckConfig,
      },
    ],
  },
  {
    id: 'code-review',
    categories: ['code_review', 'debugging'],
    criteria: [
      {
        id: 'issue-identification',
        description: 'Identifies issues in the code',
        weight: 0.4,
        scoringFunction: 'pattern_match',
        config: { matchAll: false } as PatternMatchConfig,
      },
      {
        id: 'explanation-quality',
        description: 'Provides clear explanations',
        weight: 0.3,
        scoringFunction: 'length_check',
        config: { minLength: 100, maxLength: 5000 } as LengthCheckConfig,
      },
      {
        id: 'fix-suggestion',
        description: 'Suggests fixes or improvements',
        weight: 0.3,
        scoringFunction: 'keyword_presence',
        config: {
          keywords: ['fix', 'change', 'instead', 'should', 'recommend', 'suggest', 'better'],
          minCount: 2,
        } as KeywordPresenceConfig,
      },
    ],
  },
  {
    id: 'architecture',
    categories: ['architecture'],
    criteria: [
      {
        id: 'component-description',
        description: 'Describes system components',
        weight: 0.3,
        scoringFunction: 'keyword_presence',
        config: {
          keywords: ['service', 'component', 'module', 'layer', 'api', 'database', 'interface'],
          minCount: 3,
        } as KeywordPresenceConfig,
      },
      {
        id: 'pattern-coverage',
        description: 'Response includes expected patterns',
        weight: 0.4,
        scoringFunction: 'pattern_match',
        config: { matchAll: false } as PatternMatchConfig,
      },
      {
        id: 'thoroughness',
        description: 'Provides thorough analysis',
        weight: 0.3,
        scoringFunction: 'length_check',
        config: { minLength: 200, maxLength: 15000 } as LengthCheckConfig,
      },
    ],
  },
  {
    id: 'testing',
    categories: ['testing'],
    criteria: [
      {
        id: 'test-structure',
        description: 'Has proper test structure',
        weight: 0.4,
        scoringFunction: 'keyword_presence',
        config: {
          keywords: ['describe', 'it', 'test', 'expect', 'assert', 'mock', 'beforeEach'],
          minCount: 3,
        } as KeywordPresenceConfig,
      },
      {
        id: 'pattern-coverage',
        description: 'Response includes expected patterns',
        weight: 0.4,
        scoringFunction: 'pattern_match',
        config: { matchAll: false } as PatternMatchConfig,
      },
      {
        id: 'test-count',
        description: 'Contains multiple test cases',
        weight: 0.2,
        scoringFunction: 'length_check',
        config: { minLength: 100, maxLength: 10000 } as LengthCheckConfig,
      },
    ],
  },
  {
    id: 'documentation',
    categories: ['documentation'],
    criteria: [
      {
        id: 'documentation-format',
        description: 'Uses proper documentation format',
        weight: 0.4,
        scoringFunction: 'keyword_presence',
        config: {
          keywords: ['@param', '@returns', '@example', '@description', '/**', '*/'],
          minCount: 2,
        } as KeywordPresenceConfig,
      },
      {
        id: 'pattern-coverage',
        description: 'Response includes expected patterns',
        weight: 0.4,
        scoringFunction: 'pattern_match',
        config: { matchAll: false } as PatternMatchConfig,
      },
      {
        id: 'content-length',
        description: 'Appropriate documentation length',
        weight: 0.2,
        scoringFunction: 'length_check',
        config: { minLength: 50, maxLength: 5000 } as LengthCheckConfig,
      },
    ],
  },
  {
    id: 'large-context',
    categories: ['large_context'],
    criteria: [
      {
        id: 'comprehensiveness',
        description: 'Addresses the full context',
        weight: 0.5,
        scoringFunction: 'pattern_match',
        config: { matchAll: false } as PatternMatchConfig,
      },
      {
        id: 'thoroughness',
        description: 'Provides thorough analysis',
        weight: 0.5,
        scoringFunction: 'length_check',
        config: { minLength: 200, maxLength: 20000 } as LengthCheckConfig,
      },
    ],
  },
];
