/**
 * Type definitions for the Spec Pipeline module.
 *
 * Wires spec-parser, spec-decomposer, and GraphBuilder into
 * an end-to-end execution pipeline.
 *
 * @module orchestration/spec-pipeline-types
 * (Source: Issue #849 — Phase 2 of AI Software Factory Epic #843)
 */

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
