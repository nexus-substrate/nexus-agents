/**
 * nexus-agents/swe-bench - Environment Validator
 *
 * Validates that the local environment meets SWE-bench evaluation requirements:
 * - Python 3.10 or 3.11 (not 3.12+ due to swebench compatibility)
 * - swebench package installed
 * - Docker daemon running
 * - Sufficient disk space (120GB recommended)
 *
 * @module swe-bench/environment-validator
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';

// Re-export types for backward compatibility
export type {
  PythonValidation,
  SwebenchValidation,
  DockerValidation,
  DiskSpaceValidation,
  EnvironmentValidationResult,
} from './environment-validator-types.js';

// Re-export validation functions for backward compatibility
export {
  validatePython,
  validateSwebench,
  validateDocker,
  validateDiskSpace,
} from './environment-validator-checks.js';

// Import for internal use
import type {
  PythonValidation,
  SwebenchValidation,
  DockerValidation,
  DiskSpaceValidation,
  EnvironmentValidationResult,
} from './environment-validator-types.js';
import {
  validatePython,
  validateSwebench,
  validateDocker,
  validateDiskSpace,
  collectErrors,
  collectWarnings,
  bytesToGB,
} from './environment-validator-checks.js';

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validates the complete environment for SWE-bench evaluation.
 */
export async function validateEnvironment(logger?: ILogger): Promise<EnvironmentValidationResult> {
  const log = logger ?? createLogger({ component: 'environment-validator' });

  log.info('Validating SWE-bench environment');

  const [python, swebench, docker, diskSpace] = await Promise.all([
    validatePython(log),
    validateSwebench(log),
    validateDocker(log),
    validateDiskSpace(log),
  ]);

  const errors = collectErrors(python, swebench, docker);
  const warnings = collectWarnings(diskSpace);
  const valid = errors.length === 0;

  if (valid) {
    log.info('Environment validation passed', {
      pythonVersion: python.version,
      swebenchVersion: swebench.version,
      dockerVersion: docker.version,
    });
  } else {
    log.error('Environment validation failed', new Error(errors.join('; ')), {
      errorCount: errors.length,
      warningCount: warnings.length,
    });
  }

  return { valid, python, swebench, docker, diskSpace, errors, warnings };
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Formats Python validation status line.
 */
function formatPythonLine(python: PythonValidation): string {
  const status = python.available ? 'OK' : 'FAIL';
  const info = python.available
    ? `${python.version ?? 'unknown'} (${python.path ?? 'unknown path'})`
    : 'Not found (need 3.10 or 3.11)';
  return `Python:    [${status}] ${info}`;
}

/**
 * Formats swebench validation status line.
 */
function formatSwebenchLine(swebench: SwebenchValidation): string {
  const status = swebench.installed ? 'OK' : 'FAIL';
  const info = swebench.installed ? (swebench.version ?? 'installed') : 'Not installed';
  return `swebench:  [${status}] ${info}`;
}

/**
 * Formats Docker validation status line.
 */
function formatDockerLine(docker: DockerValidation): string {
  const status = docker.running ? 'OK' : 'FAIL';
  const info = docker.running ? (docker.version ?? 'running') : 'Not running';
  return `Docker:    [${status}] ${info}`;
}

/**
 * Formats disk space validation status line.
 */
function formatDiskLine(diskSpace: DiskSpaceValidation): string {
  const status = diskSpace.sufficient ? 'OK' : 'WARN';
  const availableGB = bytesToGB(diskSpace.available);
  return `Disk:      [${status}] ${availableGB}GB available (120GB recommended)`;
}

/**
 * Formats errors section of the validation result.
 */
function formatErrorsSection(errors: readonly string[]): string[] {
  const lines: string[] = ['Status: NOT READY', '', 'Errors:'];
  for (const error of errors) {
    lines.push(`  - ${error}`);
  }
  return lines;
}

/**
 * Formats warnings section of the validation result.
 */
function formatWarningsSection(warnings: readonly string[]): string[] {
  const lines: string[] = ['', 'Warnings:'];
  for (const warning of warnings) {
    lines.push(`  - ${warning}`);
  }
  return lines;
}

/**
 * Formats validation result for display.
 */
export function formatValidationResult(result: EnvironmentValidationResult): string {
  const lines: string[] = [
    'SWE-bench Environment Validation',
    '================================',
    '',
    formatPythonLine(result.python),
    formatSwebenchLine(result.swebench),
    formatDockerLine(result.docker),
    formatDiskLine(result.diskSpace),
    '',
  ];

  if (result.valid) {
    lines.push('Status: READY for SWE-bench evaluation');
  } else {
    lines.push(...formatErrorsSection(result.errors));
  }

  if (result.warnings.length > 0) {
    lines.push(...formatWarningsSection(result.warnings));
  }

  return lines.join('\n');
}
