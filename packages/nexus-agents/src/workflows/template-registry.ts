/**
 * nexus-agents/workflows - Template Registry
 *
 * Registry for managing workflow templates (built-in and custom).
 * Implements IRegistry<TemplateMetadata, TemplateRegistryError> (ADR-0012).
 */

import type { WorkflowDefinition, Result, IRegistryStats } from '../core/index.js';
import { getTimeProvider, ok, err, AgentError, createLogger } from '../core/index.js';
import type { ITemplateRegistry, TemplateMetadata, TemplateCategory } from './template-types.js';
import { loadTemplatesFromDirectory, getBuiltInTemplatesWithMetadata } from './template-loader.js';

/**
 * Error specific to template registry operations.
 */
export class TemplateRegistryError extends AgentError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, options);
    this.name = 'TemplateRegistryError';
  }
}

/**
 * Maximum number of templates allowed in registry.
 * Prevents memory issues from unbounded growth.
 */
const MAX_TEMPLATES = 100;

/**
 * Template registry implementation.
 * Manages both built-in and custom workflow templates.
 */
class TemplateRegistry implements ITemplateRegistry {
  private readonly definitions = new Map<string, WorkflowDefinition>();
  private readonly metadata = new Map<string, TemplateMetadata>();
  private initialized = false;

  /**
   * Initialize the registry with built-in templates.
   * Called automatically on first access if not already initialized.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const builtInTemplates = await getBuiltInTemplatesWithMetadata();

    for (const { definition, metadata } of builtInTemplates) {
      this.definitions.set(definition.name, definition);
      this.metadata.set(definition.name, metadata);
    }

    this.initialized = true;
  }

  /**
   * Ensure registry is initialized.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get all built-in templates.
   */
  getBuiltIn(): TemplateMetadata[] {
    return Array.from(this.metadata.values()).filter((m) => m.builtIn);
  }

  /**
   * Get all registered templates.
   */
  getAll(): TemplateMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Get a workflow definition by ID.
   */
  getById(id: string): WorkflowDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Register a custom workflow template.
   */
  register(workflow: WorkflowDefinition, partialMetadata?: Partial<TemplateMetadata>): void {
    this.validateCanRegister(workflow.name);
    const metadata = this.buildMetadata(workflow, partialMetadata);
    this.definitions.set(workflow.name, workflow);
    this.metadata.set(workflow.name, metadata);
  }

  /**
   * Validate that a template can be registered.
   */
  private validateCanRegister(name: string): void {
    if (this.definitions.size >= MAX_TEMPLATES) {
      throw new Error(`Maximum template limit (${String(MAX_TEMPLATES)}) reached`);
    }
    const existingMeta = this.metadata.get(name);
    if (existingMeta?.builtIn === true) {
      throw new Error(`Cannot overwrite built-in template: ${name}`);
    }
  }

  /**
   * Build metadata for a workflow.
   */
  private buildMetadata(
    workflow: WorkflowDefinition,
    partialMetadata?: Partial<TemplateMetadata>
  ): TemplateMetadata {
    const metadata: TemplateMetadata = {
      id: workflow.name, // IRegistryItem compliance (ADR-0012)
      name: workflow.name,
      version: workflow.version,
      path: partialMetadata?.path ?? '',
      category: partialMetadata?.category ?? 'custom',
      keywords: partialMetadata?.keywords ?? extractKeywordsFromWorkflow(workflow),
      builtIn: false,
      updatedAt: getTimeProvider().nowIso(),
    };
    if (workflow.description !== undefined) {
      metadata.description = workflow.description;
    }
    if (partialMetadata?.author !== undefined) {
      metadata.author = partialMetadata.author;
    }
    return metadata;
  }

  /**
   * Unregister a custom template.
   */
  unregister(id: string): boolean {
    const meta = this.metadata.get(id);

    if (meta === undefined) {
      return false;
    }

    if (meta.builtIn) {
      throw new Error(`Cannot unregister built-in template: ${id}`);
    }

    this.definitions.delete(id);
    this.metadata.delete(id);
    return true;
  }

  /**
   * Load templates from a directory.
   */
  async loadFromDirectory(directoryPath: string): Promise<number> {
    await this.ensureInitialized();

    const { templates, errors } = await loadTemplatesFromDirectory(directoryPath);

    if (errors.length > 0) {
      // Log errors but continue with successfully loaded templates
      const logger = createLogger({ component: 'TemplateRegistry' });
      for (const error of errors) {
        logger.warn('Template loading warning', { error: error.message });
      }
    }

    let loadedCount = 0;

    for (const { definition, metadata } of templates) {
      try {
        // Skip if it would overwrite a built-in
        const existingMeta = this.metadata.get(definition.name);
        if (existingMeta?.builtIn !== true) {
          this.register(definition, metadata);
          loadedCount++;
        }
      } catch (regError) {
        const logger = createLogger({ component: 'TemplateRegistry' });
        logger.warn('Template registration failed', {
          template: definition.name,
          error: regError instanceof Error ? regError.message : String(regError),
        });
      }
    }

    return loadedCount;
  }

