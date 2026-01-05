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

import { z } from 'zod';

import {
  createLogger,
  type ILogger,
  type Result,
  ok,
  err,
  SecurityError,
} from '../../core/index.js';

// =============================================================================
// Types
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
      const decision: PolicyDecision = {
        allowed: true,
        reason: 'No policy rules configured',
      };
      this.logDecision(ctx, decision);
      return decision;
    }

    // Evaluate each rule in order
    for (const rule of this.rules) {
      const decision = rule.check(ctx);

      if (!decision.allowed) {
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
    }

    // All rules passed
    const allowDecision: PolicyDecision = {
      allowed: true,
      reason: 'All policy rules passed',
    };
    this.logDecision(ctx, allowDecision);
    return allowDecision;
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
// Default Policy Rules
// =============================================================================

/**
 * Tools that are considered write/mutation operations.
 */
const MUTATION_TOOLS = new Set([
  'write_file',
  'edit_file',
  'delete_file',
  'create_directory',
  'remove_directory',
  'execute_command',
  'run_shell',
  'bash',
  'create_expert',
  'run_workflow',
]);

/**
 * Tools that are considered read-only operations.
 */
const READ_ONLY_TOOLS = new Set([
  'read_file',
  'list_directory',
  'search_files',
  'get_status',
  'orchestrate',
  'delegate_to_model',
]);

/**
 * Checks if a tool is a mutation operation.
 */
function isMutationTool(toolName: string): boolean {
  // Check explicit mutation tools
  if (MUTATION_TOOLS.has(toolName)) {
    return true;
  }

  // Check explicit read-only tools
  if (READ_ONLY_TOOLS.has(toolName)) {
    return false;
  }

  // Default to treating unknown tools as mutations (safe default)
  return true;
}

/**
 * Policy rule that denies mutation operations when mode is 'read-only'.
 *
 * This ensures that write operations are only allowed when explicitly
 * enabled via the 'read-write' mode.
 */
export const denyMutationsWithoutModeRule: PolicyRule = {
  name: 'deny-mutations-without-mode',
  description: 'Blocks write operations unless mode is read-write',
  check(ctx: PolicyContext): PolicyDecision {
    // If mode is read-write, allow all operations
    if (ctx.mode === 'read-write') {
      return { allowed: true, reason: 'Read-write mode enabled' };
    }

    // Check if this is a mutation tool
    if (isMutationTool(ctx.toolName)) {
      return {
        allowed: false,
        reason: `Tool '${ctx.toolName}' is a mutation operation but mode is '${ctx.mode}'. Set mode to 'read-write' to enable.`,
      };
    }

    // Read-only tool in read-only mode is allowed
    return { allowed: true, reason: 'Read-only operation allowed' };
  },
};

/**
 * Validates a path against allowed roots.
 *
 * @param targetPath - The path to validate
 * @param allowedPaths - Array of allowed root paths
 * @returns True if the path is within an allowed root
 */
function isPathSafe(targetPath: string, allowedPaths: readonly string[]): boolean {
  // Normalize the target path
  const normalizedTarget = normalizePath(targetPath);

  // Check if any allowed path is a prefix of the target
  for (const allowed of allowedPaths) {
    const normalizedAllowed = normalizePath(allowed);
    if (normalizedTarget.startsWith(normalizedAllowed)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes a path by removing trailing slashes and handling relative paths.
 */
function normalizePath(p: string): string {
  // Remove trailing slashes
  let normalized = p.replace(/\/+$/, '');

  // Handle relative paths
  if (normalized === '.') {
    normalized = '';
  } else if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  // Ensure absolute-like comparison
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  return normalized;
}

/**
 * Extracts path from tool arguments if present.
 */
function extractPathFromArgs(args: unknown): string | undefined {
  if (args === null || typeof args !== 'object') {
    return undefined;
  }

  const argsObj = args as Record<string, unknown>;

  // Common path field names
  const pathFields = ['path', 'filePath', 'file_path', 'directory', 'dir', 'target'];

  for (const field of pathFields) {
    const value = argsObj[field];
    if (typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}

/**
 * Policy rule that validates paths against allowed roots.
 *
 * Prevents path traversal attacks by ensuring all file operations
 * target paths within configured allowed directories.
 */
export const safePathsRule: PolicyRule = {
  name: 'safe-paths',
  description: 'Validates paths against allowed root directories',
  check(ctx: PolicyContext): PolicyDecision {
    // Extract path from arguments
    const targetPath = extractPathFromArgs(ctx.args);

    // If no path in args, allow (not a file operation)
    if (targetPath === undefined) {
      return { allowed: true, reason: 'No path argument found' };
    }

    // Check for obvious path traversal attempts
    if (targetPath.includes('..')) {
      return {
        allowed: false,
        reason: `Path contains '..' which may indicate path traversal: ${targetPath}`,
      };
    }

    // Get allowed paths from context or use default
    const allowedPaths = ctx.allowedPaths ?? ['./'];

    // Validate path is within allowed roots
    if (!isPathSafe(targetPath, allowedPaths)) {
      return {
        allowed: false,
        reason: `Path '${targetPath}' is outside allowed directories: ${allowedPaths.join(', ')}`,
      };
    }

    return { allowed: true, reason: 'Path is within allowed directories' };
  },
};

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
