/**
 * Task Analysis — Advocate Extensions (Issue #903)
 *
 * Deterministic heuristic functions for:
 * - Ambiguity scoring (0-1)
 * - Constraint extraction (time, quality, scope)
 * - Required capabilities inference (tools, experts)
 *
 * Separated from SharedTaskAnalyzer to respect the 400-line file limit.
 *
 * @module core/task-analysis/task-analysis-advocate
 */

import { SUPPORTED_EXTENSIONS } from '../../indexer/supported-extensions.js';
import { toolRefusalGapName } from './tool-refusal-gap.js';
import type { TaskTypeCategory, TaskCapabilities } from './shared-task-analyzer.js';
import {
  VAGUE_VERBS,
  TIME_CONSTRAINT_PATTERNS,
  QUALITY_CONSTRAINT_PATTERNS,
  SCOPE_PATTERNS,
} from './task-analysis-keywords.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Extracted constraints from task description.
 */
export interface TaskConstraints {
  /** Detected time constraint (e.g., "urgent", "by Friday") */
  readonly time?: string;
  /** Detected quality level (e.g., "production-ready", "proof of concept") */
  readonly quality?: string;
  /** Detected scope references (file paths, modules, PR numbers) */
  readonly scope: readonly string[];
}

/**
 * Inferred capabilities needed to fulfill the task.
 */
export interface RequiredCapabilities {
  /** MCP tools likely needed */
  readonly tools: readonly string[];
  /** Expert roles likely valuable */
  readonly experts: readonly string[];
}

// ============================================================================
// Ambiguity Score
// ============================================================================

/** Minimum word count threshold — below this, ambiguity increases */
const MIN_WORDS_FOR_CLARITY = 8;

/** Word count below which ambiguity is at maximum */
const VERY_SHORT_THRESHOLD = 3;

/**
 * Compute an ambiguity score (0-1) for task content.
 *
 * Heuristics:
 * - Short input → higher ambiguity
 * - No specific references (files, PRs, issues) → higher ambiguity
 * - Vague verbs without specific targets → higher ambiguity
 */
export function computeAmbiguityScore(content: string, signals: string[]): number {
  if (content.trim() === '') return 1.0;

  const lower = content.toLowerCase();
  const words = content.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  let score = 0;

  // Factor 1: Word count (0-0.3)
  if (wordCount <= VERY_SHORT_THRESHOLD) {
    score += 0.3;
    signals.push('ambiguity:very-short');
  } else if (wordCount < MIN_WORDS_FOR_CLARITY) {
    score += 0.15;
    signals.push('ambiguity:short');
  }

  // Factor 2: Vague verbs without specific targets (0-0.3)
  const vagueCount = VAGUE_VERBS.filter((v) => lower.includes(v)).length;
  if (vagueCount > 0) {
    score += Math.min(vagueCount / 3, 1) * 0.3;
    signals.push('ambiguity:vague-verbs(' + String(vagueCount) + ')');
  }

  // Factor 3: No scope references (0-0.2)
  const hasScope = SCOPE_PATTERNS.some((p) => p.test(content));
  if (!hasScope) {
    score += 0.2;
    signals.push('ambiguity:no-scope');
  }

  // Factor 4: No specific identifiers — numbers, quoted strings (0-0.2)
  const hasSpecifics = /\b\d{2,}\b/.test(content) || /["'`][\w./-]+["'`]/.test(content);
  if (!hasSpecifics) {
    score += 0.2;
    signals.push('ambiguity:no-specifics');
  }

  return Math.min(score, 1);
}

// ============================================================================
// Constraint Extraction — helpers
// ============================================================================

/**
 * Find best-matching time constraint by weight.
 */
function findTimeConstraint(content: string): string | undefined {
  let best: string | undefined;
  let bestWeight = 0;
  for (const p of TIME_CONSTRAINT_PATTERNS) {
    const match = p.pattern.exec(content);
    if (match !== null && p.weight > bestWeight) {
      best = match[0];
      bestWeight = p.weight;
    }
  }
  return best;
}

/**
 * Find best-matching quality constraint by weight.
 */
function findQualityConstraint(content: string): string | undefined {
  let best: string | undefined;
  let bestWeight = 0;
  for (const p of QUALITY_CONSTRAINT_PATTERNS) {
    const match = p.pattern.exec(content);
    if (match !== null && p.weight > bestWeight) {
      best = match[0];
      bestWeight = p.weight;
    }
  }
  return best;
}

/**
 * Collect all unique scope references from content.
 */
function collectScopeReferences(content: string): string[] {
  const scope: string[] = [];
  for (const pattern of SCOPE_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, pattern.flags + 'g');
    let match = globalPattern.exec(content);
    while (match !== null) {
      if (!scope.includes(match[0])) {
        scope.push(match[0]);
      }
      match = globalPattern.exec(content);
    }
  }
  return scope;
}

