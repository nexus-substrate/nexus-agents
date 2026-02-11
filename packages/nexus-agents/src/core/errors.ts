/**
 * nexus-agents/core - Error Hierarchy
 *
 * Structured error classes for consistent error handling across the codebase.
 */

/**
 * Error codes for all Nexus Agents errors.
 */
export const ErrorCode = {
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  SCHEMA_ERROR: 'SCHEMA_ERROR',

  // Configuration errors
  CONFIG_ERROR: 'CONFIG_ERROR',
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
  CONFIG_INVALID: 'CONFIG_INVALID',

  // Model errors
  MODEL_ERROR: 'MODEL_ERROR',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  MODEL_RATE_LIMITED: 'MODEL_RATE_LIMITED',
  MODEL_TIMEOUT: 'MODEL_TIMEOUT',

  // Agent errors
  AGENT_ERROR: 'AGENT_ERROR',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_EXECUTION_FAILED: 'AGENT_EXECUTION_FAILED',

  // Agent failure categories (Source: arxiv:2509.25370 - Where LLM Agents Fail)
  AGENT_MEMORY_FAILURE: 'AGENT_MEMORY_FAILURE',
  AGENT_REFLECTION_FAILURE: 'AGENT_REFLECTION_FAILURE',
  AGENT_PLANNING_FAILURE: 'AGENT_PLANNING_FAILURE',
  AGENT_ACTION_FAILURE: 'AGENT_ACTION_FAILURE',

  // Workflow errors
  WORKFLOW_ERROR: 'WORKFLOW_ERROR',
  WORKFLOW_NOT_FOUND: 'WORKFLOW_NOT_FOUND',
  WORKFLOW_PARSE_ERROR: 'WORKFLOW_PARSE_ERROR',
  WORKFLOW_EXECUTION_FAILED: 'WORKFLOW_EXECUTION_FAILED',

  // Security errors
  SECURITY_ERROR: 'SECURITY_ERROR',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // System errors
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Serialized error format for JSON output.
 */
export interface SerializedError {
  name: string;
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
  cause?: SerializedError;
  stack?: string;
}

/**
 * Options for creating a NexusError.
 */
export interface NexusErrorOptions {
  code: ErrorCode;
  cause?: Error;
  context?: Record<string, unknown>;
}

/**
 * Base error class for all Nexus Agents errors.
 */
export class NexusError extends Error {
  readonly code: ErrorCode;
  readonly context: Record<string, unknown> | undefined;
  override readonly cause: Error | undefined;

  constructor(message: string, options: NexusErrorOptions) {
    super(message);
    this.name = 'NexusError';
    this.code = options.code;
    this.cause = options.cause;
    this.context = options.context;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serializes the error to a JSON-safe object.
   */
  toJSON(): SerializedError {
    const result: SerializedError = {
      name: this.name,
      code: this.code,
      message: this.message,
    };
    if (this.context !== undefined) {
      result.context = this.context;
    }
    if (this.cause instanceof NexusError) {
      result.cause = this.cause.toJSON();
    }
    if (this.stack !== undefined) {
      result.stack = this.stack;
    }
    return result;
  }
}

/**
 * Validation error for invalid inputs or schema violations.
 */
export class ValidationError extends NexusError {
  constructor(message: string, options?: Partial<Omit<NexusErrorOptions, 'code'>>) {
    super(message, { code: ErrorCode.VALIDATION_ERROR, ...options });
    this.name = 'ValidationError';
  }
}

/**
 * Configuration error for missing or invalid configuration.
 */
export class ConfigError extends NexusError {
  constructor(message: string, options?: Partial<Omit<NexusErrorOptions, 'code'>>) {
    super(message, { code: ErrorCode.CONFIG_ERROR, ...options });
    this.name = 'ConfigError';
  }
}

/**
 * Model error for model adapter failures.
 */
export class ModelError extends NexusError {
  constructor(message: string, options?: Partial<Omit<NexusErrorOptions, 'code'>>) {
    super(message, { code: ErrorCode.MODEL_ERROR, ...options });
    this.name = 'ModelError';
  }
}

/**
 * Agent error for agent execution failures.
 */
export class AgentError extends NexusError {
  constructor(message: string, options?: Partial<Omit<NexusErrorOptions, 'code'>>) {
    super(message, { code: ErrorCode.AGENT_ERROR, ...options });
    this.name = 'AgentError';
  }
}

/**
 * Agent failure categories for structured error taxonomy.
 * (Source: arxiv:2509.25370 - Where LLM Agents Fail)
 *
 * These categories enable better failure analysis and targeted improvements:
 * - MEMORY: Failed to retrieve or store relevant context
 * - REFLECTION: Failed to properly self-evaluate or verify outputs
 * - PLANNING: Failed to create valid execution plan
 * - ACTION: Failed to execute planned action correctly
 * - SYSTEM: Infrastructure or external system failure
 */
export const AgentErrorCategory = {
  MEMORY: 'memory',
  REFLECTION: 'reflection',
  PLANNING: 'planning',
  ACTION: 'action',
  SYSTEM: 'system',
} as const;

export type AgentErrorCategory = (typeof AgentErrorCategory)[keyof typeof AgentErrorCategory];

/**
 * Options for creating a categorized agent failure error.
 */
export interface AgentFailureOptions extends Partial<Omit<NexusErrorOptions, 'code'>> {
  readonly category: AgentErrorCategory;
  readonly recoverable?: boolean;
  readonly retryable?: boolean;
  readonly suggestedAction?: string;
}

/**
 * Maps agent error category to error code.
 */
function categoryToErrorCode(category: AgentErrorCategory): ErrorCode {
  const codeMap: Record<AgentErrorCategory, ErrorCode> = {
    memory: ErrorCode.AGENT_MEMORY_FAILURE,
    reflection: ErrorCode.AGENT_REFLECTION_FAILURE,
    planning: ErrorCode.AGENT_PLANNING_FAILURE,
    action: ErrorCode.AGENT_ACTION_FAILURE,
    system: ErrorCode.INTERNAL_ERROR,
  };
  return codeMap[category];
}

/**
 * Structured agent failure error with category for analysis.
 * Enables failure pattern detection and targeted improvements.
 */
export class AgentFailureError extends NexusError {
  readonly category: AgentErrorCategory;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly suggestedAction: string | undefined;

  constructor(message: string, options: AgentFailureOptions) {
    super(message, {
      code: categoryToErrorCode(options.category),
      ...(options.cause !== undefined ? { cause: options.cause } : {}),
      ...(options.context !== undefined ? { context: options.context } : {}),
    });
    this.name = 'AgentFailureError';
    this.category = options.category;
    this.recoverable = options.recoverable ?? false;
    this.retryable = options.retryable ?? false;
    this.suggestedAction = options.suggestedAction;
  }

  override toJSON(): SerializedError & { category: AgentErrorCategory; recoverable: boolean } {
    return {
      ...super.toJSON(),
      category: this.category,
      recoverable: this.recoverable,
    };
  }
}

/**
 * Memory failure: agent failed to retrieve or store context.
 */
export class MemoryFailureError extends AgentFailureError {
  constructor(message: string, options?: Partial<Omit<AgentFailureOptions, 'category'>>) {
    super(message, {
      ...options,
      category: AgentErrorCategory.MEMORY,
      retryable: options?.retryable ?? true,
      suggestedAction: options?.suggestedAction ?? 'Verify context availability and retry',
    });
    this.name = 'MemoryFailureError';
  }
}

/**
 * Reflection failure: agent failed to self-evaluate or verify outputs.
 */
export class ReflectionFailureError extends AgentFailureError {
  constructor(message: string, options?: Partial<Omit<AgentFailureOptions, 'category'>>) {
    super(message, {
      ...options,
      category: AgentErrorCategory.REFLECTION,
      retryable: options?.retryable ?? true,
      suggestedAction: options?.suggestedAction ?? 'Request explicit verification step',
    });
    this.name = 'ReflectionFailureError';
  }
}

/**
 * Planning failure: agent failed to create valid execution plan.
 */
export class PlanningFailureError extends AgentFailureError {
  constructor(message: string, options?: Partial<Omit<AgentFailureOptions, 'category'>>) {
    super(message, {
      ...options,
      category: AgentErrorCategory.PLANNING,
      retryable: options?.retryable ?? true,
      suggestedAction: options?.suggestedAction ?? 'Simplify task or provide more constraints',
    });
    this.name = 'PlanningFailureError';
  }
}

/**
 * Action failure: agent failed to execute planned action correctly.
 */
export class ActionFailureError extends AgentFailureError {
  constructor(message: string, options?: Partial<Omit<AgentFailureOptions, 'category'>>) {
    super(message, {
      ...options,
      category: AgentErrorCategory.ACTION,
      retryable: options?.retryable ?? true,
      suggestedAction: options?.suggestedAction ?? 'Retry action or use alternative approach',
    });
    this.name = 'ActionFailureError';
  }
}

/**
 * Workflow error for workflow parsing or execution failures.
 */
export class WorkflowError extends NexusError {
  constructor(message: string, options?: Partial<Omit<NexusErrorOptions, 'code'>>) {
    super(message, { code: ErrorCode.WORKFLOW_ERROR, ...options });
    this.name = 'WorkflowError';
  }
}

/**
 * Security error for security violations.
 */
export class SecurityError extends NexusError {
  constructor(message: string, options?: Partial<Omit<NexusErrorOptions, 'code'>>) {
    super(message, { code: ErrorCode.SECURITY_ERROR, ...options });
    this.name = 'SecurityError';
  }
}

/**
 * Timeout error for operation timeouts.
 */
export class TimeoutError extends NexusError {
  constructor(message: string, options?: Partial<Omit<NexusErrorOptions, 'code'>>) {
    super(message, { code: ErrorCode.TIMEOUT_ERROR, ...options });
    this.name = 'TimeoutError';
  }
}

/**
 * Rate limit error for rate limiting violations.
 */
export class RateLimitError extends NexusError {
  constructor(message: string, options?: Partial<Omit<NexusErrorOptions, 'code'>>) {
    super(message, { code: ErrorCode.RATE_LIMIT_ERROR, ...options });
    this.name = 'RateLimitError';
  }
}

// ============================================================================
// Error Categories (ADR-0009)
// ============================================================================

/**
 * Error category for classifying errors by type.
 * Used for monitoring, error handling, and observability.
 * (Source: ADR-0009 - Error Class Hierarchy)
 */
export const ErrorCategory = {
  /** Input validation failures */
  VALIDATION: 'validation',
  /** Failed operations (retryable) */
  OPERATION: 'operation',
  /** Configuration issues */
  CONFIGURATION: 'configuration',
  /** External resource failures */
  RESOURCE: 'resource',
  /** Security violations */
  SECURITY: 'security',
  /** Internal/system errors */
  INTERNAL: 'internal',
} as const;

export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory];

/**
 * Operation error for failed operations that may be retryable.
 * Use for transient failures in internal operations.
 * (Source: ADR-0009 - Error Class Hierarchy)
 */
export class OperationError extends NexusError {
  readonly retryable: boolean;

  constructor(
    message: string,
    options?: Partial<Omit<NexusErrorOptions, 'code'>> & { retryable?: boolean }
  ) {
    super(message, { code: ErrorCode.INTERNAL_ERROR, ...options });
    this.name = 'OperationError';
    this.retryable = options?.retryable ?? true;
  }
}

/**
 * Resource error for external resource failures.
 * Use for failures interacting with external systems (APIs, databases, files).
 * (Source: ADR-0009 - Error Class Hierarchy)
 */
export class ResourceError extends NexusError {
  readonly resourceType: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: Partial<Omit<NexusErrorOptions, 'code'>> & {
      resourceType: string;
      retryable?: boolean;
    }
  ) {
    super(message, { code: ErrorCode.INTERNAL_ERROR, ...options });
    this.name = 'ResourceError';
    this.resourceType = options.resourceType;
    this.retryable = options.retryable ?? true;
  }
}

