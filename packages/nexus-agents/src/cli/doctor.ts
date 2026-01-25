/**
 * nexus-agents doctor command
 *
 * Health check utility for CLI integration validation.
 * Verifies CLI installations, versions, authentication, Node.js version,
 * API keys, configuration files, and MCP server readiness.
 *
 * (Source: Issue #91, cli-project_plan.md DevEx amendment)
 * (Source: Issue #422 - Doctor command validations)
 */

import { existsSync } from 'node:fs';
import { createAllAdapters } from '../cli-adapters/factory.js';
import type { CliName, HealthStatus, CapacityStatus } from '../cli-adapters/types.js';
import { createServer } from '../mcp/server.js';
import { printDoctorResults } from './doctor-formatting.js';

/** Required Node.js major version. */
const REQUIRED_NODE_MAJOR = 22;

/** API key environment variable names. */
const API_KEY_VARS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY'] as const;

/** Configuration file paths to check (in order of priority). */
const CONFIG_FILE_PATHS = ['./nexus-agents.yaml', './nexus-agents.yml'] as const;

/**
 * Check result for a single CLI.
 */
export interface CliCheckResult {
  readonly name: CliName;
  readonly installed: boolean;
  readonly version: string;
  readonly versionStatus: 'supported' | 'outdated' | 'unsupported' | 'breaking';
  readonly authenticated: boolean;
  readonly authMethod?: string;
  readonly capacity?: CapacityStatus;
  readonly error?: string;
  readonly fix?: string;
}

/**
 * Node.js version check result.
 */
export interface NodeVersionCheck {
  readonly version: string;
  readonly major: number;
  readonly supported: boolean;
}

/**
 * API key check result.
 */
export interface ApiKeyCheck {
  readonly name: string;
  readonly configured: boolean;
}

/**
 * Configuration file check result.
 */
export interface ConfigFileCheck {
  readonly found: boolean;
  readonly path: string | null;
}

/**
 * Complete doctor check results.
 */
export interface DoctorResult {
  readonly clis: CliCheckResult[];
  readonly nodeVersion: NodeVersionCheck;
  readonly apiKeys: ApiKeyCheck[];
  readonly configFile: ConfigFileCheck;
  readonly mcpServerReady: boolean;
  readonly mcpClientReady: boolean;
  readonly allHealthy: boolean;
  readonly timestamp: Date;
}

/**
 * Gets the CLI install/upgrade fix command.
 */
function getFixCommand(name: CliName, issue: 'install' | 'upgrade' | 'auth'): string {
  const commands: Record<CliName, Record<string, string>> = {
    claude: {
      install: 'npm install -g @anthropic-ai/claude-code',
      upgrade: 'npm update -g @anthropic-ai/claude-code',
      auth: 'claude auth login',
    },
    gemini: {
      install: 'npm install -g @google/gemini-cli',
      upgrade: 'npm update -g @google/gemini-cli',
      auth: 'gemini auth login',
    },
    codex: {
      install: 'npm install -g @openai/codex-cli',
      upgrade: 'npm update -g @openai/codex-cli',
      auth: 'codex auth login',
    },
  };
  return commands[name][issue] ?? '';
}

/**
 * Creates a result for when a CLI is not found.
 */
function createNotFoundResult(name: CliName, errorMsg: string): CliCheckResult {
  return {
    name,
    installed: false,
    version: 'N/A',
    versionStatus: 'unsupported',
    authenticated: false,
    error: errorMsg,
    fix: getFixCommand(name, 'install'),
  };
}

/**
 * Determines the authentication method based on CLI name.
 * CLIs use their own auth mechanisms - we report the method type
 * rather than assuming a specific one like 'OAuth'.
 */
function detectAuthMethod(name: CliName): string {
  const authMethods: Record<CliName, string> = {
    claude: 'CLI auth',
    gemini: 'ADC/CLI auth',
    codex: 'CLI auth',
  };
  return authMethods[name];
}

/**
 * Creates a result from a successful health check.
 */
