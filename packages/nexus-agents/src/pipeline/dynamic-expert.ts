/**
 * Dynamic Expert Creation — Bounded agent creation at runtime (#1737, Phase 4)
 *
 * When the PM/Orchestrator detects a capability gap, it can create
 * temporary expert types. Bounded to MAX_DYNAMIC_EXPERTS per run.
 *
 * New experts are temporary (not persisted to registry unless promoted).
 * Capabilities are constrained to subset of existing tool permissions.
 *
 * @module pipeline/dynamic-expert
 */

import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'dynamic-expert' });

// ============================================================================
// Types
// ============================================================================

/** Specification for a dynamically created expert. */
export interface DynamicExpertSpec {
  /** Unique ID for this expert. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** System prompt / role description. */
  readonly roleDescription: string;
  /** Capabilities this expert needs. */
  readonly capabilities: readonly string[];
  /** Why this expert was created. */
  readonly justification: string;
}

/** A created dynamic expert instance. */
export interface DynamicExpert {
  /** The spec used to create this expert. */
  readonly spec: DynamicExpertSpec;
  /** When this expert was created. */
  readonly createdAt: number;
  /** Whether this expert has been promoted to the permanent registry. */
  readonly promoted: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum dynamic experts that can be created per pipeline run. */
export const MAX_DYNAMIC_EXPERTS = 2;

// ============================================================================
// Dynamic Expert Manager
// ============================================================================

/** Manages dynamic expert creation within a pipeline run. */
export class DynamicExpertManager {
  private readonly experts: DynamicExpert[] = [];
  private readonly maxExperts: number;

  constructor(maxExperts = MAX_DYNAMIC_EXPERTS) {
    this.maxExperts = maxExperts;
  }

  /** Create a new dynamic expert. Returns null if limit reached. */
  create(spec: DynamicExpertSpec): DynamicExpert | null {
    if (this.experts.length >= this.maxExperts) {
      logger.warn('Dynamic expert limit reached', {
        limit: this.maxExperts,
        requested: spec.id,
      });
      return null;
    }

    // Validate spec
    if (spec.id.trim() === '' || spec.name.trim() === '') {
      logger.warn('Invalid dynamic expert spec', { id: spec.id });
      return null;
    }

    // Check for duplicates
    if (this.experts.some((e) => e.spec.id === spec.id)) {
      logger.warn('Duplicate dynamic expert ID', { id: spec.id });
      return null;
    }

    const expert: DynamicExpert = {
      spec,
      createdAt: Date.now(),
      promoted: false,
    };

    this.experts.push(expert);
    logger.info('Dynamic expert created', {
      id: spec.id,
      name: spec.name,
      total: this.experts.length,
      max: this.maxExperts,
    });

    return expert;
  }

  /** Get all created experts. */
  list(): readonly DynamicExpert[] {
    return [...this.experts];
  }

  /** Get an expert by ID. */
  get(id: string): DynamicExpert | undefined {
    return this.experts.find((e) => e.spec.id === id);
  }

  /** How many more experts can be created. */
  get remaining(): number {
    return Math.max(0, this.maxExperts - this.experts.length);
  }

  /** Whether the limit has been reached. */
  get atLimit(): boolean {
    return this.experts.length >= this.maxExperts;
  }
}
