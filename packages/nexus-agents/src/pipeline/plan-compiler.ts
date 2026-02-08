/**
 * Plan-to-Graph Compiler (Issue #910, E2-1)
 *
 * Converts a PlanContract into a CompiledGraph using the existing
 * GraphBuilder. Each stage becomes a graph node. Dependencies become
 * edges. Policy gates become gate nodes inserted between stages.
 *
 * @module pipeline/plan-compiler
 */
import { GraphBuilder, overwrite, append } from '../orchestration/graph/graph-builder.js';
import { START, END } from '../orchestration/graph/graph-types.js';

import { formatCompileError } from '../orchestration/graph/graph-types.js';
import type { CompiledGraph, GraphState } from '../orchestration/graph/graph-types.js';
import type { PlanContract, StageSpec, PolicyGateSpec } from './task-contract.js';

/** Result of plan compilation. */
type CompileResult =
  | { readonly ok: true; readonly value: CompiledGraph }
  | { readonly ok: false; readonly error: string };

// ============================================================================
// Public API
// ============================================================================

/**
 * Compiles a PlanContract into a CompiledGraph.
 *
 * - Each stage becomes a node with a placeholder handler
 * - Dependencies become fixed edges
 * - Policy gates become gate nodes between stages
 * - Stages with no dependencies get edges from START
 * - Stages with no dependents get edges to END
 */
export function compilePlan(plan: PlanContract): CompileResult {
  if (plan.stages.length === 0) {
    return { ok: false, error: 'Plan must have at least one stage' };
  }

  // Validate dependency references
  const stageIds = new Set(plan.stages.map((s) => s.id));
  for (const stage of plan.stages) {
    for (const dep of stage.dependencies) {
      if (!stageIds.has(dep)) {
        return {
          ok: false,
          error: `Stage "${stage.id}" depends on unknown stage "${dep}"`,
        };
      }
    }
  }

  const builder = new GraphBuilder();
  addPipelineState(builder);
  addStageNodes(builder, plan.stages);
  addGateNodes(builder, plan.policyGates);
  addEdges(builder, plan.stages, plan.policyGates);

  const result = builder.compile();
  if (result.ok) {
    return { ok: true, value: result.value };
  }
  return { ok: false, error: formatCompileError(result.error) };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Adds pipeline-level state fields to the graph. */
function addPipelineState(builder: GraphBuilder): void {
  builder.addState('stageResults', append<Record<string, unknown>>([]));
  builder.addState('artifacts', append<string>([]));
  builder.addState('currentStage', overwrite(''));
  builder.addState('pipelineStatus', overwrite('running'));
  builder.addState('error', overwrite(''));
}

/**
 * Creates a placeholder handler for a pipeline stage.
 * The real handler will be injected by the PipelineRunner.
 */
function createStageHandler(
  stage: StageSpec
): (state: Readonly<GraphState>) => Promise<Partial<GraphState>> {
  return (_state: Readonly<GraphState>) =>
    Promise.resolve({
      currentStage: stage.id,
      stageResults: [{ stageId: stage.id, status: 'completed' }],
    });
}

/** Creates a handler for a policy gate node. */
function createGateHandler(
  gate: PolicyGateSpec
): (state: Readonly<GraphState>) => Promise<Partial<GraphState>> {
  return (_state: Readonly<GraphState>) =>
    Promise.resolve({
      currentStage: gate.id,
      stageResults: [{ gateId: gate.id, status: 'passed' }],
    });
}

/** Adds stage nodes to the graph builder. */
function addStageNodes(builder: GraphBuilder, stages: readonly StageSpec[]): void {
  for (const stage of stages) {
    builder.addNode(stage.id, createStageHandler(stage));
  }
}

/** Adds policy gate nodes to the graph builder. */
function addGateNodes(builder: GraphBuilder, gates: readonly PolicyGateSpec[]): void {
  for (const gate of gates) {
    builder.addNode(gate.id, createGateHandler(gate));
  }
}

/**
 * Adds edges between nodes based on stage dependencies and gates.
 *
 * Logic:
 * 1. If a gate exists afterStage→beforeStage, insert gate node between
 * 2. Otherwise, add direct dependency edge
 * 3. Stages with no dependencies get START→stage edges
 * 4. Stages with no dependents get stage→END edges
 */
function addEdges(
  builder: GraphBuilder,
  stages: readonly StageSpec[],
  gates: readonly PolicyGateSpec[]
): void {
  const isDependedOn = new Set<string>();

  // Build gate lookup: key = "afterStage→beforeStage"
  const gateMap = new Map<string, PolicyGateSpec>();
  for (const gate of gates) {
    gateMap.set(`${gate.afterStage}→${gate.beforeStage}`, gate);
  }

  // Add dependency edges (with gate interposition)
  for (const stage of stages) {
    for (const dep of stage.dependencies) {
      isDependedOn.add(dep);
      const gateKey = `${dep}→${stage.id}`;
      const gate = gateMap.get(gateKey);
      if (gate !== undefined) {
        builder.addEdge(dep, gate.id);
        builder.addEdge(gate.id, stage.id);
        gateMap.delete(gateKey); // consumed
      } else {
        builder.addEdge(dep, stage.id);
      }
    }
  }

  // Stages with no dependencies → START edges
  for (const stage of stages) {
    if (stage.dependencies.length === 0) {
      builder.addEdge(START, stage.id);
    }
  }

  // Stages not depended upon → END edges
  for (const stage of stages) {
    if (!isDependedOn.has(stage.id)) {
      builder.addEdge(stage.id, END);
    }
  }
}
