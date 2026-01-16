/**
 * nexus-agents/security/sandbox - Docker Sandbox Helper Functions
 *
 * Pure helper functions for Docker sandbox execution.
 * Extracted to keep main executor under 400 lines.
 *
 * @module security/sandbox/docker-sandbox-helpers
 * (Source: Issue #175, Alignment Roadmap Phase 4)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ResourceUsage, PolicyEvaluation } from './sandbox-types.js';

const execFileAsync = promisify(execFile);

/** Maximum output size to capture (1MB). */
export const MAX_OUTPUT_SIZE = 1024 * 1024;

/** Default Docker image for execution. */
export const DEFAULT_IMAGE = 'node:22-alpine';

/** Docker availability check result (cached). */
let dockerAvailableCache: boolean | null = null;

/**
 * Check if Docker is available on the system.
 */
export async function isDockerAvailable(): Promise<boolean> {
  if (dockerAvailableCache !== null) {
    return dockerAvailableCache;
  }

  try {
    await execFileAsync('docker', ['version'], { timeout: 5000 });
    dockerAvailableCache = true;
    return true;
  } catch {
    dockerAvailableCache = false;
    return false;
  }
}

/**
 * Reset Docker availability cache (for testing).
 */
export function resetDockerCache(): void {
  dockerAvailableCache = null;
}

/**
 * Convert bytes to Docker memory format.
 */
export function bytesToDockerMemory(bytes: number): string {
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  const KB = 1024;

  if (bytes >= GB) {
    return `${String(Math.floor(bytes / GB))}g`;
  }
  if (bytes >= MB) {
    return `${String(Math.floor(bytes / MB))}m`;
  }
  return `${String(Math.floor(bytes / KB))}k`;
}

/**
 * Truncate output if it exceeds the maximum size.
 */
export function truncateOutput(output: string, maxSize: number = MAX_OUTPUT_SIZE): string {
  if (output.length <= maxSize) return output;
  const truncated = output.slice(0, maxSize);
  return `${truncated}\n... [truncated ${String(output.length - maxSize)} bytes]`;
}

/**
 * Create empty resource usage record.
 */
export function createEmptyResourceUsage(): ResourceUsage {
  return {
    memoryBytes: 0,
    cpuTimeMs: 0,
    processCount: 0,
    outputBytes: 0,
    wallTimeMs: 0,
  };
}

/**
 * Parsed execution error details.
 */
export interface ParsedExecError {
  exitCode: number;
  stdout: string;
  stderr: string;
  isTimeout: boolean;
}

/**
 * Parse execution error from child process.
 */
export function parseExecError(error: unknown): ParsedExecError {
  const execError = error as {
    code?: number | string;
    stdout?: string;
    stderr?: string;
    message?: string;
    killed?: boolean;
  };

  return {
    exitCode: typeof execError.code === 'number' ? execError.code : 1,
    stdout: truncateOutput(execError.stdout ?? ''),
    stderr: truncateOutput(execError.stderr ?? execError.message ?? 'Unknown error'),
    isTimeout: execError.killed === true,
  };
}

/**
 * Create a denied result when policy prevents execution.
 */
export function createDeniedResult(
  evaluation: PolicyEvaluation,
  _durationMs: number
): {
  exitCode: number;
  stdout: string;
  stderr: string;
  resourceUsage: ResourceUsage;
} {
  return {
    exitCode: 126,
    stdout: '',
    stderr: `Sandbox policy denied execution: ${evaluation.reason ?? 'Unknown reason'}`,
    resourceUsage: createEmptyResourceUsage(),
  };
}

/**
 * Create result when Docker is not available.
 */
export function createDockerUnavailableResult(): {
  exitCode: number;
  stdout: string;
  stderr: string;
  resourceUsage: ResourceUsage;
} {
  return {
    exitCode: 127,
    stdout: '',
    stderr: 'Docker is not available. Install Docker to use container sandbox mode.',
    resourceUsage: createEmptyResourceUsage(),
  };
}

/**
 * Create resource usage from execution output.
 */
export function createResourceUsageFromOutput(
  stdout: string,
  stderr: string,
  durationMs: number
): ResourceUsage {
  return {
    memoryBytes: 0, // Docker doesn't report per-container easily
    cpuTimeMs: 0,
    processCount: 1,
    outputBytes: stdout.length + stderr.length,
    wallTimeMs: durationMs,
  };
}
