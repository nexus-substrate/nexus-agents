/**
 * nexus-agents/mcp - Policy Firewall Middleware
 *
 * Authorization layer for MCP tool calls. Evaluates policy rules
 * to determine whether operations should be allowed or denied.
 *
 * This is separate from validation - validation checks if input is well-formed,
 * policy checks if the operation is authorized.
 *
 * (Source: OWASP ASVS 4.0, Authorization Controls)
 */

import { createLogger, type ILogger, type Result, ok, err } from '../../core/index.js';

import type {
  Artifact,
  ExecutionMode,
  PolicyMode,
  PolicyDecision,
  PolicyContext,
  PolicyRule,
  IPolicyFirewall,
  PolicyFirewallConfig,
} from './policy-types.js';
import { PolicyError } from './policy-types.js';
import { denyMutationsWithoutModeRule, safePathsRule } from './policy-rules.js';

// =============================================================================
// PolicyFirewall Implementation
// =============================================================================

/**
 * Policy firewall that evaluates rules to authorize or deny operations.
 *
 * Rules are evaluated in order. The first rule that denies the operation
 * stops evaluation and returns the denial. If all rules pass, the operation
 * is allowed.
 *
 * @example
 * ```typescript
 * const firewall = new PolicyFirewall({ mode: 'enforce' });
 *
 * // Add rules
 * firewall.addRule(denyMutationsWithoutModeRule);
 * firewall.addRule(safePathsRule);
 *
 * // Evaluate
 * const decision = firewall.evaluate({
 *   toolName: 'write_file',
 *   args: { path: '/etc/passwd' },
 *   mode: 'read-only',
 * });
 *
 * if (!decision.allowed) {
 *   console.error(`Denied: ${decision.reason}`);
 * }
 * ```
 */
export class PolicyFirewall implements IPolicyFirewall {
  private readonly rules: PolicyRule[] = [];
  private mode: PolicyMode;
  private readonly logger: ILogger;

  constructor(config?: PolicyFirewallConfig) {
    this.mode = config?.mode ?? 'enforce';
    this.logger = config?.logger ?? createLogger({ component: 'policy-firewall' });

    // Register initial rules if provided
    if (config?.rules) {
      for (const rule of config.rules) {
        this.rules.push(rule);
      }
    }

    this.logger.debug('Policy firewall initialized', {
      mode: this.mode,
      ruleCount: this.rules.length,
    });
  }

  /**
   * Evaluates all policy rules against the given context.
   *
   * Rules are evaluated in order. The first rule that denies stops
   * evaluation and returns the denial decision.
   *
   * @param ctx - The policy context to evaluate
   * @returns The policy decision
   */
  evaluate(ctx: PolicyContext): PolicyDecision {
    this.logger.debug('Evaluating policy', {
      toolName: ctx.toolName,
      mode: ctx.mode,
      ruleCount: this.rules.length,
    });

    // If no rules, allow by default
    if (this.rules.length === 0) {
      return this.allowWithReason(ctx, 'No policy rules configured');
    }

    // Evaluate each rule in order
    for (const rule of this.rules) {
      const decision = rule.check(ctx);

      if (!decision.allowed) {
        return this.handleDenial(ctx, rule, decision);
      }
    }

    // All rules passed
    return this.allowWithReason(ctx, 'All policy rules passed');
  }

  /**
   * Creates an allow decision with the given reason and logs it.
   */
  private allowWithReason(ctx: PolicyContext, reason: string): PolicyDecision {
    const decision: PolicyDecision = { allowed: true, reason };
    this.logDecision(ctx, decision);
    return decision;
  }

  /**
   * Handles a rule denial, respecting warn mode if configured.
   */
  private handleDenial(
    ctx: PolicyContext,
    rule: PolicyRule,
    decision: PolicyDecision
  ): PolicyDecision {
    const denialDecision: PolicyDecision = {
      ...decision,
      ruleName: rule.name,
    };

    this.logDecision(ctx, denialDecision);

    // In warn mode, log but still allow
    if (this.mode === 'warn') {
      this.logger.warn('Policy denial overridden by warn mode', {
        toolName: ctx.toolName,
        ruleName: rule.name,
        reason: decision.reason,
      });
      return {
        allowed: true,
        reason: `[WARN MODE] Would be denied: ${decision.reason}`,
        ruleName: rule.name,
      };
    }

    return denialDecision;
  }

