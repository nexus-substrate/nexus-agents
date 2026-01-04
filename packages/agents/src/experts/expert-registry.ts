/**
 * @nexus-agents/agents - Expert Registry
 *
 * Singleton registry for managing expert agents.
 * Provides registration, lookup, and query capabilities.
 */

import type { Result, AgentCapability } from '@nexus-agents/core';
import { ok, err, AgentError } from '@nexus-agents/core';
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
 */
export interface RegistryStats {
  /** Total number of registered experts */
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
 */
export class ExpertRegistry {
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
   *
   * @param options - Query options
   * @returns Array of matching experts
   */
  query(options: QueryOptions): Expert[] {
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
   * List all registered experts.
   *
   * @returns Array of all registered experts
   */
  list(): Expert[] {
    return Array.from(this.experts.values());
  }

  /**
   * List all registered expert IDs.
   *
   * @returns Array of all registered expert IDs
   */
  listIds(): string[] {
    return Array.from(this.experts.keys());
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
      totalExperts: this.experts.size,
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
            availableExperts: this.listIds(),
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
