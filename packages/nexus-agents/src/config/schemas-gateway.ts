/**
 * nexus-agents/config - Gateway Configuration Schema
 *
 * Schema for the MCP gateway middleware configuration.
 * Controls tier-aware dispatch logging and per-tool tier overrides.
 *
 * (Source: Issue #897, Epic #888)
 */

import { z } from 'zod';

/**
 * Valid tier names for configuration.
 * Maps to RequestTier enum values in tier-classifier.ts.
 */
const TierNameSchema = z.enum(['DIRECT', 'ANALYZED', 'ORCHESTRATED']);

/**
 * Gateway middleware configuration schema.
 *
 * Controls whether tier-aware dispatch logging is active and
 * allows per-tool tier overrides for custom routing behavior.
 */
export const GatewayConfigSchema = z.object({
  /** Enable gateway tier dispatch logging (default: true). */
  enabled: z.boolean().default(true),
  /**
   * Per-tool tier overrides.
   * Keys are tool names (e.g., 'delegate_to_model'), values are tier names.
   * Overrides the default tier from TOOL_TIER_MAP in tier-classifier.ts.
   */
  tierOverrides: z.record(z.string(), TierNameSchema).optional(),
});

export type GatewayConfigType = z.infer<typeof GatewayConfigSchema>;
