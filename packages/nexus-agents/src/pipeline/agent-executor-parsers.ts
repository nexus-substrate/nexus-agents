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

type QaVerdict = QaReviewResult['verdict'];

/**
 * A verdict line, in the format the QA expert prompt asks for
 * (`agents/experts/expert-config.ts`: `PASS:` / `NEEDS_WORK:` / `REJECT:`).
 * The token must LEAD its line — after optional markdown (`#`, `-`, `*`, `>`,
 * backticks) and an optional `Verdict:`-style label — and be followed by
 * punctuation or the end of the line. So `PASS: no reason to reject` reads as
 * PASS, while prose such as "there is no reason to reject this" or
 * "Pass the flag through" is not a verdict at all (#6776).
 */
const VERDICT_LINE =
  /^[\s#>*_`-]*(?:(?:final\s+)?(?:verdict|assessment|decision|result|status)[*_`]*\s*[:-][\s*_`]*)?(pass|needs[_ ]work|reject)[*_`]*\s*(?:[:.,;)—–-]|$)/i;

/** Strictest first: a reply that states several verdicts gets the strictest. */
const VERDICT_SEVERITY: Readonly<Record<QaVerdict, number>> = {
  pass: 0,
  needs_work: 1,
  reject: 2,
};

function toVerdict(token: string): QaVerdict {
  const t = token.toLowerCase();
  if (t === 'pass') return 'pass';
  if (t === 'reject') return 'reject';
  return 'needs_work';
}

/**
 * Read the QA verdict out of the reviewer's reply (#6776).
 *
 * Returns `undefined` when the reply states no verdict — empty text (what
 * `runExpert` returns on a failed call), a refusal, or an off-format answer.
 * That is ABSENCE, and the caller must record it as such; it used to fall
 * through to `pass`, so a review that never ran approved the code.
 *
 * When a reply states more than one verdict (e.g. it echoes the rubric), the
 * strictest wins: an ambiguous review never reads as a pass.
 */
export function parseQaVerdict(response: string): QaReviewResult | undefined {
  let found: QaVerdict | undefined;
  for (const line of response.split('\n')) {
    const token = VERDICT_LINE.exec(line)?.[1];
    if (token === undefined) continue;
    const verdict = toVerdict(token);
    if (found === undefined || VERDICT_SEVERITY[verdict] > VERDICT_SEVERITY[found]) {
      found = verdict;
    }
  }
  if (found === undefined) return undefined;
  const issues = found === 'pass' ? [] : extractIssues(response);
  return { verdict: found, feedback: response, issues };
}

function extractIssues(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => /^\s*[-*]/.test(l))
    .map((l) => l.trim().replace(/^[-*]\s*/, ''))
    .filter((l) => l.length > 5)
    .slice(0, 10);
}
