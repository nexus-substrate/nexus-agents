/**
 * nexus-agents doctor command - Formatting utilities
 *
 * Terminal output formatting for doctor command results.
 * Extracted to comply with 400-line file limit.
 *
 * (Source: Issue #422 - Doctor command validations)
 */

import { DEFAULT_CAPABILITIES } from '../cli-adapters/types.js';
import type { CapacityStatus } from '../cli-adapters/types.js';
import type {
  CliCheckResult,
  NodeVersionCheck,
  ApiKeyCheck,
  ConfigFileCheck,
  RegistryAdvisory,
  LearningPersistenceCheck,
  DoctorResult,
} from './doctor.js';
import { colors, symbols, writeLine } from './ansi-output.js';
import { capitalize } from '../utils/text-utils.js';

/** Required Node.js major version (for warning message). */
const REQUIRED_NODE_MAJOR = 22;

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
 * Prints Node.js version check result.
 */
function printNodeVersionCheck(check: NodeVersionCheck): void {
  const versionText = check.supported
    ? `${colors.green}${check.version}${colors.reset}`
    : `${colors.yellow}${check.version}${colors.reset}`;
  writeLine(`${formatStatus(check.supported, !check.supported)} Node.js version: ${versionText}`);
  if (!check.supported) {
    writeLine(
      `  ${colors.dim}Warning: Node.js ${String(REQUIRED_NODE_MAJOR)}.x LTS required${colors.reset}`
    );
  }
}

/**
 * Prints API key configuration check results.
 */
function printApiKeysCheck(keys: ApiKeyCheck[]): void {
  const configuredCount = keys.filter((k) => k.configured).length;
  const configuredNames = keys.filter((k) => k.configured).map((k) => k.name);
  const hasAny = configuredCount > 0;

  writeLine(
    `${formatStatus(hasAny, !hasAny)} API keys configured: ${String(configuredCount)} of ${String(keys.length)}`
  );
  if (hasAny) {
    writeLine(`  ${colors.dim}Keys: ${configuredNames.join(', ')}${colors.reset}`);
  } else {
    writeLine(
      `  ${colors.dim}Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY${colors.reset}`
    );
  }
}

/**
 * Prints configuration file check result.
 */
function printConfigFileCheck(check: ConfigFileCheck): void {
  if (check.found && check.path !== null) {
    writeLine(`${formatStatus(true)} Configuration loaded: ${check.path}`);
  } else {
    writeLine(`${formatStatus(false, true)} Configuration file: Not found`);
    writeLine(`  ${colors.dim}Run: nexus-agents config init${colors.reset}`);
  }
}

/**
 * Prints model registry advisory (#890).
 */
function printRegistryAdvisory(advisory: RegistryAdvisory): void {
  const allAvailable = advisory.unavailableModels === 0;
  const countText = `${String(advisory.availableModels)} of ${String(advisory.totalModels)}`;
  writeLine(`${formatStatus(allAvailable, !allAvailable)} Models available: ${countText}`);
  if (advisory.unavailableModels > 0) {
    const missing = advisory.models.filter((m) => !m.available);
    for (const m of missing) {
      writeLine(`  ${colors.dim}${m.displayName} — ${m.reason}${colors.reset}`);
    }
  }
}

/**
 * Prints learning persistence health check (#1017).
 */
function printLearningPersistence(check: LearningPersistenceCheck): void {
  if (!check.enabled) {
    writeLine(`${formatStatus(true)} Learning persistence: ${colors.dim}Disabled${colors.reset}`);
    writeLine(`  ${colors.dim}Set NEXUS_PERSIST_LEARNING=true to enable${colors.reset}`);
    return;
  }

  const healthy = check.dirExists && check.dirWritable && check.error === null;
  writeLine(`${formatStatus(healthy, !healthy)} Learning persistence: Enabled`);

  if (check.error !== null) {
    writeLine(`  ${colors.red}Error: ${check.error}${colors.reset}`);
    return;
  }

  const dirStatus = check.dirExists
    ? check.dirWritable
      ? `${colors.green}writable${colors.reset}`
      : `${colors.red}not writable${colors.reset}`
    : `${colors.yellow}not created yet${colors.reset}`;
  writeLine(`  Data directory: ${dirStatus}`);
  writeLine(`  Outcomes: ${String(check.outcomeCount)} recorded`);
  writeLine(`  Distilled rules: ${String(check.ruleCount)} active`);
  if (check.rulesLastSaved !== null) {
    writeLine(`  Rules last saved: ${check.rulesLastSaved}`);
  }
}

/**
 * Prints the doctor results to stdout.
 */
export function printDoctorResults(result: DoctorResult): void {
  writeLine('');
  writeLine(`${colors.bold}Nexus Agents Doctor${colors.reset}`);
  writeLine('===================');
  writeLine('');

  writeLine(`${colors.cyan}Checking environment...${colors.reset}`);
  writeLine('');
  printNodeVersionCheck(result.nodeVersion);
  printApiKeysCheck(result.apiKeys);
  printConfigFileCheck(result.configFile);
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

  writeLine(`${colors.cyan}Checking model registry...${colors.reset}`);
  writeLine('');
  printRegistryAdvisory(result.registryAdvisory);
  writeLine('');

  writeLine(`${colors.cyan}Checking learning subsystem...${colors.reset}`);
  writeLine('');
  printLearningPersistence(result.learningPersistence);
  writeLine('');

  const unhealthyCount = result.clis.filter((c) => !c.installed || !c.authenticated).length;
  const nodeIssue = result.nodeVersion.supported ? 0 : 1;
  const totalIssues = unhealthyCount + nodeIssue + (result.mcpServerReady ? 0 : 1);
  const summary = result.allHealthy
    ? `${colors.green}${colors.bold}Status: Ready${colors.reset}`
    : `${colors.yellow}${colors.bold}Summary: ${String(totalIssues)} issue(s) found${colors.reset}`;
  writeLine(summary);
  writeLine('');
}
