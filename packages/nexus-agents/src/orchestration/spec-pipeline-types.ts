/**
 * Type definitions for the Spec Pipeline module.
 *
 * Wires spec-parser, spec-decomposer, and GraphBuilder into
 * an end-to-end execution pipeline.
 *
 * @module orchestration/spec-pipeline-types
 * (Source: Issue #849 — Phase 2 of AI Software Factory Epic #843)
 */

import type { SubtaskNode } from './spec-decomposer-types.js';
import type { GraphState } from './graph/index.js';

/**
 * Which stage of the pipeline failed.
 */
export type PipelineStage = 'parse' | 'decompose' | 'compile';

/**
 * Error detail when the spec pipeline fails.
 */
export interface PipelineError {
  readonly message: string;
  readonly stage: PipelineStage;
}

/**
 * A graph node handler function — takes state, returns partial state update.
 */
export type NodeHandler = (state: Readonly<GraphState>) => Promise<Partial<GraphState>>;

/**
 * Factory that creates graph node handlers from subtask nodes.
 * Allows plugging in different execution strategies (dry-run, expert delegation, etc.).
 *
 * (Source: Issue #857 — Pluggable node execution for AI Software Factory)
 */
export type NodeHandlerFactory = (node: SubtaskNode) => NodeHandler;

/**
 * Options for compiling a spec to a graph.
 */
export interface CompileOptions {
  /** Factory for creating node handlers. Defaults to dry-run placeholders. */
  readonly handlerFactory?: NodeHandlerFactory;
}
