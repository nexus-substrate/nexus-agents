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
import { ConfigError } from '../core/errors.js';
import { getDefaultCliCircuitBreakerRegistry } from '../cli-adapters/cli-circuit-breaker.js';
import { createLogger } from '../core/index.js';
import { createResilientAdapter } from './resilient-adapter.js';
import { warnIfGatewayCostUndeclared } from './sdk/gateway-cost.js';
import type { IResilientAdapter } from './resilient-adapter-types.js';
import type { CliName, EndpointArmId, ObservedArmId } from '../cli-adapters/types.js';
import { isCliName, isEndpointArmId } from '../cli-adapters/types.js';
import { TASK_SPECIALIZATION_MATRIX, detectTaskCategory } from '../config/task-specialization.js';
import type { TaskCategory } from '../config/task-specialization-types.js';
import {
  getDefaultModelForCli,
  getInTreeCapabilitiesMatrix,
} from '../config/model-config-helpers.js';

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
  /**
   * CLI-slot view of {@link cachedArms}: the lazily created CLI slots only.
   * A registered `api:*` arm is never listed here (#6290 panel: this field
   * keeps its `CliName[]` type; it is retired in 9.0, #6291).
   */
  readonly cachedAdapters: readonly CliName[];
  /** Every cached arm: lazily created CLI slots and registered `api:*` endpoint arms (#4392). */
  readonly cachedArms: readonly ObservedArmId[];
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

  /**
   * Per-arm adapter cache. CLI slots are created lazily by
   * {@link getAdapterForCli}; `api:*` arms enter only through
   * {@link registerApiArm} and are never synthesised (#4392).
   */
  private readonly cliAdapters = new Map<ObservedArmId, IResilientAdapter>();

  /** Default adapter for unscoped requests. */
  private defaultAdapter: IResilientAdapter | undefined;

  constructor(config?: UnifiedRegistryConfig) {
    this.logger = config?.logger ?? createLogger({ component: 'unified-registry' });
    this.defaultCliTimeoutMs = config?.defaultCliTimeoutMs;
    this.logger.info('UnifiedAdapterRegistry initialized', {
      categories: TASK_SPECIALIZATION_MATRIX.length,
      models: getInTreeCapabilitiesMatrix().models.length,
    });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Logger used by this registry. Exposed so singleton helpers can warn. */
  getLogger(): ILogger {
    return this.logger;
  }

  /**
   * Get adapter for a task category. Routing is re-resolved on every read
   * (#3185) so a post-startup overlay/registry update propagates without a
   * restart. Falls back to default adapter if category unknown.
   */
  getAdapter(category: TaskCategory): IResilientAdapter {
    const routing = this.getRouting(category);
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

    const raw = createResilientAdapter({
      logger: this.logger,
      preferredCli: cli,
      // #4659: the SHARED registry — the same one that already gates
      // voter-panel availability (#4330). Per-adapter registries would let one
      // adapter keep routing to a CLI another has already seen fail.
      circuitBreakerRegistry: getDefaultCliCircuitBreakerRegistry(),
      ...(this.defaultCliTimeoutMs !== undefined && {
        defaultCliTimeoutMs: this.defaultCliTimeoutMs,
      }),
    });
    const adapter = raw;
    this.cliAdapters.set(cli, adapter);
    this.logger.info('Created CLI-specific adapter', {
      cli,
    });
    return adapter;
  }

  /**
   * Get the adapter for a routing arm (#4392). A CLI slot resolves exactly as
   * {@link getAdapterForCli} (created lazily, cached, armed with the shared
   * breaker registry). An `api:*` arm resolves to what {@link registerApiArm}
   * supplied, or `undefined` — never to a CLI slot, and never by creating one.
   */
  getAdapterForArm(arm: ObservedArmId): IResilientAdapter | undefined {
    // Split on CLI-slot membership, not on the validator: an `api:` string
    // that fails validation must read as "not registered", never be handed
    // to getAdapterForCli to mint a slot adapter under a garbage name.
    if (isCliName(arm)) {
      return this.getAdapterForCli(arm);
    }
    return this.cliAdapters.get(arm);
  }

  /**
   * Register an `api:*` arm's adapter under its endpoint identity (#4392).
   * Accepts a built-in `ApiArmId` or a dynamic `EndpointArmId`; the id is
   * re-validated at runtime because the `EndpointArmId` type admits any `api:`
   * string, so a cast from an unvalidated name is exactly what this refuses.
   * Registering an id twice replaces (and disposes) the earlier adapter.
   * CLI-slot behaviour is untouched. A registered endpoint arm is observable
   * here and in the breaker registry but is NOT a `RoutingArmId`: it cannot
   * enter outcome records until #6291. A gateway arm registered without a
   * `NEXUS_GATEWAY_COST` declaration is warned about here, once, at the
   * moment it becomes routable (#4392 increment 2).
   */
  registerApiArm(arm: EndpointArmId, adapter: IResilientAdapter): void {
    if (!isEndpointArmId(arm)) {
      throw new Error(`Invalid api arm id: ${JSON.stringify(arm)} (expected api:<endpoint>)`);
    }
    this.cliAdapters.get(arm)?.dispose();
    this.cliAdapters.set(arm, adapter);
    this.logger.info('Registered api arm adapter', { arm });
    warnIfGatewayCostUndeclared(arm, this.logger);
  }

  /**
   * Get adapter for a model preference string (e.g., "claude-opus-4-6").
   * Resolves the model to its CLI via the canonical registry.
   * Falls back to default adapter if model not recognized.
   */
  getAdapterForModel(modelPreference: string): IResilientAdapter {
    // Prefer exact matches (id / cliAlias / cliModelName) over prefix matches.
    // For prefix fallback, longest-prefix-wins so a future registry containing
    // both 'gemini-pro' and 'gemini-pro-experimental' resolves correctly even
    // though the registry's natural array order isn't sorted by id length.
    // Defense-in-depth — no current registry has prefix overlaps. (#2192)
    const allModels = getInTreeCapabilitiesMatrix().models;
    const exact = allModels.find(
      (m) =>
        m.id === modelPreference ||
        m.cliAlias === modelPreference ||
        m.cliModelName === modelPreference
    );
    const prefix =
      exact ??
      [...allModels]
        .filter((m) => modelPreference.startsWith(m.id))
        .sort((a, b) => b.id.length - a.id.length)[0];
    const model = prefix;
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
    const raw = createResilientAdapter({
      logger: this.logger,
      circuitBreakerRegistry: getDefaultCliCircuitBreakerRegistry(),
      ...(this.defaultCliTimeoutMs !== undefined && {
        defaultCliTimeoutMs: this.defaultCliTimeoutMs,
      }),
    });
    this.defaultAdapter = raw;
    return this.defaultAdapter;
  }

  /**
   * Get snapshot of registry state for observability/debugging. Routing is
   * re-resolved on read (#3185) so the snapshot reflects the live registry.
   */
  getSnapshot(): RegistrySnapshot {
    return {
      taskRouting: TASK_SPECIALIZATION_MATRIX.map((spec) => this.resolveRouting(spec)),
      cachedAdapters: [...this.cliAdapters.keys()].filter(isCliName),
      cachedArms: [...this.cliAdapters.keys()],
      availableModels: getInTreeCapabilitiesMatrix().models.length,
    };
  }

  /**
   * Resolve the routing for a specific category.
   *
   * Computed on every read (#3185) rather than cached at construction, so a
   * post-startup model-registry / overlay update (e.g. a default-model change
   * surfaced via `getDefaultModelForCli`) propagates to routing decisions
   * without a process restart. The matrix is ~10 categories — the per-read
   * resolution cost is negligible.
   */
  getRouting(category: TaskCategory): TaskRoutingEntry | undefined {
    const spec = TASK_SPECIALIZATION_MATRIX.find((s) => s.category === category);
    if (spec === undefined) return undefined;
    return this.resolveRouting(spec);
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

  /**
   * Resolve one specialization-matrix row into a routing entry, re-reading the
   * primary model from the (overlay-aware) model registry each call (#3185).
   */
  private resolveRouting(spec: (typeof TASK_SPECIALIZATION_MATRIX)[number]): TaskRoutingEntry {
    return {
      category: spec.category,
      primaryCli: spec.primaryCli,
      secondaryCli: spec.secondaryCli,
      primaryModel: resolveDefaultModel(spec.primaryCli),
    };
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
  if (isCliName(cli)) {
    return getDefaultModelForCli(cli);
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
 * Claim the global registry for a process entry point, choosing its logger
 * (#6012). Idempotent and SILENT when the registry already exists — unlike
 * {@link getGlobalRegistry} with a config, which warns.
 *
 * That difference is the point. There is not exactly one composition root: the
 * bundled CLI enters through `cli.ts main()`, and an embedder can start the MCP
 * server directly without it. Both should be able to claim, first-one-wins,
 * without the second producing a warning an operator cannot act on — which is
 * what a config-passing `getGlobalRegistry` call does, and is the noise this
 * whole change removes.
 *
 * This does NOT provide per-caller log attribution: the singleton has one
 * logger. It makes that one logger a deliberate choice rather than a
 * consequence of which module happened to run first.
 */
export function claimGlobalRegistry(logger: ILogger): UnifiedAdapterRegistry {
  globalRegistry ??= new UnifiedAdapterRegistry({ logger });
  return globalRegistry;
}

/**
 * Thrown by {@link getGlobalRegistry} when a non-empty config arrives after
 * the singleton exists (#5211). The registry has no way to apply it — the
 * logger and `defaultCliTimeoutMs` are fixed at construction — so until this
 * error existed the config was logged at `warn` and dropped, and the caller
 * went on with a registry built from someone else's settings. A config that is
 * accepted and ignored is an instrument that misreports what it was given.
 *
 * The check is on presence, not on equality with the live config: the registry
 * does not keep the config it was built from, and a caller re-supplying the
 * same values is still a caller that believes it configured something.
 */
export class RegistryAlreadyInitializedError extends ConfigError {
  constructor(providedKeys: readonly string[]) {
    super(
      'UnifiedAdapterRegistry singleton is already initialized, so getGlobalRegistry() cannot ' +
        `apply the supplied config (keys: ${providedKeys.join(', ')}). Call resetGlobalRegistry() ` +
        'first if reconfiguration is intentional, or getGlobalRegistry() with no config to use the ' +
        'existing instance; claimGlobalRegistry(logger) is the idempotent way to name the logger.',
      { context: { providedKeys: [...providedKeys] } }
    );
    this.name = 'RegistryAlreadyInitializedError';
  }
}

/**
 * Get the global singleton registry.
 * Creates it on first access with default config.
 *
 * If the singleton already exists and a non-empty config is supplied, this
 * throws {@link RegistryAlreadyInitializedError} — the config cannot be
 * applied, and returning the existing instance would silently hand the caller
 * a registry configured by whoever ran first (#5211). Omitting the config, or
 * passing an empty object, returns the existing instance as before.
 */
export function getGlobalRegistry(config?: UnifiedRegistryConfig): UnifiedAdapterRegistry {
  if (globalRegistry === undefined) {
    globalRegistry = new UnifiedAdapterRegistry(config);
    return globalRegistry;
  }
  if (config !== undefined && Object.keys(config).length > 0) {
    throw new RegistryAlreadyInitializedError(Object.keys(config));
  }
  return globalRegistry;
}

/** Reset the global registry (for testing). */
export function resetGlobalRegistry(): void {
  globalRegistry?.dispose();
  globalRegistry = undefined;
}
