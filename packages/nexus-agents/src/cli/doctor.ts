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

import {
  existsSync,
  readFileSync,
  readdirSync,
  accessSync,
  constants as fsConstants,
} from 'node:fs';
import {
  getNexusDataDir,
  getNexusRepoDir,
  getPerRepoSubdirs,
  nexusDataPath,
} from '../config/nexus-data-dir.js';
import { detectSandbox } from '../config/sandbox-detection.js';
import { checkScratchFilesystems, type ScratchSpaceCheck } from './doctor-scratch-space.js';
import { getTimeProvider, getErrorMessage } from '../core/index.js';
import {
  isPersistenceEnabled,
  getLearningDir,
  getOutcomesFile,
  getRulesFile,
} from '../config/learning-persistence.js';
import { createAllAdapters } from '../cli-adapters/factory.js';
import type { CliName, HealthStatus, CapacityStatus } from '../cli-adapters/types.js';
import { getInTreeCapabilitiesMatrix } from '../config/model-config-helpers.js';
import { createServer } from '../mcp/server.js';
import { readOpenAICompatEnv } from '../adapters/openai-compat-adapter.js';
import { printDoctorResults } from './doctor-formatting.js';
import { probeCli } from './cli-auth-probe.js';
import type { AuthProbeResult } from './cli-auth-probe.js';
import { checkHarnessAlignment } from './doctor-harness-alignment.js';
import type { HarnessAlignmentCheck } from './doctor-harness-alignment.js';

/** Required Node.js major version. */
const REQUIRED_NODE_MAJOR = 22;

/** API key environment variable names. */
const API_KEY_VARS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY'] as const;

/**
 * Configuration file paths to check (in order of priority). Per epic #2872
 * the dotdir-scoped variants are preferred over the legacy root-level
 * locations — must match the order in `config-loader.ts:CONFIG_LOOKUP_PATHS`.
 */
const CONFIG_FILE_PATHS = [
  './.nexus-agents/nexus-agents.yaml',
  './.nexus-agents/nexus-agents.yml',
  './nexus-agents.yaml',
  './nexus-agents.yml',
] as const;

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
  /** Days since the registry was last updated. */
  readonly registryAgeDays: number;
  /** True if the registry is >30 days old and may have stale model data. */
  readonly registryStale: boolean;
}

/**
 * SQLite (better-sqlite3) availability check (#1249).
 */
export interface SqliteCheck {
  readonly available: boolean;
  readonly error: string | null;
}

/**
 * Data directory health check (#1249, extended #2892).
 * Reports the resolved location of every data subdirectory — per-repo
 * subdirs under `<repo>/.nexus-agents/`, cross-repo subdirs under
 * `~/.nexus-agents/` — so the operator can see where state actually
 * lives after the epic #2872 state-split.
 */
export interface DataDirectoryCheck {
  /** True if the homedir/cross-repo root exists. */
  readonly rootExists: boolean;
  /** The homedir/cross-repo root path. */
  readonly rootPath: string;
  /** `<repo>/.nexus-agents` when the repo-preferred tier is active, else null. */
  readonly repoRoot: string | null;
  readonly subdirectories: readonly DataSubdirStatus[];
}

/**
 * Status of a single data subdirectory.
 */
export interface DataSubdirStatus {
  readonly name: string;
  /** Actual resolved path (per-repo or homedir, per the #2872 split). */
  readonly path: string;
  /** Which side of the state-split this subdir belongs to. */
  readonly scope: 'per-repo' | 'cross-repo';
  readonly exists: boolean;
  readonly writable: boolean;
}

