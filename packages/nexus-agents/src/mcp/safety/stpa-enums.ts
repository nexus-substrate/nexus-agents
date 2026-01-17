/**
 * nexus-agents/mcp/safety - STPA Enum Definitions
 *
 * Enum definitions extracted to avoid circular dependencies.
 * This file has no imports and can be safely imported by both
 * stpa-types.ts and stpa-schemas.ts.
 *
 * @module mcp/safety/stpa-enums
 */

// =============================================================================
// Hazard Categories
// =============================================================================

/**
 * Categories of hazards that MCP tools can introduce.
 * Each category represents a class of potential system-level harm.
 */
export enum HazardCategory {
  /** Loss or corruption of user data */
  DATA_LOSS = 'data_loss',
  /** Unauthorized elevation of access rights */
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  /** Exhaustion of system resources (CPU, memory, disk, network) */
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  /** Unauthorized exposure of sensitive information */
  INFORMATION_DISCLOSURE = 'information_disclosure',
  /** Execution of unauthorized or malicious commands */
  UNAUTHORIZED_EXECUTION = 'unauthorized_execution',
  /** Violation of system integrity boundaries */
  INTEGRITY_VIOLATION = 'integrity_violation',
  /** Denial of service through malformed input or overload */
  DENIAL_OF_SERVICE = 'denial_of_service',
  /** Injection of malicious content or commands */
  INJECTION = 'injection',
}

// =============================================================================
// Severity and Likelihood
// =============================================================================

/**
 * Severity levels for potential hazards.
 */
export enum HazardSeverity {
  /** Catastrophic - system-wide impact, data loss, security breach */
  CRITICAL = 'critical',
  /** Serious - significant impact, partial data loss, degraded security */
  HIGH = 'high',
  /** Moderate - limited impact, recoverable */
  MEDIUM = 'medium',
  /** Minor - minimal impact, easily recoverable */
  LOW = 'low',
}

/**
 * Likelihood levels for hazard occurrence.
 */
export enum HazardLikelihood {
  /** Almost certain to occur under normal conditions */
  ALMOST_CERTAIN = 'almost_certain',
  /** Likely to occur during typical usage */
  LIKELY = 'likely',
  /** Possible under certain conditions */
  POSSIBLE = 'possible',
  /** Unlikely but not impossible */
  UNLIKELY = 'unlikely',
  /** Very rare, requires exceptional circumstances */
  RARE = 'rare',
}

// =============================================================================
// Unsafe Control Action Types
// =============================================================================

/**
 * Types of unsafe control actions in STPA terminology.
 * These represent the four ways a control action can be unsafe.
 */
export enum UnsafeControlActionType {
  /** Control action not provided when needed */
  NOT_PROVIDED = 'not_provided',
  /** Control action provided when not needed (causes hazard) */
  PROVIDED_CAUSES_HAZARD = 'provided_causes_hazard',
  /** Control action provided too early, too late, or out of order */
  WRONG_TIMING = 'wrong_timing',
  /** Control action stopped too soon or applied too long */
  WRONG_DURATION = 'wrong_duration',
}

// =============================================================================
// Constraint Types
// =============================================================================

/**
 * How a safety constraint is enforced.
 */
export enum ConstraintEnforcement {
  /** Prevent the action entirely */
  PREVENT = 'prevent',
  /** Require additional confirmation */
  REQUIRE_CONFIRMATION = 'require_confirmation',
  /** Log and alert but allow */
  ALERT = 'alert',
  /** Sanitize inputs before proceeding */
  SANITIZE = 'sanitize',
  /** Rate limit the action */
  RATE_LIMIT = 'rate_limit',
  /** Require specific privileges */
  REQUIRE_PRIVILEGE = 'require_privilege',
}

/**
 * Priority levels for constraint evaluation.
 */
export enum ConstraintPriority {
  /** Must be evaluated first, blocks all else */
  CRITICAL = 1,
  /** High priority, evaluated early */
  HIGH = 2,
  /** Normal priority */
  NORMAL = 3,
  /** Low priority, evaluated last */
  LOW = 4,
}

// =============================================================================
// Risk Levels
// =============================================================================

/**
 * Risk level classification based on risk score.
 */
export enum RiskLevel {
  /** Score 0-20: Minimal risk */
  MINIMAL = 'minimal',
  /** Score 21-40: Low risk */
  LOW = 'low',
  /** Score 41-60: Moderate risk */
  MODERATE = 'moderate',
  /** Score 61-80: High risk */
  HIGH = 'high',
  /** Score 81-100: Critical risk */
  CRITICAL = 'critical',
}
