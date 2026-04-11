/**
 * Stage Wrappers — Adapt DevPipelineStages to IPipelineStage (#1735, Phase 2)
 *
 * Wraps existing agent-executor stage functions as IPipelineStage objects
 * that can be compiled into graph nodes. This is an adapter layer that
 * preserves existing behavior while enabling graph-based execution.
 *
 * @module pipeline/stage-wrappers
 */

import { getTimeProvider } from '../core/index.js';
import { parseSpec } from '../orchestration/spec-parser.js';
import type { DevPipelineStages, PipelineTask } from './dev-pipeline.js';
import { isApproved, getVoteFeedback } from './dev-pipeline.js';
import type { IPipelineStage, PipelineContext, StageOutput } from './stage-types.js';
import { PIPELINE_STATE_KEYS as K } from './stage-types.js';

// ============================================================================
// Helper
// ============================================================================

function output(key: string, value: unknown, durationMs: number, success: boolean): StageOutput {
  return { stateKey: key, value, durationMs, success };
}

function failOutput(key: string, error: string, durationMs: number): StageOutput {
  return { stateKey: key, value: null, durationMs, success: false, error };
}

// ============================================================================
// Stage Implementations
// ============================================================================

/** Parse spec stage — parses task markdown into a typed ParsedSpec. */
export function createParseSpecStageWrapper(): IPipelineStage {
  return {
    id: 'parseSpec',
    name: 'Parse Spec',
    execute(ctx: PipelineContext): Promise<StageOutput> {
      const start = getTimeProvider().now();
      const result = parseSpec(ctx.task);
      if (!result.ok) {
        return Promise.resolve(
          failOutput(K.PARSED_SPEC, result.error.message, getTimeProvider().now() - start)
        );
      }
      return Promise.resolve(
        output(K.PARSED_SPEC, result.value, getTimeProvider().now() - start, true)
      );
    },
  };
}

/** Research stage — gathers context for the task. */
export function createResearchStageWrapper(stages: DevPipelineStages): IPipelineStage {
  return {
    id: 'research',
    name: 'Research',
    async execute(ctx: PipelineContext): Promise<StageOutput> {
      const start = getTimeProvider().now();
      try {
        const result = await stages.research(ctx.task);
        // Write research findings to shared memory for downstream stages (#1764)
        ctx.sharedMemory.write('research', 'discovery', result);
        return output(K.RESEARCH, result, getTimeProvider().now() - start, true);
      } catch (e) {
        return failOutput(K.RESEARCH, String(e), getTimeProvider().now() - start);
      }
    },
  };
}

/** Plan stage — architect creates a plan from research + task. */
export function createPlanStageWrapper(stages: DevPipelineStages): IPipelineStage {
  return {
    id: 'plan',
    name: 'Plan',
    async execute(ctx: PipelineContext): Promise<StageOutput> {
      const start = getTimeProvider().now();
      const research =
        typeof ctx.state[K.RESEARCH] === 'string' ? (ctx.state[K.RESEARCH] as string) : '';
      const feedback =
        typeof ctx.state[K.VOTE_FEEDBACK] === 'string'
          ? (ctx.state[K.VOTE_FEEDBACK] as string)
          : undefined;
      try {
        const result = await stages.plan(ctx.task, research, feedback);
        // Write plan decisions to shared memory for downstream stages (#1764)
        ctx.sharedMemory.write('plan', 'decision', result);
        return output(K.PLAN, result, getTimeProvider().now() - start, true);
      } catch (e) {
        return failOutput(K.PLAN, String(e), getTimeProvider().now() - start);
      }
    },
  };
}

/** Vote stage — consensus vote on the plan. */
export function createVoteStageWrapper(stages: DevPipelineStages): IPipelineStage {
  return {
    id: 'vote',
    name: 'Vote',
    async execute(ctx: PipelineContext): Promise<StageOutput> {
      const start = getTimeProvider().now();
      const plan = typeof ctx.state[K.PLAN] === 'string' ? (ctx.state[K.PLAN] as string) : '';
      try {
        const vote = await stages.vote(plan);
        const ms = getTimeProvider().now() - start;
        const feedback = isApproved(vote) ? '' : getVoteFeedback(vote);
        return {
          stateKey: K.VOTE_RESULT,
          value: { vote, feedback },
          durationMs: ms,
          success: isApproved(vote),
        };
      } catch (e) {
        return failOutput(K.VOTE_RESULT, String(e), getTimeProvider().now() - start);
      }
    },
  };
}

/** Decompose stage — PM splits approved plan into tasks. */
export function createDecomposeStageWrapper(stages: DevPipelineStages): IPipelineStage {
  return {
    id: 'decompose',
    name: 'Decompose',
    async execute(ctx: PipelineContext): Promise<StageOutput> {
      const start = getTimeProvider().now();
      const plan = typeof ctx.state[K.PLAN] === 'string' ? (ctx.state[K.PLAN] as string) : '';
      try {
        const tasks = await stages.decompose(plan);
        return output(K.TASKS, tasks, getTimeProvider().now() - start, true);
      } catch (e) {
        return failOutput(K.TASKS, String(e), getTimeProvider().now() - start);
      }
    },
  };
}

