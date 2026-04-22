/**
 * Codex CLI MCP auto-configuration for setup command.
 *
 * Detects Codex CLI and registers nexus-agents MCP server
 * using `codex mcp add` CLI command.
 *
 * @module cli/setup-codex
 * (Source: Issue #1263 - Codex CLI MCP auto-configuration)
 */

import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';
import { getErrorMessage } from '../core/index.js';
import { createLogger } from '../core/index.js';
import { classifyExecError, type DetectionError } from './cli-detection-error.js';

const logger = createLogger({ component: 'setup-codex' });

/** Codex CLI detection result. */
export interface CodexCliInfo {
  readonly installed: boolean;
  readonly version: string | undefined;
  /**
   * Classification of why detection failed. Only set when `installed` is
   * `false` OR when the binary was located but `--version` failed (#2152).
   */
  readonly detectionError?: DetectionError;
}

/** Codex MCP configuration result. */
export interface CodexConfigResult {
  readonly success: boolean;
  readonly alreadyConfigured: boolean;
  readonly message: string;
}

/**
 * Detects Codex CLI installation.
 */
export function detectCodexCli(): CodexCliInfo {
  try {
    const cmd = platform() === 'win32' ? 'where' : 'which';
    execFileSync(cmd, ['codex'], { timeout: 3000, stdio: 'pipe' });
  } catch (err: unknown) {
    return { installed: false, version: undefined, detectionError: classifyExecError(err) };
  }

  try {
    const output = execFileSync('codex', ['--version'], {
      timeout: 5000,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    const match = /(\d+\.\d+\.\d+)/.exec(output);
    return { installed: true, version: match?.[1] };
  } catch (err: unknown) {
    return { installed: true, version: undefined, detectionError: classifyExecError(err) };
  }
}

/**
 * Checks if nexus-agents is already configured in Codex MCP.
 */
function isAlreadyConfigured(): boolean {
  try {
    const output = execFileSync('codex', ['mcp', 'list'], {
      timeout: 5000,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return output.includes('nexus-agents');
  } catch {
    return false;
  }
}

/**
 * Removes existing nexus-agents MCP configuration from Codex.
 */
function removeExisting(): void {
  try {
    execFileSync('codex', ['mcp', 'remove', 'nexus-agents'], {
      timeout: 5000,
      stdio: 'pipe',
    });
  } catch {
    logger.debug('Failed to remove existing Codex MCP config (may not exist)');
  }
}

/**
 * Adds nexus-agents MCP server to Codex CLI.
 *
 * Uses: codex mcp add nexus-agents -- npx nexus-agents --mode=server
 */
function addMcpServer(): CodexConfigResult {
  try {
    execFileSync(
      'codex',
      ['mcp', 'add', 'nexus-agents', '--', 'npx', 'nexus-agents', '--mode=server'],
      {
        timeout: 10000,
        stdio: 'pipe',
      }
    );
    return {
      success: true,
      alreadyConfigured: false,
      message: 'Configured nexus-agents MCP in Codex CLI',
    };
  } catch (error: unknown) {
    return {
      success: false,
      alreadyConfigured: false,
      message: `Failed to configure Codex: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Configures Codex CLI with nexus-agents MCP server.
 */
export function configureCodex(force: boolean, dryRun: boolean): CodexConfigResult {
  if (isAlreadyConfigured() && !force) {
    return {
      success: true,
      alreadyConfigured: true,
      message: 'nexus-agents already configured in Codex CLI',
    };
  }

  if (dryRun) {
    return {
      success: true,
      alreadyConfigured: false,
      message: 'Would configure nexus-agents MCP in Codex CLI',
    };
  }

  if (force && isAlreadyConfigured()) {
    removeExisting();
  }

  return addMcpServer();
}
