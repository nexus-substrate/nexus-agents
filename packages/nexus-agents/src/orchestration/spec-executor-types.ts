/**
 * Type definitions for the Spec Executor module.
 *
 * End-to-end spec execution: parse → decompose → compile → execute → validate.
 *
 * @module orchestration/spec-executor-types
 * (Source: Issue #851 — Phase 3 of AI Software Factory Epic #843)
 */

import type { TaskDag } from './spec-decomposer-types.js';
import type { ScenarioResult } from './scenario-validator-types.js';
import type { CompileOptions } from './spec-pipeline-types.js';

/**
 * Which stage of execution failed.
 */
export type ExecutionStage = 'parse' | 'decompose' | 'compile' | 'execute' | 'validate';

/**
 * Error detail when spec execution fails.
 */
export interface SpecExecutionError {
  readonly message: string;
  readonly stage: ExecutionStage;
}

/**
 * Options for spec execution.
 * (Source: Issue #857 — Pluggable node execution)
 */
export type SpecExecutionOptions = CompileOptions;

/**
 * Result of executing a spec end-to-end.
 */
export interface SpecExecutionResult {
  /** Whether configured node handlers ran instead of dry-run placeholders */
  readonly executed: boolean;
  /** The decomposed task DAG */
  readonly dag: TaskDag;
  /** Raw execution outputs from graph nodes */
  readonly outputs: readonly string[];
  /** Scenario validation against acceptance criteria */
  readonly validation: ScenarioResult;
  /** Total execution duration in milliseconds */
  readonly durationMs: number;
}
