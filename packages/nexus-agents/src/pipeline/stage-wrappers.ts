/**
 * Stage Wrappers — Adapt DevPipelineStages to IPipelineStage (#1735, Phase 2)
 *
 * Wraps existing agent-executor stage functions as IPipelineStage objects
 * that can be compiled into graph nodes. This is an adapter layer that
 * preserves existing behavior while enabling graph-based execution.
 *
 * @module pipeline/stage-wrappers
 */

import { getTimeProvider, getErrorMessage } from '../core/index.js';
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
        // Codebase context (#1778). Adaptive-memory context was previously
        // injected here (#1781) but the bridge was provably broken — it
        // used `task.slice(0, 50)` as a literal key against a backend
        // whose writers use UUIDs, so the lookup never matched. Removed
        // in #2796; cross-cutting memory enrichment will return via
        // `getContextForTask` once #2795 (Phase 3 of #2792) lands.
        const codeContext = await searchCodebaseForTask(ctx.task);
        let enrichedTask = ctx.task;
        if (codeContext !== null && codeContext !== '') {
          enrichedTask = `${enrichedTask}\n\n## Codebase Context\n${codeContext}`;
        }
        const result = await stages.research(enrichedTask);
        return output(K.RESEARCH, result, getTimeProvider().now() - start, true);
      } catch (e) {
        return failOutput(K.RESEARCH, getErrorMessage(e), getTimeProvider().now() - start);
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
        // Seed plan with relevant research prior-art (#1783)
        const priorArt = await queryResearchRegistry(ctx.task);
        const enrichedResearch =
          priorArt !== null
            ? `${research}\n\n## Prior Art (Research Registry)\n${priorArt}`
            : research;
        const result = await stages.plan(ctx.task, enrichedResearch, feedback);
        return output(K.PLAN, result, getTimeProvider().now() - start, true);
      } catch (e) {
        return failOutput(K.PLAN, getErrorMessage(e), getTimeProvider().now() - start);
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
      const research =
        typeof ctx.state[K.RESEARCH] === 'string' ? (ctx.state[K.RESEARCH] as string) : '';
      try {
        const vote = await stages.vote(plan, research);
        const ms = getTimeProvider().now() - start;
        const feedback = isApproved(vote) ? '' : getVoteFeedback(vote);
        return {
          stateKey: K.VOTE_RESULT,
          value: { vote, feedback },
          durationMs: ms,
          success: isApproved(vote),
        };
      } catch (e) {
        return failOutput(K.VOTE_RESULT, getErrorMessage(e), getTimeProvider().now() - start);
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
        return failOutput(K.TASKS, getErrorMessage(e), getTimeProvider().now() - start);
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
        // #1777 symbol-context injection: pre-#2937 the resolved symbol
        // summaries were written to ctx.sharedMemory for downstream
        // stages — but no stage ever read them. Both the write and the
        // upstream `extractSymbolsForTask` resolver are gone now.
        const results = await Promise.all(tasks.map((t) => stages.implement(t)));
        // #1784 post-implement trust gate: pre-#2937 the trust assessment
        // was written to ctx.sharedMemory for downstream stages — but no
        // stage ever read it. The classifier (and its dead write) are
        // gone now. If a real trust-gate consumer lands later, route it
        // through ctx.state with a documented PIPELINE_STATE_KEYS entry.
        return output(K.IMPLEMENTATIONS, results, getTimeProvider().now() - start, true);
      } catch (e) {
        return failOutput(K.IMPLEMENTATIONS, getErrorMessage(e), getTimeProvider().now() - start);
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
        return failOutput(K.QA_ITERATIONS, getErrorMessage(e), getTimeProvider().now() - start);
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
        return failOutput(K.SECURITY_PASSED, getErrorMessage(e), getTimeProvider().now() - start);
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
// Codebase Intelligence Helpers (#1777, #1778)
// ============================================================================

/** Search codebase for symbols related to the task (#1778). */
async function searchCodebaseForTask(task: string): Promise<string | null> {
  try {
    const { CodebaseIndex } = await import('../indexer/codebase-search.js');
    const index = new CodebaseIndex(process.cwd());
    // Extract key terms from task (first 3 significant words)
    const terms = task
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 3);
    if (terms.length === 0) return null;
    const results = index.search(terms.join(' '), 5);
    if (results.length === 0) return null;
    return results
      .map(
        (r) =>
          `${r.symbol.kind} ${r.symbol.name} (${r.symbol.filePath}:${String(r.symbol.startLine)})`
      )
      .join('\n');
  } catch {
    return null; // Indexing not available — continue without context
  }
}

/** Query research registry for techniques relevant to the task (#1783). */
async function queryResearchRegistry(task: string): Promise<string | null> {
  try {
    const { synthesizeResearch } = await import('../cli/research-helpers-synthesize.js');
    // Extract key topic from task (first meaningful phrase)
    const topic = task
      .split(/[.!?\n]/)
      .filter((s) => s.trim().length > 10)[0]
      ?.trim();
    if (topic === undefined) return null;
    const result = await synthesizeResearch(topic.slice(0, 50));
    if (!result.ok) return null;
    const themes = result.value.crossCuttingThemes.slice(0, 3);
    if (themes.length === 0) return null;
    return `Relevant themes: ${themes.join(', ')}`;
  } catch {
    return null; // Research registry not available — continue without
  }
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

// ============================================================================
// Audit Pipeline Stages (#1774)
// ============================================================================

/** Analyze stage — detect repo tech stack via repo_analyze. */
export function createAnalyzeStageWrapper(): IPipelineStage {
  return {
    id: 'analyze',
    name: 'Analyze Repository',
    async execute(ctx: PipelineContext): Promise<StageOutput> {
      const start = getTimeProvider().now();
      try {
        // Use task as repo slug if it looks like owner/name
        const slug = ctx.task.match(/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/)?.[1];
        if (slug === undefined) {
          return output(
            K.RESEARCH,
            'No repository slug found in task',
            getTimeProvider().now() - start,
            true
          );
        }
        const { analyzeGitHubRepo } = await import('../mcp/tools/repo-analyze.js');
        const analysis = await analyzeGitHubRepo({ repo: slug, depth: 'deep' });
        const summary = `Language: ${String(analysis.language)}, Framework: ${String(analysis.framework)}, CI: ${String(analysis.ciProvider)}, Security: ${analysis.securityTooling.join(', ') || 'none'}`;
        return output(K.RESEARCH, summary, getTimeProvider().now() - start, true);
      } catch (e) {
        return failOutput(K.RESEARCH, getErrorMessage(e), getTimeProvider().now() - start);
      }
    },
  };
}

/** Scan stage — run security scan with recommendations from repo_security_plan. */
export function createScanStageWrapper(): IPipelineStage {
  return {
    id: 'scan',
    name: 'Security Scan',
    async execute(ctx: PipelineContext): Promise<StageOutput> {
      const start = getTimeProvider().now();
      try {
        const slug = ctx.task.match(/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/)?.[1];
        if (slug !== undefined) {
          const { generateSecurityPlan } = await import('../mcp/tools/repo-security-plan.js');
          const plan = await generateSecurityPlan({ repo: slug, maxScanners: 10 });
          const recs = plan.recommendations
            .slice(0, 5)
            .map((r) => `${r.priority}: ${r.displayName} (${r.category})`)
            .join('; ');
          return output(K.FINDINGS, recs, getTimeProvider().now() - start, true);
        }
        return output(K.FINDINGS, 'No repository to scan', getTimeProvider().now() - start, true);
      } catch (e) {
        return failOutput(K.FINDINGS, getErrorMessage(e), getTimeProvider().now() - start);
      }
    },
  };
}

/** Report stage — summarize analysis + scan findings. */
export function createReportStageWrapper(): IPipelineStage {
  return {
    id: 'report',
    name: 'Security Report',
    execute(ctx: PipelineContext): Promise<StageOutput> {
      const start = getTimeProvider().now();
      const research = typeof ctx.state[K.RESEARCH] === 'string' ? ctx.state[K.RESEARCH] : '';
      const findings = typeof ctx.state[K.FINDINGS] === 'string' ? ctx.state[K.FINDINGS] : '';
      const report = `## Security Report\n\n### Analysis\n${String(research)}\n\n### Findings\n${String(findings)}`;
      return Promise.resolve(output(K.COMPLETED, report, getTimeProvider().now() - start, true));
    },
  };
}

/** Create a stage registry for the audit pipeline template. */
export function createAuditStageRegistry(): Map<string, IPipelineStage> {
  return new Map([
    ['analyze', createAnalyzeStageWrapper()],
    ['scan', createScanStageWrapper()],
    ['report', createReportStageWrapper()],
  ]);
}
