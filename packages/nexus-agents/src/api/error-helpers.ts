/**
 * API Error Helpers
 *
 * Centralized error response builders for REST API routes.
 * Provides consistent error formatting across all endpoints.
 *
 * @module api/error-helpers
 */

import { getTimeProvider } from '../core/index.js';
import type { ApiError } from './rest-types.js';

/**
 * API error codes.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'ORCHESTRATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'TIMEOUT';

/**
 * Options for creating an API error.
 */
export interface CreateErrorOptions {
  /** Request ID for tracing */
  readonly requestId: string;
  /** Error code */
  readonly code: ApiErrorCode;
  /** Human-readable error message */
  readonly message: string;
  /** Additional error details */
  readonly details?: Record<string, unknown>;
}

/**
 * Creates a standardized API error response.
 */
export function createApiError(options: CreateErrorOptions): ApiError {
  const { requestId, code, message, details } = options;
  return {
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
    requestId,
    timestamp: getTimeProvider().nowIso(),
  };
}

/**
 * Creates a validation error response.
 *
 * @param requestId - Request ID for tracing
 * @param issuesOrMessage - Validation issues (typically from Zod) or custom message string
 * @param message - Optional custom message (defaults to "Invalid request body")
 */
export function createValidationError(
  requestId: string,
  issuesOrMessage?: unknown,
  message?: string
): ApiError {
  // If only a string is passed, treat it as the message
  if (typeof issuesOrMessage === 'string' && message === undefined) {
    return createApiError({
      requestId,
      code: 'VALIDATION_ERROR',
      message: issuesOrMessage,
    });
  }

  // Otherwise treat it as issues
  return createApiError({
    requestId,
    code: 'VALIDATION_ERROR',
    message: message ?? 'Invalid request body',
    ...(issuesOrMessage !== undefined && { details: { issues: issuesOrMessage } }),
  });
}

/**
 * Creates an internal error response.
 *
 * @param requestId - Request ID for tracing
 * @param message - Error message
 */
export function createInternalError(requestId: string, message: string): ApiError {
  return createApiError({
    requestId,
    code: 'INTERNAL_ERROR',
    message,
  });
}

/**
 * Creates an orchestration error response.
 *
 * @param requestId - Request ID for tracing
 * @param message - Error message
 */
export function createOrchestrationError(requestId: string, message: string): ApiError {
  return createApiError({
    requestId,
    code: 'ORCHESTRATION_ERROR',
    message,
  });
}

/**
 * Creates a not found error response.
 *
 * @param requestId - Request ID for tracing
 * @param resource - Resource type that was not found
 * @param id - Resource ID that was not found
 */
export function createNotFoundError(requestId: string, resource: string, id: string): ApiError {
  return createApiError({
    requestId,
    code: 'NOT_FOUND',
    message: `${resource} not found: ${id}`,
    details: { resource, id },
  });
}

/**
 * Creates a timeout error response.
 *
 * @param requestId - Request ID for tracing
 * @param operation - Operation that timed out
 * @param timeoutMs - Timeout value in milliseconds
 */
export function createTimeoutError(
  requestId: string,
  operation: string,
  timeoutMs: number
): ApiError {
  return createApiError({
    requestId,
    code: 'TIMEOUT',
    message: `Operation timed out: ${operation}`,
    details: { operation, timeoutMs },
  });
}
