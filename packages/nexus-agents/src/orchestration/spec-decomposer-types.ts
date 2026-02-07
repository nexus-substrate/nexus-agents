/**
 * Type definitions for the Spec Decomposer module.
 *
 * Decomposes parsed specs into dependency DAGs of typed subtasks
 * for autonomous agent execution.
 *
 * @module orchestration/spec-decomposer-types
 * (Source: Issue #848 — Phase 2 of AI Software Factory Epic #843)
 */

import { z } from 'zod';

/**
 * The type of work a subtask represents.
 */
export const SubtaskTypeSchema = z.enum(['code', 'test', 'docs', 'config', 'refactor']);
export type SubtaskType = z.infer<typeof SubtaskTypeSchema>;

/**
 * Complexity level for a subtask.
 */
export const ComplexityLevelSchema = z.enum(['simple', 'moderate', 'complex', 'expert']);
export type ComplexityLevel = z.infer<typeof ComplexityLevelSchema>;

/**
 * A single decomposed subtask node in the DAG.
 */
export const SubtaskNodeSchema = z.object({
  /** Unique identifier for this subtask */
  id: z.string().min(1),
  /** Human-readable description of what this subtask does */
  description: z.string().min(1),
  /** The type of work */
  type: SubtaskTypeSchema,
  /** Estimated complexity */
  complexity: ComplexityLevelSchema,
  /** Required capabilities for the executing agent */
  capabilities: z.array(z.string()),
  /** IDs of subtasks this depends on */
  dependsOn: z.array(z.string()),
  /** Source requirement text that generated this subtask */
  sourceRequirement: z.string().optional(),
});
export type SubtaskNode = z.infer<typeof SubtaskNodeSchema>;

/**
 * A directed edge in the dependency DAG.
 */
export const DagEdgeSchema = z.object({
  /** Source subtask ID */
  from: z.string().min(1),
  /** Target subtask ID */
  to: z.string().min(1),
});
export type DagEdge = z.infer<typeof DagEdgeSchema>;

/**
 * The complete dependency DAG produced by decomposition.
 */
export const TaskDagSchema = z.object({
  /** All subtask nodes */
  nodes: z.array(SubtaskNodeSchema),
  /** Dependency edges (from must complete before to) */
  edges: z.array(DagEdgeSchema),
  /** Subtask IDs that can execute in parallel (no dependencies) */
  roots: z.array(z.string()),
  /** Total estimated complexity across all subtasks */
  totalComplexity: ComplexityLevelSchema,
  /** Source spec title for traceability */
  specTitle: z.string(),
});
export type TaskDag = z.infer<typeof TaskDagSchema>;

/**
 * Error detail when decomposition fails.
 */
export interface DecomposeError {
  readonly message: string;
  readonly subtaskId?: string | undefined;
}
