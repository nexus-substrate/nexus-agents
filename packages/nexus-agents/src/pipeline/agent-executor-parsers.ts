/**
 * Agent Executor parsers — PM task lists and QA verdicts out of expert text (#6331).
 *
 * @module pipeline/agent-executor-parsers
 */

import { createLogger, extractJsonArray } from '../core/index.js';
import type { PipelineTask, QaReviewResult } from './dev-pipeline.js';

const logger = createLogger({ component: 'agent-executor' });

/**
 * A PM-response field is used when it is a string or a number (`{ id: 1 }` is a
 * common model output); anything else — a missing field, an object — falls back
 * rather than stringifying as `[object Object]`.
 */
function stringField(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

export function parseTasksFromResponse(response: string, fallbackPlan: string): PipelineTask[] {
  try {
    const candidate = extractJsonArray(response);
    if (candidate !== undefined) {
      const parsed = JSON.parse(candidate) as Array<Record<string, unknown>>;
      return parsed.map((t, i) => ({
        id: stringField(t, 'id', `task-${String(i + 1)}`),
        title: stringField(t, 'title', `Task ${String(i + 1)}`),
        description: stringField(t, 'description', ''),
        assignedTo: 'coder' as const,
        status: 'pending' as const,
      }));
    }
  } catch {
    logger.debug('Failed to parse PM response');
  }
  return [
    {
      id: 'task-1',
      title: 'Implementation',
      description: fallbackPlan,
      assignedTo: 'coder',
      status: 'pending',
    },
  ];
}

export function parseQaFromResponse(response: string): QaReviewResult {
  const l = response.toLowerCase();
  if (l.includes('reject'))
    return { verdict: 'reject', feedback: response, issues: extractIssues(response) };
  if (l.includes('needs_work') || l.includes('needs work'))
    return { verdict: 'needs_work', feedback: response, issues: extractIssues(response) };
  return { verdict: 'pass', feedback: response, issues: [] };
}

function extractIssues(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => /^\s*[-*]/.test(l))
    .map((l) => l.trim().replace(/^[-*]\s*/, ''))
    .filter((l) => l.length > 5)
    .slice(0, 10);
}
