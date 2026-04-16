/* eslint-disable max-lines */ // Pipeline orchestration — cohesive single module (governance: 400-600 OK)
/**
 * Multi-Agent Development Pipeline (#1684)
 *
 * Orchestrates the full development workflow with iterative loops:
 *
 *   1. RESEARCH — research expert gathers context
 *   2. PLAN+VOTE — architect plans, consensus votes, iterate on feedback
 *   3. DECOMPOSE — PM splits approved plan into phases/epics/issues
 *   4. IMPLEMENT — code experts work assigned tasks in parallel
 *   5. QA REVIEW — QA expert reviews, sends back to PM if issues found
 *   6. SECURITY — SARIF scan blocks on critical/high findings
 *   7. SHIP — all gates passed
 *
 * Each stage can iterate: vote feedback loops back to plan,
 * QA failures loop back to implementation via PM reassignment.
 *
 * @module pipeline/dev-pipeline
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { runQaLoop } from '../orchestration/qa-loop.js';

import { createLogger } from '../core/index.js';
import { getPipelineEventBus } from './event-bus.js';
import {
  saveStageCheckpoint,
  loadCheckpointState,
  cleanupCheckpoint,
} from './pipeline-checkpoint.js';
import type { PipelineCheckpointState } from './pipeline-checkpoint.js';
import { TraceWriter } from './trace-writer.js';
import type { IHindsightBeliefMemory } from '../context/belief-memory-interface.js';
import type { HindsightRecord } from '../context/belief-hindsight-types.js';

const logger = createLogger({ component: 'dev-pipeline' });

// ============================================================================
// Types
// ============================================================================

/** Agent roles used in the pipeline. */
export type PipelineRole = 'researcher' | 'architect' | 'pm' | 'coder' | 'qa' | 'security';

/** A task decomposed by the PM, potentially with conditional approval requirements. */
export interface PipelineTask {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly assignedTo: PipelineRole;
  readonly status: 'pending' | 'in_progress' | 'review' | 'done' | 'rejected';
  readonly feedback?: string;
  /** Implementation text from the code expert (surfaced for harness use). */
  readonly implementation?: string;
  /** Conditions required for task completion (from conditional_go vote). */
  readonly conditions?: readonly string[] | undefined;
  /** Caveats/warnings associated with the task (from conditional_go vote). */
  readonly caveats?: readonly string[] | undefined;
}

/** Vote result from consensus — discriminated union with conditional approval support. */
export type VoteResult =
  | { readonly kind: 'approved'; readonly approvalPercentage: number }
  | { readonly kind: 'rejected'; readonly feedback: string; readonly approvalPercentage: number }
  | {
      readonly kind: 'conditional_go';
      readonly conditions: readonly string[];
      readonly caveats: readonly string[];
      readonly approvalPercentage: number;
    };

/** Construct VoteResult from legacy approval flow. */
export function createVoteResult(
  approved: boolean,
  feedback: string,
  approvalPercentage: number,
  conditions?: readonly string[]
): VoteResult {
  if (!approved) {
    return { kind: 'rejected', feedback, approvalPercentage };
  }
  if (conditions !== undefined && conditions.length > 0) {
    return { kind: 'conditional_go', conditions, caveats: [], approvalPercentage };
  }
  return { kind: 'approved', approvalPercentage };
}

/** Check if vote result is approved (either explicit or conditional). */
export function isApproved(result: VoteResult): boolean {
  return result.kind === 'approved' || result.kind === 'conditional_go';
}

/** Get feedback from vote result (only available for rejected). */
export function getVoteFeedback(result: VoteResult): string {
  if (result.kind === 'rejected') return result.feedback;
  return '';
}

/** QA review result. */
export interface QaReviewResult {
  readonly verdict: 'pass' | 'needs_work' | 'reject';
  readonly feedback: string;
  readonly issues: readonly string[];
}

/** Overall pipeline result. */
export interface DevPipelineResult {
  readonly completed: boolean;
  readonly plan: string;
  readonly tasks: readonly PipelineTask[];
  readonly voteIterations: number;
  readonly qaIterations: number;
  readonly securityPassed: boolean;
}

// ============================================================================
// Pipeline Stage Interfaces
// ============================================================================

