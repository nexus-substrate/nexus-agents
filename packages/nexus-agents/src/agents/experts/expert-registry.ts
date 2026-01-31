/**
 * nexus-agents/agents - Expert Registry
 *
 * Singleton registry for managing expert agents.
 * Provides registration, lookup, and query capabilities.
 *
 * Implements IRegistry<Expert, RegistryError> for unified registry API.
 * (Source: ADR-0012 - Registry API Unification)
 */

import type { Result, AgentCapability, IRegistry, IRegistryStats } from '../../core/index.js';
import { ok, err, AgentError } from '../../core/index.js';
import type { Expert } from './expert-factory.js';

/**
 * Error specific to registry operations.
 */
export class RegistryError extends AgentError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, options);
    this.name = 'RegistryError';
  }
}

/**
 * Options for registering an expert.
 */
export interface RegisterOptions {
  /** Whether to replace if expert with same ID exists */
  replace?: boolean;
}

/**
 * Query options for finding experts.
 */
export interface QueryOptions {
  /** Filter by role */
  role?: string;
  /** Filter by capability (expert must have all specified) */
  capabilities?: AgentCapability[];
  /** Filter by capability (expert must have at least one) */
  anyCapability?: AgentCapability[];
  /** Maximum number of results */
  limit?: number;
}

/**
 * Statistics about the registry.
 * Extends IRegistryStats for interface compatibility (ADR-0012).
 */
export interface RegistryStats extends IRegistryStats {
  /** Total number of registered experts (IRegistryStats alias) */
  total: number;
  /** @deprecated Use total instead */
  totalExperts: number;
  /** Count by role */
  byRole: Record<string, number>;
  /** Count by capability */
  byCapability: Record<string, number>;
}

/**
 * Singleton registry for managing expert agents.
 *
 * Provides thread-safe registration and lookup of experts.
 * Supports querying by ID, role, and capabilities.
 *
 * Implements IRegistry<Expert, RegistryError> for unified registry API.
 */
export class ExpertRegistry implements IRegistry<Expert, RegistryError> {
  private static instance: ExpertRegistry | undefined;
  private readonly experts: Map<string, Expert>;

