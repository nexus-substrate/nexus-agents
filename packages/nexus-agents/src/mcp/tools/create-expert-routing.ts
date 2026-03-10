/**
 * Expert CLI routing helpers for create_expert tool.
 *
 * Resolves the optimal CLI adapter for expert creation based on:
 * 1. Explicit model preference (Issue #827)
 * 2. Task specialization matrix auto-routing (Issue #858)
 * 3. Fallback to default adapter
 *
 * Delegates to UnifiedAdapterRegistry for centralized, cached routing.
 * (Source: Issue #1149 — Unified Adapter Registry)
 *
 * @module mcp/tools/create-expert-routing
 */

import type { ILogger } from '../../core/index.js';
import type { IModelAdapter } from '../../core/index.js';
import { getGlobalRegistry } from '../../adapters/unified-registry.js';
import type { TaskCategory } from '../../config/task-specialization-types.js';
import type { CliName } from '../../cli-adapters/types.js';
import { getFallbackChainForCategory } from '../../cli-adapters/fallback-chains.js';

/** Maps TaskCategory to FallbackTaskType for chain lookup. */
const CATEGORY_TO_FALLBACK_TYPE: Record<TaskCategory, string> = {
  code_generation: 'code',
  code_review: 'code',
  testing: 'code',
  research: 'research',
  exploration: 'research',
  documentation: 'documentation',
  architecture: 'analysis',
  security_review: 'analysis',
  planning: 'analysis',
  devops: 'general',
};

/**
 * Maps expert roles to task categories for CLI specialization (Issue #858).
 */
export const ROLE_TO_TASK_CATEGORY: Record<string, TaskCategory> = {
  code_expert: 'code_generation',
  architecture_expert: 'architecture',
  security_expert: 'security_review',
  documentation_expert: 'documentation',
  testing_expert: 'testing',
  devops_expert: 'devops',
  research_expert: 'research',
  pm_expert: 'planning',
  ux_expert: 'planning',
};

/**
 * Resolves a model preference string to the correct CLI-specific adapter.
 * Delegates to the unified registry for cached, centralized routing.
 * (Issue #827, #1149)
 */
export function resolveAdapterForModelPreference(
  modelPreference: string,
  fallbackAdapter: IModelAdapter | undefined,
  logger: ILogger
): IModelAdapter | undefined {
  const registry = getGlobalRegistry({ logger });
  const adapter = registry.getAdapterForModel(modelPreference);
  // If the registry returned its default (model not recognized), use fallback
  if (adapter === registry.getDefault() && fallbackAdapter !== undefined) {
    logger.debug('Model preference not in registry, using fallback adapter', { modelPreference });
    return fallbackAdapter;
  }
  logger.info('Routing expert to CLI for model preference', { modelPreference });
  return adapter;
}

/**
 * Resolves the optimal CLI adapter for an expert role using the
 * task specialization matrix when no explicit model preference is given.
 * Delegates to the unified registry for cached, centralized routing.
 * (Issue #858 Phase 3, #1149)
 */
export function resolveAdapterForRole(
  role: string,
  fallbackAdapter: IModelAdapter | undefined,
  logger: ILogger
): IModelAdapter | undefined {
  const category = ROLE_TO_TASK_CATEGORY[role];
  if (category === undefined) return fallbackAdapter;

  const registry = getGlobalRegistry({ logger });
  const adapter = registry.getAdapter(category);
  logger.info('Auto-routing expert to specialized CLI', {
    role,
    category,
    preferredCli: registry.getRouting(category)?.primaryCli,
  });
  return adapter;
}

/**
 * Returns the fallback chain of CLIs for an expert role, excluding
 * a specified CLI (typically the one that just failed). (#1532)
 *
 * Used by execute_expert to retry with a different CLI on rate-limit errors.
 */
export function getExpertFallbackChain(
  role: string,
  excludeCli: string,
  logger: ILogger
): CliName[] {
  const category = ROLE_TO_TASK_CATEGORY[role];
  if (category === undefined) return [];
  const bucketType = CATEGORY_TO_FALLBACK_TYPE[category];
  const chain = getFallbackChainForCategory(
    category,
    bucketType as Parameters<typeof getFallbackChainForCategory>[1]
  );
  const filtered = chain.filter((cli) => cli !== excludeCli);
  logger.debug('Expert fallback chain resolved', { role, category, excludeCli, chain: filtered });
  return [...filtered];
}
