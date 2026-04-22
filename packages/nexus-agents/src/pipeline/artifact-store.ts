/**
 * ArtifactStore — V2 Pipeline Artifact Storage (Issue #912, Phase 4-3)
 *
 * In-memory artifact store with bounded capacity and LRU eviction.
 * Tracks provenance chains for artifact traceability.
 *
 * @see docs/v2/08-observability-eventing.md
 * @module pipeline/artifact-store
 */
import type { ArtifactRef, ArtifactType } from './task-contract.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_ARTIFACTS = 1000;
const DEFAULT_MAX_CONTENT_SIZE = 1_048_576; // 1MB

// ============================================================================
// Types
// ============================================================================

/** Full artifact with content and metadata. */
export interface Artifact {
  readonly id: string;
  readonly type: ArtifactType;
  readonly content: unknown;
  readonly metadata: Record<string, unknown>;
  readonly createdBy: string;
  readonly createdAt: number;
  readonly inputRefs: readonly ArtifactRef[];
}

/** Filter for querying artifacts. */
export interface ArtifactFilter {
  readonly type?: ArtifactType;
  readonly createdBy?: string;
}

/** Provenance entry for artifact traceability. */
export interface ProvenanceEntry {
  readonly artifactId: string;
  readonly plugin: string;
  readonly timestamp: number;
  readonly inputArtifacts: readonly string[];
}

/**
 * Checkpoint state for a single stage+keyword combination.
 * Stores the cursor/page information for resumable processing.
 */
export interface StageCheckpoint {
  readonly stageId: string;
  readonly keyword: string;
  readonly cursor: string | number;
  readonly completedAt: number;
  readonly itemsProcessed: number;
}

/**
 * Port for checkpoint persistence.
 * Implementations can store checkpoints in memory, on disk, or in external storage.
 */
export interface CheckpointPort {
  /**
   * Save checkpoint for a stage+keyword combination.
   * Overwrites any existing checkpoint for the same stage+keyword.
   */
  save(checkpoint: StageCheckpoint): void;

  /**
   * Load checkpoint for a specific stage+keyword.
   * Returns undefined if no checkpoint exists.
   */
  load(stageId: string, keyword: string): StageCheckpoint | undefined;

  /**
   * Get all checkpoints for a given stage (all keywords).
   */
  loadAllForStage(stageId: string): readonly StageCheckpoint[];

  /**
   * Clear checkpoint for a stage+keyword after successful completion.
   */
  clear(stageId: string, keyword: string): void;

  /**
   * Clear all checkpoints for a stage.
   */
  clearStage(stageId: string): void;

  /**
   * Clear all checkpoints.
   */
  clearAll(): void;

  /** Number of stored checkpoints. */
  readonly size: number;
}

/** Options for CheckpointStore behavior. */
export interface CheckpointStoreOptions {
  /** Maximum checkpoints to retain. Default: 1000 */
  readonly maxCheckpoints?: number;
}

/** Artifact store interface. */
export interface IArtifactStore {
  put(artifact: Artifact): ArtifactRef;
  get(ref: ArtifactRef): Artifact | undefined;
  query(filter: ArtifactFilter): readonly ArtifactRef[];
  provenance(ref: ArtifactRef): readonly ProvenanceEntry[];
  readonly size: number;
}

/** Options for ArtifactStore behavior. */
export interface ArtifactStoreOptions {
  readonly maxArtifacts?: number;
  readonly maxContentSize?: number;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * In-memory artifact store with bounded capacity.
 *
 * When the store exceeds maxArtifacts, the oldest artifacts
 * are evicted (FIFO). Content size is validated on put().
 */
export class ArtifactStore implements IArtifactStore {
  private readonly artifacts = new Map<string, Artifact>();
  private readonly insertOrder: string[] = [];
  private readonly maxArtifacts: number;
  private readonly maxContentSize: number;

  constructor(options?: ArtifactStoreOptions) {
    this.maxArtifacts = options?.maxArtifacts ?? DEFAULT_MAX_ARTIFACTS;
    this.maxContentSize = options?.maxContentSize ?? DEFAULT_MAX_CONTENT_SIZE;
  }

  get size(): number {
    return this.artifacts.size;
  }

  put(artifact: Artifact): ArtifactRef {
    this.validateContentSize(artifact);
    const isReplace = this.artifacts.has(artifact.id);
    if (isReplace) {
      // Remove the stale position so it does not linger in insertOrder. A
      // re-put does not consume a new slot, so eviction is skipped — the
      // old buggy behaviour ran evictIfNeeded unconditionally and dropped
      // unrelated live artifacts whenever a replace happened at capacity.
      const idx = this.insertOrder.indexOf(artifact.id);
      if (idx !== -1) this.insertOrder.splice(idx, 1);
    } else {
      this.evictIfNeeded();
    }
    this.artifacts.set(artifact.id, artifact);
    this.insertOrder.push(artifact.id);
    return { id: artifact.id, type: artifact.type };
  }

