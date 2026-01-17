/**
 * nexus-agents/agents - BaseAgent Context Pruning Initialization (Issue #306)
 *
 * Helper module for initializing context pruning infrastructure in BaseAgent.
 * Extracted to reduce constructor complexity and file size in base-agent.ts.
 */

import type { IModelAdapter, ILogger } from '../core/index.js';
import { ContextManager } from './context-manager.js';
import { ContextPruner, PruningStrategy } from './context-pruner.js';

/** Configuration for automatic context pruning in BaseAgent (Issue #306). */
export interface ContextPrunerAgentConfig {
  /** Whether to enable automatic context pruning. Default: false (opt-in). */
  enabled?: boolean;
  /** Pruning strategy to use. Default: 'priority_weighted_age'. */
  strategy?: PruningStrategy;
  /** Maximum tokens before pruning is triggered. Default: 100000 (100K). */
  maxTokens?: number;
  /** Tokens reserved for response generation. Default: 10000 (10K). */
  reserveTokens?: number;
  /** Usage threshold (0-1) at which pruning is triggered. Default: 0.9 (90%). */
  triggerThreshold?: number;
}

/** Resolved context pruning configuration with all values defined. */
export interface ResolvedPruningConfig {
  enabled: boolean;
  strategy: PruningStrategy;
  maxTokens: number;
  reserveTokens: number;
  triggerThreshold: number;
}

/** Default context pruning configuration values. */
export const DEFAULT_PRUNING_CONFIG: ResolvedPruningConfig = {
  enabled: false,
  strategy: PruningStrategy.PRIORITY_WEIGHTED_AGE,
  maxTokens: 100_000, // 100K tokens
  reserveTokens: 10_000, // 10K reserved for response generation
  triggerThreshold: 0.9, // 90% usage triggers pruning
};

/** Metrics for context pruning operations (Issue #306). */
export interface ContextPruningMetrics {
  /** Total number of pruning rounds executed. */
  pruningRounds: number;
  /** Total tokens pruned across all rounds. */
  totalTokensPruned: number;
  /** Tokens pruned in the last pruning operation. */
  lastPruningTokens: number;
  /** Items removed in the last pruning operation. */
  lastPruningItemsRemoved: number;
  /** Whether the last pruning reached its target. */
  lastPruningTargetReached: boolean;
}

/** Context pruning infrastructure created during initialization. */
export interface PruningInfrastructure {
  contextManager: ContextManager | undefined;
  contextPruner: ContextPruner | undefined;
  pruningConfig: ResolvedPruningConfig;
  contextPruningEnabled: boolean;
}

/** Options for initializing context pruning infrastructure. */
export interface PruningInitOptions {
  config?: ContextPrunerAgentConfig;
  adapter?: IModelAdapter;
  logger: ILogger;
}

/**
 * Resolves context pruning configuration with defaults.
 * Uses object spread with defaults, then overwrites with defined config values.
 */
export function resolvePruningConfig(config?: ContextPrunerAgentConfig): ResolvedPruningConfig {
  if (config === undefined) {
    return { ...DEFAULT_PRUNING_CONFIG };
  }
  // Filter out undefined values to avoid overwriting defaults
  const definedOverrides = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined)
  );
  return { ...DEFAULT_PRUNING_CONFIG, ...definedOverrides };
}

/**
 * Calculates context budget allocations ensuring total does not exceed 1.0.
 */
function calculateBudgetAllocations(pruningConfig: ResolvedPruningConfig): {
  system: number;
  task: number;
  active: number;
  reserved: number;
} {
  // Calculate reserved ratio and scale other allocations to fit within 1.0
  const reservedRatio = Math.min(
    0.5, // Cap reserved at 50% max
    pruningConfig.reserveTokens / pruningConfig.maxTokens
  );
  const availableForContent = 1.0 - reservedRatio;
  // Scale default allocations (15% system, 20% task, 50% active = 85% total)
  const scale = availableForContent / 0.85;

  return {
    system: 0.15 * scale,
    task: 0.2 * scale,
    active: 0.5 * scale,
    reserved: reservedRatio,
  };
}

/**
 * Initializes context pruning infrastructure for BaseAgent.
 * Returns undefined managers if pruning is not enabled.
 */
export function initializePruningInfrastructure(
  options: PruningInitOptions
): PruningInfrastructure {
  const pruningConfig = resolvePruningConfig(options.config);
  const contextPruningEnabled = pruningConfig.enabled;

  if (!contextPruningEnabled) {
    return {
      contextManager: undefined,
      contextPruner: undefined,
      pruningConfig,
      contextPruningEnabled: false,
    };
  }

  const budget = calculateBudgetAllocations(pruningConfig);

  const contextManagerConfig = {
    maxTokens: pruningConfig.maxTokens,
    logger: options.logger,
    budget,
    warningThreshold: pruningConfig.triggerThreshold,
    ...(options.adapter !== undefined ? { adapter: options.adapter } : {}),
  };
  const contextManager = new ContextManager(contextManagerConfig);

  const contextPrunerConfig = {
    contextManager,
    logger: options.logger,
    defaultStrategy: pruningConfig.strategy,
    autoTriggerThreshold: pruningConfig.triggerThreshold,
    ...(options.adapter !== undefined ? { adapter: options.adapter } : {}),
  };
  const contextPruner = new ContextPruner(contextPrunerConfig);

  options.logger.info('Context pruning enabled', {
    strategy: pruningConfig.strategy,
    maxTokens: pruningConfig.maxTokens,
    reserveTokens: pruningConfig.reserveTokens,
    triggerThreshold: pruningConfig.triggerThreshold,
  });

  return {
    contextManager,
    contextPruner,
    pruningConfig,
    contextPruningEnabled: true,
  };
}
