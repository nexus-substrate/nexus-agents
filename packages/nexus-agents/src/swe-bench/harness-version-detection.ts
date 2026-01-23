/**
 * nexus-agents/swe-bench - Harness Version Detection
 *
 * Version detection utilities for SWE-bench harness.
 *
 * @module swe-bench/harness-version-detection
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ILogger } from '../core/logger.js';
import {
  PYTHON_COMMAND,
  MAX_OUTPUT_BUFFER_BYTES,
  QUICK_COMMAND_TIMEOUT_MS,
} from './harness-executor-types.js';

const execAsync = promisify(exec);

/**
 * Gets the swebench package version.
 */
export async function getSwebenchVersion(logger?: ILogger): Promise<string | null> {
  try {
    const result = await execAsync(
      `${PYTHON_COMMAND} -c "import swebench; print(swebench.__version__)"`,
      { timeout: QUICK_COMMAND_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BUFFER_BYTES }
    );
    const version = result.stdout.trim();
    if (version) {
      logger?.debug('swebench version detected', { version });
      return version;
    }
  } catch (err) {
    logger?.debug('Failed to get swebench version', { error: String(err) });
  }
  return null;
}

/**
 * Gets the Python version.
 */
export async function getPythonVersion(logger?: ILogger): Promise<string | null> {
  try {
    const result = await execAsync(`${PYTHON_COMMAND} --version`, {
      timeout: QUICK_COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BUFFER_BYTES,
    });
    const match = result.stdout.trim().match(/Python\s+(\d+\.\d+\.\d+)/);
    if (match?.[1] !== undefined) {
      logger?.debug('Python version detected', { version: match[1] });
      return match[1];
    }
  } catch (err) {
    logger?.debug('Failed to get Python version', { error: String(err) });
  }
  return null;
}

/**
 * Gets the Docker version.
 */
export async function getDockerVersion(logger?: ILogger): Promise<string | null> {
  try {
    const result = await execAsync('docker version --format "{{.Server.Version}}"', {
      timeout: QUICK_COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BUFFER_BYTES,
    });
    const version = result.stdout.trim();
    if (version) {
      logger?.debug('Docker version detected', { version });
      return version;
    }
  } catch (err) {
    logger?.debug('Failed to get Docker version', { error: String(err) });
  }
  return null;
}
