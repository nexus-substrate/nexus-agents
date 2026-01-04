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