/** Pluggable stage implementations — inject real or mock agents. */
export interface DevPipelineStages {
  /** Research expert gathers context for the task. */
  research(task: string): Promise<string>;
  /** Architect creates a plan from research + task. */
  plan(task: string, research: string, priorFeedback?: string): Promise<string>;
  /** Consensus vote on the plan. Returns approval + feedback. */
  vote(plan: string): Promise<VoteResult>;
  /** PM decomposes approved plan into tasks. */
  decompose(plan: string): Promise<PipelineTask[]>;
  /** Code expert implements a task. Returns the work product. */
  implement(task: PipelineTask): Promise<string>;
  /** QA expert reviews implementation. */
  qaReview(task: PipelineTask, implementation: string): Promise<QaReviewResult>;
  /** Security scan. Returns true if passed. */
  securityScan(): Promise<{ passed: boolean; feedback: string }>;
}

// ============================================================================
// Pipeline Execution
// ============================================================================

/** Maximum iterations for each loop. */
const MAX_VOTE_ITERATIONS = 3;
const MAX_QA_ITERATIONS = 3;

/** Pipeline execution mode. */
export type PipelineMode = 'autonomous' | 'harness';

/** Options for pipeline execution. */
export interface DevPipelineOptions {
  /** Session ID for checkpoint/resume. Omit for no persistence. */
  readonly sessionId?: string | undefined;
  /** When true, stop after plan+vote and return partial result (#1717). */
  readonly dryRun?: boolean | undefined;
  /**
   * Pipeline mode (#1704):
   * - 'autonomous' (default): full pipeline runs internally
   * - 'harness': stops after decompose, returns tasks for external implementation
   */
  readonly mode?: PipelineMode | undefined;
  /** Optional BeliefMemory for hindsight updates after plan outcomes (#1720). */
  readonly beliefMemory?: IHindsightBeliefMemory | undefined;
}

/**
 * Execute the full multi-agent development pipeline.
 *
 * When `sessionId` is provided, each stage checkpoints to disk. On crash,
 * re-running with the same sessionId resumes from the last completed stage.
 *
 * @param task - High-level task description
 * @param stages - Pluggable stage implementations
 * @param options - Pipeline options (sessionId for checkpoint/resume)
 * @returns Pipeline result with all outputs
 */
export async function runDevPipeline(
  task: string,
  stages: DevPipelineStages,
  options?: DevPipelineOptions
): Promise<DevPipelineResult> {
  const sid = options?.sessionId;
  const prior = sid !== undefined ? loadCheckpointState(sid) : null;

  // Wire TraceWriter for execution replay (#1719)
  const traceWriter = createTraceWriter(sid);

  try {
    return await runDevPipelineInner(task, stages, options, sid, prior);
  } finally {
    await flushTraceWriter(traceWriter);
  }
}

/** Core pipeline logic, separated for trace writer try/finally. */
async function runDevPipelineInner(
  task: string,
  stages: DevPipelineStages,
  options: DevPipelineOptions | undefined,
  sid: string | undefined,
  prior: PipelineCheckpointState | null
): Promise<DevPipelineResult> {
  const bm = options?.beliefMemory;

  // Phases 1-2: Research + Plan/Vote
  const { planResult } = await runPlanningPhase(task, stages, sid, prior);

  // Reinforce/weaken beliefs based on vote outcome (#1720)
  reinforcePlanBeliefs(bm, task, planResult.iterations);

  // DRY RUN: stop after plan+vote, return partial result (#1717)
  if (options?.dryRun === true) {
    logger.info('Dry run — stopping after plan+vote');
    return buildDryRunResult(planResult);
  }

  // Phase 3: Decompose
  const tasks = await runOrResumeDecompose(prior, planResult.plan, stages, {
    conditional: planResult.conditional,
    conditions: planResult.conditions,
    caveats: planResult.caveats,
  });
  if (sid !== undefined) saveStageCheckpoint(sid, 'decompose', { type: 'decompose', tasks });

  // HARNESS MODE: stop after decompose, return tasks for external implementation (#1704)
  if (options?.mode === 'harness') {
    logger.info('Harness mode — returning tasks for external implementation');
    return buildHarnessResult(planResult, tasks);
  }

  // Phases 4-5: Implement + Security
  const result = await runImplSecurityPhase(planResult, tasks, stages, sid);

  // Apply hindsight with actual pipeline outcome (#1720)
  applyPipelineHindsight(bm, task, sid, result);

  return result;
}

