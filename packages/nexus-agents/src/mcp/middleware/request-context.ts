/**
 * nexus-agents/mcp - Request Context Middleware
 *
 * Provides request ID generation and caller context tracking for MCP tools.
 * (Source: Issue #185 Phase 1 - Request context & PolicyFirewall integration)
 *
 * @module mcp/middleware/request-context
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { getTimeProvider } from '../../core/index.js';
import type { TrustTier } from '../../security/trust-types.js';

/**
 * Authenticated user information.
 * (Source: Issue #739 - MCP authentication)
 */
export interface AuthenticatedUser {
  /** Unique user/client identifier */
  readonly id: string;
  /** Human-readable name (optional) */
  readonly name?: string;
  /** Granted permissions/scopes (optional) */
  readonly permissions?: readonly string[];
}

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
  /** Whether the request is authenticated (Issue #739) */
  readonly authenticated?: boolean;
  /** Authenticated user information (Issue #739) */
  readonly authenticatedUser?: AuthenticatedUser;
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
  /**
   * Trust tier for this request (Issue #828).
   * Derived from caller authentication state:
   * - '1' = Authenticated + known client, or stdio (local-only)
   * - '2' = Authenticated via network
   * - '3' = Unauthenticated network request
   * - '4' = Request with detected injection patterns (set by sanitizer)
   */
  readonly trustTier: TrustTier;
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
  /** Optional explicit trust tier override (defaults to derived from caller) */
  trustTier?: TrustTier;
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
 * Derives trust tier from caller authentication state (Issue #828).
 *
 * - Authenticated + known CLI client (claude, gemini, codex) → Tier 1
 * - stdio transport (local-only, no network) → Tier 1
 * - Authenticated via network → Tier 2
 * - Unauthenticated → Tier 3
 */
export function deriveTrustTier(caller: CallerInfo): TrustTier {
  const knownClients = ['claude-cli', 'gemini-cli', 'codex-cli'];

  if (caller.transport === 'stdio') return '1';

  if (caller.authenticated === true) {
    if (caller.clientId !== undefined && knownClients.includes(caller.clientId)) {
      return '1';
    }
    return '2';
  }

  return '3';
}

/**
 * Creates an immutable request context for an MCP tool invocation.
 *
 * @param options - Context creation options
 * @returns Immutable request context
 */
export function createRequestContext(options: CreateContextOptions): RequestContext {
  const caller = options.caller ?? {};
  const context: RequestContext = {
    requestId: generateRequestId(),
    timestamp: formatTimestamp(),
    toolName: options.toolName,
    caller,
    trustTier: options.trustTier ?? deriveTrustTier(caller),
    ...(options.traceId !== undefined && { traceId: options.traceId }),
    ...(options.parentSpanId !== undefined && { parentSpanId: options.parentSpanId }),
  };

  // Freeze to ensure immutability
  return Object.freeze(context);
}

/**
 * The request context for the call currently in flight (#4981).
 *
 * Exists because a tool call passes through two middleware implementations
 * that each used to mint their own `RequestContext`, producing two unlinked
 * `req_*` ids and two `Tool invocation started` pairs per call. Argument
 * threading cannot fix that: `createSecureHandler` returns a 1-arity function,
 * so the chain's arity dispatch drops `ctx`, and 1-arity intermediaries such
 * as the `withPrerequisite` wrappers sit between the layers on some tools.
 * An ambient channel survives both.
 *
 * This mirrors the AbortSignal and progress-context storages the chain already
 * uses, so it is the established idiom here rather than a new mechanism.
 */
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Runs `fn` with `context` as the ambient request context, so any nested layer
 * can adopt it instead of minting a second one.
 */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return requestContextStorage.run(context, fn);
}

/**
 * The ambient request context, or `undefined` when nothing established one.
 *
 * `undefined` is a real answer, not a failure: a caller that composes a secure
 * handler without the middleware chain — every direct test of it does — has no
 * outer context to inherit, and must mint its own.
 */
export function getCurrentRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
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
    // Extract all available fields from metadata
    const extracted: CallerInfo = {
      ...caller,
      ...(typeof metadata['clientId'] === 'string' ? { clientId: metadata['clientId'] } : {}),
      ...(typeof metadata['userAgent'] === 'string' ? { userAgent: metadata['userAgent'] } : {}),
      ...(typeof metadata['sessionId'] === 'string' ? { sessionId: metadata['sessionId'] } : {}),
    };

    // If any metadata was extracted, return it directly
    if (
      typeof metadata['clientId'] === 'string' ||
      typeof metadata['userAgent'] === 'string' ||
      typeof metadata['sessionId'] === 'string'
    ) {
      return extracted;
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
    trustTier: ctx.trustTier,
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
    typeof obj['caller'] === 'object' &&
    typeof obj['trustTier'] === 'string' &&
    ['1', '2', '3', '4'].includes(obj['trustTier'])
  );
}

/**
 * The request's trust tier ONLY when it was actually derived from caller
 * information (#4733).
 *
 * `createRequestContext` falls back to `caller = {}`, and `deriveTrustTier({})`
 * returns `'3'` — so an absent caller is indistinguishable from a genuinely
 * untrusted one at the reading end. Nothing in this tree supplies `callerInfo`
 * today (its only references are the declaration and one forward in
 * `secure-handler.ts`), so every tier is that fallback.
 *
 * Returning `undefined` for the fallback lets a consumer record `unmeasured`
 * rather than a constant that reads as a measurement. When a real
 * `callerInfo` producer lands this starts returning values without further
 * change.
 *
 * NOTE this is caller AUTHENTICATION (transport / authenticated / clientId),
 * not content provenance. A trusted client can submit hostile content. Consumers
 * wanting provenance need a different signal — `classifyTrust` is the closest,
 * but it requires a GitHub actor and does not apply to a bare goal string.
 */
export function measuredTrustTier(context: RequestContext): string | undefined {
  // `caller` is always set by `createRequestContext` (to `{}` at minimum), but
  // a partially-constructed context can omit it — and an absent caller is the
  // same condition as an empty one: nothing was measured.
  const caller: unknown = context.caller;
  if (typeof caller !== 'object' || caller === null) return undefined;

  // Gate on the fields `deriveTrustTier` actually reads, not on "the object has
  // any key at all" (#4738 review). `extractCallerInfo` can return
  // `{ sessionId }` or `{ userAgent }` alone; neither feeds the derivation, so
  // a non-empty check would have called the '3' fallback a measurement as soon
  // as a producer supplied only those — reintroducing the constant this
  // function exists to prevent, in the function that prevents it.
  // `clientId` is NOT sufficient, and including it was a bug in the previous
  // version of this guard: `deriveTrustTier` reads `clientId` only INSIDE the
  // `authenticated === true` branch, so `{ clientId: 'claude-cli' }` returns
  // the same '3' fallback as `{}`. The one in-tree producer,
  // `extractCallerInfo`, returns exactly that shape on its CLAUDE_SESSION_ID
  // path — so wiring it would have relabelled the constant as a measurement,
  // inside the function written to prevent exactly that.
  const info = caller as Partial<CallerInfo>;
  // `authenticated: false` counts: it is a measured fact ("we checked, they
  // are not authenticated"), which is different from the field being absent.
  const derivable = info.transport !== undefined || info.authenticated !== undefined;

  return derivable ? context.trustTier : undefined;
}
