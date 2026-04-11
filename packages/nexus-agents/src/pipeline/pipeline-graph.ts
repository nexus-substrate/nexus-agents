/**
 * Pipeline Graph Compiler — Build executable graphs from templates (#1735, Phase 2)
 *
 * Compiles a PipelineTemplate + IPipelineStage implementations into a
 * CompiledGraph that can be executed by the GraphExecutor.
 *
 * @module pipeline/pipeline-graph
 */

import { GraphBuilder } from '../orchestration/graph/graph-builder.js';
import type { CompiledGraph } from '../orchestration/graph/graph-types.js';
import { START, END, formatCompileError } from '../orchestration/graph/graph-types.js';
import { createLogger } from '../core/index.js';
import type { IPipelineStage, PipelineTemplate, PipelineContext } from './stage-types.js';
import { PIPELINE_STATE_KEYS } from './stage-types.js';

const logger = createLogger({ component: 'pipeline-graph' });

// ============================================================================
// Types
// ============================================================================

/** Result of compiling a pipeline template into a graph. */
export interface PipelineGraphResult {
  readonly ok: boolean;
  readonly graph?: CompiledGraph | undefined;
  readonly error?: string | undefined;
}

/** Map of stage ID → stage implementation. */
export type StageRegistry = ReadonlyMap<string, IPipelineStage>;

// ============================================================================
// Graph Compilation
// ============================================================================

/**
 * Compile a pipeline template + stages into an executable graph.
 *
 * Each IPipelineStage is wrapped as a GraphBuilder node handler.
 * Linear edges are auto-generated from template.stages order.
 * Custom edges override the linear flow for feedback loops.
 */
export function compilePipelineGraph(
  template: PipelineTemplate,
  stages: StageRegistry
): PipelineGraphResult {
  const missing = findMissingStages(template, stages);
  if (missing.length > 0) {
    return { ok: false, error: `Missing stage implementations: ${missing.join(', ')}` };
  }

  const builder = new GraphBuilder();
  registerStateFields(builder);
  registerNodes(builder, template, stages);
  registerEdges(builder, template);

  const result = builder.compile();
  if (!result.ok) {
    const errMsg = formatCompileError(result.error);
    logger.warn('Pipeline graph compilation failed', { error: errMsg });
    return { ok: false, error: errMsg };
  }

  logger.info('Pipeline graph compiled', {
    template: template.id,
    stages: template.stages.length,
  });
  return { ok: true, graph: result.value };
}

// ============================================================================
// Helpers
// ============================================================================

/** Check for stages in template that have no implementation. */
function findMissingStages(template: PipelineTemplate, stages: StageRegistry): string[] {
  return template.stages.filter((id) => !stages.has(id));
}

/** Register standard state fields on the graph builder. */
function registerStateFields(builder: GraphBuilder): void {
  const keys = PIPELINE_STATE_KEYS;
  builder.addState(keys.TASK, { defaultValue: '', reducer: { type: 'overwrite' } });
  builder.addState(keys.RESEARCH, { defaultValue: '', reducer: { type: 'overwrite' } });
  builder.addState(keys.PLAN, { defaultValue: '', reducer: { type: 'overwrite' } });
  builder.addState(keys.VOTE_RESULT, { defaultValue: null, reducer: { type: 'overwrite' } });
  builder.addState(keys.VOTE_FEEDBACK, { defaultValue: '', reducer: { type: 'overwrite' } });
  builder.addState(keys.VOTE_ITERATIONS, { defaultValue: 0, reducer: { type: 'overwrite' } });
  builder.addState(keys.TASKS, { defaultValue: [], reducer: { type: 'overwrite' } });
  builder.addState(keys.IMPLEMENTATIONS, { defaultValue: [], reducer: { type: 'overwrite' } });
  builder.addState(keys.QA_ITERATIONS, { defaultValue: 0, reducer: { type: 'overwrite' } });
  builder.addState(keys.SECURITY_PASSED, { defaultValue: false, reducer: { type: 'overwrite' } });
  builder.addState(keys.FINDINGS, { defaultValue: [], reducer: { type: 'overwrite' } });
  builder.addState(keys.SYNTHESIS, { defaultValue: null, reducer: { type: 'overwrite' } });
  builder.addState(keys.DELIVERABLES, { defaultValue: [], reducer: { type: 'overwrite' } });
  builder.addState(keys.PARSED_SPEC, { defaultValue: null, reducer: { type: 'overwrite' } });
  builder.addState(keys.SCAFFOLD_OUTPUT, { defaultValue: null, reducer: { type: 'overwrite' } });
  builder.addState(keys.COMPLETED, { defaultValue: false, reducer: { type: 'overwrite' } });
}

/** Register graph nodes from template stages. */
function registerNodes(
  builder: GraphBuilder,
  template: PipelineTemplate,
  stages: StageRegistry
): void {
  for (const stageId of template.stages) {
    const stage = stages.get(stageId);
    if (stage === undefined) continue;
    builder.addNode(stageId, createNodeHandler(stage, template));
  }
}

/** Create a GraphBuilder NodeHandler from an IPipelineStage. */
function createNodeHandler(
  stage: IPipelineStage,
  template: PipelineTemplate
): (state: Readonly<Record<string, unknown>>) => Promise<Partial<Record<string, unknown>>> {
  return async (state) => {
    // Extract or create SharedMemoryStore from graph state (#1764)
    const existingStore = state[PIPELINE_STATE_KEYS.SHARED_MEMORY];
    const { SharedMemoryStore } = await import('./shared-memory.js');
    const sharedMemory =
      existingStore instanceof SharedMemoryStore ? existingStore : new SharedMemoryStore();

    const context: PipelineContext = {
      executionId: `${template.id}-${stage.id}`,
      task:
        typeof state[PIPELINE_STATE_KEYS.TASK] === 'string'
          ? (state[PIPELINE_STATE_KEYS.TASK] as string)
          : '',
      templateId: template.id,
      state,
      sharedMemory,
    };

    const output = await stage.execute(context);
    return { [output.stateKey]: output.value };
  };
}

/** Register edges (linear auto-generation + custom overrides). */
function registerEdges(builder: GraphBuilder, template: PipelineTemplate): void {
  // Auto-generate linear edges from stage order
  if (template.edges === undefined || template.edges.length === 0) {
    registerLinearEdges(builder, template.stages);
    return;
  }

  // Use custom edges
  for (const edge of template.edges) {
    if (edge.type === 'fixed') {
      builder.addEdge(edge.from, edge.to);
    } else {
      const routerKey = edge.routerKey;
      builder.addConditionalEdge(
        edge.from,
        (state) => {
          const val = state[routerKey];
          if (typeof val === 'string') return val;
          return edge.targets[0] ?? '';
        },
        [...edge.targets]
      );
    }
  }
}

/** Register linear START→stage1→stage2→...→END edges. */
function registerLinearEdges(builder: GraphBuilder, stages: readonly string[]): void {
  if (stages.length === 0) return;
  builder.addEdge(START, stages[0] as string);
  for (let i = 0; i < stages.length - 1; i++) {
    builder.addEdge(stages[i] as string, stages[i + 1] as string);
  }
  builder.addEdge(stages[stages.length - 1] as string, END);
}
