/**
 * nexus-agents/orchestration - In-Memory Checkpoint Store
 *
 * Default checkpoint store using bounded in-memory storage.
 * Suitable for development and testing. For production durability,
 * implement ICheckpointStore with a persistent backend.
 *
 * @module orchestration/graph/checkpoint-store
 * (Source: Issue #833 — Orchestrator checkpointing)
 */

import { getTimeProvider } from '../../core/index.js';
import type { Checkpoint, CheckpointSummary, ICheckpointStore } from './checkpoint-types.js';
import { CHECKPOINT_SCHEMA_VERSION } from './checkpoint-types.js';
import type { GraphState, NodeResult } from './graph-types.js';

/** Maximum checkpoints per execution to prevent unbounded growth. */
const MAX_CHECKPOINTS_PER_EXECUTION = 50;

/** Maximum total executions tracked before oldest are evicted. */
const MAX_EXECUTIONS = 100;

// ============================================================================
// In-Memory Store
// ============================================================================

/**
 * In-memory checkpoint store with bounded storage.
 * Checkpoints are evicted on a per-execution basis (oldest first)
 * when limits are exceeded.
 */
export class InMemoryCheckpointStore implements ICheckpointStore {
  private readonly checkpoints = new Map<string, Checkpoint>();
  private readonly byExecution = new Map<string, string[]>();

  save(checkpoint: Checkpoint): void {
    this.checkpoints.set(checkpoint.id, checkpoint);

    const execList = this.byExecution.get(checkpoint.executionId) ?? [];
    if (!execList.includes(checkpoint.id)) {
      execList.push(checkpoint.id);
    }
    this.byExecution.set(checkpoint.executionId, execList);

    this.enforcePerExecutionLimit(checkpoint.executionId);
    this.enforceGlobalLimit();
  }

  load(id: string): Checkpoint | undefined {
    return this.checkpoints.get(id);
  }

  latest(executionId: string): Checkpoint | undefined {
    const ids = this.byExecution.get(executionId);
    if (ids === undefined || ids.length === 0) return undefined;

    const lastId = ids[ids.length - 1];
    if (lastId === undefined) return undefined;
    return this.checkpoints.get(lastId);
  }

  list(executionId: string): readonly CheckpointSummary[] {
    const ids = this.byExecution.get(executionId) ?? [];
    return ids
      .map((id) => this.checkpoints.get(id))
      .filter((cp): cp is Checkpoint => cp !== undefined)
      .map(toSummary);
  }

  delete(id: string): boolean {
    const cp = this.checkpoints.get(id);
    if (cp === undefined) return false;

    this.checkpoints.delete(id);
    const execList = this.byExecution.get(cp.executionId);
    if (execList !== undefined) {
      const idx = execList.indexOf(id);
      if (idx >= 0) execList.splice(idx, 1);
    }
    return true;
  }

  deleteExecution(executionId: string): number {
    const ids = this.byExecution.get(executionId) ?? [];
    for (const id of ids) {
      this.checkpoints.delete(id);
    }
    this.byExecution.delete(executionId);
    return ids.length;
  }

  size(): number {
    return this.checkpoints.size;
  }

  clear(): void {
    this.checkpoints.clear();
    this.byExecution.clear();
  }

  private enforcePerExecutionLimit(executionId: string): void {
    const ids = this.byExecution.get(executionId);
    if (ids === undefined) return;

    while (ids.length > MAX_CHECKPOINTS_PER_EXECUTION) {
      const oldest = ids.shift();
      if (oldest !== undefined) this.checkpoints.delete(oldest);
    }
  }

  private enforceGlobalLimit(): void {
    if (this.byExecution.size <= MAX_EXECUTIONS) return;

    // Evict oldest execution (first inserted)
    const firstKey = this.byExecution.keys().next().value;
    if (firstKey !== undefined) {
      this.deleteExecution(firstKey);
    }
  }
}

// ============================================================================
// Checkpoint Factory
// ============================================================================

/** Counter for unique checkpoint IDs within a session. */
let checkpointCounter = 0;

/**
 * Creates a checkpoint from the current execution state.
 */
export function createCheckpoint(opts: {
  executionId: string;
  stepNumber: number;
  state: Readonly<GraphState>;
  pendingNodeIds: readonly string[];
  completedResults: readonly NodeResult[];
  metadata?: Record<string, unknown>;
}): Checkpoint {
  return {
    id: `cp-${opts.executionId}-${String(++checkpointCounter)}`,
    executionId: opts.executionId,
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    stepNumber: opts.stepNumber,
    state: { ...opts.state },
    pendingNodeIds: [...opts.pendingNodeIds],
    completedResults: [...opts.completedResults],
    createdAt: getTimeProvider().nowIso(),
    metadata: opts.metadata,
  };
}

/**
 * Creates a new InMemoryCheckpointStore.
 */
export function createCheckpointStore(): ICheckpointStore {
  return new InMemoryCheckpointStore();
}

// ============================================================================
// Helpers
// ============================================================================

function toSummary(cp: Checkpoint): CheckpointSummary {
  return {
    id: cp.id,
    executionId: cp.executionId,
    stepNumber: cp.stepNumber,
    createdAt: cp.createdAt,
    completedNodeCount: cp.completedResults.length,
    pendingNodeCount: cp.pendingNodeIds.length,
  };
}
