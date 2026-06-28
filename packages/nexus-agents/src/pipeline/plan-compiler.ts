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
import type { IPluginRegistry } from './plugin-types.js';
import { enforceGatePolicy } from './policy-evaluator.js';
import type { GatePolicyEnforcement } from './policy-evaluator.js';
import { NETWORK_FETCH_TIMEOUT_MS } from '../config/timeouts.js';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'plan-compiler' });

/** Result of plan compilation. */
type CompileResult =
  | { readonly ok: true; readonly value: CompiledGraph }
  | { readonly ok: false; readonly error: string };

/** Options for plan compilation. */
export interface PlanCompileOptions {
  /** Plugin registry for resolving stage handlers. When provided, stages with
   *  a registered pluginId will use the plugin's execute() method. */
  readonly pluginRegistry?: IPluginRegistry;
  /**
   * Policy enforcement for gate nodes (#3177). When provided, each policy gate
   * node evaluates `evaluatePipelinePolicy` at runtime — denying (in BLOCK
   * mode) by throwing `PolicyBlockedError`, which halts the pipeline. When
   * absent, gate nodes remain no-op passes (back-compat).
   */
  readonly policyEnforcement?: GatePolicyEnforcement;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Compiles a PlanContract into a CompiledGraph.
 *
 * - Each stage becomes a node with a handler (plugin-backed or placeholder)
 * - Dependencies become fixed edges
 * - Policy gates become gate nodes between stages
 * - Stages with no dependencies get edges from START
 * - Stages with no dependents get edges to END
 */
export function compilePlan(plan: PlanContract, options?: PlanCompileOptions): CompileResult {
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
  addStageNodes(builder, plan.stages, options?.pluginRegistry);
  addGateNodes(builder, plan.policyGates, plan, options?.policyEnforcement);
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
 * Creates a handler for a pipeline stage.
 * Resolves from PluginRegistry when available; falls back to placeholder.
 */
function createStageHandler(
  stage: StageSpec,
  registry?: IPluginRegistry
): (state: Readonly<GraphState>) => Promise<Partial<GraphState>> {
  const plugin = registry?.resolve(stage.pluginId);
  if (plugin !== undefined) {
    return async (_state: Readonly<GraphState>) => {
      const ctx = {
        signal: AbortSignal.timeout(NETWORK_FETCH_TIMEOUT_MS),
        task: {} as never,
        config: stage.config,
      };
      const result = await plugin.execute(stage, ctx);
      return {
        currentStage: stage.id,
        stageResults: [{ stageId: stage.id, status: result.success ? 'completed' : 'failed' }],
        ...(result.outputArtifacts.length > 0
          ? { artifacts: result.outputArtifacts.map((a) => a.id) }
          : {}),
      };
    };
  }
  // No plugin registered for this stage's pluginId. The stage still compiles
  // (resilience, #1179) but runs as a NO-OP placeholder. Surface the
  // misconfiguration LOUDLY at compile time (#3178: this path used to be silent —
  // a typo'd or unregistered pluginId would run as a no-op and report success with
  // no signal). The placeholder result is marked so an inspector can tell a real
  // execution from a skipped one without re-parsing the node id.
  logger.warn(
    `Pipeline stage "${stage.id}" references unregistered plugin "${stage.pluginId}" — ` +
      `it will run as a NO-OP placeholder (no work performed). Register the plugin or ` +
      `remove the stage; a missing plugin is almost always a misconfiguration.`,
    { stageId: stage.id, pluginId: stage.pluginId }
  );
  return (_state: Readonly<GraphState>) =>
    Promise.resolve({
      currentStage: stage.id,
      stageResults: [{ stageId: stage.id, status: 'completed', placeholder: true }],
    });
}

/**
 * Creates a handler for a policy gate node (#3177).
 *
 * When `enforcement` is provided, the gate evaluates policy at the stage
 * boundary via `enforceGatePolicy`:
 *  - BLOCK mode + denial → throws `PolicyBlockedError` (the executor marks the
 *    node `failed`, which halts the pipeline — non-retryable, so it halts even
 *    under `continueOnFailure`).
 *  - WARN mode → continues; the gate is recorded `warned` and a policy.evaluated
 *    event is emitted by the evaluator.
 *  - OFF mode → evaluation skipped.
 *
 * When `enforcement` is absent the gate stays a no-op pass (back-compat).
 */
function createGateHandler(
  gate: PolicyGateSpec,
  taskId: string,
  stageType: string,
  enforcement?: GatePolicyEnforcement
): (state: Readonly<GraphState>) => Promise<Partial<GraphState>> {
  if (enforcement === undefined) {
    return (_state: Readonly<GraphState>) =>
      Promise.resolve({
        currentStage: gate.id,
        stageResults: [{ gateId: gate.id, status: 'passed' }],
      });
  }
  return (_state: Readonly<GraphState>) => {
    // enforceGatePolicy throws PolicyBlockedError on block+denial; the executor
    // catches it and marks the node failed. WARN/OFF return a verdict instead.
    const verdict = enforceGatePolicy(enforcement, { gateId: gate.id, taskId, stageType });
    const status = verdict.allowed ? 'passed' : 'warned';
    return Promise.resolve({
      currentStage: gate.id,
      stageResults: [{ gateId: gate.id, status }],
    });
  };
}

/** Adds stage nodes to the graph builder. */
function addStageNodes(
  builder: GraphBuilder,
  stages: readonly StageSpec[],
  registry?: IPluginRegistry
): void {
  for (const stage of stages) {
    builder.addNode(stage.id, createStageHandler(stage, registry));
  }
}

/** Adds policy gate nodes to the graph builder. */
function addGateNodes(
  builder: GraphBuilder,
  gates: readonly PolicyGateSpec[],
  plan: PlanContract,
  enforcement?: GatePolicyEnforcement
): void {
  // Map each stage id to its type so a gate can report the type of the stage
  // it guards (its `beforeStage`) to the policy rules (the trust-tier rule
  // only blocks `execute`-type stages). An entry gate (`afterStage === START`)
  // guards a no-dependency stage and still reports that stage's real type.
  const stageTypeById = new Map(plan.stages.map((s) => [s.id, s.type]));
  for (const gate of gates) {
    const stageType = stageTypeById.get(gate.beforeStage) ?? 'gate';
    builder.addNode(gate.id, createGateHandler(gate, plan.taskId, stageType, enforcement));
  }
}

/**
 * Adds edges between nodes based on stage dependencies and gates.
 *
 * Logic:
 * 1. If a gate exists afterStage→beforeStage, insert gate node between
 * 2. Otherwise, add direct dependency edge
 * 3. Stages with no dependencies get START→stage edges — or START→gate→stage
 *    when an entry gate (`afterStage === START`) guards that stage (#3703)
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

  // Stages with no dependencies → START edges. An entry gate keyed
  // `START→stage` (#3703) is interposed so the boundary is policy-evaluated
  // before the entry stage runs; otherwise a direct START→stage edge.
  for (const stage of stages) {
    if (stage.dependencies.length === 0) {
      const gateKey = `${START}→${stage.id}`;
      const gate = gateMap.get(gateKey);
      if (gate !== undefined) {
        builder.addEdge(START, gate.id);
        builder.addEdge(gate.id, stage.id);
        gateMap.delete(gateKey); // consumed
      } else {
        builder.addEdge(START, stage.id);
      }
    }
  }

  // Stages not depended upon → END edges
  for (const stage of stages) {
    if (!isDependedOn.has(stage.id)) {
      builder.addEdge(stage.id, END);
    }
  }
}
