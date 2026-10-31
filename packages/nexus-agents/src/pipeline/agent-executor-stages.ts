import { captureAcceptanceRequest } from './acceptance-binding.js';
/**
 * Agent Executor stages — the research/plan/decompose/implement/qaReview/
 * qualityGate/securityScan closures `createAgentStages` assembles (#1684, #6331).
 * The vote stage lives in `agent-executor-vote.ts`.
 *
 * @module pipeline/agent-executor-stages
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import { classifyCapacityFailure } from '../adapters/rate-limit-detector.js';
import type { DevPipelineStages, PipelineTask } from './dev-pipeline.js';
import { checkSecurityScan } from './security-gate.js';
import { runQualityGate, checkTypeCheck, checkLint, checkTests } from '../security/quality-gate.js';
import { executeDiscovery, ResearchDiscoverInputSchema } from '../mcp/tools/research-discover.js';
import { analyzeGaps } from '../mcp/tools/research-analyze.js';
import { buildResearchContext, researchContextFromText } from './research-context.js';
import { stageAbortError } from './dev-pipeline-deadlines.js';
import { throwIfAborted } from '../adapters/abort-utils.js';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';
import {
  type StageDeps,
  emitStageEvent,
  postProgress,
  recordOutcome,
  securityStageResult,
  outcomeFieldsFromBridge,
  runExpert,
} from './agent-executor-core.js';
import {
  flushPipelineMemory,
  recordLearning,
  recordRoutingExperience,
} from './agent-executor-memory.js';
import {
  getMemoryContext,
  getOutcomeContext,
  getTrendContext,
  getWeatherContext,
} from './agent-executor-context.js';
import { parseTasksFromResponse } from './agent-executor-parsers.js';
import { isAbsolute, win32 } from 'node:path';
import {
  IMPLEMENT_ACCESS_MODE,
  implementQualitySignals,
  implementStageText,
} from './implement-result.js';

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

function recordPlanOutcome(
  sessionId: string | undefined,
  result: Awaited<ReturnType<typeof runExpert>>
): string | undefined {
  const failure = classifyCapacityFailure(result.error ?? '');
  const outcome = outcomeFieldsFromBridge(result);
  recordOutcome({
    sessionId,
    taskId: 'plan',
    category: 'architecture',
    ...outcome,
    ...(result.error !== undefined ? { error: failure.safeMessage } : {}),
    ...(failure.durable && outcome.cli === undefined ? { cli: 'unknown' } : {}),
  });
  return failure.durable ? failure.safeMessage : undefined;
}

export function createResearchStage(deps: StageDeps): DevPipelineStages['research'] {
  const { config, startStage } = deps;
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
        sessionId: config.sessionId,
        taskId: 'research',
        category: 'research',
        cli: undefined,
        routedBy: undefined,
        served: undefined,
        accessMode: undefined,
        requestedAccessMode: undefined,
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
  acceptanceRun,
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
    const request = captureAcceptanceRequest(acceptanceRun, 'plan', prompt);
    const r = await runExpert(guard, 'architecture', request.prompt, 'plan', {
      acceptanceRequest: request,
      signal,
      accessMode: 'read-only-analysis',
    });
    // model: real per-model failure attribution for the feedback bridge (#4194)
    emitStageEvent('plan', r.success ? 'completed' : 'failed', {
      durationMs: r.durationMs,
      model: r.model,
    });
    const failure = recordPlanOutcome(config.sessionId, r);
    await postProgress(
      config,
      'Plan',
      `Done (${String(r.text.length)} chars, ${String(r.durationMs)}ms)`
    );
    // A failed bridge can echo the request; never turn it into a generated plan.
    // Successful empty plans still reach the pipeline's explicit empty-plan status.
    if (!r.success && failure !== undefined) throw new Error(`Planning failed: ${failure}`);
    if (!r.success) throw new Error('Planning failed: expert call unsuccessful');
    return r.text;
  };
}

export function createDecomposeStage({
  config,
  guard,
  startStage,
  acceptanceRun,
}: StageDeps): DevPipelineStages['decompose'] {
  return async (plan, signal) => {
    startStage('decompose');
    await postProgress(config, 'PM', 'PM expert decomposing...');
    const request = captureAcceptanceRequest(
      acceptanceRun,
      'decompose',
      `Decompose into tasks for implementation in a future fresh execution workspace.\n` +
        `Each task must include writeTargets as either {"kind":"workspace-relative","paths":["path/from/workspace/root"]} or {"kind":"none"}.\n` +
        `Targets must be portable relative paths from that future workspace root. Keep source files and absolute paths in description as references; never turn them into write targets.\n` +
        `Return JSON: [{id,title,description,assignedTo,writeTargets}]\n\n${plan}`
    );
    const r = await runExpert(guard, 'pm', request.prompt, 'decompose', {
      signal,
      accessMode: 'read-only-analysis',
      acceptanceRequest: request,
    });
    // Record the routed call even when its failed output cannot become tasks.
    recordOutcome({
      sessionId: config.sessionId,
      taskId: 'decompose',
      category: 'planning',
      ...outcomeFieldsFromBridge(r),
    });
    if (!r.success) {
      emitStageEvent('decompose', 'failed', { error: 'Expert call unsuccessful' });
      throw new Error('Decomposition failed: expert call unsuccessful');
    }
    const tasks = parseTasksFromResponse(r.text, plan);
    tasks.forEach((task) => validateImplementationTargets(task.writeTargets));
    emitStageEvent('decompose', 'completed', { durationMs: r.durationMs });
    await postProgress(config, 'PM', `${String(tasks.length)} task(s)`);
    return tasks;
  };
}

export function createImplementStage({
  config,
  guard,
  startStage,
  wrapper,
  acceptanceRun,
}: StageDeps): DevPipelineStages['implement'] {
  return async (task, signal) => {
    const targets = validateImplementationTargets(task.writeTargets);
    if (targets === undefined) return 'No write requested; implementation was not dispatched.';
    startStage(`impl-${task.id}`, 'execute');
    await postProgress(config, `Code [${task.id}]`, task.title);
    const fb = task.feedback !== undefined ? `\n\nQA feedback: ${task.feedback}` : '';
    // #6792: see IMPLEMENT_ACCESS_MODE (panel decision on #6792, option B).
    const request = captureAcceptanceRequest(
      acceptanceRun,
      'implement',
      implementationPrompt(task, fb, targets)
    );
    const r = await runExpert(guard, 'code', request.prompt, task.id, {
      signal,
      acceptanceRequest: request,
      accessMode: config.dryRun === true ? 'read-only-analysis' : IMPLEMENT_ACCESS_MODE,
      workDir: config.scanTarget,
      wrapper,
    });
    emitStageEvent(`impl-${task.id}`, r.success ? 'completed' : 'failed', {
      durationMs: r.durationMs,
      // model: real per-model failure attribution for the feedback bridge (#4194)
      model: r.model,
    });
    const signals = implementQualitySignals(r);
    recordOutcome({
      sessionId: config.sessionId,
      taskId: task.id,
      category: 'code_generation',
      ...outcomeFieldsFromBridge(r),
      ...(signals.length > 0 && { qualitySignals: signals }),
    });
    recordRoutingExperience(
      'code_generation',
      r.success,
      r.durationMs,
      r.tokensUsed,
      task.researchMaturity
    );
    await postProgress(config, `Code [${task.id}]`, `Done (${String(r.durationMs)}ms)`);
    // Failed bridge text can echo the prompt; it is never an implementation artifact.
    if (r.success && r.text !== '') return implementStageText(r);
    throw new Error('Implementation failed: expert call unsuccessful or empty output');
  };
}

function validateImplementationTargets(
  contract: PipelineTask['writeTargets']
): string[] | undefined {
  if (contract?.kind === 'none') return undefined;
  if (contract?.kind !== 'workspace-relative' || contract.paths.length === 0)
    throw new Error(
      'Implementation write target contract is missing, unmeasured, or declares no writable targets'
    );
  const invalidTarget = contract.paths.find((target) => !isSafeWorkspaceTarget(target));
  if (invalidTarget !== undefined)
    throw new Error(`Invalid implementation write target: ${invalidTarget || '(empty)'}`);
  return [...new Set(contract.paths)];
}

function isSafeWorkspaceTarget(target: string): boolean {
  return (
    target.length > 0 &&
    !target.includes('\\') &&
    !target.includes('\0') &&
    !/[\u0001-\u001f\u007f]/u.test(target) &&
    !target.includes(':') &&
    !target.includes('$') &&
    !target.startsWith('~') &&
    !isAbsolute(target) &&
    !win32.isAbsolute(target) &&
    target.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function implementationPrompt(
  task: PipelineTask,
  feedback: string,
  targets: readonly string[]
): string {
  return (
    `Implement only within the declared workspace-relative write targets below. ` +
    `Treat other paths in the description as references, not write targets.\n` +
    `Workspace-relative write targets (JSON): ${JSON.stringify(targets)}\n\n` +
    `${task.title}\n${task.description}${feedback}`
  );
}

export { createQaReviewStage } from './agent-executor-qa.js';

/**
 * Run typecheck/lint/tests for the gate, or report it unmeasured when the
 * scratch's dependencies could not be provisioned (#6794).
 */