/** Create a TraceWriter when sessionId is available (#1719). */
function createTraceWriter(sessionId: string | undefined): TraceWriter | null {
  if (sessionId === undefined) return null;
  try {
    const tracesDir = join(homedir(), '.nexus-agents', 'traces');
    return new TraceWriter(getPipelineEventBus(), {
      runsDir: tracesDir,
      runId: `pipeline-${sessionId}`,
    });
  } catch (error: unknown) {
    logger.warn('Failed to create TraceWriter', { error: String(error) });
    return null;
  }
}

/** Flush and stop the TraceWriter, swallowing errors. */
async function flushTraceWriter(writer: TraceWriter | null): Promise<void> {
  if (writer === null) return;
  try {
    await writer.flush();
  } catch (error: unknown) {
    logger.warn('Failed to flush execution trace', { error: String(error) });
  } finally {
    writer.stop();
  }
}

/**
 * Reinforce or weaken beliefs based on plan vote outcome (#1720).
 * First-iteration approval → reinforce. Multiple iterations → weaken.
 * Fire-and-forget — pipeline does not block on belief updates.
 */
function reinforcePlanBeliefs(
  bm: IHindsightBeliefMemory | undefined,
  task: string,
  iterations: number
): void {
  if (bm === undefined) return;
  const beliefId = `plan-approach:${task.slice(0, 80)}`;
  // Fire-and-forget: belief memory is optional persistence. Log on failure
  // so we notice if the belief store silently stops receiving updates.
  const logBmError = (op: string) => (error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    logger.debug(`Belief-memory ${op} failed`, { beliefId, error: msg });
  };
  if (iterations <= 1) {
    void bm.reinforce(beliefId, 'Plan approved on first vote iteration').catch(logBmError('reinforce'));
  } else {
    void bm
      .weaken(beliefId, `Plan required ${String(iterations)} vote iterations before approval`)
      .catch(logBmError('weaken'));
  }
}

/**
 * Apply hindsight with actual pipeline outcome (#1720).
 * Fire-and-forget — pipeline does not block on hindsight persistence.
 */
function applyPipelineHindsight(
  bm: IHindsightBeliefMemory | undefined,
  task: string,
  sessionId: string | undefined,
  result: DevPipelineResult
): void {
  if (bm === undefined) return;
  const record: HindsightRecord = {
    hindsightId: `pipeline-${sessionId ?? 'ephemeral'}-${Date.now().toString(36)}`,
    taskId: sessionId ?? task.slice(0, 40),
    priorBeliefs: [],
    expectedOutcome: 'Pipeline completes with all gates passed',
    actualOutcome: result.completed
      ? `Completed: ${String(result.tasks.length)} tasks, security ${result.securityPassed ? 'passed' : 'failed'}`
      : `Incomplete: ${String(result.voteIterations)} vote iterations, ${String(result.qaIterations)} QA iterations`,
    outcomeMatched: result.completed && result.securityPassed,
    correctedBeliefs: [],
    newBeliefs: [],
    lessons: result.completed
      ? [`Pipeline succeeded for task type: ${task.slice(0, 60)}`]
      : [`Pipeline did not complete — review plan approach for: ${task.slice(0, 60)}`],
    createdAt: new Date(),
  };
  void bm.applyHindsight(record).catch((error: unknown) => {
    // Fire-and-forget: hindsight persistence is optional. Log so we can
    // notice if records are silently failing to land.
    const msg = error instanceof Error ? error.message : String(error);
    logger.debug('Belief-memory applyHindsight failed', {
      hindsightId: record.hindsightId,
      error: msg,
    });
  });
}

/** Build a partial result for dry-run mode. */
function buildDryRunResult(planResult: {
  plan: string;
  iterations: number;
  conditional: boolean;
  conditions: readonly string[];
  caveats: readonly string[];
}): DevPipelineResult {
  return {
    completed: false,
    plan: planResult.plan,
    tasks: [],
    voteIterations: planResult.iterations,
    qaIterations: 0,
    securityPassed: false,
  };
}

/** Phases 1-2: Research + Plan/Vote with checkpoint support. */
async function runPlanningPhase(
  task: string,
  stages: DevPipelineStages,
  sid: string | undefined,
  prior: PipelineCheckpointState | null
): Promise<{
  planResult: {
    plan: string;
    iterations: number;
    conditional: boolean;
    conditions: readonly string[];
    caveats: readonly string[];
  };
}> {
  const research = await runOrResume(prior, 'research', () => {
    logger.info('Stage: research', { task: task.slice(0, 100) });
    return stages.research(task);
  });
  if (sid !== undefined) saveStageCheckpoint(sid, 'research', { type: 'research', text: research });

  const planResult = await runPlanOrResume(prior, task, research, stages);
  if (sid !== undefined) {
    saveStageCheckpoint(sid, 'plan', {
      type: 'plan',
      text: planResult.plan,
      iterations: planResult.iterations,
    });
    saveStageCheckpoint(sid, 'vote', {
      type: 'vote',
      approved: planResult.conditional || planResult.iterations > 0,
      conditional: planResult.conditional,
      conditions: planResult.conditions,
      caveats: planResult.caveats,
      iterations: planResult.iterations,
    });
  }
  return { planResult };
}

