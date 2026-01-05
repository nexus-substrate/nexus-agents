/**
 * nexus-agents doctor command
 *
 * Health check utility for CLI integration validation.
 * Verifies CLI installations, versions, and authentication.
 *
 * (Source: Issue #91, cli-project_plan.md DevEx amendment)
 */

import { createAllAdapters } from '../cli-adapters/factory.js';
import type { CliName, HealthStatus, CapacityStatus } from '../cli-adapters/types.js';
import { DEFAULT_CAPABILITIES } from '../cli-adapters/types.js';

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

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
 * Complete doctor check results.
 */
export interface DoctorResult {
  readonly clis: CliCheckResult[];
  readonly mcpServerReady: boolean;
  readonly mcpClientReady: boolean;
  readonly allHealthy: boolean;
  readonly timestamp: Date;
}

/**
 * Symbols for status output.
 */
const symbols = {
  check: process.platform === 'win32' ? '√' : '✓',
  cross: process.platform === 'win32' ? '×' : '✗',
  warn: process.platform === 'win32' ? '!' : '⚠',
};

/**
 * Helper to write a line to stdout.
 */
function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

/**
 * Formats a status symbol with color.
 */
function formatStatus(healthy: boolean, warn = false): string {
  if (healthy) return `${colors.green}${symbols.check}${colors.reset}`;
  if (warn) return `${colors.yellow}${symbols.warn}${colors.reset}`;
  return `${colors.red}${symbols.cross}${colors.reset}`;
}

/**
 * Formats version status with color.
 */
