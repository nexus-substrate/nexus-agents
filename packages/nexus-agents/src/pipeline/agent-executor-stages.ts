/**
 * Agent Executor stages — the research/plan/decompose/implement/qaReview/
 * qualityGate/securityScan closures `createAgentStages` assembles (#1684, #6331).
 * The vote stage lives in `agent-executor-vote.ts`.
 *
 * @module pipeline/agent-executor-stages
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import type { DevPipelineStages, QaReviewResult } from './dev-pipeline.js';
import { buildQaPrompt } from './qa-review-budget.js';
import { checkSecurityScan } from './security-gate.js';
import { runQualityGate, checkTypeCheck, checkLint, checkTests } from '../security/quality-gate.js';
import { executeDiscovery, ResearchDiscoverInputSchema } from '../mcp/tools/research-discover.js';
import { analyzeGaps } from '../mcp/tools/research-analyze.js';
import { buildResearchContext, researchContextFromText } from './research-context.js';
import { stageAbortError } from './dev-pipeline-deadlines.js';
import { throwIfAborted } from '../adapters/abort-utils.js';
import {
  type StageDeps,
  emitStageEvent,
  postProgress,
  recordOutcome,
  outcomeFieldsFromBridge,
  runExpert,
} from './agent-executor-core.js';
import {
  flushPipelineMemory,
  recordLearning,
  recordMemoryError,
  recordRoutingExperience,
} from './agent-executor-memory.js';
import {
  getMemoryContext,
  getOutcomeContext,
  getTrendContext,
  getWeatherContext,
} from './agent-executor-context.js';
import { parseQaVerdict, parseTasksFromResponse } from './agent-executor-parsers.js';

const logger = createLogger({ component: 'agent-executor' });

/**
 * Run a stage's work and, once `signal` has fired, throw the stage's abort
 * error (#6747) — whether the work rejected on the abort or returned a result
 * it reached anyway. A scan or gate that stopped part-way returns a `skip` or
 * `fail` that measured nothing; reporting it as the stage's verdict would
 * record an outcome for work that never finished.
 */
async function rethrowAsStageAbort<T>(
  stage: string,
  signal: AbortSignal | undefined,
  work: () => Promise<T>
): Promise<T> {
  let value: T;
  try {
    value = await work();
  } catch (error: unknown) {
    if (signal?.aborted === true) throw stageAbortError(stage, signal);
    throw error;
  }
  if (signal?.aborted === true) throw stageAbortError(stage, signal);
  return value;
}

/** Discovery plus gap analysis for `topic`, stopping on `signal` (#6747). */
async function gatherResearch(
  topic: string,
  signal: AbortSignal | undefined
): Promise<ReturnType<typeof buildResearchContext>> {
  const discoverInput = ResearchDiscoverInputSchema.parse({ topic });
  // The signal ends the source fetch in flight and stops the fan-out.
  const discover = await executeDiscovery(discoverInput, logger, signal);
  // `analyzeGaps` reads the local registries only; it has no network or
  // subprocess to stop, so the abort is checked around it instead.
  throwIfAborted(signal, 'Research aborted');
  const analyze = await analyzeGaps(topic);
  throwIfAborted(signal, 'Research aborted');
  return buildResearchContext(discover, analyze, topic);
}

