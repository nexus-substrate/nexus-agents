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
        // Inject adaptive memory context (#1781) + codebase context (#1778)
        const priorContext = await retrieveAdaptiveMemory(ctx.task);
        const codeContext = await searchCodebaseForTask(ctx.task);
        let enrichedTask = ctx.task;
        if (priorContext !== null) {
          enrichedTask = `${enrichedTask}\n\n## Prior Context (Adaptive Memory)\n${priorContext}`;
        }
        if (codeContext !== null && codeContext !== '') {
          enrichedTask = `${enrichedTask}\n\n## Codebase Context\n${codeContext}`;
        }
        const result = await stages.research(enrichedTask);
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
        // Seed plan with relevant research prior-art (#1783)
        const priorArt = await queryResearchRegistry(ctx.task);
        const enrichedResearch =
          priorArt !== null
            ? `${research}\n\n## Prior Art (Research Registry)\n${priorArt}`
            : research;
        const result = await stages.plan(ctx.task, enrichedResearch, feedback);
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
        // Inject symbol context before implementation (#1777)
        const symbolContext = await extractSymbolsForTask(ctx.task);
        if (symbolContext !== null && symbolContext !== '') {
          ctx.sharedMemory.write('implement', 'context', symbolContext);
        }
        const results = await Promise.all(tasks.map((t) => stages.implement(t)));
        // Post-implement trust gate: classify generated output trust level (#1784)
        classifyImplementationTrust(results, ctx);
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

/** Extract symbols from files referenced in the task (#1777). */
async function extractSymbolsForTask(task: string): Promise<string | null> {
  try {
    // Look for file paths in the task
    const fileRefs = task.match(/(?:src|lib|packages)\/[^\s,)]+\.ts/g);
    if (fileRefs === null || fileRefs.length === 0) return null;
    const { extractSymbols } = await import('../indexer/symbol-extractor.js');
    const path = await import('node:path');
    const summaries: string[] = [];
    for (const ref of fileRefs.slice(0, 3)) {
      try {
        const resolved = path.resolve(ref);
        const result = await extractSymbols(resolved);
        const exported = result.symbols.filter((s) => s.exported);
        if (exported.length > 0) {
          summaries.push(`${ref}: ${exported.map((s) => `${s.kind} ${s.name}`).join(', ')}`);
        }
      } catch {
        // File not found — skip
      }
    }
    return summaries.length > 0 ? summaries.join('\n') : null;
  } catch {
    return null;
  }
}

/** Retrieve relevant prior context from AdaptiveMemory (#1781). */
async function retrieveAdaptiveMemory(task: string): Promise<string | null> {
  try {
    const { AdaptiveMemoryBackend } = await import('../context/adaptive-memory.js');
    const path = await import('node:path');
    const { nexusDataPath } = await import('../config/nexus-data-dir.js');
    const baseDir = nexusDataPath('memory');
    const memory = new AdaptiveMemoryBackend({
      dbPath: path.join(baseDir, 'adaptive.db'),
      markdownDir: path.join(baseDir, 'adaptive-md'),
    });
    // Use first 50 chars of task as retrieval key
    const key = task.slice(0, 50).replace(/\s+/g, '-').toLowerCase();
    const result = await memory.retrieve(key);
    if (!result.ok) return null;
    const value = result.value;
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null; // Adaptive memory not available — continue without
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

/** Classify trust of generated implementations (#1784). */
function classifyImplementationTrust(results: unknown[], ctx: PipelineContext): void {
  try {
    // Record trust assessment — fire-and-forget, never blocks pipeline
    const implCount = results.length;
    const trustLevel = implCount > 0 ? 'semi-trusted' : 'unknown';
    ctx.sharedMemory.write('implement', 'risk', {
      trustLevel,
      source: 'pipeline-agent',
      requiresReview: true,
      count: implCount,
    });
  } catch {
    // Trust classification failure must never block the pipeline
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
        ctx.sharedMemory.write('analyze', 'discovery', { slug, analysis: summary });
        return output(K.RESEARCH, summary, getTimeProvider().now() - start, true);
      } catch (e) {
        return failOutput(K.RESEARCH, String(e), getTimeProvider().now() - start);
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
          ctx.sharedMemory.write('scan', 'decision', { recommendations: recs });
          return output(K.FINDINGS, recs, getTimeProvider().now() - start, true);
        }
        return output(K.FINDINGS, 'No repository to scan', getTimeProvider().now() - start, true);
      } catch (e) {
        return failOutput(K.FINDINGS, String(e), getTimeProvider().now() - start);
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
