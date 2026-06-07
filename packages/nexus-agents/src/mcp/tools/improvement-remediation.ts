/**
 * Improvement-signal → remediation-task bridge (#3540, capability-loop increment 1).
 *
 * The "safe plumbing" half of the capability loop: turn the observability
 * signals `improvement_review` already detects (fitness decline, CLI-floor,
 * failure-category concentration, consensus rejection, self-eval findings) into
 * structured remediation {@link PipelineTask}s, surfaced for human review.
 *
 * SUGGEST-ONLY by construction: this is a pure mapping. It executes nothing,
 * files nothing, and auto-invokes no pipeline — the safety-critical auto-invoke
 * gate is a deliberately separate, later increment (still owner-gated). A
 * reviewer (or a future human-gated path) decides whether to route a task
 * through the dev-pipeline.
 *
 * @module mcp/tools/improvement-remediation
 */

import type { PipelineTask, PipelineRole } from '../../pipeline/dev-pipeline.js';
import type { ImprovementSignal, SignalCategory } from './improvement-review.js';

/**
 * Which pipeline role should own a remediation, by signal category. The
 * dev-pipeline re-plans from research anyway, so this is the seed owner, not a
 * final assignment.
 */
const ROLE_BY_CATEGORY: Readonly<Record<SignalCategory, PipelineRole>> = {
  security: 'security',
  bug: 'coder',
  'tech-debt': 'coder',
  routing: 'researcher',
  consensus: 'researcher',
};

/** Stable, dedup-friendly task id for a signal (mirrors the signalKey). */
export function remediationTaskId(signal: ImprovementSignal): string {
  return `improvement-${signal.signalKey}`;
}

/** Maps one improvement signal to a suggest-only remediation task. */
export function improvementSignalToTask(signal: ImprovementSignal): PipelineTask {
  return {
    id: remediationTaskId(signal),
    title: signal.title,
    description:
      `Auto-suggested remediation from improvement_review (#3540 — SUGGEST-ONLY, nothing executed). ` +
      `Category: ${signal.category}; severity: ${signal.severity}.\n\n${signal.body}\n\n` +
      `If accepted, route this through the dev-pipeline (research → plan → vote → implement → QA → ` +
      `security gate). Auto-invocation is a separate, owner-gated step.`,
    assignedTo: ROLE_BY_CATEGORY[signal.category],
    status: 'pending',
  };
}

/**
 * Maps detected improvement signals to remediation tasks for review. Preserves
 * input order (signals arrive severity-sorted) and dedups by task id against
 * `existingTaskIds` when provided.
 */
export function improvementSignalsToTasks(
  signals: readonly ImprovementSignal[],
  existingTaskIds?: ReadonlySet<string>
): PipelineTask[] {
  const tasks: PipelineTask[] = [];
  for (const signal of signals) {
    const task = improvementSignalToTask(signal);
    if (existingTaskIds?.has(task.id) === true) continue;
    tasks.push(task);
  }
  return tasks;
}
