/**
 * nexus-agents/agents - Skill Security Types
 *
 * Type definitions, interfaces, and constants for skill security controls.
 * Implements capability-based permissions, RBAC, provenance tracking,
 * and execution attestation for safe skill auto-loading.
 *
 * @module agents/skills/skill-security-types
 * (Source: Issue #374, Phase 1)
 */

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
    'orchestrator',
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