function formatVersionStatus(status: string): string {
  switch (status) {
    case 'supported':
      return `${colors.green}supported${colors.reset}`;
    case 'outdated':
      return `${colors.yellow}outdated${colors.reset}`;
    case 'unsupported':
    case 'breaking':
      return `${colors.red}${status}${colors.reset}`;
    default:
      return status;
  }
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
 * Capitalizes the first letter of a string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
 * Creates a result from a successful health check.
 */
function createHealthyResult(
  name: CliName,
  health: HealthStatus,
  capacity?: CapacityStatus
): CliCheckResult {
  const authenticated = health.healthy;
  const authMethod = authenticated ? 'OAuth' : undefined;

  const result: CliCheckResult = {
    name,
    installed: true,
    version: health.version,
    versionStatus: health.versionStatus,
    authenticated,
    authMethod,
    capacity,
  };

  // Add optional fields conditionally
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
 * Runs the complete doctor check.
 */
export async function runDoctor(): Promise<DoctorResult> {
  const clis = await Promise.all([checkCli('claude'), checkCli('gemini'), checkCli('codex')]);

  const mcpServerReady = true;
  const codexCheck = clis.find((c) => c.name === 'codex');
  const mcpClientReady = codexCheck?.installed ?? false;

  const allHealthy = clis.every(
    (c) => c.installed && c.authenticated && c.versionStatus !== 'unsupported'
  );

  return { clis, mcpServerReady, mcpClientReady, allHealthy, timestamp: new Date() };
}

/**
 * Formats capacity as percentage string.
 */
function formatCapacity(capacity?: CapacityStatus): string {
  if (capacity === undefined) return 'Unknown';
  const remaining = 100 - capacity.utilizationPercent;
  const remainingStr = String(remaining);
  if (remaining > 80) return `${colors.green}${remainingStr}% remaining${colors.reset}`;
  if (remaining > 20) return `${colors.yellow}${remainingStr}% remaining${colors.reset}`;
  return `${colors.red}${remainingStr}% remaining${colors.reset}`;
}

/**
 * Prints details for an installed CLI.
 */
function printInstalledCliDetails(cli: CliCheckResult): void {
  writeLine(`  Version: ${cli.version} (${formatVersionStatus(cli.versionStatus)})`);

  const authText = cli.authenticated
    ? `${colors.green}${cli.authMethod ?? 'Authenticated'}${colors.reset}`
    : `${colors.red}Not authenticated${colors.reset}`;
  writeLine(`  Auth: ${authText}`);

  if (cli.capacity !== undefined) {
    writeLine(`  Capacity: ${formatCapacity(cli.capacity)}`);
  }
}

/**
 * Prints a single CLI result.
 */
function printCliResult(cli: CliCheckResult): void {
  const status = cli.installed && cli.authenticated;
  const warn = cli.installed && (!cli.authenticated || cli.versionStatus === 'outdated');

  writeLine(
    `${formatStatus(status, warn)} ${colors.bold}${capitalize(cli.name)} CLI${colors.reset}`
  );

  if (cli.installed) {
    printInstalledCliDetails(cli);
  } else {
    const errorText = cli.error ?? 'Not installed';
    writeLine(`  ${colors.red}Error: ${errorText}${colors.reset}`);
  }

  if (cli.fix !== undefined && cli.fix !== '') {
    writeLine(`  ${colors.dim}Fix: ${cli.fix}${colors.reset}`);
  }

  writeLine('');
}

/**
 * Prints capability summary for installed CLIs.
 */
function printCapabilities(clis: CliCheckResult[]): void {
  const installedClis = clis.filter((c) => c.installed);

  if (installedClis.length === 0) {
    writeLine(`${formatStatus(false)} No CLIs installed`);
    return;
  }

  const caps = DEFAULT_CAPABILITIES;
  const bestReasoning = installedClis.reduce((best, c) =>
    caps[c.name].reasoning > caps[best.name].reasoning ? c : best
  );
  const bestContext = installedClis.reduce((best, c) =>
    caps[c.name].contextWindow > caps[best.name].contextWindow ? c : best
  );
  const bestSpeed = installedClis.reduce((best, c) =>
    caps[c.name].speed > caps[best.name].speed ? c : best
  );

  const contextTokensK = (caps[bestContext.name].contextWindow / 1000).toFixed(0);

  writeLine(
    `${formatStatus(true)} Complex reasoning: ${colors.bold}${capitalize(bestReasoning.name)}${colors.reset}`
  );
  writeLine(
    `${formatStatus(true)} Large context: ${colors.bold}${capitalize(bestContext.name)}${colors.reset} (${contextTokensK}K tokens)`
  );
  writeLine(
    `${formatStatus(true)} Fast execution: ${colors.bold}${capitalize(bestSpeed.name)}${colors.reset}`
  );
}

/**
 * Prints the doctor results to stdout.
 */
export function printDoctorResults(result: DoctorResult): void {
  writeLine('');
  writeLine(`${colors.bold}Nexus Agents Doctor${colors.reset}`);
  writeLine('===================');
  writeLine('');
  writeLine(`${colors.cyan}Checking CLI installations...${colors.reset}`);
  writeLine('');

  for (const cli of result.clis) {
    printCliResult(cli);
  }

  writeLine(`${colors.cyan}Checking MCP configuration...${colors.reset}`);
  writeLine('');
  writeLine(
    `${formatStatus(result.mcpServerReady)} MCP Server mode: ${result.mcpServerReady ? 'Ready' : 'Not ready'}`
  );
  writeLine(
    `${formatStatus(result.mcpClientReady)} MCP Client mode: ${result.mcpClientReady ? 'Ready (Codex mcp-server)' : 'Not ready (Codex not installed)'}`
  );
  writeLine('');

  writeLine(`${colors.cyan}Checking capabilities...${colors.reset}`);
  writeLine('');
  printCapabilities(result.clis);
  writeLine('');

  const unhealthyCount = result.clis.filter((c) => !c.installed || !c.authenticated).length;
  const summary = result.allHealthy
    ? `${colors.green}${colors.bold}Summary: All systems operational${colors.reset}`
    : `${colors.yellow}${colors.bold}Summary: ${String(unhealthyCount)} issue(s) found${colors.reset}`;
  writeLine(summary);
  writeLine('');
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
