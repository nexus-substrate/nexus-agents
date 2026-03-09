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
    primaryCli: 'gemini',
    secondaryCli: 'claude',
    reasoning:
      'Gemini primary (66.7%, n=24) for architecture. Claude secondary (43.6%, n=220). Weather data 2026-03-09.',
    keywords: ['architect', 'design', 'system design', 'trade-off', 'adr'],
    bonus: 10,
  },
  {
    category: 'code_generation',
    primaryCli: 'codex',
    secondaryCli: 'claude',
    reasoning:
      'Codex primary (91.9%, n=408) for code generation with sandboxed execution. Confirmed per weather data (#1454)',
    keywords: ['implement', 'generate code', 'write function', 'build feature'],
    bonus: 15,
  },
  {
    category: 'code_review',
    primaryCli: 'codex',
    secondaryCli: 'claude',
    reasoning:
      'Codex primary (88.3%, n=94) for code review; Claude secondary. Bonus aligned per weather data (#1454)',
    keywords: ['review code', 'code review', 'pull request', 'pr review'],
    bonus: 15,
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
      'Weather 2026-03-09: claude 44.9% (n=385, declining), codex 60% (n=5), gemini 50% (n=14). Codex primary, claude secondary. Low bonus — no CLI is clearly dominant.',
    keywords: [
      'security review',
      'security analysis',
      'security audit',
      'security flaw',
      'vulnerability assessment',
      'threat model',
      'cve',
      'audit security',
      'owasp',
      'injection',
      'xss',
      'csrf',
      'security',
      'vulnerability',
    ],
    bonus: 5,
  },
  {
    category: 'planning',
    primaryCli: 'claude',
    secondaryCli: 'codex',
    reasoning:
      'Claude primary (92.0%, n=274) for planning and task decomposition. Confirmed per weather data (#1454)',
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
    reasoning:
      'Codex primary (91.6%, n=143) for test writing with sandbox execution. Bonus aligned per weather data (#1454)',
    keywords: ['test', 'write tests', 'test coverage', 'unit test', 'integration test'],
    bonus: 15,
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
    secondaryCli: 'codex',
    reasoning:
      'Gemini primary (98.5%, n=202) for exploration with 1M context. Claude removed as secondary (63.5% vs 98.5%, n=340) per #1462',
    keywords: ['explore', 'navigate', 'find', 'discover', 'scan codebase'],
    bonus: 15,
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
 * Uses best-match scoring: counts keyword hits weighted by keyword length
 * (multi-word keywords like "security scan" score higher than "security").
 * Breaks ties by matrix order.
 */
export function detectTaskCategory(task: string): SpecializationMatch | null {
  const taskLower = task.toLowerCase();
  let bestSpec: TaskSpecialization | undefined;
  let bestScore = 0;

  for (const spec of TASK_SPECIALIZATION_MATRIX) {
    let score = 0;
    for (const kw of spec.keywords) {
      if (taskLower.includes(kw)) {
        // Multi-word keywords score higher (more specific match)
        score += kw.split(/\s+/).length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestSpec = spec;
    }
  }

  if (bestSpec === undefined) return null;

  return {
    category: bestSpec.category,
    primaryCli: bestSpec.primaryCli,
    secondaryCli: bestSpec.secondaryCli,
    bonus: bestSpec.bonus,
  };
}

/**
 * Get all task categories.
 */
export function getTaskCategories(): readonly TaskCategory[] {
  return TASK_CATEGORIES;
}
