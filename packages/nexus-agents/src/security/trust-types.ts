/**
 * nexus-agents/security - Trust Types
 *
 * Zod schemas and TypeScript types for the untrusted input hardening
 * framework. Defines trust tiers, sanitized input, user roles, and
 * injection detection flags.
 *
 * @module security/trust-types
 * (Source: Issue #818, #819 — Phase 1: Input Sanitization)
 */

import { z } from 'zod';

// ============================================================================
// Trust Tiers
// ============================================================================

/**
 * Trust tier classification for input sources.
 * Lower number = higher trust.
 *
 * 1 = Authoritative (repo files, CI, CLAUDE.md, allowlisted maintainers)
 * 2 = Semi-trusted (collaborator issue body, contributor PR metadata)
 * 3 = Untrusted (unknown user comments, non-collaborator issue body)
 * 4 = Hostile (injection patterns, hidden HTML, instruction-like content)
 */
export const TrustTierSchema = z.enum(['1', '2', '3', '4']);
export type TrustTier = z.infer<typeof TrustTierSchema>;

/** Numeric trust tier for comparisons. Higher number = lower trust. */
export const TRUST_TIER_NUMERIC: Record<TrustTier, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
};

// ============================================================================
// GitHub User Roles
// ============================================================================

/**
 * GitHub user relationship to the repository.
 */
export const GitHubUserRoleSchema = z.enum([
  'owner',
  'maintainer',
  'collaborator',
  'contributor',
  'member',
  'unknown',
]);
export type GitHubUserRole = z.infer<typeof GitHubUserRoleSchema>;

/**
 * Default trust tier mapping for each GitHub role.
 * Can be overridden by injection pattern detection (downgrade only).
 */
export const ROLE_DEFAULT_TRUST: Record<GitHubUserRole, TrustTier> = {
  owner: '1',
  maintainer: '1',
  collaborator: '2',
  contributor: '2',
  member: '3',
  unknown: '3',
};

// ============================================================================
// Injection Detection
// ============================================================================

/**
 * Categories of injection patterns detected in content.
 */
export const InjectionFlagSchema = z.enum([
  'authority_claim',
  'instruction_pattern',
  'system_prompt_manipulation',
  'hidden_content',
  'urgency_manipulation',
  'fake_conversation',
  'base64_encoded',
  'external_link_instruction',
]);
export type InjectionFlag = z.infer<typeof InjectionFlagSchema>;

/**
 * An element stripped during sanitization, preserved for audit trail.
 */
export const StrippedElementSchema = z.object({
  /** Type of element stripped. */
  tag: z.string().min(1),
  /** Reason for stripping. */
  reason: z.string().min(1),
  /** Start index in original content. */
  startIndex: z.number().int().nonnegative(),
  /** Length of stripped content. */
  length: z.number().int().positive(),
});
export type StrippedElement = z.infer<typeof StrippedElementSchema>;

// ============================================================================
// Sanitized Input
// ============================================================================

/**
 * The result of sanitizing untrusted input.
 * Contains cleaned content, trust classification, and audit data.
 */
export const SanitizedInputSchema = z.object({
  /** Sanitized content with dangerous elements removed. */
  content: z.string(),
  /** Original content before sanitization (for audit). */
  originalLength: z.number().int().nonnegative(),
  /** Assigned trust tier based on user role and content analysis. */
  trustTier: TrustTierSchema,
  /** GitHub user role of the input source. */
  userRole: GitHubUserRoleSchema,
  /** Injection patterns detected in content. */
  injectionFlags: z.array(InjectionFlagSchema),
  /** Elements stripped during sanitization (audit trail). */
  strippedElements: z.array(StrippedElementSchema),
  /** Whether any dangerous content was detected and stripped. */
  wasModified: z.boolean(),
  /** Timestamp of sanitization (ISO 8601). */
  sanitizedAt: z.string().datetime(),
});
export type SanitizedInput = z.infer<typeof SanitizedInputSchema>;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the input sanitizer.
 */
export const SanitizerConfigSchema = z.object({
  /** GitHub usernames that are always Tier 1 (allowlisted maintainers). */
  allowlistedMaintainers: z.array(z.string().min(1)).default([]),
  /** Whether to fail open (log only) or fail closed (block). Phase 1 = open. */
  failOpen: z.boolean().default(true),
  /** Maximum input length before truncation. */
  maxInputLength: z.number().int().positive().default(50_000),
});
export type SanitizerConfig = z.infer<typeof SanitizerConfigSchema>;
