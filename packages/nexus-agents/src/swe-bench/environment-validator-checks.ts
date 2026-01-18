/**
 * nexus-agents/swe-bench - Environment Validator Checks
 *
 * Individual validation functions for SWE-bench environment requirements:
 * - Python 3.10 or 3.11 (not 3.12+ due to swebench compatibility)
 * - swebench package installed
 * - Docker daemon running
 * - Sufficient disk space (120GB recommended)
 *
 * @module swe-bench/environment-validator-checks
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type {
  PythonValidation,
  SwebenchValidation,
  DockerValidation,
  DiskSpaceValidation,
} from './environment-validator-types.js';
import {
  MIN_PYTHON_VERSION,
  MAX_PYTHON_VERSION,
  MIN_DISK_SPACE_BYTES,
  COMMAND_TIMEOUT_MS,
  BYTES_PER_GB,
} from './environment-validator-types.js';

const execAsync = promisify(exec);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parses a version string into [major, minor, patch] tuple.
 */
export function parseVersion(versionStr: string): [number, number, number] | null {
  const match = versionStr.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;

  const major = match[1];
  const minor = match[2];
  const patch = match[3] ?? '0';

  if (major === undefined || minor === undefined) return null;

  return [parseInt(major, 10), parseInt(minor, 10), parseInt(patch, 10)];
}

/**
 * Checks if a Python version is compatible (3.10.x or 3.11.x).
 */
export function isPythonVersionCompatible(version: string): boolean {
  const parsed = parseVersion(version);
  if (!parsed) return false;

  const [major, minor] = parsed;
  const minOk =
    major > MIN_PYTHON_VERSION[0] ||
    (major === MIN_PYTHON_VERSION[0] && minor >= MIN_PYTHON_VERSION[1]);
  const maxOk =
    major < MAX_PYTHON_VERSION[0] ||
    (major === MAX_PYTHON_VERSION[0] && minor < MAX_PYTHON_VERSION[1]);

  return minOk && maxOk;
}

/**
 * Executes a shell command with timeout.
 */
export async function safeExec(
  command: string,
  timeoutMs: number = COMMAND_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string } | null> {
  try {
    const result = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return result;
  } catch {
    return null;
  }
}

/**
 * Converts bytes to a human-readable GB string.
 */
