/**
 * nexus-agents/config - SICA Configuration Schemas
 *
 * Zod schemas for Self-Improving Coding Agent configuration.
 * Implements SICA pattern configuration for agent self-improvement.
 *
 * @module config/schemas-sica
 * (Source: Issue #492 - Wire SicaAgent to orchestration)
 */

import { z } from 'zod';

/**
 * SICA (Self-Improving Coding Agent) configuration schema.
 *
 * Maps to SicaConfig in agents/self-improving/sica-types.ts
 */
export const SicaConfigSchema = z.object({
  /** Whether SICA wrapping is enabled (default: false) */
  enabled: z.boolean().default(false),

  /** Minimum executions before considering improvement (default: 10) */
  minExecutionsForImprovement: z.number().int().positive().default(10),

  /** Success rate threshold to trigger improvement (0-1, default: 0.7) */
  improvementThreshold: z.number().min(0).max(1).default(0.7),

  /** Maximum concurrent versions to evaluate (default: 3) */
  maxActiveVersions: z.number().int().positive().max(10).default(3),

  /** Whether to auto-select best version (default: true) */
  autoSelectBest: z.boolean().default(true),

  /** Improvement cooldown in milliseconds (default: 60000) */
  improvementCooldownMs: z.number().int().nonnegative().default(60000),

  /** Enable observability logging for SICA events (default: true) */
  enableObservability: z.boolean().default(true),
});

export type SicaConfig = z.infer<typeof SicaConfigSchema>;

/**
 * Default SICA configuration values.
 *
 * SICA is disabled by default as it wraps agents with self-improvement
 * capabilities which adds overhead. Enable explicitly when needed.
 */
export const DEFAULT_SICA_CONFIG: SicaConfig = {
  enabled: false,
  minExecutionsForImprovement: 10,
  improvementThreshold: 0.7,
  maxActiveVersions: 3,
  autoSelectBest: true,
  improvementCooldownMs: 60000,
  enableObservability: true,
};
