/** Builtin QA request construction, bounded implementation coverage and outcome recording. */
import { captureAcceptanceRequest } from './acceptance-binding.js';
import type { DevPipelineStages, QaReviewResult } from './dev-pipeline.js';
import { buildQaPrompt } from './qa-review-budget.js';
import { parseQaVerdict } from './agent-executor-parsers.js';
import {
  type StageDeps,
  emitStageEvent,
  postProgress,
  recordOutcome,
  outcomeFieldsFromBridge,
  runExpert,
} from './agent-executor-core.js';
import { recordLearning, recordMemoryError } from './agent-executor-memory.js';
/** Why a QA review produced no verdict (#6776). */
type QaUnmeasuredCause = 'call-failed' | 'unreadable';

/**
 * Turn the QA expert's result into a review, failing CLOSED (#6776).
 *
 * A failed call (`runExpert` returns `text: ''` on budget skip, routing error,
 * timeout, refusal) and a reply with no readable verdict are both ABSENCE of a
 * review. `QaReviewResult.verdict` has no `unmeasured` member (it is a
 * published type, and the QA loop only distinguishes pass from not-pass), so
 * absence is recorded as `needs_work` whose feedback says the verdict was
 * unmeasured and why, plus a `qa-unmeasured:<cause>` outcome signal. The QA
 * loop is bounded, so a reviewer that keeps failing ends the task not-done
 * after its max iterations with this feedback on it.
 */
function readQaReview(r: {
  readonly success: boolean;
  readonly text: string;
  readonly error?: string | undefined;
}): { review: QaReviewResult; unmeasured?: QaUnmeasuredCause } {
  if (!r.success) {
    const reason = `QA review unmeasured: the QA expert call failed (${r.error ?? 'unknown error'}); no verdict was produced.`;
    return {
      review: { verdict: 'needs_work', feedback: reason, issues: [reason] },
      unmeasured: 'call-failed',
    };
  }
  const parsed = parseQaVerdict(r.text);
  if (parsed !== undefined) return { review: parsed };
  const excerpt = r.text.trim() === '' ? '(empty reply)' : r.text.slice(0, 500);
  const reason =
    'QA review unmeasured: no PASS / NEEDS_WORK / REJECT verdict could be read from the reviewer reply.';
  return {
    review: { verdict: 'needs_work', feedback: `${reason}\n\n${excerpt}`, issues: [reason] },
    unmeasured: 'unreadable',
  };
}

export function createQaReviewStage({
  config,
  guard,
  startStage,
  wrapper,
  acceptanceRun,
  workspaceRoot,
}: StageDeps): DevPipelineStages['qaReview'] {
  return async (task, implementation, signal) => {
    startStage(`qa-${task.id}`);
    await postProgress(config, `QA [${task.id}]`, 'QA expert reviewing...');
    const { prompt, coverage } = buildQaPrompt(task.title, implementation);
    // #6768: the reviewer reads model-generated code that can come from issue
    // text, so it runs read-only with no MCP tools (panel decision on #6768).
    const request = captureAcceptanceRequest(acceptanceRun, 'qa', prompt);
    const r = await runExpert(guard, 'qa', request.prompt, task.id, {
      acceptanceRequest: request,
      signal,
      accessMode: 'read-only-analysis',
      workDir: workspaceRoot ?? config.scanTarget,
      wrapper,
    });
    const { review: parsed, unmeasured } = readQaReview(r);
    const review: QaReviewResult = coverage !== undefined ? { ...parsed, coverage } : parsed;
    emitStageEvent(`qa-${task.id}`, review.verdict === 'pass' ? 'completed' : 'failed', {
      durationMs: r.durationMs,
      // model: real per-model failure attribution for the feedback bridge (#4194)
      model: r.model,
    });
    recordOutcome({
      sessionId: config.sessionId,
      taskId: task.id,
      category: 'code_review',
      // #6521 I2: the row scores the reviewer's CALL; the verdict judges the
      // implementation, so it rides as a signal, not as `success`.
      ...outcomeFieldsFromBridge(r),
      qualitySignals: [
        `qa-verdict:${review.verdict}`,
        ...(unmeasured !== undefined ? [`qa-unmeasured:${unmeasured}`] : []),
      ],
    });
    recordQaMemory(task.title, review, unmeasured);
    await postProgress(config, `QA [${task.id}]`, review.verdict);
    return review;
  };
}

function recordQaMemory(
  title: string,
  review: QaReviewResult,
  unmeasured: QaUnmeasuredCause | undefined
): void {
  // Write-back: persist QA outcomes to memory (#1716)
  if (review.verdict === 'pass') {
    recordLearning(`Task "${title}" passed QA`, 0.8, 'pipeline-qa');
  } else if (unmeasured !== undefined) {
    recordMemoryError(
      `QA review of "${title}" unmeasured (${unmeasured})`,
      'QA produced no verdict'
    );
  } else {
    recordMemoryError(`QA rejected "${title}": ${review.feedback.slice(0, 150)}`, 'needs rework');
  }
}
