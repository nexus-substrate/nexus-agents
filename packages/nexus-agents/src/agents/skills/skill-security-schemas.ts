/**
 * nexus-agents/agents - Skill Security Schemas
 *
 * Zod validation schemas for skill security types.
 * Used for runtime validation at trust boundaries.
 *
 * @module agents/skills/skill-security-schemas
 * (Source: Issue #374, Phase 1)
 */

import { z } from 'zod';
import { SKILL_PERMISSIONS, MAX_EXECUTION_TIME_MS } from './skill-security-types.js';

// ============================================================================
// Permission & Role Schemas
// ============================================================================

/**
 * Zod schema for SkillPermission.
 */
export const SkillPermissionSchema = z.enum([
  'read',
  'write',
  'execute',
  'network',
  'filesystem',
  'spawn',
]);

/**
 * Zod schema for AgentRole (mirrors core/types/agent.ts).
 */
export const AgentRoleSchema = z.enum([
  'tech_lead',
  'code_expert',
  'architecture_expert',
  'security_expert',
  'documentation_expert',
  'testing_expert',
  'infrastructure_expert',
  'thinker',
  'worker',
  'verifier',
  'custom',
]);

// ============================================================================
// Capability Schemas
// ============================================================================

/**
 * Zod schema for SkillCapabilities.
 */
export const SkillCapabilitiesSchema = z.object({
  permissions: z
    .array(SkillPermissionSchema)
    .min(0)
    .max(SKILL_PERMISSIONS.length)
    .readonly()
    .describe('Permissions granted to the skill'),
  maxExecutionTime: z
    .number()
    .int()
    .positive()
    .max(MAX_EXECUTION_TIME_MS)
    .describe('Maximum execution time in milliseconds'),
  sandboxed: z.boolean().describe('Whether the skill runs in a sandboxed environment'),
});

// ============================================================================
// RBAC Schemas
// ============================================================================

/**
 * Zod schema for SkillRBAC.
 */
export const SkillRBACSchema = z.object({
  allowedRoles: z
    .array(AgentRoleSchema)
    .min(1)
    .readonly()
    .describe('Roles allowed to execute this skill'),
  deniedRoles: z
    .array(AgentRoleSchema)
    .readonly()
    .optional()
    .describe('Roles explicitly denied execution'),
  requiresAttestation: z.boolean().describe('Whether execution requires attestation'),
});

// ============================================================================
// Provenance Schemas
// ============================================================================

/**
 * Zod schema for SkillProvenance.
 */
export const SkillProvenanceSchema = z.object({
  createdBy: z.string().min(1).max(256).describe('Identifier of the creator'),
  createdAt: z.date().describe('Creation timestamp'),
  modifiedBy: z.string().min(1).max(256).optional().describe('Identifier of last modifier'),
  modifiedAt: z.date().optional().describe('Last modification timestamp'),
  version: z.number().int().nonnegative().describe('Version number'),
  signature: z.string().max(512).optional().describe('Cryptographic signature'),
});

// ============================================================================
// Attestation Schemas
// ============================================================================

/**
 * Zod schema for AuthorizationMethod.
 */
export const AuthorizationMethodSchema = z.enum(['role', 'explicit', 'inherited']);

/**
 * Zod schema for SkillAttestation.
 */
export const SkillAttestationSchema = z.object({
  skillId: z.string().min(1).max(256).describe('ID of the skill'),
  executorId: z.string().min(1).max(256).describe('ID of the executor'),
  timestamp: z.date().describe('Attestation timestamp'),
  inputHash: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]+$/)
    .describe('SHA-256 hash of input'),
  authorized: z.boolean().describe('Whether execution is authorized'),
  authorizationMethod: AuthorizationMethodSchema.describe('How authorization was determined'),
});

// ============================================================================
// Error Schemas
// ============================================================================

/**
 * Zod schema for SecurityErrorCode.
 */
export const SecurityErrorCodeSchema = z.enum([
  'PERMISSION_DENIED',
  'ROLE_NOT_ALLOWED',
  'ATTESTATION_REQUIRED',
  'INVALID_PROVENANCE',
  'SIGNATURE_MISMATCH',
  'EXECUTION_TIMEOUT',
  'SANDBOX_VIOLATION',
]);

/**
 * Zod schema for SkillSecurityError.
 */
export const SkillSecurityErrorSchema = z.object({
  code: SecurityErrorCodeSchema,
  message: z.string().min(1).max(1024),
  context: z.record(z.unknown()).optional(),
});
