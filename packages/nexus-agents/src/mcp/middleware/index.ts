/**
 * nexus-agents/mcp - Middleware
 *
 * Common middleware for MCP tool handlers.
 */

// Validation. `validateToolOutput` / `createOutputValidator` were removed
// in #3022 — see validation.ts for the activate-or-delete rationale.
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
  type AuthenticatedUser,
  type CallerInfo,
  type RequestContext,
  type CreateContextOptions,
  // Functions
  generateRequestId,
  generateSessionId,
  createRequestContext,
  deriveTrustTier,
  extractCallerInfo,
  contextForLogging,
  isRequestContext,
} from './request-context.js';

// Authentication handler (Issue #739)
export {
  // Types
  type AuthResult,
  type AuthHandlerConfig,
  // Classes
  AuthHandler,
  // Functions
  getDefaultTokenPath,
  generateSecureToken,
  readStoredToken,
  writeToken,
  validateToken,
  extractBearerToken,
  createAuthHandler,
  createUnauthorizedResponse,
} from './auth-handler.js';

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
  toSdkCallback,
} from './tool-wrapper.js';

// Tool input sanitizer (Issue #828 — untrusted input hardening)
export {
  // Types
  type SanitizeToolInputResult,
  // Functions
  sanitizeToolInput,
  logSanitizationResult,
} from './tool-input-sanitizer.js';

// Tool usage metrics (Issue #1022)
export {
  // Types
  type ToolMetric,
  type ToolStats,
  // Functions
  recordToolMetric,
  getToolMetrics,
  getToolStats,
  clearToolMetrics,
  createMetricsMiddleware,
} from './tool-metrics.js';

// Tool error handler (Issue #1144 — DRY error handling)
export { toolErrorResponse, withToolError } from './tool-error-handler.js';

// Spawn depth guard (Issue #1500)
export { MAX_SPAWN_DEPTH, getCurrentDepth, withDepthGuard } from './spawn-depth-guard.js';

// Per-tool rate limiter factory (Issue #274 Phase 2)
export {
  // Types
  type ToolRateLimiterFactoryConfig,
  // Classes
  ToolRateLimiterFactory,
  // Functions
  createToolRateLimiterFactory,
  getGlobalToolRateLimiterFactory,
  setGlobalToolRateLimiterFactory,
  resetGlobalToolRateLimiterFactory,
} from './tool-rate-limiter.js';

export {
  getGlobalPolicyFirewall,
  setGlobalPolicyFirewall,
  resetGlobalPolicyFirewall,
  stagePolicyFirewallForRollout,
  POLICY_ENFORCE_ENV,
} from './policy-registry.js';
