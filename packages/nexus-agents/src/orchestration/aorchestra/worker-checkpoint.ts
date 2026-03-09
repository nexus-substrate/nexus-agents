/**
 * Worker checkpoint for progress preservation on failure (#1508).
 *
 * Saves intermediate worker state (partial output, elapsed time) so
 * refinement passes can resume from last known good state instead of
 * restarting from scratch.
 *
 * In-memory only — no disk I/O overhead. Checkpoints are scoped to
 * a single dispatch execution lifecycle.
 *
 * Inspired by Overstory's session checkpoint + handoff protocol.
 *
 * @module orchestration/aorchestra/worker-checkpoint
 */

// ============================================================================
// Constants
// ============================================================================

/** Maximum characters stored in partialOutput to bound memory. */
export const MAX_PARTIAL_OUTPUT_CHARS = 4000;

/** Maximum number of checkpoints stored per dispatch execution. */
export const MAX_CHECKPOINTS = 50;

// ============================================================================
// Types
// ============================================================================

/** Snapshot of worker progress at time of failure or interruption. */
export interface WorkerCheckpoint {
  readonly role: string;
  readonly subTask: string;
  readonly partialOutput: string;
  readonly elapsedMs: number;
  readonly timestamp: number;
}

// ============================================================================
// Factory
// ============================================================================

/** Create a new checkpoint with optional partial output. */
export function createCheckpoint(
  role: string,
  subTask: string,
  partialOutput = ''
): WorkerCheckpoint {
  return {
    role,
    subTask,
    partialOutput,
    elapsedMs: 0,
    timestamp: Date.now(),
  };
}

// ============================================================================
// Store
// ============================================================================

/**
 * In-memory checkpoint store scoped to a single dispatch execution.
 * Enforces memory bounds via truncation and capacity limits.
 */
export class WorkerCheckpointStore {
  private readonly store = new Map<string, WorkerCheckpoint>();

  /** Save a checkpoint, truncating partial output if needed. */
  save(key: string, checkpoint: WorkerCheckpoint): void {
    const truncated = truncateOutput(checkpoint);
    this.store.set(key, truncated);
    this.enforceCapacity();
  }

  /** Retrieve a checkpoint by key. */
  get(key: string): WorkerCheckpoint | undefined {
    return this.store.get(key);
  }

  /** Remove a specific checkpoint. Returns true if it existed. */
  remove(key: string): boolean {
    return this.store.delete(key);
  }

  /** Clear all checkpoints. */
  clear(): void {
    this.store.clear();
  }

  /** Number of stored checkpoints. */
  get size(): number {
    return this.store.size;
  }

  /** List all checkpoint keys. */
  keys(): readonly string[] {
    return [...this.store.keys()];
  }

  /** Evict oldest entries when capacity exceeded. */
  private enforceCapacity(): void {
    if (this.store.size <= MAX_CHECKPOINTS) return;
    const entries = [...this.store.entries()];
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const excess = entries.length - MAX_CHECKPOINTS;
    for (let i = 0; i < excess; i++) {
      const entry = entries[i];
      if (entry !== undefined) {
        this.store.delete(entry[0]);
      }
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function truncateOutput(cp: WorkerCheckpoint): WorkerCheckpoint {
  if (cp.partialOutput.length <= MAX_PARTIAL_OUTPUT_CHARS) return cp;
  return {
    ...cp,
    partialOutput: cp.partialOutput.slice(0, MAX_PARTIAL_OUTPUT_CHARS),
  };
}
