/**
 * Plugin System Types — V2 Pipeline OS (Issue #911, Phase 3-1)
 *
 * Defines the plugin manifest, plugin interface, stage context,
 * stage result, and plugin registry interface.
 *
 * @see docs/v2/05-plugin-system-spec.md
 * @module pipeline/plugin-types
 */
import { z } from 'zod';

import { STAGE_TYPES, ArtifactRefSchema } from './task-contract.js';
import type { StageSpec, TaskContract } from './task-contract.js';
import type { Result } from '../core/index.js';

// ============================================================================
// Constants
// ============================================================================

/** All valid plugin trust levels. */
export const PLUGIN_TRUST_LEVELS = Object.freeze([
  'core',
  'standard',
  'experimental',
  'external',
] as const);

// ============================================================================
// Derived Types
// ============================================================================

export type PluginTrustLevel = (typeof PLUGIN_TRUST_LEVELS)[number];

// ============================================================================
// Zod Schemas
// ============================================================================

/** Schema for plugin manifests. */
export const PluginManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
  stages: z.array(z.enum(STAGE_TYPES)).min(1),
  requiredCapabilities: z.array(z.string()),
  trustLevel: z.enum(PLUGIN_TRUST_LEVELS),
  experimental: z.boolean(),
});

/** Schema for stage execution results. */
export const StageResultSchema = z.object({
  success: z.boolean(),
  outputArtifacts: z.array(ArtifactRefSchema),
  metadata: z.record(z.string(), z.unknown()),
  error: z.string().optional(),
});

// ============================================================================
// Types
// ============================================================================

/** Plugin manifest declaring identity and capabilities. */
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** Result of a plugin stage execution. */
export type StageResult = z.infer<typeof StageResultSchema>;

/**
 * Runtime context passed to plugins during stage execution.
 * Plugins communicate only via artifacts and events.
 */
export interface StageContext {
  /** Abort signal for cancellation. */
  readonly signal: AbortSignal;
  /** Task contract for reference (read-only). */
  readonly task: Readonly<TaskContract>;
  /** Stage configuration from the plan. */
  readonly config: Record<string, unknown>;
}

/**
 * Plugin interface — every stage implementation must conform.
 *
 * Plugins are the ONLY way stage logic runs.
 * They communicate via ArtifactStore and EventBus (injected via context).
 */
export interface PipelinePlugin {
  /** Manifest declaring this plugin's identity and capabilities. */
  readonly manifest: PluginManifest;

  /**
   * Execute a pipeline stage.
   * @param stage - The stage specification from the PlanContract
   * @param context - Runtime context with abort signal and task
   * @returns Stage result with output artifacts
   */
  execute(stage: StageSpec, context: StageContext): Promise<StageResult>;

  /**
   * Validate plugin configuration at registration time.
   * Called once when the plugin is registered, not per-execution.
   */
  validateConfig(config: unknown): Result<void, ValidationError>;

  /** Optional lifecycle hook — called when plugin is loaded. */
  onLoad?(): Promise<void>;

  /** Optional lifecycle hook — called when plugin is unloaded. */
  onUnload?(): Promise<void>;
}

// ============================================================================
// Error Types
// ============================================================================

/** Validation error from plugin config validation. */
export interface ValidationError {
  readonly message: string;
  readonly field?: string;
}

/** Registration error when adding a plugin to the registry. */
export type RegistrationError =
  | { readonly type: 'duplicate_id'; readonly pluginId: string }
  | { readonly type: 'invalid_manifest'; readonly message: string }
  | {
      readonly type: 'missing_capability';
      readonly capability: string;
    }
  | { readonly type: 'validation_failed'; readonly message: string }
  | { readonly type: 'registry_frozen' };

// ============================================================================
// Plugin Registry Interface
// ============================================================================

/**
 * Plugin registry — manages plugin lifecycle and resolution.
 *
 * Registry is frozen after startup — no runtime registration.
 */
export interface IPluginRegistry {
  /**
   * Register a plugin. Validates manifest and config.
   * Returns error if plugin ID conflicts or capabilities missing.
   */
  register(plugin: PipelinePlugin): Result<void, RegistrationError>;

  /** Resolve a plugin by ID. Returns undefined if not registered or disabled. */
  resolve(pluginId: string): PipelinePlugin | undefined;

  /** List all enabled plugins with their manifests. */
  listEnabled(): readonly PluginManifest[];

  /** Check if a plugin is registered and enabled. */
  isEnabled(pluginId: string): boolean;

  /** Freeze the registry — no further registrations allowed. */
  freeze(): void;

  /** Whether the registry is frozen. */
  readonly frozen: boolean;
}
