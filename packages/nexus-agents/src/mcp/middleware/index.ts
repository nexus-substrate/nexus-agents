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

// Timeout guard (CVE-2026-0621 mitigation)
export {
  TimeoutGuard,
  createDefaultTimeoutGuard,
  UriValidation,
  type TimeoutGuardConfig,
  type TimeoutError,
  type TimeoutErrorCode,
  type GuardedResult,
  type ExecuteOptions,
} from './timeout-guard.js';

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

// Request context (Issue #185 Phase 1)
export {
  // Types
  type CallerInfo,
  type RequestContext,
  type CreateContextOptions,
  // Functions
  generateRequestId,
  generateSessionId,
  createRequestContext,
  extractCallerInfo,
  contextForLogging,
  isRequestContext,
} from './request-context.js';

// Secure handler wrapper (Issue #185 Phase 1)
export {
  // Types
  type ToolResult,
  type ToolHandler,
  type SecureHandlerConfig,
  type HandlerContext,
  type ContextAwareHandler,
  // Functions
  createSecureHandler,
  createSecureHandlerFactory,
} from './secure-handler.js';

// Centralized middleware chain (Issue #189)
export {
  // Types
  type ToolResult as ChainToolResult,
  type MiddlewareContext,
  type Middleware,
  type MiddlewareChainConfig,
  type MiddlewareSkipConfig,
  type ToolHandler as ChainToolHandler,
  type ContextAwareToolHandler,
  // Functions
  createMiddlewareChain,
  withMiddleware,
  createMiddlewareFactory,
} from './middleware-chain.js';

// Tool wrapper helper (Issue #271, CVE-2026-0621)
export {
  // Types
  type ToolFactoryConfig,
  type ToolWrapperOptions,
  // Constants
  DEFAULT_TIMEOUT_CONFIG,
  // Functions
  createToolFactory,
  wrapToolWithTimeout,
} from './tool-wrapper.js';