  /**
   * Search templates by keyword.
   */
  search(query: string): TemplateMetadata[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.metadata.values()).filter((meta) => this.matchesQuery(meta, lowerQuery));
  }

  /**
   * Check if metadata matches a search query.
   */
  private matchesQuery(meta: TemplateMetadata, lowerQuery: string): boolean {
    const nameMatches = meta.name.toLowerCase().includes(lowerQuery);
    const descMatches = meta.description?.toLowerCase().includes(lowerQuery) ?? false;
    const keywordMatches = meta.keywords.some((k) => k.includes(lowerQuery));
    return nameMatches || descMatches || keywordMatches;
  }

  /**
   * Get templates by category.
   */
  getByCategory(category: TemplateCategory): TemplateMetadata[] {
    return Array.from(this.metadata.values()).filter((m) => m.category === category);
  }

  /**
   * Clear all custom templates (keeps built-in).
   */
  clearCustom(): void {
    const customIds: string[] = [];

    for (const [id, meta] of this.metadata) {
      if (!meta.builtIn) {
        customIds.push(id);
      }
    }

    for (const id of customIds) {
      this.definitions.delete(id);
      this.metadata.delete(id);
    }
  }

  // =========================================================================
  // IRegistry Interface Methods (ADR-0012)
  // =========================================================================

  /**
   * Get template metadata by ID.
   * IRegistry interface method.
   *
   * @param id - Template ID to retrieve
   * @returns Result with TemplateMetadata or TemplateRegistryError
   */
  get(id: string): Result<TemplateMetadata, TemplateRegistryError> {
    const meta = this.metadata.get(id);
    if (meta === undefined) {
      return err(
        new TemplateRegistryError(`Template with ID '${id}' not found`, {
          context: {
            requestedId: id,
            availableIds: this.getAllIds(),
          },
        })
      );
    }
    return ok(meta);
  }

  /**
   * Check if a template is registered.
   * IRegistry interface method.
   *
   * @param id - Template ID to check
   * @returns True if template is registered
   */
  has(id: string): boolean {
    return this.metadata.has(id);
  }

  /**
   * Get all registered template IDs.
   * IRegistry interface method.
   *
   * @returns Array of all registered template IDs
   */
  getAllIds(): string[] {
    return Array.from(this.metadata.keys());
  }

  /**
   * Query templates with predicate function.
   * IRegistry interface method.
   *
   * @param predicate - Function to test each template
   * @returns Array of matching templates
   */
  query(predicate: (item: TemplateMetadata) => boolean): TemplateMetadata[] {
    return Array.from(this.metadata.values()).filter(predicate);
  }

  /**
   * Get the number of registered templates.
   * IRegistry interface method.
   */
  get size(): number {
    return this.metadata.size;
  }

  /**
   * Check if the registry is empty.
   * IRegistry interface method.
   */
  get isEmpty(): boolean {
    return this.metadata.size === 0;
  }

  /**
   * Clear all templates (built-in and custom).
   * IRegistry interface method.
   *
   * WARNING: This removes built-in templates. Use clearCustom() to only clear custom templates.
   */
  clear(): void {
    this.definitions.clear();
    this.metadata.clear();
    this.initialized = false;
  }

  /**
   * Get registry statistics.
   * IRegistry interface method with domain-specific extensions.
   */
  getStats(): IRegistryStats & { builtIn: number; custom: number } {
    const builtIn = this.getBuiltIn().length;
    const total = this.metadata.size;
    return { total, builtIn, custom: total - builtIn };
  }
}

/**
 * Extract keywords from a workflow definition.
 */
function extractKeywordsFromWorkflow(definition: WorkflowDefinition): string[] {
  const keywords = new Set<string>();

  // Add name words
  for (const word of definition.name.split(/[-_\s]+/)) {
    if (word.length > 2) {
      keywords.add(word.toLowerCase());
    }
  }

  // Add step action words
  for (const step of definition.steps) {
    for (const word of step.action.split(/[-_\s]+/)) {
      if (word.length > 2) {
        keywords.add(word.toLowerCase());
      }
    }
  }

  return Array.from(keywords);
}

// Singleton instance
let registryInstance: TemplateRegistry | null = null;

/**
 * Create or get the template registry instance.
 * @returns Template registry instance
 */
export function createTemplateRegistry(): ITemplateRegistry {
  registryInstance ??= new TemplateRegistry();
  return registryInstance;
}

/**
 * Create a new isolated template registry instance.
 * Useful for testing or isolated contexts.
 * @returns New template registry instance
 */
export function createIsolatedRegistry(): TemplateRegistry {
  return new TemplateRegistry();
}

/**
 * Reset the global registry instance.
 * Primarily for testing purposes.
 */
export function resetRegistry(): void {
  registryInstance = null;
}

export { TemplateRegistry };
