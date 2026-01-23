/**
 * nexus-agents/agents - Skill Security Controls
 *
 * Security types and validation for the Voyager skill library.
 * Implements capability-based permissions, RBAC, provenance tracking,
 * and execution attestation for safe skill auto-loading.
 *
 * @module agents/skills/skill-security
 * (Source: Issue #374, Phase 1)
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import type { Result } from '../../core/result.js';
import { ok, err } from '../../core/result.js';
import type { AgentRole } from '../../core/types/agent.js';

// ============================================================================
// Permission Types
// ============================================================================

/**
 * Available skill permissions.
 * Each permission grants specific capabilities to a skill.
 */
export type SkillPermission =
  | 'read' // Read files, data, state
  | 'write' // Write files, modify state
  | 'execute' // Execute code, commands
  | 'network' // Make network requests
  | 'filesystem' // Access filesystem beyond working directory
  | 'spawn'; // Spawn child processes

/**
 * All valid skill permissions as a readonly array.
 */
export const SKILL_PERMISSIONS: readonly SkillPermission[] = [
  'read',
  'write',
  'execute',
  'network',
  'filesystem',
  'spawn',
] as const;

/**
 * Default permissions for new skills (minimal, read-only).
 */
export const DEFAULT_PERMISSIONS: readonly SkillPermission[] = ['read'] as const;

/**
 * Maximum execution time in milliseconds.
 */
export const MAX_EXECUTION_TIME_MS = 300_000; // 5 minutes

/**
 * Default execution time limit in milliseconds.
 */
export const DEFAULT_EXECUTION_TIME_MS = 30_000; // 30 seconds

// ============================================================================
// Capability Types
// ============================================================================

/**
 * Skill capabilities define what a skill can do and its execution constraints.
 */
export interface SkillCapabilities {
  /** Permissions granted to the skill */
  readonly permissions: readonly SkillPermission[];
  /** Maximum execution time in milliseconds */
  readonly maxExecutionTime: number;
  /** Whether the skill runs in a sandboxed environment */
  readonly sandboxed: boolean;
}

/**
 * Default capabilities for new skills.
 */
export const DEFAULT_CAPABILITIES: SkillCapabilities = {
  permissions: DEFAULT_PERMISSIONS,
  maxExecutionTime: DEFAULT_EXECUTION_TIME_MS,
  sandboxed: true,
} as const;

// ============================================================================
// RBAC Types
// ============================================================================

/**
 * Role-based access control for skill execution.
 */
export interface SkillRBAC {
  /** Roles that are allowed to execute this skill */
  readonly allowedRoles: readonly AgentRole[];
  /** Roles that are explicitly denied (takes precedence over allowed) */
  readonly deniedRoles?: readonly AgentRole[];
  /** Whether execution requires attestation even for allowed roles */
  readonly requiresAttestation: boolean;
}

/**
 * Default RBAC allowing all roles without attestation requirement.
 */
export const DEFAULT_RBAC: SkillRBAC = {
  allowedRoles: [
    'tech_lead',
    'code_expert',
    'architecture_expert',
    'security_expert',
    'documentation_expert',
    'testing_expert',
    'thinker',
    'worker',
    'verifier',
    'custom',
  ],
  requiresAttestation: false,
} as const;

// ============================================================================
// Provenance Types
// ============================================================================

/**
 * Tracks the origin and modification history of a skill.
 */
export interface SkillProvenance {
  /** Identifier of who created the skill */
  readonly createdBy: string;
  /** When the skill was created */
  readonly createdAt: Date;
  /** Identifier of who last modified the skill */
  readonly modifiedBy?: string;
  /** When the skill was last modified */
  readonly modifiedAt?: Date;
  /** Version number (increments on modification) */
  readonly version: number;
  /** Cryptographic signature for verification */
  readonly signature?: string;
}

// ============================================================================
// Attestation Types
// ============================================================================

/**
 * Method used to authorize skill execution.
 */
export type AuthorizationMethod = 'role' | 'explicit' | 'inherited';

/**
 * Records the authorization of a skill execution.
 */
export interface SkillAttestation {
  /** ID of the skill being executed */
  readonly skillId: string;
  /** ID of the agent executing the skill */
  readonly executorId: string;
  /** When the attestation was created */
  readonly timestamp: Date;
  /** SHA-256 hash of the input parameters */
  readonly inputHash: string;
  /** Whether execution was authorized */
  readonly authorized: boolean;
  /** How authorization was determined */
  readonly authorizationMethod: AuthorizationMethod;
}

