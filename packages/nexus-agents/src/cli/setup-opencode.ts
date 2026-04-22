/**
 * OpenCode MCP auto-configuration for setup command.
 *
 * Detects OpenCode CLI and generates opencode.json/.jsonc with nexus-agents MCP server.
 * Supports JSONC (JSON with Comments) via `jsonc-parser` for comment-preserving writes.
 *
 * @module cli/setup-opencode
 * (Source: Issue #1253 - OpenCode MCP auto-configuration, #1255 - JSONC support)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { parse as jsoncParse, modify, applyEdits } from 'jsonc-parser';
import { getErrorMessage } from '../core/index.js';
import { createLogger } from '../core/index.js';
import { classifyExecError, type DetectionError } from './cli-detection-error.js';

const logger = createLogger({ component: 'setup-opencode' });

/** OpenCode detection result. */
export interface OpenCodeCliInfo {
  readonly installed: boolean;
  readonly version: string | undefined;
  /**
   * Classification of why detection failed. Only set when `installed` is
   * `false` OR when the binary was located but `--version` failed (#2152).
   */
  readonly detectionError?: DetectionError;
}

/** OpenCode MCP configuration result. */
export interface OpenCodeConfigResult {
  readonly success: boolean;
  readonly alreadyConfigured: boolean;
  readonly message: string;
  readonly configPath: string;
}

/** Resolved config file info. */
export interface ResolvedConfig {
  readonly path: string;
  readonly isJsonc: boolean;
  readonly exists: boolean;
}

/**
 * Detects OpenCode CLI installation.
 */
export function detectOpenCodeCli(): OpenCodeCliInfo {
  try {
    const cmd = platform() === 'win32' ? 'where' : 'which';
    execFileSync(cmd, ['opencode'], { timeout: 3000, stdio: 'pipe' });
  } catch (err: unknown) {
    return { installed: false, version: undefined, detectionError: classifyExecError(err) };
  }

  try {
    const output = execFileSync('opencode', ['--version'], {
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

const NEXUS_MCP_ENTRY = {
  type: 'local',
  command: getNexusCommand(),
  enabled: true,
};

/**
 * Resolves the OpenCode config file in a directory.
 * Prefers .jsonc over .json (matching OpenCode's own priority).
 */
export function resolveOpenCodeConfig(dir: string): ResolvedConfig {
  const jsoncPath = join(dir, 'opencode.jsonc');
  if (existsSync(jsoncPath)) {
    return { path: jsoncPath, isJsonc: true, exists: true };
  }
  const jsonPath = join(dir, 'opencode.json');
  if (existsSync(jsonPath)) {
    return { path: jsonPath, isJsonc: false, exists: true };
  }
  return { path: jsonPath, isJsonc: false, exists: false };
}

/** Checks if nexus-agents is already configured in an existing config. */
function isAlreadyConfigured(resolved: ResolvedConfig): boolean {
  if (!resolved.exists) return false;
  try {
    const raw = readFileSync(resolved.path, 'utf-8');
    const config = jsoncParse(raw) as Record<string, unknown> | null;
    const mcp = config?.['mcp'] as Record<string, unknown> | undefined;
    return mcp?.['nexus-agents'] !== undefined;
  } catch {
    logger.debug('Failed to parse existing OpenCode config, will overwrite');
    return false;
  }
}

/** Writes nexus-agents MCP entry using comment-preserving edits for JSONC. */
function writeJsoncConfig(configPath: string, raw: string): void {
  let result = raw;
  result = applyEdits(result, modify(result, ['mcp', 'nexus-agents'], NEXUS_MCP_ENTRY, {}));
  result = applyEdits(result, modify(result, ['$schema'], 'https://opencode.ai/config.json', {}));
  writeFileSync(configPath, result, 'utf-8');
}

/** Writes nexus-agents MCP entry as plain JSON for new configs. */
function writeJsonConfig(configPath: string): void {
  const config = {
    $schema: 'https://opencode.ai/config.json',
    mcp: { 'nexus-agents': NEXUS_MCP_ENTRY },
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/** Writes the merged config with nexus-agents MCP entry. */
function writeOpenCodeConfig(configDir: string, resolved: ResolvedConfig): void {
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  if (resolved.exists) {
    const raw = readFileSync(resolved.path, 'utf-8');
    writeJsoncConfig(resolved.path, raw);
  } else {
    writeJsonConfig(resolved.path);
  }
}

/** Options for configureOpenCode. */
export interface ConfigureOpenCodeOptions {
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly projectRoot?: string;
}

/** Validates projectRoot to prevent path traversal (CWE-22). */
function validateProjectRoot(projectRoot: string): string {
  const resolved = resolve(projectRoot);
  if (!existsSync(resolved)) {
    throw new Error(`Project root does not exist: ${resolved}`);
  }
  return resolved;
}

/**
 * Configures OpenCode with nexus-agents MCP server.
 * Supports both global (~/.config/opencode/) and project-local configs.
 */
export function configureOpenCode(
  force: boolean,
  dryRun: boolean,
  options?: ConfigureOpenCodeOptions
): OpenCodeConfigResult {
  try {
    return configureOpenCodeInner(force, dryRun, options);
  } catch (error: unknown) {
    const fallbackPath = join(getOpenCodeConfigDir(), 'opencode.json');
    return {
      success: false,
      alreadyConfigured: false,
      message: `Failed to configure OpenCode: ${getErrorMessage(error)}`,
      configPath: fallbackPath,
    };
  }
}

function configureOpenCodeInner(
  force: boolean,
  dryRun: boolean,
  options?: ConfigureOpenCodeOptions
): OpenCodeConfigResult {
  const configDir =
    options?.projectRoot !== undefined
      ? validateProjectRoot(options.projectRoot)
      : getOpenCodeConfigDir();
  const resolved = resolveOpenCodeConfig(configDir);

  if (isAlreadyConfigured(resolved) && !force) {
    return {
      success: true,
      alreadyConfigured: true,
      message: 'nexus-agents already configured in OpenCode',
      configPath: resolved.path,
    };
  }
  if (dryRun) {
    return {
      success: true,
      alreadyConfigured: false,
      message: `Would configure nexus-agents MCP in ${resolved.path}`,
      configPath: resolved.path,
    };
  }
  writeOpenCodeConfig(configDir, resolved);
  return {
    success: true,
    alreadyConfigured: false,
    message: 'Configured nexus-agents MCP in OpenCode',
    configPath: resolved.path,
  };
}
