/**
 * Expert CLI routing helpers for create_expert tool.
 *
 * Resolves the optimal CLI adapter for expert creation based on:
 * 1. Explicit model preference (Issue #827)
 * 2. Task specialization matrix auto-routing (Issue #858)
 * 3. Fallback to default adapter
 *
 * @module mcp/tools/create-expert-routing
 */

import type { ILogger } from '../../core/index.js';
import type { IModelAdapter } from '../../core/index.js';
import { DEFAULT_MODEL_CAPABILITIES } from '../../config/model-capabilities.js';
import { createResilientAdapter } from '../../adapters/resilient-adapter.js';
import type { CliName } from '../../cli-adapters/types.js';
import { getSpecialization } from '../../config/task-specialization.js';
import type { TaskCategory } from '../../config/task-specialization-types.js';

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
 * Looks up the model in the capabilities registry and creates a ResilientAdapter
 * with the matching CLI set as preferred. Falls back to the default adapter.
 * (Issue #827)
 */
export function resolveAdapterForModelPreference(
  modelPreference: string,
  fallbackAdapter: IModelAdapter | undefined,
  logger: ILogger
): IModelAdapter | undefined {
  const model = DEFAULT_MODEL_CAPABILITIES.models.find(
    (m) =>
      m.id === modelPreference ||
      m.cliAlias === modelPreference ||
      m.cliModelName === modelPreference ||
      modelPreference.startsWith(m.id)
  );
  if (model === undefined) {
    logger.debug('Model preference not in registry, using default adapter', { modelPreference });
    return fallbackAdapter;
  }
  logger.info('Routing expert to CLI for model preference', {
    modelPreference,
    resolvedModel: model.id,
    cliName: model.cliName,
  });
  return createResilientAdapter({ logger, preferredCli: model.cliName as CliName });
}

/**
 * Resolves the optimal CLI adapter for an expert role using the
 * task specialization matrix when no explicit model preference is given.
 * (Issue #858 Phase 3)
 */
export function resolveAdapterForRole(
  role: string,
  fallbackAdapter: IModelAdapter | undefined,
  logger: ILogger
): IModelAdapter | undefined {
  const category = ROLE_TO_TASK_CATEGORY[role];
  if (category === undefined) return fallbackAdapter;

  const spec = getSpecialization(category);
  logger.info('Auto-routing expert to specialized CLI', {
    role,
    category,
    preferredCli: spec.primaryCli,
  });
  return createResilientAdapter({ logger, preferredCli: spec.primaryCli as CliName });
}
