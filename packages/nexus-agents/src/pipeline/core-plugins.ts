/**
 * Core Plugins — V2 Pipeline OS Built-in Plugins (Issue #921, Phase B)
 *
 * Registers core plugin manifests into PluginRegistry during server startup.
 * These plugins wrap existing V1 subsystems (task analyzer, model router,
 * CLI executor) as V2 pipeline stages.
 *
 * Plugins are lazy — no external API calls at registration time.
 *
 * @module pipeline/core-plugins
 */
import { createLogger } from '../core/index.js';

import { PluginRegistry } from './plugin-registry.js';

import type { PipelinePlugin, StageResult, StageContext } from './plugin-types.js';
import type { StageSpec } from './task-contract.js';
import type { Result } from '../core/index.js';

const logger = createLogger({ component: 'CorePlugins' });

// ============================================================================
// No-op Stage Handler (Phase B — lazy skeleton)
// ============================================================================

/** Creates a no-op stage result for skeleton plugins. */
function noopStageResult(): StageResult {
  return { success: true, outputArtifacts: [], metadata: { stub: true } };
}

/** Creates a core plugin with a no-op execute handler. */
function createCorePlugin(
  id: string,
  description: string,
  stages: PipelinePlugin['manifest']['stages']
): PipelinePlugin {
  return {
    manifest: {
      id,
      version: '1.0.0',
      description,
      stages,
      requiredCapabilities: [],
      trustLevel: 'core',
      experimental: false,
    },
    execute: (_stage: StageSpec, _ctx: StageContext): Promise<StageResult> =>
      Promise.resolve(noopStageResult()),
    validateConfig: (_config: unknown): Result<void, { message: string }> => ({
      ok: true,
      value: undefined,
    }),
  };
}

// ============================================================================
// Core Plugin Definitions
// ============================================================================

/** Task analyzer plugin — wraps SharedTaskAnalyzer for pipeline stages. */
export const TASK_ANALYZER_PLUGIN = createCorePlugin(
  'nexus:task-analyzer',
  'Analyzes task complexity, type, and required capabilities',
  ['analyze']
);

/** Model router plugin — wraps CompositeRouter for pipeline routing stages. */
export const MODEL_ROUTER_PLUGIN = createCorePlugin(
  'nexus:model-router',
  'Routes tasks to optimal model via Budget→TOPSIS→LinUCB pipeline',
  ['route']
);

/** CLI executor plugin — executes tasks via CLI adapters (claude/gemini/codex). */
export const CLI_EXECUTOR_PLUGIN = createCorePlugin(
  'nexus:cli-executor',
  'Executes tasks via external CLI adapters with resilient retry',
  ['execute']
);

/** All core plugins in registration order. */
export const CORE_PLUGINS: readonly PipelinePlugin[] = [
  TASK_ANALYZER_PLUGIN,
  MODEL_ROUTER_PLUGIN,
  CLI_EXECUTOR_PLUGIN,
];

// ============================================================================
// Registration
// ============================================================================

/** Result of core plugin registration. */
export interface CorePluginRegistrationResult {
  readonly registered: number;
  readonly failed: number;
  readonly errors: readonly string[];
}

/**
 * Registers all core plugins into a PluginRegistry and freezes it.
 * Returns registration summary. Never throws.
 */
export function registerCorePlugins(registry?: PluginRegistry): CorePluginRegistrationResult {
  const reg = registry ?? new PluginRegistry();
  const errors: string[] = [];
  let registered = 0;

  for (const plugin of CORE_PLUGINS) {
    const result = reg.register(plugin);
    if (result.ok) {
      registered++;
    } else {
      const msg = `Failed to register ${plugin.manifest.id}: ${JSON.stringify(result.error)}`;
      errors.push(msg);
      logger.warn(msg);
    }
  }

  reg.freeze();
  logger.info('Core plugins registered', { registered, failed: errors.length });
  return { registered, failed: errors.length, errors };
}

/**
 * Creates a PluginRegistry with core plugins pre-registered and frozen.
 * Convenience function for server startup.
 */
export function createCorePluginRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  registerCorePlugins(registry);
  return registry;
}

// ============================================================================
// Global Singleton (#1179)
// ============================================================================

let globalPluginRegistry: PluginRegistry | undefined;

/** Returns the global PluginRegistry (created lazily on first call). */
export function getPipelinePluginRegistry(): PluginRegistry {
  globalPluginRegistry ??= createCorePluginRegistry();
  return globalPluginRegistry;
}

/** Resets the global PluginRegistry (for testing). */
export function resetPipelinePluginRegistry(): void {
  globalPluginRegistry = undefined;
}
