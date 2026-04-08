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

import { runQaLoop } from '../orchestration/qa-loop.js';

import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'dev-pipeline' });

// ============================================================================
// Types
// ============================================================================

/** Agent roles used in the pipeline. */
export type PipelineRole = 'researcher' | 'architect' | 'pm' | 'coder' | 'qa' | 'security';

/** A task decomposed by the PM. */
export interface PipelineTask {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly assignedTo: PipelineRole;
  readonly status: 'pending' | 'in_progress' | 'review' | 'done' | 'rejected';
  readonly feedback?: string;
  /** Implementation text from the code expert (surfaced for harness use). */
  readonly implementation?: string;
}

/** Vote result from consensus. */
export interface VoteResult {
  readonly approved: boolean;
  readonly feedback: string;
  readonly approvalPercentage: number;
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

/**
 * Execute the full multi-agent development pipeline.
 *
 * @param task - High-level task description
 * @param stages - Pluggable stage implementations
 * @returns Pipeline result with all outputs
 */
export async function runDevPipeline(
  task: string,
  stages: DevPipelineStages
): Promise<DevPipelineResult> {
  // 1. RESEARCH
  logger.info('Stage: research', { task: task.slice(0, 100) });
  const research = await stages.research(task);

  // 2. PLAN + VOTE (iterative loop)
  const planResult = await planVoteLoop(task, research, stages);

  // 3. DECOMPOSE (PM splits into tasks)
  logger.info('Stage: decompose');
  const tasks = await stages.decompose(planResult.plan);

  // 4. IMPLEMENT + QA (per-task loop)
  const implResult = await implementQaLoop(tasks, stages);

  // 5. SECURITY SCAN
  logger.info('Stage: security scan');
  const security = await stages.securityScan();

  return {
    completed: security.passed,
    plan: planResult.plan,
    tasks: implResult.completedTasks.length > 0 ? implResult.completedTasks : tasks,
    voteIterations: planResult.iterations,
    qaIterations: implResult.totalIterations,
    securityPassed: security.passed,
  };
}

/** Plan → Vote → iterate on feedback until approved or exhausted. */
async function planVoteLoop(
  task: string,
  research: string,
  stages: DevPipelineStages
): Promise<{ plan: string; iterations: number }> {
  let feedback: string | undefined;
  let plan = '';

  for (let i = 1; i <= MAX_VOTE_ITERATIONS; i++) {
    logger.info('Stage: plan', { iteration: i });
    plan = await stages.plan(task, research, feedback);

    logger.info('Stage: vote', { iteration: i });
    const vote = await stages.vote(plan);

    if (vote.approved) {
      logger.info('Plan approved', { iteration: i, approval: vote.approvalPercentage });
      return { plan, iterations: i };
    }

    feedback = vote.feedback;
    logger.warn('Plan rejected, iterating', { iteration: i, feedback: feedback.slice(0, 200) });
  }

  logger.warn('Max vote iterations reached, proceeding with last plan');
  return { plan, iterations: MAX_VOTE_ITERATIONS };
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

/** Implement tasks with parallel dispatch for independent tasks (#1695). */
async function implementQaLoop(
  tasks: PipelineTask[],
  stages: DevPipelineStages
): Promise<ImplLoopResult> {
  if (tasks.length === 0) return { totalIterations: 0, completedTasks: [] };
  const results = await Promise.allSettled(tasks.map((task) => implementSingleTask(task, stages)));
  let totalIterations = 0;
  const completedTasks: PipelineTask[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      totalIterations += r.value.iterations;
      completedTasks.push(r.value.task);
    } else {
      const reason = r.reason instanceof Error ? r.reason : new Error(String(r.reason));
      logger.error('Task implementation failed', reason, {});
      totalIterations++;
    }
  }
  return { totalIterations, completedTasks };
}