  /**
   * Adds a policy rule to the firewall.
   *
   * @param rule - The rule to add
   */
  addRule(rule: PolicyRule): void {
    // Prevent duplicate rules
    const existingIndex = this.rules.findIndex((r) => r.name === rule.name);
    if (existingIndex >= 0) {
      this.logger.warn('Replacing existing policy rule', { ruleName: rule.name });
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
      this.logger.debug('Policy rule added', { ruleName: rule.name });
    }
  }

  /**
   * Removes a policy rule by name.
   *
   * @param name - The name of the rule to remove
   * @returns True if the rule was found and removed
   */
  removeRule(name: string): boolean {
    const index = this.rules.findIndex((r) => r.name === name);
    if (index >= 0) {
      this.rules.splice(index, 1);
      this.logger.debug('Policy rule removed', { ruleName: name });
      return true;
    }
    return false;
  }

  /**
   * Gets all registered policy rules.
   *
   * @returns A readonly array of policy rules
   */
  getRules(): readonly PolicyRule[] {
    return [...this.rules];
  }

  /**
   * Sets the policy enforcement mode.
   *
   * @param mode - The new enforcement mode
   */
  setMode(mode: PolicyMode): void {
    const previousMode = this.mode;
    this.mode = mode;
    this.logger.info('Policy mode changed', { from: previousMode, to: mode });
  }

  /**
   * Gets the current policy enforcement mode.
   *
   * @returns The current mode
   */
  getMode(): PolicyMode {
    return this.mode;
  }

  /**
   * Logs a policy decision for audit purposes.
   */
  private logDecision(ctx: PolicyContext, decision: PolicyDecision): void {
    const logData = {
      toolName: ctx.toolName,
      mode: ctx.mode,
      workflowId: ctx.workflowId,
      allowed: decision.allowed,
      reason: decision.reason,
      ruleName: decision.ruleName,
    };

    if (decision.allowed) {
      this.logger.debug('Policy decision: ALLOWED', logData);
    } else {
      this.logger.warn('Policy decision: DENIED', logData);
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Creates a policy firewall with default rules.
 *
 * Default rules included:
 * - deny-mutations-without-mode
 * - safe-paths
 *
 * @param config - Optional configuration
 * @returns A configured PolicyFirewall instance
 */
export function createDefaultPolicyFirewall(config?: PolicyFirewallConfig): PolicyFirewall {
  const firewall = new PolicyFirewall(config);

  // Add default rules
  firewall.addRule(denyMutationsWithoutModeRule);
  firewall.addRule(safePathsRule);

  return firewall;
}

/**
 * Evaluates a policy context and returns a Result.
 *
 * This is a convenience function that wraps the firewall evaluation
 * in a Result type for easier error handling.
 *
 * @param firewall - The policy firewall to use
 * @param ctx - The policy context to evaluate
 * @returns Result containing void on success or PolicyError on denial
 */
export function evaluatePolicy(
  firewall: IPolicyFirewall,
  ctx: PolicyContext
): Result<void, PolicyError> {
  const decision = firewall.evaluate(ctx);

  if (decision.allowed) {
    return ok(undefined);
  }

  return err(new PolicyError(`Policy denied: ${decision.reason}`, decision));
}

/**
 * Creates a policy context from tool invocation parameters.
 *
 * @param toolName - Name of the tool being invoked
 * @param args - Tool arguments
 * @param options - Additional context options
 * @returns A PolicyContext object
 */
export function createPolicyContext(
  toolName: string,
  args: unknown,
  options?: {
    mode?: ExecutionMode;
    artifacts?: Map<string, Artifact>;
    workflowId?: string;
    allowedPaths?: readonly string[];
  }
): PolicyContext {
  // Build base context with required properties
  const base = {
    toolName,
    args,
    mode: options?.mode ?? 'read-only',
  };

  // Use Object.assign to build result, only adding optional properties
  // when they are actually defined (to satisfy exactOptionalPropertyTypes)
  const result: Record<string, unknown> = { ...base };

  if (options?.artifacts !== undefined) {
    result['artifacts'] = options.artifacts;
  }
  if (options?.workflowId !== undefined) {
    result['workflowId'] = options.workflowId;
  }
  if (options?.allowedPaths !== undefined) {
    result['allowedPaths'] = options.allowedPaths;
  }

  return result as unknown as PolicyContext;
}

// =============================================================================
// Re-exports for backward compatibility
// =============================================================================

export * from './policy-types.js';
export * from './policy-rules.js';
export * from './policy-helpers.js';
