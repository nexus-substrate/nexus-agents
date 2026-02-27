/**
 * Unified Adapter Registry — single entry point for all model adapter access.
 *
 * Pre-computes task-to-CLI routing from the canonical model registry and
 * task specialization matrix at creation time. All consumers get adapters
 * through this registry instead of calling createAutoAdapter/createResilientAdapter
 * directly.
 *
 * Design:
 * - One IResilientAdapter per CLI (claude/gemini/codex), created lazily on first access
 * - One "default" adapter for unscoped requests (uses createAutoAdapter priority)
 * - Task routing is deterministic: category → primary CLI → cached adapter
 * - Session-scoped: create once at MCP startup, reuse for the session lifetime
 *
 * @module adapters/unified-registry
 * (Source: Issue #1149 — Unified Adapter Registry)
 * (Source: Issue #1151 — Single adapter entry point)
 */

import type { ILogger } from '../core/index.js';
import { createLogger } from '../core/index.js';
import { createResilientAdapter } from './resilient-adapter.js';
import type { IResilientAdapter } from './resilient-adapter-types.js';
import type { CliName } from '../cli-adapters/types.js';
import { TASK_SPECIALIZATION_MATRIX, detectTaskCategory } from '../config/task-specialization.js';
import type { TaskCategory } from '../config/task-specialization-types.js';
import { DEFAULT_MODEL_CAPABILITIES, DEFAULT_MODEL_PER_CLI } from '../config/model-capabilities.js';
import type { CliNameLiteral } from '../config/model-capabilities-types.js';

// ============================================================================
// Types
// ============================================================================

/** Configuration for the unified registry. */
export interface UnifiedRegistryConfig {
  /** Logger instance */
  readonly logger?: ILogger;
  /** Default CLI timeout for subprocess calls (ms) */
  readonly defaultCliTimeoutMs?: number;
}

/** Summary of the pre-computed task routing table. */
export interface TaskRoutingEntry {
  readonly category: TaskCategory;
  readonly primaryCli: CliName;
  readonly secondaryCli: CliName;
  readonly primaryModel: string;
}

/** Snapshot of registry state for observability. */
export interface RegistrySnapshot {
  readonly taskRouting: readonly TaskRoutingEntry[];
  readonly cachedAdapters: readonly CliName[];
  readonly availableModels: number;
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Unified adapter registry. Centralizes all adapter creation and task routing.
 *
 * Usage:
 * ```typescript
 * const registry = createUnifiedRegistry({ logger });
 * const adapter = registry.getAdapter('code_generation'); // → codex adapter
 * const adapter2 = registry.getAdapterForCli('claude');   // → claude adapter
 * const adapter3 = registry.getDefault();                 // → best available
 * ```
 */
export class UnifiedAdapterRegistry {
  private readonly logger: ILogger;
  private readonly defaultCliTimeoutMs: number | undefined;

  /** Pre-computed task → CLI routing (immutable after construction). */
  private readonly taskRouting: ReadonlyMap<TaskCategory, TaskRoutingEntry>;

  /** Per-CLI adapter cache — max 3 entries (claude/gemini/codex). */
  private readonly cliAdapters = new Map<CliName, IResilientAdapter>();

  /** Default adapter for unscoped requests. */
  private defaultAdapter: IResilientAdapter | undefined;

