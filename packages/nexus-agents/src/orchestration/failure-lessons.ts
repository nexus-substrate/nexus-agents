/**
 * Failure lesson extraction from OutcomeStore.
 *
 * Inspired by AutoResearchClaw's MetaClaw pattern:
 * pipeline failures → structured lessons → injected into future prompts.
 *
 * Closes the feedback loop: experts learn from past failures instead
 * of repeating the same mistakes.
 *
 * @module orchestration/failure-lessons
 */

import { type TaskOutcome, type OutcomeQuery } from './outcomes/outcome-types.js';
import { getOutcomeStore } from './outcomes/outcome-store.js';
import type { TaskCategory } from '../config/task-specialization-types.js';
import type { CliNameLiteral } from '../config/model-capabilities-types.js';

/** A structured lesson extracted from failure patterns. */
export interface FailureLesson {
  /** What went wrong (sanitized). */
  pattern: string;
  /** How often this pattern occurred. */
  occurrences: number;
  /** Which CLI/category combination. */
  context: string;
  /** Actionable guidance for the expert. */
  guidance: string;
}

/** Maximum lessons per prompt to prevent context bloat. */
const MAX_LESSONS = 5;

/** Maximum error message length to include (sanitized). */
const MAX_ERROR_LENGTH = 120;

/** Sanitize error message: remove paths, stack traces, secrets. */
function sanitizeError(msg: string): string {
  return msg
    .replace(/\/[^\s:]+/g, '<path>')
    .replace(/at\s+\S+\s+\(\S+\)/g, '')
    .replace(/sk-[a-zA-Z0-9]+/g, '<key>')
    .replace(/\n/g, ' ')
    .trim()
    .slice(0, MAX_ERROR_LENGTH);
}

/** Map failure category to actionable guidance. */
function categoryToGuidance(category: string, count: number): string {
  const guides: Record<string, string> = {
    timeout: `Task timed out ${String(count)} time(s). Keep responses concise and focused. Avoid exploring the entire codebase.`,
    rate_limit: `Rate limited ${String(count)} time(s). Reduce API calls. Complete the task in fewer iterations.`,
    parse: `Response parsing failed ${String(count)} time(s). Ensure output follows the expected format exactly.`,
    connection: `Connection errors occurred ${String(count)} time(s). This is transient — retry should succeed.`,
    execution: `Execution failed ${String(count)} time(s). Check that commands and file paths are correct before running.`,
    validation: `Input validation failed ${String(count)} time(s). Ensure all required fields are provided.`,
  };
  return guides[category] ?? `Failed ${String(count)} time(s) due to ${category}.`;
}

/** Group outcomes by failure category. */
function groupByCategory(outcomes: TaskOutcome[]): Map<string, TaskOutcome[]> {
  const groups = new Map<string, TaskOutcome[]>();
  for (const outcome of outcomes) {
    const key = outcome.failureCategory ?? 'unknown';
    const group = groups.get(key);
    if (group !== undefined) {
      group.push(outcome);
    } else {
      groups.set(key, [outcome]);
    }
  }
  return groups;
}

/** Convert a group of outcomes into a lesson. */
function groupToLesson(cat: string, outcomes: TaskOutcome[], ctx: string): FailureLesson {
  const sampleError = outcomes.find(
    (o) => typeof o.errorMessage === 'string' && o.errorMessage.length > 0
  );
  return {
    pattern: sampleError !== undefined ? sanitizeError(sampleError.errorMessage ?? '') : cat,
    occurrences: outcomes.length,
    context: ctx,
    guidance: categoryToGuidance(cat, outcomes.length),
  };
}

/**
 * Extract failure lessons from recent outcomes for a given category/CLI.
 */
export function extractLessons(
  category?: TaskCategory,
  cli?: CliNameLiteral,
  lookbackMs = 7 * 24 * 60 * 60 * 1000
): FailureLesson[] {
  const store = getOutcomeStore();
  const query: OutcomeQuery = {
    success: false,
    ...(category !== undefined ? { category } : {}),
    ...(cli !== undefined ? { cli } : {}),
    limit: 100,
  };

  const cutoff = new Date(Date.now() - lookbackMs).toISOString();
  const recent = store.query(query).filter((o) => o.timestamp >= cutoff);
  if (recent.length === 0) return [];

  const ctx =
    cli !== undefined && category !== undefined ? `${cli}/${category}` : (category ?? cli ?? 'all');

  const groups = groupByCategory(recent);
  const lessons = [...groups.entries()].map(([cat, outcomes]) => groupToLesson(cat, outcomes, ctx));

  return lessons.sort((a, b) => b.occurrences - a.occurrences).slice(0, MAX_LESSONS);
}

/**
 * Format lessons as a prompt section for injection into expert system prompts.
 *
 * Returns empty string if no lessons — safe to always call.
 */
export function formatLessonsForPrompt(lessons: FailureLesson[]): string {
  if (lessons.length === 0) return '';

  const items = lessons.map((l) => `- ${l.guidance}`);

  return [
    '',
    '## Lessons from Recent Failures',
    '',
    'Previous tasks in this category encountered these issues:',
    ...items,
    '',
    'Adjust your approach accordingly.',
  ].join('\n');
}