// ============================================================================
// Constraint Extraction
// ============================================================================

/**
 * Extract structured constraints from task content.
 */
export function extractConstraints(content: string, signals: string[]): TaskConstraints {
  const time = findTimeConstraint(content);
  const quality = findQualityConstraint(content);
  const scope = collectScopeReferences(content);

  if (time !== undefined) signals.push('constraint:time:' + time);
  if (quality !== undefined) signals.push('constraint:quality:' + quality);
  if (scope.length > 0) signals.push('constraint:scope(' + String(scope.length) + ')');

  const result: TaskConstraints = { scope };
  if (time !== undefined && quality !== undefined) {
    return { ...result, time, quality };
  }
  if (time !== undefined) {
    return { ...result, time };
  }
  if (quality !== undefined) {
    return { ...result, quality };
  }
  return result;
}

// ============================================================================
// Required Capabilities Inference
// ============================================================================

/** Task type → relevant MCP tools mapping */
const TASK_TYPE_TO_TOOLS: Record<TaskTypeCategory, readonly string[]> = {
  architecture: ['orchestrate', 'consensus_vote'],
  code_implementation: ['create_expert', 'execute_expert'],
  code_review: ['run_workflow', 'create_expert'],
  security_review: ['create_expert', 'execute_expert'],
  test_generation: ['create_expert', 'execute_expert'],
  documentation: ['create_expert', 'execute_expert'],
  large_codebase: ['orchestrate', 'run_graph_workflow'],
  bulk_operations: ['run_graph_workflow', 'orchestrate'],
  general: ['delegate_to_model'],
};

/** Task type → relevant expert roles mapping */
const TASK_TYPE_TO_EXPERTS: Record<TaskTypeCategory, readonly string[]> = {
  architecture: ['architecture_expert', 'security_expert'],
  code_implementation: ['code_expert', 'testing_expert'],
  code_review: ['code_expert', 'security_expert'],
  security_review: ['security_expert', 'code_expert'],
  test_generation: ['testing_expert', 'code_expert'],
  documentation: ['documentation_expert'],
  large_codebase: ['architecture_expert', 'code_expert'],
  bulk_operations: ['devops_expert', 'code_expert'],
  general: ['pm_expert'],
};

/** Known source-language aliases, including languages not yet supported. */
const SYMBOL_LANGUAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  python: '.py',
  go: '.go',
  golang: '.go',
  rust: '.rs',
  ruby: '.rb',
  java: '.java',
  typescript: '.ts',
  javascript: '.js',
  php: '.php',
  swift: '.swift',
  kotlin: '.kt',
  scala: '.scala',
  lua: '.lua',
  c: '.c',
  cpp: '.cpp',
  csharp: '.cs',
};