export function bytesToGB(bytes: number): string {
  return (bytes / BYTES_PER_GB).toFixed(1);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates Python environment.
 *
 * Checks for Python 3.10 or 3.11 (swebench doesn't support 3.12+).
 * Tries python3, python3.11, python3.10 in order.
 */
export async function validatePython(logger?: ILogger): Promise<PythonValidation> {
  const log = logger ?? createLogger({ component: 'environment-validator' });
  const pythonCommands = ['python3', 'python3.11', 'python3.10', 'python'];

  for (const cmd of pythonCommands) {
    const result = await safeExec(`${cmd} --version`);
    if (!result) continue;

    const versionMatch = result.stdout.trim().match(/Python\s+(\d+\.\d+\.\d+)/);
    if (!versionMatch) continue;

    const version = versionMatch[1];
    if (version === undefined) continue;

    if (isPythonVersionCompatible(version)) {
      const whichResult = await safeExec(`which ${cmd}`);
      const pathValue = whichResult?.stdout.trim();
      log.debug('Found compatible Python', { version, path: pathValue, command: cmd });

      // Build result object conditionally to satisfy exactOptionalPropertyTypes
      const validation: PythonValidation = { available: true, version };
      if (pathValue !== undefined && pathValue !== '') {
        return { ...validation, path: pathValue };
      }
      return validation;
    }

    log.debug('Python found but incompatible version', { version, command: cmd });
  }

  log.warn('No compatible Python found (need 3.10 or 3.11)');
  return { available: false };
}

/**
 * Validates swebench package installation.
 */
export async function validateSwebench(logger?: ILogger): Promise<SwebenchValidation> {
  const log = logger ?? createLogger({ component: 'environment-validator' });

  const result = await safeExec('python3 -c "import swebench; print(swebench.__version__)"');

  const importVersion = result?.stdout.trim();
  if (importVersion !== undefined && importVersion !== '') {
    log.debug('swebench package found', { version: importVersion });
    return { installed: true, version: importVersion };
  }

  const pipResult = await safeExec('pip3 show swebench');
  if (pipResult?.stdout.includes('Version:') === true) {
    const versionMatch = pipResult.stdout.match(/Version:\s*(\S+)/);
    const pipVersion = versionMatch?.[1];
    log.debug('swebench package found via pip', { version: pipVersion });
    if (pipVersion !== undefined) {
      return { installed: true, version: pipVersion };
    }
    return { installed: true };
  }

  log.warn('swebench package not found');
  return { installed: false };
}

/**
 * Validates Docker environment.
 */
export async function validateDocker(logger?: ILogger): Promise<DockerValidation> {
  const log = logger ?? createLogger({ component: 'environment-validator' });

  const versionResult = await safeExec('docker version --format "{{.Server.Version}}"');
  if (!versionResult) {
    log.warn('Docker not available or daemon not running');
    return { running: false };
  }

  const version = versionResult.stdout.trim();
  if (version) {
    log.debug('Docker available', { version });
    return { running: true, version };
  }

  const altResult = await safeExec('docker --version');
  if (altResult) {
    const match = altResult.stdout.match(/Docker version\s+(\S+)/);
    const altVersion = match?.[1];
    if (altVersion !== undefined) {
      log.debug('Docker available', { version: altVersion });
      return { running: true, version: altVersion };
    }
  }

  log.warn('Docker daemon not running');
  return { running: false };
}

/**
 * Validates available disk space.
 */
export async function validateDiskSpace(logger?: ILogger): Promise<DiskSpaceValidation> {
  const log = logger ?? createLogger({ component: 'environment-validator' });

  const result = await safeExec('df -B1 . | tail -1');
  if (!result) {
    log.warn('Could not determine disk space');
    return { available: 0, sufficient: false };
  }

  const parts = result.stdout.trim().split(/\s+/);
  const availableStr = parts[3];
  if (parts.length < 4 || availableStr === undefined) {
    log.warn('Unexpected df output format');
    return { available: 0, sufficient: false };
  }

  const available = parseInt(availableStr, 10);
  if (isNaN(available)) {
    log.warn('Could not parse available disk space');
    return { available: 0, sufficient: false };
  }

  const sufficient = available >= MIN_DISK_SPACE_BYTES;
  const availableGB = bytesToGB(available);

  if (sufficient) {
    log.debug('Disk space sufficient', { availableGB: `${availableGB}GB` });
  } else {
    log.warn('Low disk space', { availableGB: `${availableGB}GB`, requiredGB: '120GB' });
  }

  return { available, sufficient };
}

// ============================================================================
// Error Collection
// ============================================================================

/**
 * Collects validation errors based on results.
 */
export function collectErrors(
  python: PythonValidation,
  swebench: SwebenchValidation,
  docker: DockerValidation
): string[] {
  const errors: string[] = [];

  if (!python.available) {
    errors.push('Python 3.10 or 3.11 is required. Python 3.12+ is not supported by swebench.');
  }

  if (!swebench.installed) {
    errors.push('swebench package is not installed. Install with: pip install swebench');
  }

  if (!docker.running) {
    errors.push('Docker is not running. Start Docker daemon to run evaluations.');
  }

  return errors;
}

/**
 * Collects validation warnings based on results.
 */
export function collectWarnings(diskSpace: DiskSpaceValidation): string[] {
  const warnings: string[] = [];

  if (!diskSpace.sufficient && diskSpace.available > 0) {
    const availableGB = bytesToGB(diskSpace.available);
    warnings.push(
      `Low disk space: ${availableGB}GB available, 120GB recommended for SWE-bench Docker images.`
    );
  }

  return warnings;
}