/** Build result for harness mode — tasks returned for external implementation. */
function buildHarnessResult(
  planResult: {
    plan: string;
    iterations: number;
    conditional: boolean;
    conditions: readonly string[];
    caveats: readonly string[];
  },
  tasks: PipelineTask[]
): DevPipelineResult {
  return {
    completed: false,
    plan: planResult.plan,
    tasks,
    voteIterations: planResult.iterations,
    qaIterations: 0,
    securityPassed: false,
  };
}

/** Phases 4-5: Implement/QA + Security with checkpoint support. */
async function runImplSecurityPhase(
  planResult: { plan: string; iterations: number },
  tasks: PipelineTask[],
  stages: DevPipelineStages,
  sid: string | undefined
): Promise<DevPipelineResult> {
  const implResult = await implementQaLoop(tasks, stages);
  if (sid !== undefined)
    saveStageCheckpoint(sid, 'implement', { type: 'implement', tasks: implResult.completedTasks });

  logger.info('Stage: security scan');
  const security = await stages.securityScan();
  if (sid !== undefined) {
    saveStageCheckpoint(sid, 'security', { type: 'security', passed: security.passed });
    if (security.passed) cleanupCheckpoint(sid);
  }

  return {
    completed: security.passed,
    plan: planResult.plan,
    tasks: implResult.completedTasks.length > 0 ? implResult.completedTasks : tasks,
    voteIterations: planResult.iterations,
    qaIterations: implResult.totalIterations,
    securityPassed: security.passed,
  };
}

/** Run stage or return cached result from checkpoint. */
async function runOrResume(
  prior: PipelineCheckpointState | null,
  stage: string,
  run: () => Promise<string>
): Promise<string> {
  if (prior?.research !== undefined && stage === 'research') {
    logger.info('Resuming from checkpoint', { stage });
    return prior.research;
  }
  return run();
}

/** Run plan/vote or return from checkpoint. */
async function runPlanOrResume(
  prior: PipelineCheckpointState | null,
  task: string,
  research: string,
  stages: DevPipelineStages
): Promise<{
  plan: string;
  iterations: number;
  conditional: boolean;
  conditions: readonly string[];
  caveats: readonly string[];
}> {
  if (prior?.plan !== undefined) {
    logger.info('Resuming from checkpoint', { stage: 'plan' });
    return {
      plan: prior.plan,
      iterations: prior.voteIterations ?? 0,
      conditional: prior.voteConditional ?? false,
      conditions: prior.voteConditions ?? [],
      caveats: prior.voteCaveats ?? [],
    };
  }
  return planVoteLoop(task, research, stages);
}

/** Conditional vote metadata for task annotation. */
interface ConditionalMeta {
  readonly conditional: boolean;
  readonly conditions: readonly string[];
  readonly caveats: readonly string[];
}

/** Run decompose or return from checkpoint. */
async function runOrResumeDecompose(
  prior: PipelineCheckpointState | null,
  plan: string,
  stages: DevPipelineStages,
  meta: ConditionalMeta
): Promise<PipelineTask[]> {
  if (prior?.tasks !== undefined) {
    logger.info('Resuming from checkpoint', { stage: 'decompose' });
    return [...prior.tasks];
  }
  logger.info('Stage: decompose');
  const tasks = await stages.decompose(plan);
  if (meta.conditional && tasks.length > 0) {
    return tasks.map((t) => ({
      ...t,
      conditions: meta.conditions,
      caveats: meta.caveats,
    }));
  }
  return tasks;
}

/** Extract conditional metadata from an approved vote. */
function extractConditionalMeta(vote: VoteResult): ConditionalMeta {
  if (vote.kind === 'conditional_go') {
    return { conditional: true, conditions: vote.conditions, caveats: vote.caveats };
  }
  return { conditional: false, conditions: [], caveats: [] };
}