// ============================================================================
// Security Error Types
// ============================================================================

/**
 * Error codes for security-related failures.
 */
export type SecurityErrorCode =
  | 'PERMISSION_DENIED'
  | 'ROLE_NOT_ALLOWED'
  | 'ATTESTATION_REQUIRED'
  | 'INVALID_PROVENANCE'
  | 'SIGNATURE_MISMATCH'
  | 'EXECUTION_TIMEOUT'
  | 'SANDBOX_VIOLATION';

/**
 * Security error with code and context.
 */
export interface SkillSecurityError {
  readonly code: SecurityErrorCode;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

// ============================================================================
// Zod Schemas
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
  'thinker',
  'worker',
  'verifier',
  'custom',
]);

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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if an agent role can execute a skill based on RBAC rules.
 *
 * @param agentRole - The role of the agent attempting execution
 * @param rbac - The skill's RBAC configuration
 * @returns True if the role is allowed to execute the skill
 */
export function canExecuteSkill(agentRole: AgentRole, rbac: SkillRBAC): boolean {
  // Check denied roles first (deny takes precedence)
  if (rbac.deniedRoles?.includes(agentRole) === true) {
    return false;
  }

  // Check if role is in allowed list
  return rbac.allowedRoles.includes(agentRole);
}

/**
 * Computes a SHA-256 hash of the input for attestation.
 *
 * @param input - The input to hash
 * @returns Lowercase hex-encoded SHA-256 hash
 */
