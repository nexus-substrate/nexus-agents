/**
 * nexus-agents/adapters - Adapter Factory
 *
 * Registry-based factory for creating model adapters.
 * Provides a centralized way to register and create adapters for different providers.
 */

import { z } from 'zod';
import type { Result, IModelAdapter } from '../core/index.js';
import { ConfigError, err, ok } from '../core/index.js';

/**
 * Zod schema for adapter configuration.
 * Validates configuration before creating adapters.
 */
export const AdapterConfigSchema = z.object({
  /** Provider identifier (e.g., 'anthropic', 'openai') */
  providerId: z.string().min(1, 'Provider ID is required'),
  /** Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o') */
  modelId: z.string().min(1, 'Model ID is required'),
  /** API key for authentication (optional, may come from environment) */
  apiKey: z.string().optional(),
  /** Base URL for the API (optional, uses provider default) */
  baseUrl: z.string().url('Base URL must be a valid URL').optional(),
  /** Request timeout in milliseconds */
  timeout: z.number().positive('Timeout must be positive').optional(),
  /** Maximum number of retries for failed requests */
  maxRetries: z.number().int('Max retries must be an integer').min(0).optional(),
});

/**
 * Adapter configuration type inferred from schema.
 */
export type AdapterConfig = z.infer<typeof AdapterConfigSchema>;

/**
 * Factory function type for creating adapters.
 * Each provider registers a creator function that produces adapters.
 *
 * @param config - The validated adapter configuration
 * @returns A configured model adapter instance
 */
export type AdapterCreator = (config: AdapterConfig) => IModelAdapter;

/**
 * Options for registering an adapter provider.
 */
export interface RegisterOptions {
  /** Whether to allow overwriting an existing provider */
  allowOverwrite?: boolean;
}

/**
 * Factory for creating and managing model adapters.
 *
 * Implements the registry pattern to allow dynamic registration of adapter
 * creators for different model providers. This enables a plugin-style
 * architecture where new providers can be added without modifying core code.
 *
 * @example
 * ```typescript
 * const factory = new AdapterFactory();
 *
 * // Register a provider
 * factory.register('anthropic', (config) => new ClaudeAdapter(config));
 *
 * // Create an adapter
 * const result = factory.create({
 *   providerId: 'anthropic',
 *   modelId: 'claude-sonnet-4'
 * });
 *
 * if (result.ok) {
 *   const adapter = result.value;
 *   // Use adapter...
 * }
 * ```
 */
export class AdapterFactory {
  /**
   * Registry mapping provider IDs to their creator functions.
   */
  private readonly registry: Map<string, AdapterCreator> = new Map();

  /**
   * Registers an adapter creator for a provider.
   *
   * @param providerId - Unique identifier for the provider (e.g., 'anthropic')
   * @param creator - Factory function that creates adapters for this provider
   * @param options - Registration options
   * @returns Result indicating success or failure
   *
   * @example
   * ```typescript
   * const result = factory.register('anthropic', (config) => new ClaudeAdapter(config));
   * if (!result.ok) {
   *   console.error('Registration failed:', result.error.message);
   * }
   * ```
   */
  register(
    providerId: string,
    creator: AdapterCreator,
    options: RegisterOptions = {}
  ): Result<void, ConfigError> {
    const { allowOverwrite = false } = options;

    if (!providerId || providerId.trim() === '') {
      return err(
        new ConfigError('Provider ID cannot be empty', {
          context: { providerId },
        })
      );
    }

    if (this.registry.has(providerId) && !allowOverwrite) {
      return err(
        new ConfigError(`Provider '${providerId}' is already registered`, {
          context: { providerId, existingProviders: this.listProviders() },
        })
      );
    }

    this.registry.set(providerId, creator);
    return ok(undefined);
  }

  /**
   * Unregisters an adapter creator for a provider.
   *
   * @param providerId - The provider ID to unregister
   * @returns Result indicating whether the provider was removed
   */
  unregister(providerId: string): Result<boolean, ConfigError> {
    if (!providerId || providerId.trim() === '') {
      return err(
        new ConfigError('Provider ID cannot be empty', {
          context: { providerId },
        })
      );
    }

    const deleted = this.registry.delete(providerId);
    return ok(deleted);
  }