export function createResearchStage({
  config,
  startStage,
}: StageDeps): DevPipelineStages['research'] {
  return async (task, signal) => {
    // #3372 Option A (7/7 vote): call the research tools DIRECTLY for structured
    // data instead of routing through an LLM expert that discards it. The text
    // returned here is DERIVED from that same structure (single source of truth);
    // increment 2 threads the structured metadata through plan/vote.
    startStage('research');
    await postProgress(config, 'Research', 'Querying research tools (structured)...');
    const start = getTimeProvider().now();
    const topic = task.slice(0, 200);
    try {
      // Seed with prior learnings from memory (#1716) — appended to the text.
      const memoryCtx = await getMemoryContext(task);
      const ctx = await gatherResearch(topic, signal);
      const durationMs = getTimeProvider().now() - start;
      emitStageEvent('research', 'completed', { durationMs });
      // Direct tool calls consume no routed CLI — recordOutcome (CLI-keyed)
      // no-ops gracefully on undefined cli; research perf is no longer a CLI outcome.
      recordOutcome({
        taskId: 'research',
        category: 'research',
        cli: undefined,
        routedBy: undefined,
        served: undefined,
        success: true,
        durationMs,
      });
      // Write-back: persist research findings to memory (#1716)
      if (ctx.text.length > 50) {
        recordLearning(
          `Research for "${task.slice(0, 80)}": ${ctx.text.slice(0, 200)}`,
          0.7,
          'pipeline-research'
        );
      }
      await postProgress(
        config,
        'Research',
        `Done (${String(ctx.metadata.discoveredItems.length)} items, ${String(durationMs)}ms)`
      );
      // #3234 seam 0: return the full ResearchContext (text + structured
      // metadata) so the orchestration can attach the metadata to tasks.
      const text = memoryCtx ? `${ctx.text}${memoryCtx}` : ctx.text;
      return { text, metadata: ctx.metadata };
    } catch (error: unknown) {
      // An aborted stage is ended, not degraded: continuing on the minimal
      // context would carry a cancelled run on into planning.
      if (signal?.aborted === true) throw stageAbortError('research', signal);
      const durationMs = getTimeProvider().now() - start;
      emitStageEvent('research', 'failed', { durationMs });
      logger.debug('Research stage failed; continuing with minimal context', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Empty-metadata context — the no-research path degrades cleanly.
      return researchContextFromText(`[Research failed] ${task.slice(0, 500)}`);
    }
  };
}

export function createPlanStage({
  config,
  guard,
  startStage,
}: StageDeps): DevPipelineStages['plan'] {
  return async (task, research, feedback, signal) => {
    startStage('plan');
    const outcomeCtx = getOutcomeContext();
    const trendCtx = getTrendContext();
    const weatherCtx = await getWeatherContext();
    const contextBlock = `${research}${outcomeCtx}${trendCtx}${weatherCtx}`;
    const prompt =
      feedback !== undefined
        ? `Revise plan.\n\nFeedback: ${feedback}\n\nTask: ${task}\n\n${contextBlock}`
        : `Create implementation plan for:\n\n${task}\n\n${contextBlock}`;
    await postProgress(config, 'Plan', feedback !== undefined ? 'Revising...' : 'Planning...');
    const r = await runExpert(guard, 'architecture', prompt, 'plan', signal);
    // model: real per-model failure attribution for the feedback bridge (#4194)
    emitStageEvent('plan', r.success ? 'completed' : 'failed', {
      durationMs: r.durationMs,
      model: r.model,
    });
    recordOutcome({
      taskId: 'plan',
      category: 'architecture',
      ...outcomeFieldsFromBridge(r),
    });
    await postProgress(
      config,
      'Plan',
      `Done (${String(r.text.length)} chars, ${String(r.durationMs)}ms)`
    );
    // #4772: do NOT fall back to `prompt`. Returning the input as the output
    // made a failed planner indistinguishable from a successful one — the
    // vote, and then decompose, ran against the prompt text as if it were a
    // plan. `runExpert` already returns `{ success: false, text: '' }` on
    // failure, so the empty string carries the signal; `planVoteLoop` stops
    // on it rather than voting on nothing.
    return r.text;
  };
}

export function createDecomposeStage({
  config,
  guard,
  startStage,
}: StageDeps): DevPipelineStages['decompose'] {
  return async (plan, signal) => {
    startStage('decompose');
    await postProgress(config, 'PM', 'PM expert decomposing...');
    const r = await runExpert(
      guard,
      'pm',
      `Decompose into tasks.\nReturn JSON: [{id,title,description,assignedTo}]\n\n${plan}`,
      'decompose',
      signal
    );
    const tasks = parseTasksFromResponse(r.text, plan);
    emitStageEvent('decompose', 'completed', { durationMs: r.durationMs });
    recordOutcome({
      taskId: 'decompose',
      category: 'planning',
      ...outcomeFieldsFromBridge(r),
    });
    await postProgress(config, 'PM', `${String(tasks.length)} task(s)`);
    return tasks;
  };
}

export function createImplementStage({
  config,
  guard,
  startStage,
}: StageDeps): DevPipelineStages['implement'] {
  return async (task, signal) => {
    startStage(`impl-${task.id}`);
    await postProgress(config, `Code [${task.id}]`, task.title);
    const fb = task.feedback !== undefined ? `\n\nQA feedback: ${task.feedback}` : '';
    const r = await runExpert(
      guard,
      'code',
      `Implement:\n\n${task.title}\n${task.description}${fb}`,
      task.id,
      signal
    );
    emitStageEvent(`impl-${task.id}`, r.success ? 'completed' : 'failed', {
      durationMs: r.durationMs,
      // model: real per-model failure attribution for the feedback bridge (#4194)
      model: r.model,
    });
    recordOutcome({
      taskId: task.id,
      category: 'code_generation',
      ...outcomeFieldsFromBridge(r),
    });
    recordRoutingExperience(
      'code_generation',
      r.success,
      r.durationMs,
      r.tokensUsed,
      task.researchMaturity
    );
    await postProgress(config, `Code [${task.id}]`, `Done (${String(r.durationMs)}ms)`);
    // An empty text is a failed implementation (`runExpert` returns `text: ''` on failure).
    if (r.text !== '') return r.text;
    return `[Implementation failed: ${r.error ?? 'unknown error'}]`;
  };
}

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
}: StageDeps): DevPipelineStages['qaReview'] {
  return async (task, implementation, signal) => {
    startStage(`qa-${task.id}`);
    await postProgress(config, `QA [${task.id}]`, 'QA expert reviewing...');
    const { prompt, coverage } = buildQaPrompt(task.title, implementation);
    const r = await runExpert(guard, 'qa', prompt, task.id, signal);
    const { review: parsed, unmeasured } = readQaReview(r);
    const review: QaReviewResult = coverage !== undefined ? { ...parsed, coverage } : parsed;
    emitStageEvent(`qa-${task.id}`, review.verdict === 'pass' ? 'completed' : 'failed', {
      durationMs: r.durationMs,
      // model: real per-model failure attribution for the feedback bridge (#4194)
      model: r.model,
    });
    recordOutcome({
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
    // Write-back: persist QA outcomes to memory (#1716)
    if (review.verdict === 'pass') {
      recordLearning(`Task "${task.title}" passed QA`, 0.8, 'pipeline-qa');
    } else if (unmeasured !== undefined) {
      recordMemoryError(
        `QA review of "${task.title}" unmeasured (${unmeasured})`,
        'QA produced no verdict'
      );
    } else {
      recordMemoryError(
        `QA rejected "${task.title}": ${review.feedback.slice(0, 150)}`,
        'needs rework'
      );
    }
    await postProgress(config, `QA [${task.id}]`, review.verdict);
    return review;
  };
}

export function createQualityGateStage({
  config,
  startStage,
}: StageDeps): NonNullable<DevPipelineStages['qualityGate']> {
  return async (signal) => {
    startStage('quality-gate');
    const start = getTimeProvider().now();
    const target = config.scanTarget ?? process.cwd();
    await postProgress(config, 'QualityGate', `Typecheck/lint/tests on ${target}...`);
    // Reuse the canonical #1684 engine + check factories — no new check logic.
    // #6747: the signal ends the running check's process tree; an aborted
    // gate throws rather than recording an outcome it never measured.
    const result = await rethrowAsStageAbort('qualityGate', signal, () =>
      runQualityGate(
        'qa',
        [checkTypeCheck(target), checkLint(target), checkTests(target)],
        1,
        signal
      )
    );
    // #4355: `=== 'pass'`, NOT `!== 'fail'`. The gate reports three states,
    // and `skip` means no check actually ran — every declared script was
    // missing. Reading that as passed lets a blocking gate ship code with
    // zero typecheck/lint/test coverage and record it as a success, which is
    // the "unreviewed work laundered as reviewed" failure the gate exists to
    // prevent. `!== 'fail'` was equivalent while these checks could only
    // pass or fail; making `skip` reachable is what broke it.
    const passed = result.verdict === 'pass';
    const ms = getTimeProvider().now() - start;
    emitStageEvent('quality-gate', passed ? 'completed' : 'failed', { durationMs: ms });
    recordOutcome({
      taskId: 'quality-gate',
      category: 'code_review',
      cli: undefined,
      routedBy: undefined,
      served: undefined,
      success: passed,
      durationMs: ms,
    });
    // A skip is not a failure, and saying "Gate failed" for one would send
    // the reader looking for a broken check rather than a missing script.
    const verdictNote =
      result.verdict === 'skip'
        ? `Gate unmeasured: ${result.feedback}`
        : `Gate failed: ${result.feedback}`;
    await postProgress(config, 'QualityGate', passed ? 'Passed' : verdictNote);
    return { passed, feedback: result.feedback };
  };
}

export function createSecurityScanStage({
  config,
  startStage,
}: StageDeps): DevPipelineStages['securityScan'] {
  return async (signal) => {
    startStage('security');
    const start = getTimeProvider().now();
    const target = config.scanTarget ?? process.cwd();
    await postProgress(config, 'Security', `Scanning ${target}...`);
    const check = checkSecurityScan(target);
    // #6747: the signal ends the scanner's process tree and the OSV lookups.
    const result = await rethrowAsStageAbort('securityScan', signal, () => check(signal));
    // #4355: same tri-state discipline as the quality gate above. This one
    // predates that change: `checkSecurityScan` returns `skip` when the scan
    // itself ERRORED (security-gate.ts:99-102), so a scanner that failed to
    // run was recorded as "security passed" on a blocking ship gate. Fail
    // closed instead — `.rules/untrusted-input.md` requires it, and an
    // unmeasured scan is the one result that must never read as clean.
    const passed = result.verdict === 'pass';
    const ms = getTimeProvider().now() - start;
    emitStageEvent('security', passed ? 'completed' : 'failed', { durationMs: ms });
    // security scan is a deterministic local check (no CLI dispatch),
    // so it has no `cli` to attribute the outcome to. Skip the record.
    recordOutcome({
      taskId: 'security',
      category: 'security_review',
      cli: undefined,
      routedBy: undefined,
      served: undefined,
      success: passed,
      durationMs: ms,
    });
    // A scan that could not run is not a finding. `checkSecurityScan`
    // returns `skip` when the scanner itself errored — most often because
    // semgrep is not installed — and reporting that as BLOCKED reads
    // identically to a discovered vulnerability. Same distinction the
    // quality gate above makes.
    const securityNote =
      result.verdict === 'skip'
        ? `Security scan did not run: ${result.details}. Install the scanner, or use qualityGate 'advisory' to proceed without security evidence.`
        : `BLOCKED: ${result.details}`;
    await postProgress(config, 'Security', passed ? 'Passed' : securityNote);
    // Flush pipeline memory session at end of run
    flushPipelineMemory();
    return { passed, verdict: result.verdict, feedback: result.details };
  };
}