function createHealthyResult(
  name: CliName,
  health: HealthStatus,
  capacity?: CapacityStatus
): CliCheckResult {
  const authenticated = health.healthy;

  const result: CliCheckResult = {
    name,
    installed: true,
    version: health.version,
    versionStatus: health.versionStatus,
    authenticated,
    ...(authenticated && { authMethod: detectAuthMethod(name) }),
    ...(capacity !== undefined && { capacity }),
  };

  if (health.message !== undefined && health.message !== '') {
    return { ...result, error: health.message };
  }
  if (!authenticated) {
    return { ...result, fix: getFixCommand(name, 'auth') };
  }
  if (health.versionStatus === 'outdated') {
    return { ...result, fix: getFixCommand(name, 'upgrade') };
  }

  return result;
}

/**
 * Runs health check on a single CLI adapter.
 */
async function checkCli(name: CliName): Promise<CliCheckResult> {
  const adapters = createAllAdapters();
  const adapter = adapters.get(name);

  if (!adapter) {
    return createNotFoundResult(name, 'Adapter not available');
  }

  try {
    const health: HealthStatus = await adapter.healthCheck();
    let capacity: CapacityStatus | undefined;

    try {
      capacity = await adapter.getCapacity();
    } catch {
      // Capacity check may fail, that's ok
    }

    return createHealthyResult(name, health, capacity);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isNotFound = message.includes('ENOENT') || message.includes('not found');
    return createNotFoundResult(name, isNotFound ? 'Not found in PATH' : message);
  }
}

/**
 * Checks the Node.js version against the required version.
 */
function checkNodeVersion(): NodeVersionCheck {
  const version = process.version;
  const major = Number(version.slice(1).split('.')[0]);
  return {
    version,
    major,
    supported: major >= REQUIRED_NODE_MAJOR,
  };
}

/**
 * Checks which API keys are configured in the environment.
 * Does NOT expose the actual key values - only reports presence.
 */
function checkApiKeys(): ApiKeyCheck[] {
  return API_KEY_VARS.map((name) => ({
    name,
    configured: typeof process.env[name] === 'string' && process.env[name] !== '',
  }));
}

/**
 * Checks for the existence of a configuration file.
 */
function checkConfigFile(): ConfigFileCheck {
  for (const configPath of CONFIG_FILE_PATHS) {
    if (existsSync(configPath)) {
      return { found: true, path: configPath };
    }
  }
  return { found: false, path: null };
}

/**
 * Validates that the MCP server can be created successfully.
 * This is a lightweight check that verifies server instantiation works.
 */
function checkMcpServerReady(): boolean {
  try {
    const result = createServer({ name: 'nexus-agents-doctor-check' });
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * Runs the complete doctor check.
 */
export async function runDoctor(): Promise<DoctorResult> {
  const clis = await Promise.all([checkCli('claude'), checkCli('gemini'), checkCli('codex')]);
  const nodeVersion = checkNodeVersion();
  const apiKeys = checkApiKeys();
  const configFile = checkConfigFile();
  const mcpServerReady = checkMcpServerReady();
  const codexCheck = clis.find((c) => c.name === 'codex');
  const mcpClientReady = codexCheck?.installed ?? false;

  // At least one API key configured or one CLI authenticated
  const hasAuthMethod =
    apiKeys.some((k) => k.configured) || clis.some((c) => c.installed && c.authenticated);

  const allHealthy =
    nodeVersion.supported &&
    hasAuthMethod &&
    mcpServerReady &&
    clis.every((c) => c.installed && c.authenticated && c.versionStatus !== 'unsupported');

  return {
    clis,
    nodeVersion,
    apiKeys,
    configFile,
    mcpServerReady,
    mcpClientReady,
    allHealthy,
    timestamp: new Date(),
  };
}

/**
 * Runs the doctor command and prints results.
 * Returns exit code (0 = healthy, 1 = issues found).
 */
export async function doctorCommand(): Promise<number> {
  const result = await runDoctor();
  printDoctorResults(result);
  return result.allHealthy ? 0 : 1;
}

// Re-export printDoctorResults for backward compatibility
export { printDoctorResults } from './doctor-formatting.js';
