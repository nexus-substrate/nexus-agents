/**
 * nexus-agents/mcp - Middleware
 *
 * Common middleware for MCP tool handlers.
 */

// Validation
export { validateToolInput, createValidator, isZodError } from './validation.js';

// Rate limiting
export {
  RateLimiter,
  createDefaultRateLimiter,
  type RateLimiterConfig,
  type RateLimiterState,
} from './rate-limiter.js';

// Logging
export {
  createMcpLogger,
  createToolLogger,
  logToolStart,
  logToolSuccess,
  logToolError,
  createTimer,
  withLogging,
  type McpLogContext,
} from './logging.js';

// Policy firewall
export {
  // Types
  type Artifact,
  type ExecutionMode,
  type PolicyMode,
  type PolicyDecision,
  type PolicyContext,
  type PolicyRule,
  type IPolicyFirewall,
  type PolicyFirewallConfig,
  type PolicyConfig,
  // Classes
  PolicyFirewall,
  PolicyError,
  // Schema
  PolicyConfigSchema,
  // Default rules
  denyMutationsWithoutModeRule,
  safePathsRule,
  // Factory functions
  createDefaultPolicyFirewall,
  evaluatePolicy,
  createPolicyContext,
} from './policy.js';
