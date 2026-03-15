/**
 * nexus-agents/security/firewall - Types
 *
 * Configuration, result, and adapter interface types for the
 * HostileInputFirewall pipeline. Uses Zod schemas for runtime
 * validation at construction boundaries.
 *
 * @module security/firewall/firewall-types
 * (Source: Issue #826 — Reusable Hostile Input Firewall)
 */

import { z } from 'zod';

// ============================================================================
// Source Adapter Interface
// ============================================================================

/**
 * Metadata extracted from a platform-specific input source.
 */
export interface SourceMetadata {
  readonly username: string;
  readonly authorAssociation: string;
  readonly content: string;
  readonly sourceType: string;
}

/**
 * Adapter that extracts normalized metadata from platform-specific input.
 * Each platform (GitHub, GitLab, etc.) implements this interface.
 */
export interface ISourceAdapter {
  readonly platform: string;
  extractMetadata(input: unknown): SourceMetadata;
}

// ============================================================================
// Stage Configuration
// ============================================================================

/**
 * Controls which pipeline stages run. Disabled stages use safe defaults.
 */
export const FirewallStagesSchema = z.object({
  sanitization: z.boolean().default(true),
  trustClassification: z.boolean().default(true),
  reputationAssessment: z.boolean().default(false),
  policyEnforcement: z.boolean().default(true),
  corroboration: z.boolean().default(false),
  audit: z.boolean().default(true),
});
export type FirewallStages = z.infer<typeof FirewallStagesSchema>;

/** Creates default stage configuration. */
export function createDefaultStages(): FirewallStages {
  return FirewallStagesSchema.parse({});
}

// ============================================================================
// Firewall Configuration
// ============================================================================

/**
 * Configuration for the HostileInputFirewall.
 * The adapter is required; all other fields have sensible defaults.
 */
export const FirewallConfigSchema = z.object({
  stages: FirewallStagesSchema.default(() => ({
    sanitization: true,
    trustClassification: true,
    reputationAssessment: false,
    policyEnforcement: true,
    corroboration: false,
    audit: true,
  })),
  allowlistedMaintainers: z.array(z.string().min(1)).default([]),
  maxInputLength: z.number().int().positive().default(50_000),
  context: z
    .object({
      hasWriteAccess: z.boolean().default(false),
      hasSecretAccess: z.boolean().default(false),
    })
    .default(() => ({
      hasWriteAccess: false,
      hasSecretAccess: false,
    })),
});

/**
 * Full config including the adapter (not Zod-validated since it's an interface).
 */
export interface FirewallConfig {
  readonly adapter: ISourceAdapter;
  readonly stages?: Partial<FirewallStages>;
  readonly allowlistedMaintainers?: readonly string[];
  readonly maxInputLength?: number;
  readonly context?: {
    readonly hasWriteAccess?: boolean;
    readonly hasSecretAccess?: boolean;
  };
}

// ============================================================================
// Agent Trust Label (ATL) Data
// ============================================================================

/**
 * Structured data for an Agent Trust Label.
 */
export const ATLDataSchema = z.object({
  tier: z.enum(['1', '2', '3', '4']),
  source: z.string().min(1),
  user: z.string().min(1),
  sanitized: z.boolean(),
  rep: z.number().min(0).max(1).optional(),
});
export type ATLData = z.infer<typeof ATLDataSchema>;

// ============================================================================
// Firewall Error
// ============================================================================

/**
 * Error codes for firewall pipeline failures.
 */
export type FirewallErrorCode =
  | 'EXTRACTION_FAILED'
  | 'SANITIZATION_FAILED'
  | 'CLASSIFICATION_FAILED'
  | 'REPUTATION_FAILED'
  | 'INVALID_CONFIG';

/**
 * Structured error from the firewall pipeline.
 */
export interface FirewallError {
  readonly code: FirewallErrorCode;
  readonly message: string;
  readonly stage: string;
}