/** Standard data subdirectories — resolved per-repo or cross-repo (epic #2872). */
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
 * Sandbox awareness (#2501, child 1 of epic #2500).
 *
 * Reports whether nexus-agents is running inside a host-provided sandbox
 * (Docker Desktop Sandbox + OpenCode, Codex sandbox, locked-down CI) and
 * whether the explicit `NEXUS_SANDBOX` signal matches the runtime
 * heuristic. Mismatches don't block startup but get surfaced here so the
 * operator can fix the image / launch config.
 */
export interface SandboxCheck {
  readonly active: boolean;
  readonly flavor: string | undefined;
  readonly root: string | undefined;
  readonly heuristicMatch: 'docker' | 'podman' | 'unknown' | null;
  /** True iff the explicit signal disagrees with the heuristic. */
  readonly mismatch: boolean;
  /** True iff `NEXUS_DATA_DIR` resolves inside a single repo subfolder. */
  readonly dataDirInsideRepo: boolean;
}

/**
 * Voter transport check (#4255): whether an OpenAI-compatible gateway is
 * configured (env vars or the opencode.json bridge). Presence-only, same
 * spirit as {@link checkApiKeys} — no network probe, and the key itself is
 * never surfaced. When configured, consensus/voter calls route in-process
 * through the gateway; otherwise they fall back to CLI subprocesses (see
 * `cli-server-gateway.ts` `tryWireGatewayAdapters`).
 */
export interface VoterTransportCheck {
  readonly configured: boolean;
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
  /** Model registry advisory — which models are available (#890). */
  readonly registryAdvisory: RegistryAdvisory;
  /** Learning persistence health check (#1017). */
  readonly learningPersistence: LearningPersistenceCheck;
  /** SQLite (better-sqlite3) availability (#1249). */
  readonly sqliteCheck: SqliteCheck;
  /** Data directory health (#1249). */
  readonly dataDirectory: DataDirectoryCheck;
  /** Sandbox detection + heuristic verification (#2501). */
  readonly sandbox: SandboxCheck;
  /** Per-harness config alignment with AGENTS.md federation (#2805). */
  readonly harnessAlignment: HarnessAlignmentCheck;
  /** Voter transport: in-process gateway vs CLI subprocess fallback (#4255). */
  readonly voterTransport: VoterTransportCheck;
  /**
   * Headroom on every distinct filesystem backing a scratch root (#4488).
   *
   * A list rather than one reading because the nexus scratch root and the
   * shared system temp dir are frequently on different volumes, and the
   * incident this check exists for was on the one it did not measure.
   */
  readonly scratchSpace: readonly ScratchSpaceCheck[];
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
 *
 * Authentication state comes from the auth probe (#2439, #2447), not from
 * `health.healthy` (which only confirms version compatibility). Without the
 * probe, doctor falsely reports "Auth: CLI auth ✓" for installed-but-
 * unauthed CLIs.
 */
function createHealthyResult(
  name: CliName,
  health: HealthStatus,
  authProbe: AuthProbeResult,
  capacity?: CapacityStatus
): CliCheckResult {
  const versionOk = health.healthy;
  const authenticated = versionOk && authProbe.state === 'authenticated';

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
  // Surface the probe's reason when needs-login so operators see what to fix.
  if (!authenticated && authProbe.state === 'needs-login') {
    return {
      ...result,
      error: authProbe.reason,
      fix: authProbe.fixCommand,
    };
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
 *
 * Combines the version-compatibility check from `adapter.healthCheck()` with
 * the real auth probe from `cli-auth-probe.ts` — see #2439 for why both are
 * needed (version-OK alone misled doctor into reporting unauthed CLIs as ✓).
 */
async function checkCli(name: CliName): Promise<CliCheckResult> {
  const adapters = createAllAdapters();
  const adapter = adapters.get(name);

  if (!adapter) {
    return createNotFoundResult(name, 'Adapter not available');
  }

  try {
    const [health, authProbe] = await Promise.all([adapter.healthCheck(), probeCli(name)]);
    let capacity: CapacityStatus | undefined;

    try {
      capacity = await adapter.getCapacity();
    } catch (capErr: unknown) {
      // Capacity check is optional — some adapters don't support it
      void capErr; // Logged at debug via adapter internals
    }

    return createHealthyResult(name, health, authProbe, capacity);
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
 *
 * Exported so `verify` (#2136) and other health gates can reuse it without
 * running the full doctor pipeline.
 */
export function checkApiKeys(): ApiKeyCheck[] {
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
 *
 * Staleness threshold (#2445): bumped from 30 → 90 days. The published
 * npm tarball ships with a registry snapshot that's typically 1-4 weeks
 * old by the time an operator installs it (normal release cadence). A
 * 30-day threshold meant fresh installs of recently-published versions
 * showed `⚠ Model registry is 55 days old` on day one of usage, training
 * operators to ignore staleness warnings.
 *
 * Additionally, if the operator's data directory has no signs of prior
 * usage (no audit log, no outcome store), suppress the warning entirely
 * — staleness on first run is a publishing concern, not an operator
 * concern.
 */
function buildRegistryAdvisory(cliResults: CliCheckResult[]): RegistryAdvisory {
  const installedClis = new Set(cliResults.filter((c) => c.installed).map((c) => c.name));

  const matrix = getInTreeCapabilitiesMatrix();
  const models: ModelAdvisory[] = matrix.models
    .filter((m) => m.cliName !== undefined)
    .map((m) => {
      const cliName = m.cliName ?? '';
      const available = cliName.length > 0 && installedClis.has(cliName as CliName);
      const reason = available ? `${cliName} CLI is installed` : `${cliName} CLI is not installed`;
      return { modelId: m.id, displayName: m.displayName, cliName, available, reason };
    });

  // Registry staleness check (#1549, threshold revised in #2445)
  const STALE_THRESHOLD_DAYS = 90;
  const updatedAt = new Date(matrix.updatedAt);
  const nowMs = getTimeProvider().now();
  const ageDays = Math.floor((nowMs - updatedAt.getTime()) / (1000 * 60 * 60 * 24));

  // First-install detection: if the operator has no prior activity in
  // their data dir, suppress the staleness warning. There's nothing they
  // can do about it on day one anyway, and it trains them to ignore
  // warnings.
  const isFreshInstall = !hasPriorUsage();
  const exceedsThreshold = ageDays > STALE_THRESHOLD_DAYS;

  return {
    totalModels: models.length,
    availableModels: models.filter((m) => m.available).length,
    unavailableModels: models.filter((m) => !m.available).length,
    models,
    registryAgeDays: ageDays,
    registryStale: exceedsThreshold && !isFreshInstall,
  };
}

/**
 * Cheap heuristic for "operator has used nexus-agents before": data dir
 * exists and contains audit / outcome / session evidence. Used to
 * suppress staleness warnings on day-one of a fresh install (#2445).
 */
function hasPriorUsage(): boolean {
  try {
    const root = getNexusDataDir();
    if (!existsSync(root)) return false;
    // Check for any subdirectory with files. Lazy creation of empty
    // subdirs by `nexus-agents setup` would falsely register as usage —
    // hence we look for *files*, not just directories.
    for (const sub of ['audit', 'learning', 'sessions', 'voting']) {
      const p = `${root}/${sub}`;
      try {
        if (existsSync(p) && readdirSync(p).length > 0) return true;
      } catch {
        // ignore — best-effort heuristic
      }
    }
    return false;
  } catch {
    return false;
  }
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
    const { exists: dirExists, writable: dirWritable } = checkDirAccess(getLearningDir());
    const outcomeCount = countJsonlLines(getOutcomesFile());
    const { count: ruleCount, savedAt: rulesLastSaved } = readRulesMetadata(getRulesFile());
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
 *
 * Exported so `verify` (#2136) can reuse it without running the full doctor
 * pipeline.
 */
export async function checkSqlite(): Promise<SqliteCheck> {
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
 * Checks the nexus-agents data directory health (#1249, extended #2892).
 *
 * Resolves each subdir through `nexusDataPath()` so the reported path is
 * the REAL location after the epic #2872 state-split — per-repo subdirs
 * land in `<repo>/.nexus-agents/`, cross-repo subdirs in `~/.nexus-agents/`.
 *
 * Exported so `verify` (#2136) can reuse it without running the full doctor
 * pipeline.
 */
export function checkDataDirectory(): DataDirectoryCheck {
  const rootPath = getNexusDataDir();
  const rootExists = existsSync(rootPath);
  const repoRoot = getNexusRepoDir();
  const perRepoSet = getPerRepoSubdirs();

  const subdirectories: DataSubdirStatus[] = DATA_SUBDIRECTORIES.map((name) => {
    const segments = name.split('/');
    const fullPath = nexusDataPath(...segments);
    const exists = existsSync(fullPath);
    const scope: 'per-repo' | 'cross-repo' = perRepoSet.has(segments[0] ?? '')
      ? 'per-repo'
      : 'cross-repo';
    return { name, path: fullPath, scope, exists, writable: exists && isWritable(fullPath) };
  });

  return { rootExists, rootPath, repoRoot, subdirectories };
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
 * Sandbox awareness check (#2501).
 *
 * Cross-references the explicit `NEXUS_SANDBOX` signal against the runtime
 * heuristic and the resolved data dir. Surfaces mismatches that point at
 * a misconfigured image (claims docker but no `/.dockerenv`) or a
 * misconfigured launch (`NEXUS_DATA_DIR` inside a single repo while the
 * sandbox root spans multiple).
 */
export function checkSandbox(): SandboxCheck {
  const info = detectSandbox();
  const dataDir = getNexusDataDir();
  const root = info.root;
  const dataDirInsideRepo =
    info.active &&
    root !== undefined &&
    dataDir.startsWith(`${root.replace(/\/$/, '')}/`) &&
    // path segments BETWEEN root and `.nexus-agents/` indicate the data dir
    // lives in a subfolder rather than at the multi-repo root.
    dataDir.replace(`${root.replace(/\/$/, '')}/`, '').split('/').length > 1;

  // Mismatch: claimed sandbox but heuristic says not-a-container, or vice versa.
  const heuristicSaysContainer =
    info.heuristicMatch === 'docker' || info.heuristicMatch === 'podman';
  const mismatch =
    (info.active && info.heuristicMatch === 'unknown') || (!info.active && heuristicSaysContainer);

  return {
    active: info.active,
    flavor: info.flavor,
    root: info.root,
    heuristicMatch: info.heuristicMatch,
    mismatch,
    dataDirInsideRepo,
  };
}

/**
 * Checks whether an OpenAI-compatible gateway is configured (#4255).
 * Presence-only — mirrors {@link checkApiKeys}, no network probe and the
 * key value never leaves `process.env`.
 */
export function checkVoterTransport(): VoterTransportCheck {
  return { configured: readOpenAICompatEnv() !== null };
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
  const sandbox = checkSandbox();
  const harnessAlignment = checkHarnessAlignment();
  const voterTransport = checkVoterTransport();
  const scratchSpace = checkScratchFilesystems();

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
    sandbox,
    harnessAlignment,
    voterTransport,
    scratchSpace,
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
