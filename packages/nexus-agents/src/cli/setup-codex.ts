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
import { getErrorMessage } from '../core/index.js';
import { createLogger } from '../core/index.js';
import { detectCliBinary, type CliDetectionInfo } from './setup-cli-detection.js';

const logger = createLogger({ component: 'setup-codex' });

/**
 * Codex CLI detection result.
 *
 * Type alias of {@link CliDetectionInfo} — kept as a named type for the
 * public API surface (re-exported from `cli/index.ts`). Identical shape
 * across all three CLI setups (#2155).
 */
export type CodexCliInfo = CliDetectionInfo;

/** Codex MCP configuration result. */
export interface CodexConfigResult {
  readonly success: boolean;
  readonly alreadyConfigured: boolean;
  readonly message: string;
}

/** Detects Codex CLI installation. Delegates to {@link detectCliBinary}. */
export function detectCodexCli(): CodexCliInfo {
  return detectCliBinary('codex');
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
