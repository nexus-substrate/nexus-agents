/**
 * Expert Knowledge Module Types
 *
 * Core type definitions for the knowledge enrichment system.
 * Knowledge modules contain domain-specific information that enriches
 * expert agent prompts with standards, best practices, and guidelines.
 *
 * @module agents/experts/knowledge/types
 * (Source: Epic #643 - Standards Absorption)
 */

/**
 * Knowledge domains aligned with expert agent specializations.
 */
export type KnowledgeDomain = 'security' | 'testing' | 'code' | 'architecture' | 'documentation';

/**
 * A section within a knowledge module containing specific guidance.
 */
export interface KnowledgeSection {
  /** Section title for identification and display */
  readonly title: string;
  /** Section content containing the actual knowledge/guidance */
  readonly content: string;
  /** Priority level: higher values indicate greater importance (default: 0) */
  readonly priority: number;
}

/**
 * A knowledge module encapsulating domain-specific expertise.
 *
 * Modules are registered with the KnowledgeRegistry and injected into
 * expert agent prompts based on domain matching.
 */
export interface KnowledgeModule {
  /** Unique identifier for the module (e.g., 'security-owasp-top10') */
  readonly id: string;
  /** Domain this module belongs to */
  readonly domain: KnowledgeDomain;
  /** Human-readable title */
  readonly title: string;
  /** Ordered sections of knowledge content */
  readonly sections: readonly KnowledgeSection[];
  /** Optional NIST control identifiers this module relates to */
  readonly nistControls?: readonly string[];
  /** Optional tags for filtering and categorization */
  readonly tags?: readonly string[];
}

/**
 * Registry for managing and querying knowledge modules.
 *
 * Provides a central store for all domain knowledge modules,
 * with lookup by domain, ID, or retrieval of all registered modules.
 */
export class KnowledgeRegistry {
  private readonly modules: Map<string, KnowledgeModule> = new Map();

  /**
   * Register a knowledge module in the registry.
   *
   * @param module - The knowledge module to register
   * @throws Error if a module with the same ID is already registered
   */
  register(module: KnowledgeModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Knowledge module already registered: ${module.id}`);
    }
    this.modules.set(module.id, module);
  }

  /**
   * Retrieve all modules for a specific domain.
   *
   * @param domain - The knowledge domain to filter by
   * @returns Readonly array of modules matching the domain
   */
  getByDomain(domain: KnowledgeDomain): readonly KnowledgeModule[] {
    const results: KnowledgeModule[] = [];
    for (const module of this.modules.values()) {
      if (module.domain === domain) {
        results.push(module);
      }
    }
    return results;
  }

  /**
   * Retrieve a specific module by its unique ID.
   *
   * @param id - The module identifier
   * @returns The module if found, undefined otherwise
   */
  getById(id: string): KnowledgeModule | undefined {
    return this.modules.get(id);
  }

  /**
   * Retrieve all registered knowledge modules.
   *
   * @returns Readonly array of all modules
   */
  getAll(): readonly KnowledgeModule[] {
    return Array.from(this.modules.values());
  }
}

/**
 * Singleton knowledge registry instance.
 *
 * All knowledge modules should be registered against this instance
 * to ensure consistent access across the application.
 */
export const knowledgeRegistry = new KnowledgeRegistry();