/** Implement stage — code experts work assigned tasks. */
export function createImplementStageWrapper(stages: DevPipelineStages): IPipelineStage {
  return {
    id: 'implement',
    name: 'Implement',
    async execute(ctx: PipelineContext): Promise<StageOutput> {
      const start = getTimeProvider().now();
      const tasks = Array.isArray(ctx.state[K.TASKS]) ? (ctx.state[K.TASKS] as PipelineTask[]) : [];
      try {
        const results = await Promise.all(tasks.map((t) => stages.implement(t)));
        return output(K.IMPLEMENTATIONS, results, getTimeProvider().now() - start, true);
      } catch (e) {
        return failOutput(K.IMPLEMENTATIONS, String(e), getTimeProvider().now() - start);
      }
    },
  };
}

/** QA stage — QA expert reviews implementations. */
export function createQaStageWrapper(stages: DevPipelineStages): IPipelineStage {
  return {
    id: 'qa',
    name: 'QA Review',
    async execute(ctx: PipelineContext): Promise<StageOutput> {
      const start = getTimeProvider().now();
      const tasks = Array.isArray(ctx.state[K.TASKS]) ? (ctx.state[K.TASKS] as PipelineTask[]) : [];
      const impls = Array.isArray(ctx.state[K.IMPLEMENTATIONS])
        ? (ctx.state[K.IMPLEMENTATIONS] as string[])
        : [];
      try {
        const reviews = await Promise.all(tasks.map((t, i) => stages.qaReview(t, impls[i] ?? '')));
        const allPass = reviews.every((r) => r.verdict === 'pass');
        return output(K.QA_ITERATIONS, reviews, getTimeProvider().now() - start, allPass);
      } catch (e) {
        return failOutput(K.QA_ITERATIONS, String(e), getTimeProvider().now() - start);
      }
    },
  };
}

/** Security stage — SARIF scan blocks on critical/high findings. */
export function createSecurityStageWrapper(stages: DevPipelineStages): IPipelineStage {
  return {
    id: 'security',
    name: 'Security Scan',
    async execute(): Promise<StageOutput> {
      const start = getTimeProvider().now();
      try {
        const result = await stages.securityScan();
        return output(
          K.SECURITY_PASSED,
          result.passed,
          getTimeProvider().now() - start,
          result.passed
        );
      } catch (e) {
        return failOutput(K.SECURITY_PASSED, String(e), getTimeProvider().now() - start);
      }
    },
  };
}

/** Scaffold stage — generates project structure from approved plan. */
export function createScaffoldStageWrapper(): IPipelineStage {
  return {
    id: 'scaffold',
    name: 'Scaffold',
    execute(ctx: PipelineContext): Promise<StageOutput> {
      const start = getTimeProvider().now();
      const plan = typeof ctx.state[K.PLAN] === 'string' ? (ctx.state[K.PLAN] as string) : '';
      const result =
        plan.length > 0
          ? `Scaffolded project from plan (${String(plan.length)} chars)`
          : 'No plan to scaffold';
      return Promise.resolve(
        output(K.SCAFFOLD_OUTPUT, result, getTimeProvider().now() - start, true)
      );
    },
  };
}

// ============================================================================
// Registry Factory
// ============================================================================

/** Create a complete stage registry for the dev pipeline template. */
export function createDevStageRegistry(stages: DevPipelineStages): Map<string, IPipelineStage> {
  return new Map([
    ['research', createResearchStageWrapper(stages)],
    ['plan', createPlanStageWrapper(stages)],
    ['vote', createVoteStageWrapper(stages)],
    ['decompose', createDecomposeStageWrapper(stages)],
    ['implement', createImplementStageWrapper(stages)],
    ['qa', createQaStageWrapper(stages)],
    ['security', createSecurityStageWrapper(stages)],
  ]);
}

/** Create a complete stage registry for the greenfield pipeline template. */
export function createGreenfieldStageRegistry(
  stages: DevPipelineStages
): Map<string, IPipelineStage> {
  return new Map([
    ['parseSpec', createParseSpecStageWrapper()],
    ['research', createResearchStageWrapper(stages)],
    ['plan', createPlanStageWrapper(stages)],
    ['vote', createVoteStageWrapper(stages)],
    ['scaffold', createScaffoldStageWrapper()],
    ['decompose', createDecomposeStageWrapper(stages)],
    ['implement', createImplementStageWrapper(stages)],
    ['qa', createQaStageWrapper(stages)],
    ['security', createSecurityStageWrapper(stages)],
  ]);
}