/**
 * Get the error category for an error.
 * Useful for monitoring and error handling.
 */
export function getErrorCategory(error: Error): ErrorCategory {
  if (error instanceof ValidationError) return ErrorCategory.VALIDATION;
  if (error instanceof ConfigError) return ErrorCategory.CONFIGURATION;
  if (error instanceof SecurityError) return ErrorCategory.SECURITY;
  if (error instanceof ResourceError) return ErrorCategory.RESOURCE;
  if (error instanceof OperationError) return ErrorCategory.OPERATION;
  if (error instanceof NexusError) return ErrorCategory.INTERNAL;
  return ErrorCategory.INTERNAL;
}

/**
 * Check if an error is retryable.
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof OperationError) return error.retryable;
  if (error instanceof ResourceError) return error.retryable;
  if (error instanceof AgentFailureError) return error.retryable;
  if (error instanceof RateLimitError) return true;
  if (error instanceof TimeoutError) return true;
  return false;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert an unknown error to an Error instance.
 * Useful for wrapping errors in Result types from try-catch blocks.
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Extract error message from unknown error type.
 * Safely converts any error value to a human-readable message string.
 *
 * @param error - Unknown error value
 * @param fallback - Fallback message if error has no message (default: 'Unknown error')
 * @returns Error message string
 *
 * @example
 * ```typescript
 * try {
 *   await doSomething();
 * } catch (error) {
 *   console.error('Failed:', getErrorMessage(error));
 * }
 * ```
 */
export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error === null || error === undefined) return fallback;
  if (typeof error === 'object') return extractObjectMessage(error, fallback);
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return String(error);
  }
  return fallback;
}

/** Extract message from an error-like object, falling back to JSON serialization. */
function extractObjectMessage(error: object, fallback: string): string {
  const errObj = error as Record<string, unknown>;
  if (typeof errObj['message'] === 'string') return errObj['message'];
  try {
    return JSON.stringify(error);
  } catch {
    return fallback;
  }
}
