/**
 * nexus-agents/swe-bench - Environment Validator Types
 *
 * Type definitions and constants for SWE-bench environment validation.
 *
 * @module swe-bench/environment-validator-types
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Python environment validation result.
 */
export interface PythonValidation {
  /** Whether a compatible Python is available. */
  readonly available: boolean;
  /** Python version string (e.g., "3.10.12"). */
  readonly version?: string;
  /** Path to the Python executable. */
  readonly path?: string;
}

/**
 * SWE-bench package validation result.
 */
export interface SwebenchValidation {
  /** Whether swebench package is installed. */
  readonly installed: boolean;
  /** swebench version string. */
  readonly version?: string;
}

/**
 * Docker environment validation result.
 */
export interface DockerValidation {
  /** Whether Docker daemon is running. */
  readonly running: boolean;
  /** Docker version string. */
  readonly version?: string;
}

/**
 * Disk space validation result.
 */
export interface DiskSpaceValidation {
  /** Available disk space in bytes. */
  readonly available: number;
  /** Whether disk space is sufficient (>= 120GB). */
  readonly sufficient: boolean;
}

/**
 * Complete environment validation result.
 */
export interface EnvironmentValidationResult {
  /** Whether the environment is valid for SWE-bench evaluation. */
  readonly valid: boolean;
  /** Python environment validation. */
  readonly python: PythonValidation;
  /** SWE-bench package validation. */
  readonly swebench: SwebenchValidation;
  /** Docker environment validation. */
  readonly docker: DockerValidation;
  /** Disk space validation. */
  readonly diskSpace: DiskSpaceValidation;
  /** Critical errors that prevent evaluation. */
  readonly errors: readonly string[];
  /** Non-critical warnings. */
  readonly warnings: readonly string[];
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum Python version (inclusive). */
export const MIN_PYTHON_VERSION = [3, 10] as const;

/** Maximum Python version (exclusive - 3.12 is not supported). */
export const MAX_PYTHON_VERSION = [3, 12] as const;

/** Minimum recommended disk space in bytes (120GB). */
export const MIN_DISK_SPACE_BYTES = 120 * 1024 * 1024 * 1024;

/** Command timeout in milliseconds. */
export const COMMAND_TIMEOUT_MS = 10_000;

/** Bytes per gigabyte for conversions. */
export const BYTES_PER_GB = 1024 * 1024 * 1024;