function runQualityChecks(
  target: string,
  workspaceDependencies: StageDeps['workspaceDependencies'],
  wrapper: StageDeps['wrapper'],
  signal: AbortSignal | undefined
): Promise<Awaited<ReturnType<typeof runQualityGate>> | { verdict: 'skip'; feedback: string }> {
  if (workspaceDependencies?.status === 'failed') {
    return Promise.resolve({
      verdict: 'skip' as const,
      feedback: `dependencies could not be provisioned: ${workspaceDependencies.reason}`,
    });
  }
  // Scratch scripts must not inherit source-repository Git redirects.
  const env = workspaceDependencies === undefined ? undefined : hermeticGitEnv();
  // Reuse the canonical #1684 engine + check factories — no new check logic.
  return runQualityGate(
    'qa',
    [
      checkTypeCheck(target, env, wrapper),
      checkLint(target, env, wrapper),
      checkTests(target, env, wrapper),
    ],
    1,
    signal
  );
}

export function createQualityGateStage({
  config,
  startStage,
  workspaceDependencies,
  wrapper,
}: StageDeps): NonNullable<DevPipelineStages['qualityGate']> {
  return async (signal) => {
    startStage('quality-gate');
    const start = getTimeProvider().now();
    const target = config.scanTarget ?? process.cwd();
    await postProgress(config, 'QualityGate', `Typecheck/lint/tests on ${target}...`);
    // #6747: the signal ends the running check's process tree; an aborted
    // gate throws rather than recording an outcome it never measured.
    const result = await rethrowAsStageAbort('qualityGate', signal, async () =>
      runQualityChecks(target, workspaceDependencies, wrapper, signal)
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
    emitStageEvent('quality-gate', passed ? 'completed' : 'failed', {
      durationMs: ms,
      verdict: result.verdict,
    });
    recordOutcome({
      sessionId: config.sessionId,
      taskId: 'quality-gate',
      category: 'code_review',
      cli: undefined,
      routedBy: undefined,
      served: undefined,
      accessMode: undefined,
      requestedAccessMode: undefined,
      success: passed,
      durationMs: ms,
    });
    // A skip is not a failure, and saying "Gate failed" for one would send
    // the reader looking for a broken check rather than a missing script.
    const verdictNote = `Gate ${result.verdict === 'skip' ? 'unmeasured' : 'failed'}: ${result.feedback}`;
    await postProgress(config, 'QualityGate', passed ? 'Passed' : verdictNote);
    const feedback = result.verdict === 'skip' ? verdictNote : result.feedback;
    return { passed, verdict: result.verdict, feedback };
  };
}

export function createSecurityScanStage(deps: StageDeps): DevPipelineStages['securityScan'] {
  const { config, startStage, workspaceDependencies, workspaceRoot, wrapper } = deps;
  return async (signal) => {
    startStage('security');
    const start = getTimeProvider().now();
    const target = workspaceRoot ?? config.scanTarget ?? process.cwd();
    await postProgress(config, 'Security', `Scanning ${target}...`);
    // Bound to the pipeline's own scratch (#6794): it lives outside cwd by
    // design, so the scan is contained to the scratch rather than to cwd.
    const scratchBound = workspaceDependencies !== undefined;
    const check = checkSecurityScan(target, undefined, {
      baseline: config.securityBaseline,
      dependencyTarget: config.scanTarget,
      dependencyCaptureRoot: workspaceRoot,
      env: scratchBound ? hermeticGitEnv() : undefined,
      root: scratchBound ? target : undefined,
      wrapper,
    });
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
      sessionId: config.sessionId,
      taskId: 'security',
      category: 'security_review',
      cli: undefined,
      routedBy: undefined,
      served: undefined,
      accessMode: undefined,
      requestedAccessMode: undefined,
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
    return securityStageResult(result, passed);
  };
}