  private constructor() {
    this.experts = new Map();
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): ExpertRegistry {
    ExpertRegistry.instance ??= new ExpertRegistry();
    return ExpertRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance(): void {
    if (ExpertRegistry.instance !== undefined) {
      ExpertRegistry.instance.clear();
      ExpertRegistry.instance = undefined;
    }
  }

  /**
   * Register an expert in the registry.
   *
   * @param expert - Expert to register
   * @param options - Registration options
   * @returns Result with void or RegistryError
   */
  register(expert: Expert, options?: RegisterOptions): Result<void, RegistryError> {
    const existingExpert = this.experts.get(expert.id);

    if (existingExpert !== undefined && options?.replace !== true) {
      return err(
        new RegistryError(`Expert with ID '${expert.id}' already registered`, {
          context: {
            existingId: existingExpert.id,
            existingName: existingExpert.name,
          },
        })
      );
    }

    this.experts.set(expert.id, expert);
    return ok(undefined);
  }

  /**
   * Register multiple experts.
   *
   * @param experts - Experts to register
   * @param options - Registration options
   * @returns Result with void or first RegistryError
   */
  registerMany(experts: Expert[], options?: RegisterOptions): Result<void, RegistryError> {
    for (const expert of experts) {
      const result = this.register(expert, options);
      if (!result.ok) {
        return result;
      }
    }
    return ok(undefined);
  }

  /**
   * Unregister an expert by ID.
   *
   * @param id - Expert ID to unregister
   * @returns Result with the removed Expert or RegistryError
   */
  unregister(id: string): Result<Expert, RegistryError> {
    const expert = this.experts.get(id);

    if (expert === undefined) {
      return err(
        new RegistryError(`Expert with ID '${id}' not found`, {
          context: { requestedId: id },
        })
      );
    }

    this.experts.delete(id);
    return ok(expert);
  }

  /**
   * Get an expert by ID.
   *
   * @param id - Expert ID to retrieve
   * @returns Result with Expert or RegistryError
   */
  get(id: string): Result<Expert, RegistryError> {
    const expert = this.experts.get(id);

    if (expert === undefined) {
      return err(
        new RegistryError(`Expert with ID '${id}' not found`, {
          context: {
            requestedId: id,
            availableIds: Array.from(this.experts.keys()),
          },
        })
      );
    }

    return ok(expert);
  }

  /**
   * Check if an expert is registered.
   *
   * @param id - Expert ID to check
   * @returns True if expert is registered
   */
  has(id: string): boolean {
    return this.experts.has(id);
  }

  /**
   * Get experts by capability.
   *
   * Returns all experts that have the specified capability.
   *
   * @param capability - Capability to search for
   * @returns Array of matching experts
   */
  getByCapability(capability: AgentCapability): Expert[] {
    return Array.from(this.experts.values()).filter((expert) =>
      expert.capabilities.includes(capability)
    );
  }

  /**
   * Get experts by role.
   *
   * @param role - Role to search for
   * @returns Array of matching experts
   */
  getByRole(role: string): Expert[] {
    return Array.from(this.experts.values()).filter((expert) => expert.role === role);
  }

  /**
   * Query experts with multiple criteria.
   * Domain-specific query with structured options.
   *
   * @param options - Query options
   * @returns Array of matching experts
   */
  queryWithOptions(options: QueryOptions): Expert[] {
    let results = Array.from(this.experts.values());

    // Filter by role
    if (options.role !== undefined) {
      results = results.filter((expert) => expert.role === options.role);
    }

    // Filter by all capabilities
    if (options.capabilities !== undefined && options.capabilities.length > 0) {
      const requiredCaps = options.capabilities;
      results = results.filter((expert) =>
        requiredCaps.every((cap) => expert.capabilities.includes(cap))
      );
    }

    // Filter by any capability
    if (options.anyCapability !== undefined && options.anyCapability.length > 0) {
      const anyCaps = options.anyCapability;
      results = results.filter((expert) =>
        anyCaps.some((cap) => expert.capabilities.includes(cap))
      );
    }

    // Apply limit
    if (options.limit !== undefined && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Query experts with predicate function.
   * IRegistry interface method.
   *
   * @param predicate - Function to test each expert
   * @returns Array of matching experts
   */
  query(predicate: (item: Expert) => boolean): Expert[] {
    return Array.from(this.experts.values()).filter(predicate);
  }

  /**
   * List all registered experts.
   *
   * @returns Array of all registered experts
   * @deprecated Use getAll() instead (IRegistry interface)
   */
  list(): Expert[] {
    return this.getAll();
  }

  /**
   * List all registered expert IDs.
   *
   * @returns Array of all registered expert IDs
   * @deprecated Use getAllIds() instead (IRegistry interface)
   */
  listIds(): string[] {
    return this.getAllIds();
  }

  // =========================================================================
  // IRegistry Interface Methods (ADR-0012)
  // =========================================================================

  /**
   * Get all registered experts.
   * IRegistry interface method.
   *
   * @returns Array of all registered experts
   */
  getAll(): Expert[] {
    return Array.from(this.experts.values());
  }

  /**
   * Get all registered expert IDs.
   * IRegistry interface method.
   *
   * @returns Array of all registered expert IDs
   */
  getAllIds(): string[] {
    return Array.from(this.experts.keys());
  }

  /**
   * Search experts by text query.
   * IRegistry interface method.
   *
   * Searches expert ID, name, role, and capabilities.
   *
   * @param searchTerm - Search term to match
   * @returns Array of matching experts
   */
  search(searchTerm: string): Expert[] {
    const term = searchTerm.toLowerCase();
    return Array.from(this.experts.values()).filter((expert) => {
      return (
        expert.id.toLowerCase().includes(term) ||
        expert.name.toLowerCase().includes(term) ||
        expert.role.toLowerCase().includes(term) ||
        expert.capabilities.some((cap) => cap.toLowerCase().includes(term))
      );
    });
  }

  /**
   * Get the number of registered experts.
   */
  get size(): number {
    return this.experts.size;
  }

  /**
   * Check if the registry is empty.
   */
  get isEmpty(): boolean {
    return this.experts.size === 0;
  }

  /**
   * Clear all registered experts.
   */
  clear(): void {
    this.experts.clear();
  }

  /**
   * Get statistics about the registry.
   * Returns IRegistryStats-compatible stats with domain-specific extensions.
   */
  getStats(): RegistryStats {
    const byRole: Record<string, number> = {};
    const byCapability: Record<string, number> = {};

    for (const expert of this.experts.values()) {
      // Count by role
      byRole[expert.role] = (byRole[expert.role] ?? 0) + 1;

      // Count by capability
      for (const capability of expert.capabilities) {
        byCapability[capability] = (byCapability[capability] ?? 0) + 1;
      }
    }

    return {
      total: this.experts.size,
      totalExperts: this.experts.size, // deprecated alias
      byRole,
      byCapability,
    };
  }

  /**
   * Find the best expert for a set of required capabilities.
   *
   * Returns the expert that matches the most capabilities.
   *
   * @param requiredCapabilities - Capabilities needed
   * @returns Result with best Expert or RegistryError if none found
   */
  findBestMatch(requiredCapabilities: AgentCapability[]): Result<Expert, RegistryError> {
    if (this.isEmpty) {
      return err(
        new RegistryError('No experts registered', {
          context: { requiredCapabilities },
        })
      );
    }

    let bestExpert: Expert | undefined;
    let bestScore = -1;

    for (const expert of this.experts.values()) {
      const score = requiredCapabilities.filter((cap) => expert.capabilities.includes(cap)).length;

      if (score > bestScore) {
        bestScore = score;
        bestExpert = expert;
      }
    }

    if (bestExpert === undefined || bestScore === 0) {
      return err(
        new RegistryError('No expert matches the required capabilities', {
          context: {
            requiredCapabilities,
            availableExperts: this.getAllIds(),
          },
        })
      );
    }

    return ok(bestExpert);
  }
}

/**
 * Get the global expert registry instance.
 */
export function getExpertRegistry(): ExpertRegistry {
  return ExpertRegistry.getInstance();
}