function computeInputHash(input: unknown): string {
  // Handle undefined and null by converting to consistent string
  const serialized =
    input === undefined ? 'undefined' : JSON.stringify(input, Object.keys(input ?? {}).sort());
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Creates an attestation record for a skill execution.
 *
 * @param skillId - ID of the skill being executed
 * @param executorId - ID of the agent executing the skill
 * @param input - Input parameters for the skill
 * @param authorized - Whether execution is authorized
 * @param method - How authorization was determined
 * @returns A new SkillAttestation record
 */
export function createAttestation(
  skillId: string,
  executorId: string,
  input: unknown,
  authorized: boolean,
  method: AuthorizationMethod
): SkillAttestation {
  return {
    skillId,
    executorId,
    timestamp: new Date(),
    inputHash: computeInputHash(input),
    authorized,
    authorizationMethod: method,
  };
}

/**
 * Validates skill provenance for integrity.
 *
 * @param provenance - The provenance to validate
 * @returns Result indicating success or validation error
 */
export function validateSkillProvenance(
  provenance: SkillProvenance
): Result<void, SkillSecurityError> {
  // Validate with Zod schema
  const parseResult = SkillProvenanceSchema.safeParse(provenance);
  if (!parseResult.success) {
    return err({
      code: 'INVALID_PROVENANCE',
      message: `Invalid provenance: ${parseResult.error.message}`,
      context: { zodError: parseResult.error.flatten() },
    });
  }

  // Check temporal consistency
  if (provenance.modifiedAt && provenance.modifiedAt < provenance.createdAt) {
    return err({
      code: 'INVALID_PROVENANCE',
      message: 'Modified date cannot be before created date',
      context: {
        createdAt: provenance.createdAt.toISOString(),
        modifiedAt: provenance.modifiedAt.toISOString(),
      },
    });
  }

  // Check version consistency
  if (
    typeof provenance.modifiedBy === 'string' &&
    provenance.modifiedBy.length > 0 &&
    provenance.version < 1
  ) {
    return err({
      code: 'INVALID_PROVENANCE',
      message: 'Version must be at least 1 if skill has been modified',
      context: { version: provenance.version, modifiedBy: provenance.modifiedBy },
    });
  }

  return ok(undefined);
}

/**
 * Checks if requested permissions are within the skill's permission boundary.
 *
 * @param capabilities - The skill's capability configuration
 * @param requestedPermissions - Permissions being requested for an operation
 * @returns True if all requested permissions are allowed
 */
export function checkPermissionBoundary(
  capabilities: SkillCapabilities,
  requestedPermissions: readonly SkillPermission[]
): boolean {
  const allowedSet = new Set(capabilities.permissions);
  return requestedPermissions.every((perm) => allowedSet.has(perm));
}

/**
 * Creates a security error with the given code and message.
 *
 * @param code - The error code
 * @param message - Human-readable error message
 * @param context - Additional context for debugging
 * @returns A SkillSecurityError
 */
export function createSecurityError(
  code: SecurityErrorCode,
  message: string,
  context?: Record<string, unknown>
): SkillSecurityError {
  // Use spread to include context only when defined (for exactOptionalPropertyTypes)
  return context !== undefined ? { code, message, context } : { code, message };
}

/**
 * Validates capabilities against security constraints.
 *
 * @param capabilities - The capabilities to validate
 * @returns Result indicating success or validation error
 */
export function validateCapabilities(
  capabilities: SkillCapabilities
): Result<void, SkillSecurityError> {
  const parseResult = SkillCapabilitiesSchema.safeParse(capabilities);
  if (!parseResult.success) {
    return err({
      code: 'PERMISSION_DENIED',
      message: `Invalid capabilities: ${parseResult.error.message}`,
      context: { zodError: parseResult.error.flatten() },
    });
  }

  // Non-sandboxed skills require explicit approval (spawn + network is dangerous)
  if (!capabilities.sandboxed) {
    const hasSpawn = capabilities.permissions.includes('spawn');
    const hasNetwork = capabilities.permissions.includes('network');
    if (hasSpawn && hasNetwork) {
      return err({
        code: 'SANDBOX_VIOLATION',
        message: 'Non-sandboxed skills cannot have both spawn and network permissions',
        context: { permissions: capabilities.permissions },
      });
    }
  }

  return ok(undefined);
}

/**
 * Validates RBAC configuration.
 *
 * @param rbac - The RBAC configuration to validate
 * @returns Result indicating success or validation error
 */
export function validateRBAC(rbac: SkillRBAC): Result<void, SkillSecurityError> {
  const parseResult = SkillRBACSchema.safeParse(rbac);
  if (!parseResult.success) {
    return err({
      code: 'ROLE_NOT_ALLOWED',
      message: `Invalid RBAC: ${parseResult.error.message}`,
      context: { zodError: parseResult.error.flatten() },
    });
  }

  // Check for overlap between allowed and denied roles
  if (rbac.deniedRoles) {
    const allowedSet = new Set(rbac.allowedRoles);
    const overlap = rbac.deniedRoles.filter((role) => allowedSet.has(role));
    if (overlap.length > 0) {
      return err({
        code: 'ROLE_NOT_ALLOWED',
        message: 'Roles cannot be both allowed and denied',
        context: { overlappingRoles: overlap },
      });
    }
  }

  return ok(undefined);
}

/**
 * Performs comprehensive security validation for skill execution.
 *
 * @param agentRole - The role of the agent attempting execution
 * @param capabilities - The skill's capabilities
 * @param rbac - The skill's RBAC configuration
 * @param requestedPermissions - Permissions needed for the operation
 * @returns Result indicating success or the first validation error
 */
export function validateSkillExecution(
  agentRole: AgentRole,
  capabilities: SkillCapabilities,
  rbac: SkillRBAC,
  requestedPermissions: readonly SkillPermission[]
): Result<void, SkillSecurityError> {
  // Validate capabilities
  const capResult = validateCapabilities(capabilities);
  if (!capResult.ok) {
    return capResult;
  }

  // Validate RBAC
  const rbacResult = validateRBAC(rbac);
  if (!rbacResult.ok) {
    return rbacResult;
  }

  // Check role authorization
  if (!canExecuteSkill(agentRole, rbac)) {
    return err({
      code: 'ROLE_NOT_ALLOWED',
      message: `Role '${agentRole}' is not authorized to execute this skill`,
      context: {
        agentRole,
        allowedRoles: rbac.allowedRoles,
        deniedRoles: rbac.deniedRoles,
      },
    });
  }

  // Check permission boundary
  if (!checkPermissionBoundary(capabilities, requestedPermissions)) {
    return err({
      code: 'PERMISSION_DENIED',
      message: 'Requested permissions exceed skill capabilities',
      context: {
        allowed: capabilities.permissions,
        requested: requestedPermissions,
      },
    });
  }

  return ok(undefined);
}
