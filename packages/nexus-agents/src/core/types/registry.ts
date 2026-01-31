/**
 * nexus-agents/core - Registry Interface
 *
 * Unified interface for registry implementations.
 * Provides consistent API across ExpertRegistry, TemplateRegistry, etc.
 *
 * (Source: Issue #596 - Unify registry APIs)
 */

import type { Result } from '../result.js';

/**
 * Base interface for registry items.
 * All registrable items must have an ID.
 */
export interface IRegistryItem {
  /** Unique identifier for the item */
  readonly id: string;
}

/**
 * Options for registering an item.
 */
export interface IRegisterOptions {
  /** Whether to replace if item with same ID exists */
  replace?: boolean;
}

/**
 * Statistics about a registry.
 */
export interface IRegistryStats {
  /** Total number of registered items */
  total: number;
  /** Additional stats specific to the registry type */
  [key: string]: unknown;
}

/**
 * Unified registry interface.
 *
 * Provides consistent CRUD and query operations for all registries.
 * Domain-specific methods can be added as extensions.
 *
 * @template T - Type of items stored in the registry
 * @template E - Error type for failed operations
 */
export interface IRegistry<T extends IRegistryItem, E extends Error = Error> {
  /**
   * Register an item in the registry.
   *
   * @param item - Item to register
   * @param options - Registration options
   * @returns Result indicating success or error
   */
  register(item: T, options?: IRegisterOptions): Result<void, E>;

  /**
   * Unregister an item by ID.
   *
   * @param id - Item ID to unregister
   * @returns Result with the removed item or error
   */
  unregister(id: string): Result<T, E>;

  /**
   * Get an item by ID.
   *
   * @param id - Item ID to retrieve
   * @returns Result with item or error
   */
  get(id: string): Result<T, E>;

  /**
   * Check if an item is registered.
   *
   * @param id - Item ID to check
   * @returns True if item is registered
   */
  has(id: string): boolean;

  /**
   * Get all registered items.
   *
   * @returns Array of all registered items
   */
  getAll(): T[];

  /**
   * Get all registered item IDs.
   *
   * @returns Array of all registered IDs
   */
  getAllIds(): string[];

  /**
   * Search items by predicate.
   *
   * @param predicate - Function to test each item
   * @returns Array of matching items
   */
  query(predicate: (item: T) => boolean): T[];

  /**
   * Search items by text query.
   *
   * @param searchTerm - Search term to match against item fields
   * @returns Array of matching items
   */
  search(searchTerm: string): T[];

  /**
   * Get the number of registered items.
   */
  readonly size: number;

  /**
   * Check if the registry is empty.
   */
  readonly isEmpty: boolean;

  /**
   * Clear all registered items.
   */
  clear(): void;

  /**
   * Get statistics about the registry.
   */
  getStats(): IRegistryStats;
}

/**
 * Singleton registry with instance management.
 *
 * Extends IRegistry with singleton pattern methods.
 */
export interface ISingletonRegistry<
  T extends IRegistryItem,
  E extends Error = Error,
> extends IRegistry<T, E> {
  /**
   * Reset the singleton instance.
   * Primarily for testing purposes.
   */
  resetInstance?(): void;
}

/**
 * Type guard to check if an object is a registry item.
 */
export function isRegistryItem(obj: unknown): obj is IRegistryItem {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as Record<string, unknown>).id === 'string'
  );
}
