/**
 * Gemini CLI MCP auto-configuration for setup command.
 *
 * Detects Gemini CLI and configures ~/.gemini/settings.json with nexus-agents MCP server.
 *
 * @module cli/setup-gemini
 * (Source: Issue #1259 - Gemini CLI MCP auto-configuration)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { getErrorMessage } from '../core/index.js';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'setup-gemini' });

/** Gemini CLI detection result. */
export interface GeminiCliInfo {
  readonly installed: boolean;
  readonly version: string | undefined;
}

/** Gemini MCP configuration result. */
export interface GeminiConfigResult {
  readonly success: boolean;
  readonly alreadyConfigured: boolean;
  readonly message: string;
  readonly configPath: string;
}

/** Gemini MCP server entry format. */
interface GeminiMcpEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeout: number;
}

/**
 * Detects Gemini CLI installation.
 */
export function detectGeminiCli(): GeminiCliInfo {
  try {
    const cmd = platform() === 'win32' ? 'where' : 'which';
    execFileSync(cmd, ['gemini'], { timeout: 3000, stdio: 'pipe' });
  } catch {
    return { installed: false, version: undefined };
  }

  try {
    const output = execFileSync('gemini', ['--version'], {
      timeout: 5000,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    const match = /(\d+\.\d+\.\d+)/.exec(output);
    return { installed: true, version: match?.[1] };
  } catch {
    return { installed: true, version: undefined };
  }
}

/** Resolves the Gemini config directory path. */
function getGeminiConfigDir(): string {
  return join(homedir(), '.gemini');
}

/** Returns the nexus-agents MCP entry for Gemini settings.json. */
function getNexusMcpEntry(): GeminiMcpEntry {
  return {
    command: 'npx',
    args: ['nexus-agents', '--mode=server'],
    timeout: 30000,
  };
}

/** Checks if nexus-agents is already configured in settings.json. */
function isAlreadyConfigured(configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const servers = config['mcpServers'] as Record<string, unknown> | undefined;
    return servers?.['nexus-agents'] !== undefined;
  } catch {
    logger.debug('Failed to parse existing Gemini settings.json, will overwrite');
    return false;
  }
}

/** Reads existing config or returns empty object. */
function readExistingConfig(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Writes the merged config with nexus-agents MCP entry. */
function writeGeminiConfig(configDir: string, configPath: string): void {
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  const config = readExistingConfig(configPath);
  const servers = (config['mcpServers'] ?? {}) as Record<string, unknown>;
  servers['nexus-agents'] = getNexusMcpEntry();
  config['mcpServers'] = servers;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Configures Gemini CLI with nexus-agents MCP server.
 */
export function configureGemini(force: boolean, dryRun: boolean): GeminiConfigResult {
  const configDir = getGeminiConfigDir();
  const configPath = join(configDir, 'settings.json');

  if (isAlreadyConfigured(configPath) && !force) {
    return {
      success: true,
      alreadyConfigured: true,
      message: 'nexus-agents already configured in Gemini CLI',
      configPath,
    };
  }
  if (dryRun) {
    return {
      success: true,
      alreadyConfigured: false,
      message: `Would configure nexus-agents MCP in ${configPath}`,
      configPath,
    };
  }
  try {
    writeGeminiConfig(configDir, configPath);
    return {
      success: true,
      alreadyConfigured: false,
      message: 'Configured nexus-agents MCP in Gemini CLI',
      configPath,
    };
  } catch (error: unknown) {
    return {
      success: false,
      alreadyConfigured: false,
      message: `Failed to configure Gemini: ${getErrorMessage(error)}`,
      configPath,
    };
  }
}
