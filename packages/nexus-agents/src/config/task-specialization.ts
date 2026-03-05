/**
 * Task Specialization Matrix — maps task categories to optimal CLIs.
 *
 * Based on real-world model strengths (inspired by StrongDM Weather Report):
 * - Claude: strongest reasoning, architecture, security analysis
 * - Codex: strongest code generation, testing, implementation
 * - Gemini: largest context, deep research, documentation
 *
 * @module config/task-specialization
 * (Source: Issue #858 — Multi-model task specialization)
 */

import type {
  TaskSpecialization,
  TaskCategory,
  SpecializationMatch,
} from './task-specialization-types.js';
import { TASK_CATEGORIES } from './task-specialization-types.js';

// Re-export types for consumer convenience
export type {
  TaskSpecialization,
  TaskCategory,
  SpecializationMatch,
} from './task-specialization-types.js';
export {
  TASK_CATEGORIES,
  TaskCategorySchema,
  TaskSpecializationSchema,
} from './task-specialization-types.js';

/**
 * Canonical task specialization matrix.
 *
 * Each entry maps a task category to the CLI best suited for it,
 * with keywords for automatic detection and a score bonus.
 */
export const TASK_SPECIALIZATION_MATRIX: readonly TaskSpecialization[] = [
  {
    category: 'architecture',
    primaryCli: 'claude',
    secondaryCli: 'gemini',
    reasoning: 'Claude excels at reasoning; Gemini secondary (67% vs codex 33%, n=24 vs 3)',
    keywords: ['architect', 'design', 'system design', 'trade-off', 'adr'],
    bonus: 10,
  },
  {
    category: 'code_generation',
    primaryCli: 'codex',
    secondaryCli: 'claude',
    reasoning: 'Codex has highest code generation quality with sandboxed execution',
    keywords: ['implement', 'generate code', 'write function', 'build feature'],
    bonus: 15,
  },
  {
    category: 'code_review',
    primaryCli: 'codex',
    secondaryCli: 'claude',
    reasoning: 'Codex combines code understanding with large context for full-file review',
    keywords: ['review code', 'code review', 'pull request', 'pr review'],
    bonus: 10,
  },
  {
    category: 'research',
    primaryCli: 'gemini',
    secondaryCli: 'claude',
    reasoning: 'Gemini has deep_research feature and 1M token context for synthesis',
    keywords: ['research', 'investigate', 'literature', 'survey', 'state of the art'],
    bonus: 15,
  },
  {
    category: 'security_review',
    primaryCli: 'codex',
    secondaryCli: 'claude',
    reasoning:
      'Codex 60% (n=5), Gemini 50% (n=14), Claude 30% (n=107); reduced bonus to let adaptive routing learn',
    keywords: ['security', 'vulnerability', 'threat model', 'cve', 'audit security'],
    bonus: 7,
  },
  {
    category: 'planning',
    primaryCli: 'claude',
    secondaryCli: 'codex',
    reasoning: 'Claude has strongest reasoning for sprint planning and task decomposition',
    keywords: ['plan', 'sprint', 'roadmap', 'decompose', 'prioritize'],
    bonus: 10,
  },
  {
    category: 'documentation',
    primaryCli: 'gemini',
    secondaryCli: 'claude',
    reasoning: 'Gemini can process entire codebases (1M context) for comprehensive docs',
    keywords: ['document', 'documentation', 'readme', 'api docs', 'write docs'],
    bonus: 10,
  },
  {
    category: 'testing',
    primaryCli: 'codex',
    secondaryCli: 'claude',
    reasoning: 'Codex has strongest code generation for test writing with sandbox execution',
    keywords: ['test', 'write tests', 'test coverage', 'unit test', 'integration test'],
    bonus: 10,
  },
  {
    category: 'devops',
    primaryCli: 'claude',
    secondaryCli: 'gemini',
    reasoning: 'Claude excels at infrastructure reasoning and CI/CD configuration',
    keywords: [
      'devops',
      'ci/cd',
      'deploy',
      'infrastructure',
      'docker',
      'kubernetes',
      'pipeline',
      'helm',
      'terraform',
      'ansible',
      'makefile',
      'dockerfile',
      'github actions',
      'workflow',
      'concourse',
      'jenkins',
      'argocd',
      'vulnerability scan',
      'security scan',
      'sast',
      'dast',
      'zap',
      'semgrep',
      'trivy',
      'fork',
      'kind',
      'cluster',
      'namespace',
      'ingress',
      'monitoring',
    ],
    bonus: 10,
  },
  {
    category: 'exploration',
    primaryCli: 'gemini',
    secondaryCli: 'claude',
    reasoning: 'Gemini 1M context window excels at codebase exploration and navigation',
    keywords: ['explore', 'navigate', 'find', 'discover', 'scan codebase'],
    bonus: 10,
  },
] as const;

/** Index for O(1) category lookup. */
const CATEGORY_INDEX = new Map<TaskCategory, TaskSpecialization>(
  TASK_SPECIALIZATION_MATRIX.map((s) => [s.category, s])
);

/**
 * Get specialization for a known task category.
 */
export function getSpecialization(category: TaskCategory): TaskSpecialization {
  const spec = CATEGORY_INDEX.get(category);
  if (!spec) throw new Error(`Unknown category: ${category}`);
  return spec;
}

/**
 * Detect task category from free-text task description.
 * Returns the first matching category or null if none match.
 */
export function detectTaskCategory(task: string): SpecializationMatch | null {
  const taskLower = task.toLowerCase();

  for (const spec of TASK_SPECIALIZATION_MATRIX) {
    const matched = spec.keywords.some((kw) => taskLower.includes(kw));
    if (matched) {
      return {
        category: spec.category,
        primaryCli: spec.primaryCli,
        secondaryCli: spec.secondaryCli,
        bonus: spec.bonus,
      };
    }
  }

  return null;
}

/**
 * Get all task categories.
 */
export function getTaskCategories(): readonly TaskCategory[] {
  return TASK_CATEGORIES;
}
