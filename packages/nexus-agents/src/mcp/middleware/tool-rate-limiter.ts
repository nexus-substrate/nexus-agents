/**
 * nexus-agents/mcp - Per-Tool Rate Limiter Factory
 *
 * Creates and manages per-tool rate limiters with configurable limits.
 * Different tool categories have different rate limits based on their
 * resource usage and expected frequency.
 *
 * @module mcp/middleware/tool-rate-limiter
 * (Source: Issue #274 Phase 2 - per-tool rate limits)
 */

import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { ToolRateLimit, ToolCategory } from '../../config/schemas.js';
import { DEFAULT_TOOL_RATE_LIMITS } from '../../config/schemas.js';
import { RateLimiter, type RateLimiterConfig } from './rate-limiter.js';

/**
 * Configuration for the tool rate limiter factory.
 */
export interface ToolRateLimiterFactoryConfig {
  /** Whether rate limiting is enabled (default: true) */
  readonly enabled?: boolean;
  /** Per-tool rate limit overrides */
  readonly perTool?: Record<string, ToolRateLimit>;
  /** Logger instance */
  readonly logger?: ILogger;
}

/**
 * Maps tool names to their rate limit categories.
 */
const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
  // Orchestration tools
  orchestrate: 'orchestrate',
  // Delegation tools
  delegate: 'delegate',
  delegate_to_model: 'delegate',
  // Workflow tools
  run_workflow: 'workflow',
  workflow: 'workflow',
  // Expert tools
  create_expert: 'expert',
  expert: 'expert',
  list_experts: 'expert',
};

/**
 * Factory for creating per-tool rate limiters.
 *
 * This factory maintains a registry of rate limiters, one per tool,
 * with configurable limits based on tool category.
 *
 * @example
 * ```typescript
 * const factory = createToolRateLimiterFactory({
 *   perTool: {
 *     orchestrate: { capacity: 5, refillRate: 5 },
 *   },
 * });
 *
 * const limiter = factory.getForTool('orchestrate');
 * if (limiter.tryAcquire()) {
 *   // Proceed with operation
 * }
 * ```
 */
export class ToolRateLimiterFactory {
  private readonly enabled: boolean;
  private readonly limiters = new Map<string, RateLimiter>();
  private readonly config: Record<string, ToolRateLimit>;
  private readonly logger: ILogger;

  constructor(factoryConfig: ToolRateLimiterFactoryConfig = {}) {
    this.enabled = factoryConfig.enabled ?? true;
    this.logger = factoryConfig.logger ?? createLogger({ component: 'tool-rate-limiter' });

    // Merge default limits with custom overrides
    this.config = {
      ...DEFAULT_TOOL_RATE_LIMITS,
      ...(factoryConfig.perTool ?? {}),
    };

    // Validate that the fallback category exists in merged config
    if (this.config['orchestrate'] === undefined) {
      this.logger.warn(
        'Rate limiter config missing fallback category "orchestrate". ' +
          'Using DEFAULT_TOOL_RATE_LIMITS.orchestrate as final fallback.',
        { availableCategories: Object.keys(this.config) }
      );
    }

    this.logger.debug('Tool rate limiter factory initialized', {
      enabled: this.enabled,
      categories: Object.keys(this.config),
    });
  }

  /**
   * Gets the rate limit category for a tool name.
   */
  private getCategoryForTool(toolName: string): ToolCategory | undefined {
    // Direct mapping
    const mapped = TOOL_CATEGORY_MAP[toolName];
    if (mapped !== undefined) {
      return mapped;
    }

    // Try prefix matching (e.g., "expert_create" -> "expert")
    for (const [prefix, category] of Object.entries(TOOL_CATEGORY_MAP)) {
      if (toolName.startsWith(prefix)) {
        return category;
      }
    }

    return undefined;
  }

  /**
   * Gets the rate limit configuration for a tool.
   */
  private getLimitConfig(toolName: string): ToolRateLimit {
    // Check for tool-specific override
    const toolConfig = this.config[toolName];
    if (toolConfig !== undefined) {
      return toolConfig;
    }

    // Get category-based config
    const category = this.getCategoryForTool(toolName);
    if (category !== undefined) {
      const categoryConfig = this.config[category];
      if (categoryConfig !== undefined) {
        return categoryConfig;
      }
    }

    // Return default (orchestrate limits as fallback)
    this.logger.debug('No category match for tool, using fallback limits', {
      tool: toolName,
    });
    return this.config['orchestrate'] ?? DEFAULT_TOOL_RATE_LIMITS.orchestrate;
  }

  /**
   * Gets or creates a rate limiter for a specific tool.
   *
   * @param toolName - Name of the tool
   * @returns RateLimiter instance for the tool
   */
  getForTool(toolName: string): RateLimiter {
    // Return existing limiter if available
    const existing = this.limiters.get(toolName);
    if (existing !== undefined) {
      return existing;
    }

    // Create new limiter with tool-specific config
    const limitConfig = this.getLimitConfig(toolName);
    const rateLimiterConfig: RateLimiterConfig = {
      capacity: limitConfig.capacity,
      refillRate: limitConfig.refillRate,
      refillIntervalMs: limitConfig.refillIntervalMs,
      name: `rate-limit-${toolName}`,
      logger: this.logger.child({ tool: toolName }),
    };

    const limiter = new RateLimiter(rateLimiterConfig);
    this.limiters.set(toolName, limiter);

    this.logger.debug('Created rate limiter for tool', {
      tool: toolName,
      config: limitConfig,
    });

    return limiter;
  }

  /**
   * Checks if rate limiting is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Gets the current state of all rate limiters.
   * Useful for debugging and monitoring.
   */
  getStates(): Record<string, { tokens: number; capacity: number; nextTokenMs: number }> {
    const states: Record<string, { tokens: number; capacity: number; nextTokenMs: number }> = {};
    for (const [tool, limiter] of this.limiters) {
      states[tool] = limiter.getState();
    }
    return states;
  }

  /**
   * Resets all rate limiters to full capacity.
   * Useful for testing.
   */
  resetAll(): void {
    for (const limiter of this.limiters.values()) {
      limiter.reset();
    }
    this.logger.debug('All rate limiters reset');
  }
}

/**
 * Creates a tool rate limiter factory with the given configuration.
 *
 * @param config - Factory configuration
 * @returns Configured ToolRateLimiterFactory instance
 */
export function createToolRateLimiterFactory(
  config?: ToolRateLimiterFactoryConfig
): ToolRateLimiterFactory {
  return new ToolRateLimiterFactory(config);
}

// Global factory instance for singleton pattern
let globalFactory: ToolRateLimiterFactory | undefined;

/**
 * Gets the global tool rate limiter factory instance.
 * Creates one with default configuration if not already created.
 */
export function getGlobalToolRateLimiterFactory(): ToolRateLimiterFactory {
  globalFactory ??= createToolRateLimiterFactory();
  return globalFactory;
}

/**
 * Sets the global tool rate limiter factory instance.
 * Useful for configuration during server startup.
 */
export function setGlobalToolRateLimiterFactory(factory: ToolRateLimiterFactory): void {
  globalFactory = factory;
}

/**
 * Resets the global factory instance.
 * Useful for testing.
 */
export function resetGlobalToolRateLimiterFactory(): void {
  globalFactory = undefined;
}
