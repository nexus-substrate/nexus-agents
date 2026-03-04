/* eslint-disable max-lines -- Cohesive doctor command module (governance: 400-600 OK if cohesive) */
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

import { existsSync, readFileSync, accessSync, constants as fsConstants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getTimeProvider, getErrorMessage } from '../core/index.js';
import {
  isPersistenceEnabled,
  LEARNING_DIR,
  OUTCOMES_FILE,
  RULES_FILE,
} from '../config/learning-persistence.js';
import { createAllAdapters } from '../cli-adapters/factory.js';
import type { CliName, HealthStatus, CapacityStatus } from '../cli-adapters/types.js';
import { DEFAULT_MODEL_CAPABILITIES } from '../config/model-capabilities.js';
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
 * Model availability advisory entry (#890).
 */
export interface ModelAdvisory {
  readonly modelId: string;
  readonly displayName: string;
  readonly cliName: string;
  readonly available: boolean;
  readonly reason: string;
}

/**
 * Learning persistence health check result (#1017).
 */
export interface LearningPersistenceCheck {
  readonly enabled: boolean;
  readonly dirExists: boolean;
  readonly dirWritable: boolean;
  readonly outcomeCount: number;
  readonly ruleCount: number;
  readonly rulesLastSaved: string | null;
  readonly error: string | null;
}

/**
 * Registry advisory summary (#890).
 */
export interface RegistryAdvisory {
  readonly totalModels: number;
  readonly availableModels: number;
  readonly unavailableModels: number;
  readonly models: readonly ModelAdvisory[];
}

/**
 * SQLite (better-sqlite3) availability check (#1249).
 */
export interface SqliteCheck {
  readonly available: boolean;
  readonly error: string | null;
}

/**
 * Data directory health check (#1249).
 * Reports status of ~/.nexus-agents/ and its subdirectories.
 */
export interface DataDirectoryCheck {
  readonly rootExists: boolean;
  readonly rootPath: string;
  readonly subdirectories: readonly DataSubdirStatus[];
}

/**
 * Status of a single data subdirectory.
 */
export interface DataSubdirStatus {
  readonly name: string;
  readonly path: string;
  readonly exists: boolean;
  readonly writable: boolean;
}

/** Standard data subdirectories under ~/.nexus-agents/. */
export const DATA_SUBDIRECTORIES = [
  'memory',
  'memory/beliefs',
  'learning',
  'sessions',
  'audit',
  'voting',
  'auth',
  'research',
  'checkpoints',
] as const;

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
  /** Model registry advisory — which models are available (#890). */
  readonly registryAdvisory: RegistryAdvisory;
  /** Learning persistence health check (#1017). */
  readonly learningPersistence: LearningPersistenceCheck;
  /** SQLite (better-sqlite3) availability (#1249). */
  readonly sqliteCheck: SqliteCheck;
  /** Data directory health (#1249). */
  readonly dataDirectory: DataDirectoryCheck;
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
      install: 'npm install -g @openai/codex',
      upgrade: 'npm update -g @openai/codex',
      auth: 'codex auth login',
    },
    opencode: {
      install: 'npm install -g opencode-ai',
      upgrade: 'npm update -g opencode-ai',
      auth: 'opencode auth login',
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
    opencode: 'CLI auth',
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
    } catch (capErr: unknown) {
      // Capacity check is optional — some adapters don't support it
      void capErr; // Logged at debug via adapter internals
    }

    return createHealthyResult(name, health, capacity);
  } catch (error) {
    const message = getErrorMessage(error);
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
 * Builds model registry advisory based on detected CLI availability (#890).
 */
function buildRegistryAdvisory(cliResults: CliCheckResult[]): RegistryAdvisory {
  const installedClis = new Set(cliResults.filter((c) => c.installed).map((c) => c.name));

  const models: ModelAdvisory[] = DEFAULT_MODEL_CAPABILITIES.models
    .filter((m) => m.cliName !== undefined)
    .map((m) => {
      const cliName = m.cliName ?? '';
      const available = cliName.length > 0 && installedClis.has(cliName as CliName);
      const reason = available ? `${cliName} CLI is installed` : `${cliName} CLI is not installed`;
      return { modelId: m.id, displayName: m.displayName, cliName, available, reason };
    });

  return {
    totalModels: models.length,
    availableModels: models.filter((m) => m.available).length,
    unavailableModels: models.filter((m) => !m.available).length,
    models,
  };
}

/** Counts non-empty lines in a JSONL file. Returns 0 if file doesn't exist. */
function countJsonlLines(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0).length;
}

/** Reads rules snapshot metadata. Returns count and savedAt. */
function readRulesMetadata(filePath: string): { count: number; savedAt: string | null } {
  if (!existsSync(filePath)) return { count: 0, savedAt: null };
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const rules = raw['rules'];
    const saved = raw['savedAt'];
    return {
      count: Array.isArray(rules) ? rules.length : 0,
      savedAt: typeof saved === 'string' ? saved : null,
    };
  } catch {
    return { count: 0, savedAt: null };
  }
}

/** Checks if a directory exists and is writable. */
function checkDirAccess(dir: string): { exists: boolean; writable: boolean } {
  const exists = existsSync(dir);
  if (!exists) return { exists: false, writable: false };
  try {
    accessSync(dir, fsConstants.W_OK);
    return { exists: true, writable: true };
  } catch {
    return { exists: true, writable: false };
  }
}

const DISABLED_CHECK: LearningPersistenceCheck = {
  enabled: false,
  dirExists: false,
  dirWritable: false,
  outcomeCount: 0,
  ruleCount: 0,
  rulesLastSaved: null,
  error: null,
};

