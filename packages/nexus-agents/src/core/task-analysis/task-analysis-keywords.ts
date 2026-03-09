/**
 * Task Analysis Keyword Registries
 *
 * Centralized keyword/pattern data for task classification.
 * Separated from SharedTaskAnalyzer to keep the analyzer under
 * the 400-line file limit while maintaining cohesive data definitions.
 *
 * @module core/task-analysis/task-analysis-keywords
 * (Source: Issue #574, ADR-0004)
 */

import type { TaskTypeCategory } from './shared-task-analyzer.js';

/** Weighted pattern entry for reasoning/knowledge classification */
export interface WeightedPattern {
  readonly pattern: RegExp;
  readonly weight: number;
  readonly name: string;
}

/** Reasoning task patterns (arXiv:2502.19130) */
export const REASONING_PATTERNS: readonly WeightedPattern[] = [
  { pattern: /\b(why|how come|explain why)\b/i, weight: 0.3, name: 'causal-question' },
  { pattern: /\b(analyze|evaluate|assess|compare)\b/i, weight: 0.25, name: 'analysis-verb' },
  { pattern: /\b(solve|calculate|compute|derive)\b/i, weight: 0.35, name: 'problem-solving' },
  {
    pattern: /\b(if|then|therefore|because|since|assuming)\b/i,
    weight: 0.2,
    name: 'logical-connector',
  },
  { pattern: /\b(prove|deduce|infer|conclude)\b/i, weight: 0.35, name: 'deductive-verb' },
  {
    pattern: /\b(trade-?off|pros? and cons?|advantages?|disadvantages?)\b/i,
    weight: 0.25,
    name: 'tradeoff-analysis',
  },
  { pattern: /\b(debug|fix|troubleshoot|diagnose)\b/i, weight: 0.3, name: 'debugging' },
  { pattern: /\b(design|architect|plan|strategy)\b/i, weight: 0.25, name: 'design-task' },
  { pattern: /\b(optimize|improve|enhance|refactor)\b/i, weight: 0.2, name: 'optimization' },
];

/** Knowledge task patterns (arXiv:2502.19130) */
export const KNOWLEDGE_PATTERNS: readonly WeightedPattern[] = [
  { pattern: /\b(what is|what are|who is|who are)\b/i, weight: 0.3, name: 'factual-question' },
  { pattern: /\b(define|definition of|meaning of)\b/i, weight: 0.35, name: 'definition-request' },
  { pattern: /\b(list|enumerate|name|identify)\b/i, weight: 0.25, name: 'enumeration' },
  { pattern: /\b(when|where|which)\b/i, weight: 0.2, name: 'specific-query' },
  { pattern: /\b(version|release|date|year|number)\b/i, weight: 0.25, name: 'factual-detail' },
  { pattern: /\b(syntax|format|structure|schema)\b/i, weight: 0.2, name: 'format-query' },
  { pattern: /\b(documentation|docs|reference|api)\b/i, weight: 0.25, name: 'doc-lookup' },
  { pattern: /\b(example|sample|template|boilerplate)\b/i, weight: 0.2, name: 'example-request' },
  { pattern: /\b(tell me|show me|give me)\b/i, weight: 0.15, name: 'information-request' },
];

/** Task type keywords for 9-type taxonomy */
export const TASK_TYPE_KEYWORDS: Record<TaskTypeCategory, readonly string[]> = {
  architecture: [
    'architecture',
    'design',
    'system',
    'pattern',
    'scalability',
    'microservice',
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
  ],
  code_review: ['review', 'audit', 'check', 'analyze code', 'evaluate', 'inspect', 'bugs'],
  security_review: [
    'security review',
    'security audit',
    'vulnerabilities',
    'cve',
    'owasp',
    'injection',
    'xss',
    'csrf',
    'penetration',
    'threat model',
  ],
  test_generation: [
    'test',
    'unit test',
    'integration test',
    'e2e',
    'coverage',
    'spec',
    'mock',
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
  ],
  general: [],
};

/** High complexity indicators */
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
  'centralize',
  'consolidate',
  'migrate',
  'integrate',
  'system-wide',
  'cross-cutting',
];

/** Code generation indicators */
export const CODE_GEN_KEYWORDS: readonly string[] = [
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
  'test',
];

/** Multimodal indicators */
export const MULTIMODAL_KEYWORDS: readonly string[] = [
  'image',
  'screenshot',
  'diagram',
  'photo',
  'picture',
  'audio',
  'video',
  'ui',
  'visual',
  'mockup',
];

/** Parallelizable indicators */
export const PARALLEL_KEYWORDS: readonly string[] = [
  'multiple',
  'batch',
  'bulk',
  'all files',
  'each',
  'every',
  'parallel',
  'concurrent',
  'independent',
];

// ============================================================================
// Advocate Analysis Keywords (Issue #903)
// ============================================================================

/** Vague verbs that increase ambiguity score */
export const VAGUE_VERBS: readonly string[] = [
  'improve',
  'fix',
  'help',
  'update',
  'change',
  'make better',
  'handle',
  'deal with',
  'look at',
  'work on',
  'do something',
  'clean up',
  'take care of',
];

/** Time constraint patterns */
export const TIME_CONSTRAINT_PATTERNS: readonly WeightedPattern[] = [
  { pattern: /\b(asap|urgent|immediately|right now)\b/i, weight: 1.0, name: 'urgent' },
  {
    pattern: /\bby (friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/i,
    weight: 0.8,
    name: 'deadline-day',
  },
  {
    pattern: /\bby (today|tomorrow|end of day|eod|end of week|eow)\b/i,
    weight: 0.9,
    name: 'deadline-relative',
  },
  { pattern: /\b(quick|fast|hurry|rush)\b/i, weight: 0.6, name: 'speed' },
  { pattern: /\bwithin \d+ (hours?|days?|weeks?)\b/i, weight: 0.8, name: 'deadline-duration' },
];

/** Quality constraint patterns */
export const QUALITY_CONSTRAINT_PATTERNS: readonly WeightedPattern[] = [
  {
    pattern: /\b(production[- ]ready|prod[- ]ready|ship[- ]ready)\b/i,
    weight: 1.0,
    name: 'production',
  },
  { pattern: /\b(proof of concept|poc|prototype|spike)\b/i, weight: 0.8, name: 'prototype' },
  {
    pattern: /\b(quick hack|quick fix|workaround|temporary|temp fix)\b/i,
    weight: 0.6,
    name: 'hack',
  },
  { pattern: /\b(robust|thorough|comprehensive|complete)\b/i, weight: 0.9, name: 'thorough' },
  { pattern: /\b(mvp|minimum viable|bare minimum)\b/i, weight: 0.7, name: 'mvp' },
];

/** Scope indicator patterns — match file paths, directories, modules */
export const SCOPE_PATTERNS: readonly RegExp[] = [
  /\b[\w-]+\.(ts|js|tsx|jsx|py|rs|go|java|rb|md|json|yaml|yml)\b/i,
  /\bsrc\/[\w/-]+/,
  /\b(packages|modules|components|services)\/[\w-]+/,
  /\b(file|directory|folder|module|package|component)\s+[`"']?[\w./-]+/i,
  /\b(PR|pull request|issue)\s*#?\d+/i,
];
