/**
 * nexus-agents setup environment detection
 *
 * Environment detection helpers for Claude CLI and project setup.
 *
 * @module cli/setup-environment
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import type {
  ClaudeCliInfo,
  McpConfigInfo,
  McpJsonConfig,
  ProjectInfo,
  ProjectType,
  EnvironmentInfo,
} from './setup-types.js';

/**
 * Parses Claude CLI version from output.
 */
function parseClaudeVersion(output: string): string | undefined {
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match?.[1];
}

/**
 * Detects if Claude CLI is installed and available.
 * Uses a 3-second timeout to avoid hanging in slow environments.
 */
export function detectClaudeCli(): ClaudeCliInfo {
  const configPath = join(homedir(), '.claude');
  const mcpJsonPath = join(configPath, 'mcp.json');

  try {
    const result = execSync('claude --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000, // 3 second timeout to avoid hanging
    });
    const version = parseClaudeVersion(result);

    return {
      installed: true,
      version,
      configPath,
      mcpJsonPath,
    };
  } catch {
    return {
      installed: false,
      version: undefined,
      configPath,
      mcpJsonPath,
    };
  }
}

/**
 * Detects existing MCP configuration.
 */
export function detectMcpConfig(mcpJsonPath: string): McpConfigInfo | undefined {
  if (!existsSync(mcpJsonPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(mcpJsonPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    const config = parsed as McpJsonConfig;
    const mcpServers = config.mcpServers ?? {};
    const servers = Object.keys(mcpServers);

    return {
      exists: true,
      path: mcpJsonPath,
      hasNexusAgents: servers.includes('nexus-agents'),
      servers,
    };
  } catch {
    return {
      exists: true,
      path: mcpJsonPath,
      hasNexusAgents: false,
      servers: [],
    };
  }
}

/** Checks for TypeScript in package.json devDependencies. */
function hasTypeScriptInPackageJson(root: string): boolean {
  try {
    const content = readFileSync(join(root, 'package.json'), 'utf-8');
    const parsed: unknown = JSON.parse(content);
    const pkg = parsed as Record<string, unknown>;
    const devDeps = pkg['devDependencies'] as Record<string, string> | undefined;
    return devDeps?.['typescript'] !== undefined;
  } catch {
    return false;
  }
}

/** Mapping of config files to project types. */
const CONFIG_FILE_TYPES: readonly [string, ProjectType][] = [
  ['tsconfig.json', 'typescript'],
  ['Cargo.toml', 'rust'],
  ['go.mod', 'go'],
  ['pyproject.toml', 'python'],
  ['setup.py', 'python'],
  ['pom.xml', 'java'],
  ['build.gradle', 'java'],
];

/**
 * Detects project type based on configuration files.
 */
export function detectProjectType(root: string): ProjectType {
  // Check config files
  for (const [file, type] of CONFIG_FILE_TYPES) {
    if (existsSync(join(root, file))) return type;
  }

  // Check package.json
  if (existsSync(join(root, 'package.json'))) {
    return hasTypeScriptInPackageJson(root) ? 'typescript' : 'javascript';
  }

  return 'unknown';
}

/**
 * Detects project information.
 */
export function detectProjectInfo(root: string): ProjectInfo {
  let packageName: string | undefined;

  if (existsSync(join(root, 'package.json'))) {
    try {
      const content = readFileSync(join(root, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content) as Record<string, unknown>;
      packageName = pkg['name'] as string | undefined;
    } catch {
      // Ignore parse errors
    }
  }

  return {
    root,
    hasPackageJson: existsSync(join(root, 'package.json')),
    hasClaudeMd: existsSync(join(root, 'CLAUDE.md')),
    hasClaudeRules: existsSync(join(root, '.claude', 'rules')),
    hasNexusConfig: existsSync(join(root, 'nexus-agents.yaml')),
    projectType: detectProjectType(root),
    packageName: packageName ?? basename(root),
  };
}

/**
 * Detects complete environment information.
 */
export function detectEnvironment(projectRoot: string): EnvironmentInfo {
  const claudeCli = detectClaudeCli();
  const existingMcpConfig = detectMcpConfig(claudeCli.mcpJsonPath);
  const projectInfo = detectProjectInfo(projectRoot);

  return {
    platform: process.platform,
    homeDir: homedir(),
    claudeCli,
    existingMcpConfig,
    projectInfo,
  };
}