/**
 * Plan → Vote → iterate on feedback until approved or exhausted.
 *
 * Uses DevPipelineStages.vote() for each round (preserves progress
 * callbacks, outcome recording, event emission from agent-executor).
 * The iteration pattern matches runIterativeConsensus (#1734).
 */
async function planVoteLoop(
  task: string,
  research: string,
  stages: DevPipelineStages
): Promise<{ plan: string; iterations: number } & ConditionalMeta> {
  let feedback: string | undefined;
  let plan = '';

  for (let i = 1; i <= MAX_VOTE_ITERATIONS; i++) {
    logger.info('Stage: plan', { iteration: i });
    plan = await stages.plan(task, research, feedback);

    logger.info('Stage: vote', { iteration: i });
    const vote = await stages.vote(plan);

    if (isApproved(vote)) {
      const meta = extractConditionalMeta(vote);
      logger.info('Plan approved', { iteration: i, approval: vote.approvalPercentage, ...meta });
      return { plan, iterations: i, ...meta };
    }

    feedback = getVoteFeedback(vote);
    logger.warn('Plan rejected, iterating', { iteration: i, feedback: feedback.slice(0, 200) });
  }

  logger.warn('Max vote iterations reached, proceeding with last plan');
  return { plan, iterations: MAX_VOTE_ITERATIONS, conditional: false, conditions: [], caveats: [] };
}

/** Result of implementing a single task. */
interface TaskImplResult {
  readonly iterations: number;
  readonly task: PipelineTask;
}

/** Implement a single task with QA iteration loop via reusable runQaLoop (#1707). */
async function implementSingleTask(
  task: PipelineTask,
  stages: DevPipelineStages
): Promise<TaskImplResult> {
  let currentTask: PipelineTask = { ...task, status: 'in_progress' };
  const qaResult = await runQaLoop<string>(
    async (feedback) => {
      if (feedback !== undefined) {
        currentTask = {
          id: task.id,
          title: task.title,
          description: task.description,
          assignedTo: task.assignedTo,
          status: 'rejected',
          feedback,
        };
      }
      return stages.implement(currentTask);
    },
    async (impl) => {
      const review = await stages.qaReview(currentTask, impl);
      return { verdict: review.verdict, feedback: review.feedback, issues: review.issues };
    },
    MAX_QA_ITERATIONS
  );
  const finalTask: PipelineTask = {
    id: task.id,
    title: task.title,
    description: task.description,
    assignedTo: task.assignedTo,
    status: qaResult.approved ? 'done' : 'rejected',
    implementation: qaResult.output,
    feedback: qaResult.feedback,
  };
  return { iterations: qaResult.iterations, task: finalTask };
}

/** Result of the implement+QA loop. */
interface ImplLoopResult {
  readonly totalIterations: number;
  readonly completedTasks: readonly PipelineTask[];
}

/** Max concurrent task implementations per wave (#1734 Phase 1.3). */
const MAX_IMPL_CONCURRENCY = 4;

/** Implement tasks with bounded-concurrency parallel dispatch (#1695, #1734). */
async function implementQaLoop(
  tasks: PipelineTask[],
  stages: DevPipelineStages
): Promise<ImplLoopResult> {
  if (tasks.length === 0) return { totalIterations: 0, completedTasks: [] };

  const taskFns = tasks.map((task) => () => implementSingleTaskSafe(task, stages));
  const results = await executeWithConcurrency(taskFns, MAX_IMPL_CONCURRENCY);
  return aggregateImplResults(results);
}

/** Execute a task with error handling, returning a safe result. */
async function implementSingleTaskSafe(
  task: PipelineTask,
  stages: DevPipelineStages
): Promise<TaskImplResult | null> {
  try {
    return await implementSingleTask(task, stages);
  } catch (error) {
    const reason = error instanceof Error ? error : new Error(String(error));
    logger.error('Task implementation failed', reason, {});
    return null;
  }
}

/** Aggregate implementation results into totals. */
function aggregateImplResults(results: ReadonlyArray<TaskImplResult | null>): ImplLoopResult {
  let totalIterations = 0;
  const completedTasks: PipelineTask[] = [];
  for (const r of results) {
    if (r !== null) {
      totalIterations += r.iterations;
      completedTasks.push(r.task);
    } else {
      totalIterations++;
    }
  }
  return { totalIterations, completedTasks };
}

/** Execute async tasks with bounded concurrency (#1734). */
async function executeWithConcurrency<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;
  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const idx = nextIndex;
      nextIndex++;
      const task = tasks[idx];
      if (task !== undefined) results[idx] = await task();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}
