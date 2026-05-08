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
// HITL Interrupt (#1895)
// ============================================================================

/**
 * Captures a paused-execution context when a node returns an Interrupt.
 * Persisted alongside the checkpoint so the resume() caller can read the
 * value the node surfaced and supply a matching `{[id]: resumeValue}` map.
 */
export interface CheckpointInterrupt {
  /** Node that returned the interrupt — re-runnable as the first step on resume. */
  readonly nodeId: string;
  /** Stable interrupt id from the Interrupt envelope. */
  readonly interruptId: string;
  /** Value the node surfaced for the human. */
  readonly value: unknown;
  /** ISO timestamp when the interrupt fired. */
  readonly createdAt: string;
  /**
   * ISO timestamp when this interrupt was consumed by a successful
   * resumeFromCheckpoint() call. A second resume against the same checkpoint
   * is rejected — see #2425 idempotency requirement.
   */
  readonly consumedAt?: string;
  /**
   * Additional interrupts dropped because they fired in the same super-step
   * as the primary one (#2425 multi-interrupt observability). Phase 1
   * silently dropped these; Phase 2 surfaces them so operators can detect
   * lost human-input requests in the wild. The executor still only honors
   * the primary interrupt; downstream tooling can fan out from this list.
   */
  readonly additionalInterrupts?: readonly {
    readonly nodeId: string;
    readonly interruptId: string;
    readonly value: unknown;
  }[];
}

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
  readonly metadata?: Record<string, unknown> | undefined;
  /**
   * If present, the checkpoint was created because a node returned an
   * Interrupt. The resume API uses this to know which node to re-run and
   * which interrupt id to match resume values against. (#1895)
   */
  readonly interrupt?: CheckpointInterrupt | undefined;
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
