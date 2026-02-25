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
    this.evictIfNeeded();
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
// Filter Matching
// ============================================================================

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