  /**
   * Creates an adapter instance for the specified configuration.
   *
   * Validates the configuration against the schema, looks up the provider
   * in the registry, and invokes the creator function to produce an adapter.
   *
   * @param config - Adapter configuration specifying provider and settings
   * @returns Result containing the adapter or a ConfigError
   *
   * @example
   * ```typescript
   * const result = factory.create({
   *   providerId: 'anthropic',
   *   modelId: 'claude-sonnet-4',
   *   timeout: 30000,
   *   maxRetries: 3
   * });
   *
   * if (result.ok) {
   *   const response = await result.value.complete(request);
   * } else {
   *   console.error('Failed to create adapter:', result.error.message);
   * }
   * ```
   */
  create(config: AdapterConfig): Result<IModelAdapter, ConfigError> {
    // Validate configuration
    const validationResult = this.validateConfig(config);
    if (!validationResult.ok) {
      return validationResult;
    }
    const validConfig = validationResult.value;

    // Look up provider
    const creator = this.registry.get(validConfig.providerId);
    if (creator === undefined) {
      return err(
        new ConfigError(`Provider '${validConfig.providerId}' is not registered`, {
          context: {
            providerId: validConfig.providerId,
            availableProviders: this.listProviders(),
          },
        })
      );
    }

    // Create adapter
    return this.invokeCreator(creator, validConfig);
  }

  /**
   * Validates adapter configuration against the schema.
   */
  private validateConfig(config: AdapterConfig): Result<AdapterConfig, ConfigError> {
    const result = AdapterConfigSchema.safeParse(config);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return err(
        new ConfigError(`Invalid adapter configuration: ${issues}`, {
          context: {
            config: this.sanitizeConfig(config),
            validationErrors: result.error.issues,
          },
        })
      );
    }
    return ok(result.data);
  }

  /**
   * Invokes the creator function to create an adapter.
   */
  private invokeCreator(
    creator: AdapterCreator,
    config: AdapterConfig
  ): Result<IModelAdapter, ConfigError> {
    try {
      return ok(creator(config));
    } catch (error) {
      return this.handleCreatorError(error, config);
    }
  }

  /**
   * Handles errors thrown by adapter creator functions.
   */
  private handleCreatorError(error: unknown, config: AdapterConfig): Result<never, ConfigError> {
    const message = error instanceof Error ? error.message : String(error);
    const baseOptions = {
      context: { providerId: config.providerId, modelId: config.modelId },
    };
    if (error instanceof Error) {
      return err(
        new ConfigError(`Failed to create adapter: ${message}`, {
          ...baseOptions,
          cause: error,
        })
      );
    }
    return err(new ConfigError(`Failed to create adapter: ${message}`, baseOptions));
  }

  /**
   * Checks if a provider is registered.
   *
   * @param providerId - The provider ID to check
   * @returns True if the provider is registered
   */
  hasProvider(providerId: string): boolean {
    return this.registry.has(providerId);
  }

  /**
   * Returns a list of all registered provider IDs.
   *
   * @returns Array of provider identifiers
   */
  listProviders(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Returns the number of registered providers.
   *
   * @returns Count of registered providers
   */
  get size(): number {
    return this.registry.size;
  }

  /**
   * Clears all registered providers.
   * Useful for testing or resetting the factory state.
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * Sanitizes configuration for logging by removing sensitive fields.
   *
   * @param config - Configuration to sanitize
   * @returns Sanitized configuration safe for logging
   */
  private sanitizeConfig(config: AdapterConfig): Record<string, unknown> {
    const sanitized: Record<string, unknown> = { ...config };
    if (config.apiKey !== undefined) {
      sanitized['apiKey'] = '[REDACTED]';
    }
    return sanitized;
  }
}

/**
 * Default global adapter factory instance.
 * Use this for convenience when a single factory suffices.
 *
 * @deprecated Use `new AdapterFactory()` directly instead. Global mutable state
 * causes testing difficulties and hidden coupling. Will be removed in v3.0.0.
 */
export const defaultFactory = new AdapterFactory();
