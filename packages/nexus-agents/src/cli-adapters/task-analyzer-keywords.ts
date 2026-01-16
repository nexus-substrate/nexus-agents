/**
 * nexus-agents/cli-adapters - Task Analyzer Keywords
 *
 * Keyword constants for task type classification.
 * Extracted from task-analyzer.ts for maintainability.
 *
 * (Source: Issue #78 - Capability-based task router)
 */

/**
 * Task type classification.
 * Defined here to avoid circular dependency with task-analyzer.ts.
 */
export type TaskType =
  | 'architecture'
  | 'code_implementation'
  | 'code_review'
  | 'test_generation'
  | 'documentation'
  | 'large_codebase'
  | 'bulk_operations'
  | 'general';

/**
 * Keywords for task type classification.
 */
export const TASK_TYPE_KEYWORDS: Record<TaskType, readonly string[]> = {
  architecture: [
    'architecture',
    'design',
    'system',
    'pattern',
    'structure',
    'scalability',
    'microservice',
    'monolith',
    'distributed',
    'api design',
  ],
  code_implementation: [
    'implement',
    'create',
    'build',
    'write code',
    'add feature',
    'function',
    'class',
    'module',
    'component',
    'endpoint',
  ],
  code_review: [
    'review',
    'audit',
    'check',
    'analyze',
    'evaluate',
    'inspect',
    'security review',
    'code quality',
    'bugs',
    'vulnerabilities',
  ],
  test_generation: [
    'test',
    'unit test',
    'integration test',
    'e2e',
    'coverage',
    'spec',
    'assertion',
    'mock',
    'fixture',
    'vitest',
    'jest',
  ],
  documentation: [
    'document',
    'readme',
    'jsdoc',
    'comment',
    'explain',
    'tutorial',
    'guide',
    'api doc',
    'changelog',
  ],
  large_codebase: [
    'entire codebase',
    'all files',
    'whole project',
    'repository',
    'monorepo',
    'workspace',
    'large context',
    'many files',
  ],
  bulk_operations: [
    'bulk',
    'batch',
    'mass',
    'multiple files',
    'refactor all',
    'update all',
    'rename all',
    'migrate',
    'transform',
  ],
  general: [],
} as const;

/**
 * Keywords indicating high reasoning complexity.
 */
export const HIGH_COMPLEXITY_KEYWORDS: readonly string[] = [
  'complex',
  'optimize',
  'architecture',
  'security',
  'performance',
  'distributed',
  'concurrent',
  'async',
  'race condition',
  'deadlock',
  'memory leak',
  'algorithm',
  'trade-off',
  'decision',
  'design pattern',
  'refactor',
  'legacy',
] as const;

/**
 * Keywords indicating code generation needs.
 */
export const CODE_GENERATION_KEYWORDS: readonly string[] = [
  'implement',
  'create',
  'write',
  'generate',
  'build',
  'add',
  'new',
  'function',
  'class',
  'component',
  'module',
  'test',
  'code',
  'script',
] as const;

/**
 * Keywords indicating multimodal content.
 */
export const MULTIMODAL_KEYWORDS: readonly string[] = [
  'image',
  'screenshot',
  'diagram',
  'chart',
  'graph',
  'visual',
  'picture',
  'photo',
  'ui',
  'mockup',
  'wireframe',
] as const;

/**
 * Keywords indicating parallelizable tasks.
 */
export const PARALLELIZABLE_KEYWORDS: readonly string[] = [
  'multiple',
  'several',
  'batch',
  'bulk',
  'all',
  'each',
  'every',
  'list of',
  'series of',
  'independent',
] as const;

/**
 * Keywords indicating budget sensitivity.
 */
export const BUDGET_SENSITIVE_KEYWORDS: readonly string[] = [
  'cheap',
  'cost',
  'budget',
  'economical',
  'efficient',
  'quick',
  'fast',
  'simple',
  'trivial',
  'minor',
] as const;

/**
 * Image file extensions.
 */
export const IMAGE_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
] as const;

/**
 * Complexity scores by task type.
 */
export const TYPE_COMPLEXITY: Record<TaskType, number> = {
  architecture: 8,
  code_review: 6,
  code_implementation: 5,
  test_generation: 4,
  documentation: 3,
  large_codebase: 6,
  bulk_operations: 3,
  general: 4,
} as const;
