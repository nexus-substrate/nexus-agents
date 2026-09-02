/**
 * nexus-agents/mcp - Policy Firewall Types
 *
 * Type definitions for the authorization layer of MCP tool calls.
 *
 * (Source: OWASP ASVS 4.0, Authorization Controls)
 */

import { z } from 'zod';

import { SecurityError, type ILogger } from '../../core/index.js';

// =============================================================================
// Core Types
// =============================================================================

/**
 * Artifact type for policy context.
 * Artifacts are resources that can be referenced in policy decisions.
 */
export interface Artifact<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly value: T;
  readonly createdAt: Date;
}

/**
 * Execution mode for tool operations.
 * - 'read-only': Only read operations allowed (default)
 * - 'read-write': Both read and write operations allowed
 */
export type ExecutionMode = 'read-only' | 'read-write';

/**
 * Policy enforcement mode.
 * - 'enforce': Block denied operations
 * - 'warn': Log denials but allow execution (for migration)
 */
export type PolicyMode = 'enforce' | 'warn';

/**
 * Result of a policy evaluation.
 */
export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly requiredArtifact?: string;
  readonly ruleName?: string;
  /**
   * A rule denied this call and warn mode overrode the denial, so `allowed` is
   * `true` but the operation WOULD have been blocked in enforce mode (#4991).
   *
   * Set explicitly by the evaluator rather than inferred downstream. The first
   * implementation deduced it from `allowed === true && ruleName !== undefined`
   * — true of today's code, because `allowWithReason` never sets `ruleName` —
   * and a consensus panel rejected that: naming which rule *permitted* an
   * action (`admin-override` vs `default-allow`) is ordinary access-control
   * practice, so the day an allow rule sets `ruleName`, every authorized call
   * it covers would be silently recorded as a near-miss. Deriving a verdict
   * from the absence of an unrelated field is not a signal, it is a
   * coincidence.
   */
  readonly overriddenByWarnMode?: boolean;
}

/**
 * Context provided to policy rules for evaluation.
 */
export interface PolicyContext {
  readonly toolName: string;
  readonly args: unknown;
  readonly mode: ExecutionMode;
  readonly artifacts?: Map<string, Artifact>;
  readonly workflowId?: string;
  readonly allowedPaths?: readonly string[];
}

/**
 * A single policy rule that can approve or deny operations.
 */
export interface PolicyRule {
  readonly name: string;
  readonly description: string;
  check(ctx: PolicyContext): PolicyDecision;
}

/**
 * Interface for the policy firewall.
 */
export interface IPolicyFirewall {
  evaluate(ctx: PolicyContext): PolicyDecision;
  addRule(rule: PolicyRule): void;
  removeRule(name: string): boolean;
  getRules(): readonly PolicyRule[];
  setMode(mode: PolicyMode): void;
  getMode(): PolicyMode;
}

/**
 * Configuration for the policy firewall.
 */
export interface PolicyFirewallConfig {
  /** Enforcement mode (default: 'enforce') */
  readonly mode?: PolicyMode;
  /** Logger instance */
  readonly logger?: ILogger;
  /** Initial rules to register */
  readonly rules?: readonly PolicyRule[];
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Policy error for authorization failures.
 */
export class PolicyError extends SecurityError {
  readonly decision: PolicyDecision;

  constructor(message: string, decision: PolicyDecision) {
    super(message, {
      context: {
        allowed: decision.allowed,
        reason: decision.reason,
        ruleName: decision.ruleName,
        requiredArtifact: decision.requiredArtifact,
      },
    });
    this.name = 'PolicyError';
    this.decision = decision;
  }
}

// =============================================================================
// Zod Schemas for Configuration
// =============================================================================

/**
 * Schema for policy configuration.
 */
export const PolicyConfigSchema = z.object({
  defaultMode: z.enum(['read-only', 'read-write']).default('read-only'),
  policyMode: z.enum(['enforce', 'warn']).default('enforce'),
  allowedPaths: z.array(z.string()).default(['./']),
});

export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;
