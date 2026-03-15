/**
 * nexus-agents/agents - Skill Security Controls
 *
 * Security validation functions for the Voyager skill library.
 * Implements capability-based permissions, RBAC, provenance tracking,
 * and execution attestation for safe skill auto-loading.
 *
 * This module re-exports all types, constants, and schemas from:
 * - skill-security-types.ts (types, interfaces, constants)
 * - skill-security-schemas.ts (Zod validation schemas)
 *
 * @module agents/skills/skill-security
 * (Source: Issue #374, Phase 1)
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import type { Result } from '../../core/result.js';
import { ok, err } from '../../core/result.js';
import { getTimeProvider } from '../../core/index.js';
import type { AgentRole } from '../../core/types/agent.js';

// Re-export types from skill-security-types.ts
export type {
  SkillPermission,
  SkillCapabilities,
  SkillRBAC,
  SkillProvenance,
  AuthorizationMethod,
  SkillAttestation,
  SecurityErrorCode,
  SkillSecurityError,
} from './skill-security-types.js';

export {
  SKILL_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  MAX_EXECUTION_TIME_MS,
  DEFAULT_EXECUTION_TIME_MS,
  DEFAULT_CAPABILITIES,
  DEFAULT_RBAC,
} from './skill-security-types.js';

// Re-export schemas from skill-security-schemas.ts
export {
  SkillPermissionSchema,
  AgentRoleSchema,
  SkillCapabilitiesSchema,
  SkillRBACSchema,
  SkillProvenanceSchema,
  AuthorizationMethodSchema,
  SkillAttestationSchema,
  SecurityErrorCodeSchema,
  SkillSecurityErrorSchema,
} from './skill-security-schemas.js';

// Import types for use in this file
import type {
  SkillPermission,
  SkillCapabilities,
  SkillRBAC,
  SkillProvenance,
  AuthorizationMethod,
  SkillAttestation,
  SecurityErrorCode,
  SkillSecurityError,
} from './skill-security-types.js';

import {
  SkillProvenanceSchema,
  SkillCapabilitiesSchema,
  SkillRBACSchema,
} from './skill-security-schemas.js';

// ============================================================================
// RBAC Functions
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

// ============================================================================
// Attestation Functions
// ============================================================================

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
    timestamp: new Date(getTimeProvider().now()),
    inputHash: computeInputHash(input),
    authorized,
    authorizationMethod: method,
  };
}

// ============================================================================
// Provenance Validation
// ============================================================================

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
      context: { zodError: z.treeifyError(parseResult.error) },
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

// ============================================================================
// Permission Validation
// ============================================================================

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

// ============================================================================
// Error Creation
// ============================================================================

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

// ============================================================================
// Capability Validation
// ============================================================================

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
      context: { zodError: z.treeifyError(parseResult.error) },
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

// ============================================================================
// RBAC Validation
// ============================================================================

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
      context: { zodError: z.treeifyError(parseResult.error) },
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

// ============================================================================
// Comprehensive Execution Validation
// ============================================================================

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