  constructor(config?: UnifiedRegistryConfig) {
    this.logger = config?.logger ?? createLogger({ component: 'unified-registry' });
    this.defaultCliTimeoutMs = config?.defaultCliTimeoutMs;
    this.taskRouting = this.buildTaskRouting();
    this.logger.info('UnifiedAdapterRegistry initialized', {
      categories: this.taskRouting.size,
      models: DEFAULT_MODEL_CAPABILITIES.models.length,
    });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Get adapter for a task category. Uses pre-computed routing.
   * Falls back to default adapter if category unknown.
   */
  getAdapter(category: TaskCategory): IResilientAdapter {
    const routing = this.taskRouting.get(category);
    if (routing === undefined) {
      this.logger.warn('Unknown task category, using default', { category });
      return this.getDefault();
    }
    return this.getAdapterForCli(routing.primaryCli);
  }

  /**
   * Get adapter for a free-text task description.
   * Detects category from keywords, falls back to default.
   */
  getAdapterForTask(taskDescription: string): IResilientAdapter {
    const match = detectTaskCategory(taskDescription);
    if (match !== null) {
      this.logger.debug('Task category detected', {
        category: match.category,
        cli: match.primaryCli,
      });
      return this.getAdapterForCli(match.primaryCli);
    }
    return this.getDefault();
  }

  /**
   * Get adapter pinned to a specific CLI.
   * Creates and caches one IResilientAdapter per CLI.
   */
  getAdapterForCli(cli: CliName): IResilientAdapter {
    const cached = this.cliAdapters.get(cli);
    if (cached !== undefined) return cached;

    const adapter = createResilientAdapter({
      logger: this.logger,
      preferredCli: cli,
      ...(this.defaultCliTimeoutMs !== undefined && {
        defaultCliTimeoutMs: this.defaultCliTimeoutMs,
      }),
    });
    this.cliAdapters.set(cli, adapter);
    this.logger.info('Created CLI-specific adapter', { cli });
    return adapter;
  }

  /**
   * Get adapter for a model preference string (e.g., "claude-opus-4-6").
   * Resolves the model to its CLI via the canonical registry.
   * Falls back to default adapter if model not recognized.
   */
  getAdapterForModel(modelPreference: string): IResilientAdapter {
    const model = DEFAULT_MODEL_CAPABILITIES.models.find(
      (m) =>
        m.id === modelPreference ||
        m.cliAlias === modelPreference ||
        m.cliModelName === modelPreference ||
        modelPreference.startsWith(m.id)
    );
    if (model !== undefined) {
      this.logger.debug('Model resolved to CLI', {
        model: modelPreference,
        cli: model.cliName,
      });
      return this.getAdapterForCli(model.cliName as CliName);
    }
    this.logger.debug('Model not in registry, using default', {
      model: modelPreference,
    });
    return this.getDefault();
  }

  /**
   * Get adapter for an expert role (e.g., "code_expert").
   * Uses ROLE_TO_TASK_CATEGORY mapping → task specialization → CLI.
   */
  getAdapterForRole(role: string): IResilientAdapter {
    const category = ROLE_TO_CATEGORY[role];
    if (category !== undefined) return this.getAdapter(category);
    return this.getDefault();
  }

  /**
   * Get the default adapter (no CLI preference — auto-detection priority).
   */
  getDefault(): IResilientAdapter {
    if (this.defaultAdapter !== undefined) return this.defaultAdapter;
    this.defaultAdapter = createResilientAdapter({
      logger: this.logger,
      ...(this.defaultCliTimeoutMs !== undefined && {
        defaultCliTimeoutMs: this.defaultCliTimeoutMs,
      }),
    });
    return this.defaultAdapter;
  }

  /**
   * Get snapshot of registry state for observability/debugging.
   */
  getSnapshot(): RegistrySnapshot {
    return {
      taskRouting: [...this.taskRouting.values()],
      cachedAdapters: [...this.cliAdapters.keys()],
      availableModels: DEFAULT_MODEL_CAPABILITIES.models.length,
    };
  }

  /**
   * Get the pre-computed routing for a specific category.
   */
  getRouting(category: TaskCategory): TaskRoutingEntry | undefined {
    return this.taskRouting.get(category);
  }

  /**
   * Dispose all cached adapters.
   */
  dispose(): void {
    for (const adapter of this.cliAdapters.values()) {
      adapter.dispose();
    }
    this.cliAdapters.clear();
    this.defaultAdapter?.dispose();
    this.defaultAdapter = undefined;
    this.logger.info('UnifiedAdapterRegistry disposed');
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private buildTaskRouting(): ReadonlyMap<TaskCategory, TaskRoutingEntry> {
    const routing = new Map<TaskCategory, TaskRoutingEntry>();
    for (const spec of TASK_SPECIALIZATION_MATRIX) {
      const primaryModel = resolveDefaultModel(spec.primaryCli);
      routing.set(spec.category, {
        category: spec.category,
        primaryCli: spec.primaryCli,
        secondaryCli: spec.secondaryCli,
        primaryModel,
      });
    }
    return routing;
  }
}

// ============================================================================
// Role → Category Mapping (consolidated from create-expert-routing.ts)
// ============================================================================

/** Maps expert roles to task categories for CLI specialization. */
const ROLE_TO_CATEGORY: Record<string, TaskCategory> = {
  code_expert: 'code_generation',
  architecture_expert: 'architecture',
  security_expert: 'security_review',
  documentation_expert: 'documentation',
  testing_expert: 'testing',
  devops_expert: 'devops',
  research_expert: 'research',
  pm_expert: 'planning',
  ux_expert: 'planning',
  infrastructure_expert: 'devops',
};

// ============================================================================
// Helpers
// ============================================================================

/** Resolve the default model name for a CLI from the canonical registry. */
function resolveDefaultModel(cli: string): string {
  if (cli in DEFAULT_MODEL_PER_CLI) {
    return DEFAULT_MODEL_PER_CLI[cli as CliNameLiteral];
  }
  return cli;
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let globalRegistry: UnifiedAdapterRegistry | undefined;

/**
 * Create a new UnifiedAdapterRegistry instance.
 * For most uses, prefer `getGlobalRegistry()` instead.
 */
export function createUnifiedRegistry(config?: UnifiedRegistryConfig): UnifiedAdapterRegistry {
  return new UnifiedAdapterRegistry(config);
}

/**
 * Get the global singleton registry.
 * Creates it on first access with default config.
 */
export function getGlobalRegistry(config?: UnifiedRegistryConfig): UnifiedAdapterRegistry {
  globalRegistry ??= new UnifiedAdapterRegistry(config);
  return globalRegistry;
}

/** Reset the global registry (for testing). */
export function resetGlobalRegistry(): void {
  globalRegistry?.dispose();
  globalRegistry = undefined;
}