/** Checks learning persistence health (#1017). */
function checkLearningPersistence(): LearningPersistenceCheck {
  if (!isPersistenceEnabled()) return DISABLED_CHECK;
  try {
    const { exists: dirExists, writable: dirWritable } = checkDirAccess(LEARNING_DIR);
    const outcomeCount = countJsonlLines(OUTCOMES_FILE);
    const { count: ruleCount, savedAt: rulesLastSaved } = readRulesMetadata(RULES_FILE);
    return {
      enabled: true,
      dirExists,
      dirWritable,
      outcomeCount,
      ruleCount,
      rulesLastSaved,
      error: null,
    };
  } catch (error: unknown) {
    return {
      enabled: true,
      dirExists: false,
      dirWritable: false,
      outcomeCount: 0,
      ruleCount: 0,
      rulesLastSaved: null,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Checks if better-sqlite3 is available (#1249).
 * Memory backends (agentic, adaptive, typed, mobimem, decay) require it.
 */
async function checkSqlite(): Promise<SqliteCheck> {
  try {
    await import('better-sqlite3');
    return { available: true, error: null };
  } catch (error: unknown) {
    const msg = getErrorMessage(error);
    const isNotFound = msg.includes('Cannot find') || msg.includes('MODULE_NOT_FOUND');
    return {
      available: false,
      error: isNotFound
        ? 'better-sqlite3 not installed — 5 memory backends unavailable'
        : `better-sqlite3 load error: ${msg}`,
    };
  }
}

/**
 * Checks the ~/.nexus-agents/ data directory health (#1249).
 */
function checkDataDirectory(): DataDirectoryCheck {
  const rootPath = join(homedir(), '.nexus-agents');
  const rootExists = existsSync(rootPath);

  const subdirectories: DataSubdirStatus[] = DATA_SUBDIRECTORIES.map((name) => {
    const fullPath = join(rootPath, name);
    const exists = existsSync(fullPath);
    return { name, path: fullPath, exists, writable: exists && isWritable(fullPath) };
  });

  return { rootExists, rootPath, subdirectories };
}

/** Checks if a directory is writable by the current user. */
function isWritable(dirPath: string): boolean {
  try {
    accessSync(dirPath, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs the complete doctor check.
 */
export async function runDoctor(): Promise<DoctorResult> {
  const clis = await Promise.all([
    checkCli('claude'),
    checkCli('gemini'),
    checkCli('codex'),
    checkCli('opencode'),
  ]);
  const nodeVersion = checkNodeVersion();
  const apiKeys = checkApiKeys();
  const configFile = checkConfigFile();
  const mcpServerReady = checkMcpServerReady();
  const codexCheck = clis.find((c) => c.name === 'codex');
  const mcpClientReady = codexCheck?.installed ?? false;
  const registryAdvisory = buildRegistryAdvisory(clis);
  const learningPersistence = checkLearningPersistence();
  const sqliteCheck = await checkSqlite();
  const dataDirectory = checkDataDirectory();

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
    registryAdvisory,
    learningPersistence,
    sqliteCheck,
    dataDirectory,
    allHealthy,
    timestamp: new Date(getTimeProvider().now()),
  };
}

/** Doctor command options. */
export interface DoctorOptions {
  /** Auto-fix safe issues (run setup, generate config). */
  readonly fix?: boolean;
}

/**
 * Runs the doctor command and prints results.
 * Returns exit code (0 = healthy, 1 = issues found).
 */
export async function doctorCommand(options: DoctorOptions = {}): Promise<number> {
  const result = await runDoctor();
  printDoctorResults(result);

  if (options.fix === true) {
    await runDoctorFix(result);
  }

  return result.allHealthy ? 0 : 1;
}

/**
 * Auto-fixes safe issues found by doctor (#1254).
 * Only runs our own code — never execs external package managers.
 */
async function runDoctorFix(result: DoctorResult): Promise<void> {
  const writeLine = (text: string): void => {
    process.stdout.write(text + '\n');
  };

  writeLine('');
  writeLine('\x1b[1mAuto-fix\x1b[0m');
  writeLine('─'.repeat(40));

  let fixCount = 0;

  // Fix: data directories (missing or not writable)
  if (
    !result.dataDirectory.rootExists ||
    result.dataDirectory.subdirectories.some((d) => !d.exists || !d.writable)
  ) {
    const { runSetup } = await import('./setup-command.js');
    const setupResult = runSetup({
      skipMcp: true,
      skipRules: true,
      skipHooks: true,
      skipConfig: true,
      skipOpencode: true,
    });
    if (setupResult.success) {
      writeLine('✓ Created missing data directories');
      fixCount++;
    }
  }

  // Fix: config file
  if (!result.configFile.found) {
    const { runConfigInitSync } = await import('./setup-config.js');
    const configResult = runConfigInitSync(process.cwd(), false, false);
    if (configResult.success && configResult.created) {
      writeLine(`✓ Generated config: ${configResult.path}`);
      fixCount++;
    }
  }

  // Display-only: better-sqlite3
  if (!result.sqliteCheck.available) {
    writeLine('');
    writeLine('⚠ better-sqlite3 not installed (manual step required):');
    writeLine('  npm install -g better-sqlite3');
  }

  if (fixCount > 0) {
    writeLine('');
    writeLine(
      `\x1b[32m${String(fixCount)} issue(s) fixed.\x1b[0m Re-run \x1b[1mnexus-agents doctor\x1b[0m to verify.`
    );
  } else {
    writeLine('No auto-fixable issues found.');
  }
  writeLine('');
}

// Re-export printDoctorResults for backward compatibility
export { printDoctorResults } from './doctor-formatting.js';
