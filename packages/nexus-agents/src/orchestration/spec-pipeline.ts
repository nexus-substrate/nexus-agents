/**
 * Spec Pipeline — wires spec-parser + decomposer + GraphBuilder.
 *
 * Takes raw markdown and produces an executable compiled graph.
 * Each subtask becomes a graph node; dependencies become edges.
 *
 * @module orchestration/spec-pipeline
 * (Source: Issue #849 — Phase 2 of AI Software Factory Epic #843)
 */

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import { parseSpec } from './spec-parser.js';
import { decomposeSpec } from './spec-decomposer.js';
import { GraphBuilder, START, END, append } from './graph/index.js';
import type { CompiledGraph, GraphState } from './graph/index.js';
import type { SubtaskNode } from './spec-decomposer-types.js';
import type { PipelineError } from './spec-pipeline-types.js';

/**
 * Compiles a markdown specification into an executable graph.
 *
 * Pipeline: markdown → parseSpec → decomposeSpec → GraphBuilder → CompiledGraph
 */
export function compileSpecToGraph(markdown: string): Result<CompiledGraph, PipelineError> {
  const parseResult = parseSpec(markdown);
  if (!parseResult.ok) {
    return err({ message: parseResult.error.message, stage: 'parse' });
  }

  const dagResult = decomposeSpec(parseResult.value);
  if (!dagResult.ok) {
    return err({ message: dagResult.error.message, stage: 'decompose' });
  }

  const dag = dagResult.value;
  const builder = new GraphBuilder();
  builder.addState('results', append<string>([]));

  // Add all subtask nodes
  for (const node of dag.nodes) {
    builder.addNode(node.id, createNodeHandler(node));
  }

  // Wire START → root nodes (no dependencies)
  for (const rootId of dag.roots) {
    builder.addEdge(START, rootId);
  }

  // Wire dependency edges
  for (const edge of dag.edges) {
    builder.addEdge(edge.from, edge.to);
  }

  // Wire leaf nodes → END
  const leafIds = findLeaves(
    dag.nodes,
    dag.edges.map((e) => e.from)
  );
  for (const leafId of leafIds) {
    builder.addEdge(leafId, END);
  }

  const compiled = builder.compile();
  if (!compiled.ok) {
    const compileError: { message: string } = compiled.error;
    return err({ message: compileError.message, stage: 'compile' });
  }

  return ok(compiled.value);
}

/** Creates a graph node handler for a subtask. */
function createNodeHandler(
  node: SubtaskNode
): (state: Readonly<GraphState>) => Promise<Partial<GraphState>> {
  return () =>
    Promise.resolve({
      results: [`[${node.type}] ${node.description}`],
    });
}

/** Finds nodes that have no outgoing dependency edges. */
function findLeaves(nodes: readonly SubtaskNode[], sources: readonly string[]): string[] {
  const sourceSet = new Set(sources);
  return nodes.filter((n) => !sourceSet.has(n.id)).map((n) => n.id);
}
