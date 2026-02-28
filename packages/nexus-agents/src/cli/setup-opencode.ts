/**
 * OpenCode MCP auto-configuration for setup command.
 *
 * Detects OpenCode CLI and generates opencode.json with nexus-agents MCP server.
 *
 * @module cli/setup-opencode
 * (Source: Issue #1253 - OpenCode MCP auto-configuration)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { getErrorMessage } from '../core/index.js';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'setup-opencode' });

/** OpenCode detection result. */
export interface OpenCodeCliInfo {
  readonly installed: boolean;
  readonly version: string | undefined;
}

/** OpenCode MCP configuration result. */
export interface OpenCodeConfigResult {
  readonly success: boolean;
  readonly alreadyConfigured: boolean;
  readonly message: string;
  readonly configPath: string;
}

/** OpenCode MCP server entry format. */
interface OpenCodeMcpEntry {
  readonly type: string;
  readonly command: readonly string[];
  readonly enabled: boolean;
}

/** OpenCode config format. */
interface OpenCodeConfig {
  readonly $schema?: string;
  readonly mcp?: Record<string, OpenCodeMcpEntry>;
}

/**
 * Detects OpenCode CLI installation.
 */
export function detectOpenCodeCli(): OpenCodeCliInfo {
  try {
    const cmd = platform() === 'win32' ? 'where' : 'which';
    execFileSync(cmd, ['opencode'], { timeout: 3000, stdio: 'pipe' });
  } catch {
    return { installed: false, version: undefined };
  }

  try {
    const output = execFileSync('opencode', ['--version'], {
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

/**
 * Resolves the OpenCode config directory path.
 * OpenCode uses ~/.config/opencode/ on Linux/macOS.
 */
function getOpenCodeConfigDir(): string {
  return join(homedir(), '.config', 'opencode');
}

/**
 * Resolves the path for nexus-agents CLI command.
 * Uses `npx nexus-agents` for portability.
 */
function getNexusCommand(): readonly string[] {
  return ['npx', 'nexus-agents', '--mode=server'];
}

/** Checks if nexus-agents is already configured in an existing opencode.json. */
function isAlreadyConfigured(configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
    return config.mcp?.['nexus-agents'] !== undefined;
  } catch {
    logger.debug('Failed to parse existing opencode.json, will overwrite');
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
function writeOpenCodeConfig(configDir: string, configPath: string): void {
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  const config = readExistingConfig(configPath);
  const mcp = (config['mcp'] ?? {}) as Record<string, unknown>;
  mcp['nexus-agents'] = { type: 'local', command: getNexusCommand(), enabled: true };
  config['$schema'] = 'https://opencode.ai/config.json';
  config['mcp'] = mcp;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Configures OpenCode with nexus-agents MCP server.
 *
 * @param force - Overwrite existing configuration.
 * @param dryRun - Report what would happen without writing.
 */
export function configureOpenCode(force: boolean, dryRun: boolean): OpenCodeConfigResult {
  const configDir = getOpenCodeConfigDir();
  const configPath = join(configDir, 'opencode.json');

  if (isAlreadyConfigured(configPath) && !force) {
    return {
      success: true,
      alreadyConfigured: true,
      message: 'nexus-agents already configured in OpenCode',
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
    writeOpenCodeConfig(configDir, configPath);
    return {
      success: true,
      alreadyConfigured: false,
      message: 'Configured nexus-agents MCP in OpenCode',
      configPath,
    };
  } catch (error: unknown) {
    return {
      success: false,
      alreadyConfigured: false,
      message: `Failed to configure OpenCode: ${getErrorMessage(error)}`,
      configPath,
    };
  }
}
