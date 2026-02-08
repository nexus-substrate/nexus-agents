/**
 * PluginRegistry — V2 Plugin Lifecycle Manager (Issue #911, Phase 3-2)
 *
 * Manages plugin registration, resolution, and experimental gating.
 * Registry is frozen after startup — no runtime registration changes.
 *
 * @see docs/v2/05-plugin-system-spec.md
 * @module pipeline/plugin-registry
 */
import { createLogger } from '../core/index.js';

import { PluginManifestSchema } from './plugin-types.js';
import type {
  PipelinePlugin,
  PluginManifest,
  IPluginRegistry,
  RegistrationError,
} from './plugin-types.js';
import type { Result } from '../core/index.js';

const logger = createLogger({ component: 'PluginRegistry' });

// ============================================================================
// Configuration
// ============================================================================

/** Options for controlling plugin registry behavior. */
export interface PluginRegistryOptions {
  /** Allow experimental plugins to be registered. */
  readonly experimentalEnabled?: boolean;
  /** Explicit allowlist of experimental plugin IDs. */
  readonly experimentalAllow?: readonly string[];
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * In-memory plugin registry with experimental gating.
 *
 * Plugins are registered during startup. After freeze(),
 * no further registrations are accepted.
 */
export class PluginRegistry implements IPluginRegistry {
  private readonly plugins = new Map<string, PipelinePlugin>();
  private readonly options: PluginRegistryOptions;
  private isFrozen = false;

  constructor(options?: PluginRegistryOptions) {
    this.options = options ?? {};
  }

  get frozen(): boolean {
    return this.isFrozen;
  }

  register(plugin: PipelinePlugin): Result<void, RegistrationError> {
    if (this.isFrozen) {
      return { ok: false, error: { type: 'registry_frozen' } };
    }

    const idCheck = this.checkDuplicate(plugin.manifest.id);
    if (idCheck !== undefined) return idCheck;

    const manifestCheck = this.validateManifest(plugin.manifest);
    if (manifestCheck !== undefined) return manifestCheck;

    const gateCheck = this.checkExperimentalGate(plugin.manifest);
    if (gateCheck !== undefined) return gateCheck;

    const configResult = plugin.validateConfig(undefined);
    if (!configResult.ok) {
      return {
        ok: false,
        error: {
          type: 'validation_failed',
          message: configResult.error.message,
        },
      };
    }

    this.plugins.set(plugin.manifest.id, plugin);
    logger.info('Plugin registered', {
      id: plugin.manifest.id,
      version: plugin.manifest.version,
      trustLevel: plugin.manifest.trustLevel,
    });

    return { ok: true, value: undefined };
  }

  resolve(pluginId: string): PipelinePlugin | undefined {
    return this.plugins.get(pluginId);
  }

  listEnabled(): readonly PluginManifest[] {
    return [...this.plugins.values()].map((p) => p.manifest);
  }

  isEnabled(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  freeze(): void {
    this.isFrozen = true;
    logger.info('Plugin registry frozen', {
      pluginCount: this.plugins.size,
    });
  }

  // ==========================================================================
  // Validation Helpers
  // ==========================================================================

  private checkDuplicate(id: string): Result<void, RegistrationError> | undefined {
    if (this.plugins.has(id)) {
      return {
        ok: false,
        error: { type: 'duplicate_id', pluginId: id },
      };
    }
    return undefined;
  }

  private validateManifest(manifest: PluginManifest): Result<void, RegistrationError> | undefined {
    const parsed = PluginManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          type: 'invalid_manifest',
          message: parsed.error.message,
        },
      };
    }
    return undefined;
  }

  private checkExperimentalGate(
    manifest: PluginManifest
  ): Result<void, RegistrationError> | undefined {
    if (!manifest.experimental) return undefined;

    if (this.options.experimentalEnabled !== true) {
      return {
        ok: false,
        error: {
          type: 'missing_capability',
          capability: 'experimental-plugins',
        },
      };
    }

    const allow = this.options.experimentalAllow;
    if (allow !== undefined && !allow.includes(manifest.id)) {
      return {
        ok: false,
        error: {
          type: 'missing_capability',
          capability: `allowlist:${manifest.id}`,
        },
      };
    }

    return undefined;
  }
}
