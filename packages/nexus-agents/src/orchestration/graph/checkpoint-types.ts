/**
 * nexus-agents/orchestration - Checkpoint Types
 *
 * Type definitions for durable execution checkpointing.
 * Enables crash recovery, human-in-the-loop pause/resume,
 * and execution replay for debugging.
 *
 * @module orchestration/graph/checkpoint-types
 * (Source: Issue #833 — Orchestrator checkpointing)
 */

import type { GraphState, NodeResult } from './graph-types.js';

// ============================================================================
// Checkpoint Data
// ============================================================================

/** Schema version for forward compatibility. */
export const CHECKPOINT_SCHEMA_VERSION = 1;

/**
 * A snapshot of graph execution state at a given step boundary.
 * Contains all information needed to resume execution.
 */
export interface Checkpoint {
  /** Unique checkpoint ID. */
  readonly id: string;
  /** Execution ID this checkpoint belongs to. */
  readonly executionId: string;
  /** Schema version for deserialization. */
  readonly schemaVersion: number;
  /** Step number when this checkpoint was taken. */
  readonly stepNumber: number;
  /** Full graph state at this point. */
  readonly state: Readonly<GraphState>;
  /** IDs of nodes ready to run next. */
  readonly pendingNodeIds: readonly string[];
  /** Results of all completed nodes so far. */
  readonly completedResults: readonly NodeResult[];
  /** ISO timestamp when checkpoint was created. */
  readonly createdAt: string;
  /** Optional metadata for debugging. */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Summary of a checkpoint (for listing without full state).
 */
export interface CheckpointSummary {
  readonly id: string;
  readonly executionId: string;
  readonly stepNumber: number;
  readonly createdAt: string;
  readonly completedNodeCount: number;
  readonly pendingNodeCount: number;
}

// ============================================================================
// Store Interface
// ============================================================================

/**
 * Abstract checkpoint store interface.
 * Implementations provide persistence (in-memory, JSON file, SQLite, etc.).
 */
export interface ICheckpointStore {
  /** Saves a checkpoint. Overwrites if ID already exists. */
  save(checkpoint: Checkpoint): void;

  /** Loads a checkpoint by ID. Returns undefined if not found. */
  load(id: string): Checkpoint | undefined;

  /** Loads the latest checkpoint for a given execution ID. */
  latest(executionId: string): Checkpoint | undefined;

  /** Lists all checkpoint summaries for a given execution ID. */
  list(executionId: string): readonly CheckpointSummary[];

  /** Deletes a checkpoint by ID. Returns true if found and deleted. */
  delete(id: string): boolean;

  /** Deletes all checkpoints for a given execution ID. */
  deleteExecution(executionId: string): number;

  /** Returns total number of checkpoints across all executions. */
  size(): number;

  /** Clears all checkpoints. */
  clear(): void;
}
