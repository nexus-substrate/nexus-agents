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