/** Source extensions only: data, configuration, docs and TLDs are not capabilities. */
const SOURCE_EXTENSIONS = new Set([
  ...SUPPORTED_EXTENSIONS,
  ...Object.values(SYMBOL_LANGUAGE_EXTENSIONS),
]);
const SYMBOL_LANGUAGES = Object.keys(SYMBOL_LANGUAGE_EXTENSIONS).join('|');
const SYMBOL_EXTRACTION_REQUEST = new RegExp(
  `\\bextract(?:\\s+(?:class(?:es)?|functions?|and|all|exported|${SYMBOL_LANGUAGES})){0,6}\\s+symbols?\\b` +
    '|(?:^|\\b(?:run|call|invoke|use)\\s+)extract_symbols\\b' +
    '|\\b(?:perform|run)\\s+symbol\\s+extraction\\b|\\bsymbol\\s+table\\s+for\\b'
);
const SYMBOL_NEGATION =
  /(?<![\w./-])(?:not|avoid|except|exclude|without|skip|never|don't)(?![\w./-])/;

/** Extract only language aliases in explicit source/object positions. */
function sourceExtensions(target: string): string[] {
  // URLs and reference notes are not source targets, even when a TLD is .rs/.py.
  const source = target.replace(
    /\b(?:https?:\/\/|www\.)[^\s)]+|\((?:see|docs?|documentation|references?)\b[^)]*\)|\b(?:docs?|documentation|references?)\s+(?:at|on)\s+\S+/g,
    ''
  );
  const extensions = new Set<string>();
  for (const match of source.matchAll(/\.([a-z][a-z0-9]*)\b(?!\.)/g)) {
    if (SOURCE_EXTENSIONS.has(match[0])) extensions.add(match[0]);
  }
  const aliases = new RegExp(
    `\\b(?:from|for|in)\\s+(?:the\\s+)?(${SYMBOL_LANGUAGES})\\b(?![./-])` +
      `|\\b(${SYMBOL_LANGUAGES})\\s+(?:files?|code|source|(?:class\\s+|function\\s+)?symbols?)\\b`,
    'g'
  );
  for (const match of source.matchAll(aliases)) {
    const extension = SYMBOL_LANGUAGE_EXTENSIONS[match[1] ?? match[2] ?? ''];
    if (extension !== undefined) extensions.add(extension);
  }
  return [...extensions];
}

/** Require extraction and its source in the same, non-negated clause. */
function symbolExtractionRequirements(content: string): string[] {
  const extensions = new Set<string>();
  const clauses = content
    .toLowerCase()
    .split(
      /\.(?:\s+|$)|[!?;\n]|(?<![\w./-])(?:then|next)(?![\w./-])|\band\s+(?:fix|update|refactor|go)\b/
    );
  for (const clause of clauses) {
    const match = SYMBOL_EXTRACTION_REQUEST.exec(clause);
    if (match === null) continue;
    const prefix = clause.slice(0, match.index);
    if (SYMBOL_NEGATION.test(prefix) || /^\s*(?:explain|describe|document|discuss)\b/.test(prefix))
      continue;
    // A negated suffix names exclusions, not requested extraction targets.
    const target = clause.slice(match.index).split(SYMBOL_NEGATION)[0] ?? '';
    for (const extension of sourceExtensions(target)) extensions.add(extension);
  }
  return [...extensions].map((extension) => toolRefusalGapName('extract_symbols', extension));
}

/**
 * Infer required capabilities from task analysis signals.
 */
export function inferRequiredCapabilities(
  taskType: TaskTypeCategory,
  capabilities: TaskCapabilities,
  signals: string[],
  content = ''
): RequiredCapabilities {
  const tools = [...TASK_TYPE_TO_TOOLS[taskType]];
  const experts = [...TASK_TYPE_TO_EXPERTS[taskType]];

  if (capabilities.highContext) {
    if (!tools.includes('orchestrate')) tools.push('orchestrate');
    if (!experts.includes('research_expert')) experts.push('research_expert');
    signals.push('capability:needs-research');
  }

  if (capabilities.codeGeneration && !experts.includes('testing_expert')) {
    experts.push('testing_expert');
  }

  tools.push(...symbolExtractionRequirements(content));

  signals.push('required:tools(' + String(tools.length) + ')');
  signals.push('required:experts(' + String(experts.length) + ')');

  return { tools, experts };
}