  get(ref: ArtifactRef): Artifact | undefined {
    return this.artifacts.get(ref.id);
  }

  query(filter: ArtifactFilter): readonly ArtifactRef[] {
    const refs: ArtifactRef[] = [];
    for (const artifact of this.artifacts.values()) {
      if (!matchesArtifactFilter(artifact, filter)) continue;
      refs.push({ id: artifact.id, type: artifact.type });
    }
    return refs;
  }

  provenance(ref: ArtifactRef): readonly ProvenanceEntry[] {
    const artifact = this.artifacts.get(ref.id);
    if (artifact === undefined) return [];
    return [
      {
        artifactId: artifact.id,
        plugin: artifact.createdBy,
        timestamp: artifact.createdAt,
        inputArtifacts: artifact.inputRefs.map((r) => r.id),
      },
    ];
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private validateContentSize(artifact: Artifact): void {
    const content = artifact.content;
    if (typeof content === 'string' && content.length > this.maxContentSize) {
      throw new Error(`Artifact content exceeds max size (${String(this.maxContentSize)} bytes)`);
    }
  }

  private evictIfNeeded(): void {
    while (this.artifacts.size >= this.maxArtifacts) {
      const oldest = this.insertOrder.shift();
      if (oldest === undefined) break;
      this.artifacts.delete(oldest);
    }
  }
}

// ============================================================================
// Checkpoint Store — Persistent Cursor/Page per Stage+Keyword
// ============================================================================

/**
 * In-memory checkpoint store with bounded capacity.
 * Stores cursor/page position per stage+keyword for resumable processing.
 * Enables idempotent re-runs after crash or rate-limit exhaustion.
 */
export class CheckpointStore implements CheckpointPort {
  private readonly checkpoints = new Map<string, StageCheckpoint>();
  private readonly maxCheckpoints: number;

  constructor(options?: CheckpointStoreOptions) {
    this.maxCheckpoints = options?.maxCheckpoints ?? 1000;
  }

  get size(): number {
    return this.checkpoints.size;
  }

  save(checkpoint: StageCheckpoint): void {
    const key = this.makeKey(checkpoint.stageId, checkpoint.keyword);
    if (this.checkpoints.size >= this.maxCheckpoints && !this.checkpoints.has(key)) {
      const firstKey = this.checkpoints.keys().next().value;
      if (firstKey !== undefined) {
        this.checkpoints.delete(firstKey);
      }
    }
    this.checkpoints.set(key, checkpoint);
  }

  load(stageId: string, keyword: string): StageCheckpoint | undefined {
    return this.checkpoints.get(this.makeKey(stageId, keyword));
  }

  loadAllForStage(stageId: string): readonly StageCheckpoint[] {
    return Array.from(this.checkpoints.values()).filter((cp) => cp.stageId === stageId);
  }

  clear(stageId: string, keyword: string): void {
    this.checkpoints.delete(this.makeKey(stageId, keyword));
  }

  clearStage(stageId: string): void {
    for (const key of this.checkpoints.keys()) {
      if (key.startsWith(`${stageId}:`)) {
        this.checkpoints.delete(key);
      }
    }
  }

  clearAll(): void {
    this.checkpoints.clear();
  }

  private makeKey(stageId: string, keyword: string): string {
    return `${stageId}:${keyword}`;
  }
}

// ============================================================================
// Global Singleton (#1179)
// ============================================================================

let globalArtifactStore: IArtifactStore | undefined;

/** Returns the global ArtifactStore (created lazily on first call). */
export function getPipelineArtifactStore(): IArtifactStore {
  globalArtifactStore ??= new ArtifactStore();
  return globalArtifactStore;
}

/** Resets the global ArtifactStore (for testing). */
export function resetPipelineArtifactStore(): void {
  globalArtifactStore = undefined;
}

/** Global CheckpointStore singleton for pipeline resume capability. */
let globalCheckpointStore: CheckpointStore | undefined;

/** Returns the global CheckpointStore (created lazily on first call). */
export function getCheckpointStore(): CheckpointStore {
  globalCheckpointStore ??= new CheckpointStore();
  return globalCheckpointStore;
}

/** Resets the global CheckpointStore (for testing). */
export function resetCheckpointStore(): void {
  globalCheckpointStore = undefined;
}

// ============================================================================
// Filter Matching
// ============================================================================

function matchesArtifactFilter(artifact: Artifact, filter: ArtifactFilter): boolean {
  if (filter.type !== undefined && artifact.type !== filter.type) {
    return false;
  }
  if (filter.createdBy !== undefined && artifact.createdBy !== filter.createdBy) {
    return false;
  }
  return true;
}
