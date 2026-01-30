/**
 * nexus-agents/mcp - Request Context Middleware
 *
 * Provides request ID generation and caller context tracking for MCP tools.
 * (Source: Issue #185 Phase 1 - Request context & PolicyFirewall integration)
 *
 * @module mcp/middleware/request-context
 */

import { randomBytes } from 'node:crypto';
import { getTimeProvider } from '../../core/index.js';

/**
 * Caller identification for audit trails.
 */
export interface CallerInfo {
  /** Client identifier (e.g., 'claude-cli', 'gemini-cli') */
  readonly clientId?: string;
  /** User agent string if available */
  readonly userAgent?: string;
  /** Session ID for request correlation */
  readonly sessionId?: string;
  /** IP address or transport identifier */
  readonly transport?: string;
}

/**
 * Request context for MCP tool invocations.
 * Immutable once created.
 */
export interface RequestContext {
  /** Unique request identifier (format: req_<16 hex chars>) */
  readonly requestId: string;
  /** Timestamp when request was received (ISO 8601, ET) */
  readonly timestamp: string;
  /** Tool being invoked */
  readonly toolName: string;
  /** Caller information for audit */
  readonly caller: CallerInfo;
  /** Trace ID for distributed tracing correlation */
  readonly traceId?: string;
  /** Parent span ID if part of a larger trace */
  readonly parentSpanId?: string;
}

/**
 * Options for creating a request context.
 */
export interface CreateContextOptions {
  /** Tool name being invoked */
  toolName: string;
  /** Optional caller information */
  caller?: CallerInfo;
  /** Optional trace ID for correlation */
  traceId?: string;
  /** Optional parent span ID */
  parentSpanId?: string;
}

/**
 * Generates a cryptographically secure request ID.
 * Format: req_<16 hex characters>
 *
 * @returns Unique request identifier
 */
export function generateRequestId(): string {
  const bytes = randomBytes(8);
  return `req_${bytes.toString('hex')}`;
}

/**
 * Generates a session ID for request correlation.
 * Format: sess_<12 hex characters>
 *
 * @returns Unique session identifier
 */
export function generateSessionId(): string {
  const bytes = randomBytes(6);
  return `sess_${bytes.toString('hex')}`;
}

/**
 * Formats timestamp in ISO 8601 format with ET timezone.
 * (Source: CLAUDE.md - Time Authority section)
 */
function formatTimestamp(): string {
  const now = new Date(getTimeProvider().now());
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(now);
  const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? '-05:00';
  const base = now.toLocaleString('sv-SE', {
    timeZone: 'America/New_York',
    hour12: false,
  });
  return base.replace(' ', 'T') + offset.replace('GMT', '');
}

/**
 * Creates an immutable request context for an MCP tool invocation.
 *
 * @param options - Context creation options
 * @returns Immutable request context
 */
export function createRequestContext(options: CreateContextOptions): RequestContext {
  const context: RequestContext = {
    requestId: generateRequestId(),
    timestamp: formatTimestamp(),
    toolName: options.toolName,
    caller: options.caller ?? {},
    ...(options.traceId !== undefined && { traceId: options.traceId }),
    ...(options.parentSpanId !== undefined && { parentSpanId: options.parentSpanId }),
  };

  // Freeze to ensure immutability
  return Object.freeze(context);
}

/**
 * Extracts caller info from MCP transport metadata.
 * Currently supports extracting from request headers or environment.
 *
 * @param metadata - Optional transport metadata
 * @returns Caller information
 */
export function extractCallerInfo(metadata?: Record<string, unknown>): CallerInfo {
  const caller: CallerInfo = {};

  if (metadata !== undefined) {
    // Extract from metadata if available
    if (typeof metadata['clientId'] === 'string') {
      return { ...caller, clientId: metadata['clientId'] };
    }
    if (typeof metadata['userAgent'] === 'string') {
      return { ...caller, userAgent: metadata['userAgent'] };
    }
    if (typeof metadata['sessionId'] === 'string') {
      return { ...caller, sessionId: metadata['sessionId'] };
    }
  }

  // Fallback to environment variables for known CLI tools
  const claudeSession = process.env['CLAUDE_SESSION_ID'];
  if (claudeSession !== undefined) {
    return { ...caller, clientId: 'claude-cli', sessionId: claudeSession };
  }

  const geminiSession = process.env['GEMINI_SESSION_ID'];
  if (geminiSession !== undefined) {
    return { ...caller, clientId: 'gemini-cli', sessionId: geminiSession };
  }

  return caller;
}

/**
 * Formats request context for logging.
 * Extracts essential fields for log context.
 *
 * @param ctx - Request context
 * @returns Log-friendly context object
 */
export function contextForLogging(ctx: RequestContext): Record<string, unknown> {
  return {
    requestId: ctx.requestId,
    toolName: ctx.toolName,
    ...(ctx.caller.clientId !== undefined && { clientId: ctx.caller.clientId }),
    ...(ctx.traceId !== undefined && { traceId: ctx.traceId }),
  };
}

/**
 * Type guard to check if a value is a valid RequestContext.
 */
export function isRequestContext(value: unknown): value is RequestContext {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['requestId'] === 'string' &&
    obj['requestId'].startsWith('req_') &&
    typeof obj['timestamp'] === 'string' &&
    typeof obj['toolName'] === 'string' &&
    typeof obj['caller'] === 'object'
  );
}
