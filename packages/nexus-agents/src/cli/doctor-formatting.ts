/**
 * nexus-agents doctor command - Formatting utilities
 *
 * Terminal output formatting for doctor command results.
 * Extracted to comply with 400-line file limit.
 *
 * (Source: Issue #422 - Doctor command validations)
 */

import { DEFAULT_CAPABILITIES } from '../cli-adapters/types.js';
import {
  formatScratchFilesystems,
  scratchSeverityIsAcceptable,
  worstSeverity,
} from './doctor-scratch-space.js';
import type { CapacityStatus } from '../cli-adapters/types.js';
import type {
  CliCheckResult,
  NodeVersionCheck,
  ApiKeyCheck,
  ConfigFileCheck,
  RegistryAdvisory,
  LearningPersistenceCheck,
  SqliteCheck,
  DataDirectoryCheck,
  DoctorResult,
} from './doctor.js';
import { colors, symbols, writeLine } from './ansi-output.js';
import { capitalize } from '../utils/text-utils.js';
import { allOf } from '../utils/verdict-aggregation.js';
import { describeInstallFreshness } from './doctor-install-freshness.js';
import { NODE_ENGINE_RANGE } from '../version.js';

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
  // #4374: a tracker that has never recorded a request reports the full token
  // limit and 0% utilization, which used to render as a green "100% remaining".
  // That is a default, not a measurement — and it is fiction for a CLI whose
  // weekly quota was consumed by another process. Say so instead.
  if (!capacity.observed) {
    return `${colors.yellow}unknown (no usage observed this session)${colors.reset}`;
  }
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

  // Three states, not two (#4661). `unverified` is yellow because nothing was
  // measured — the same honest register as the `Capacity: unknown` line below.
  const authText =
    cli.authState === 'authenticated'
      ? `${colors.green}${cli.authMethod ?? 'Authenticated'}${colors.reset}`
      : cli.authState === 'unverified'
        ? `${colors.yellow}unverified (no non-interactive auth check)${colors.reset}`
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
    writeLine(`  ${colors.dim}Warning: Node.js ${NODE_ENGINE_RANGE} required${colors.reset}`);
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
  // Registry staleness warning (#1549, revised in #2445)
  const ageText = `${String(advisory.registryAgeDays)} days old`;
  if (advisory.registryStale) {
    writeLine(
      `${colors.yellow}${symbols.warn}${colors.reset} Model registry is ${ageText} — may have stale model data`
    );
    writeLine(
      `  ${colors.dim}Update with 'npm update -g nexus-agents' to pick up the latest registry,${colors.reset}`
    );
    writeLine(
      `  ${colors.dim}or run 'nexus-agents registry refresh' to probe currently-installed models.${colors.reset}`
    );
  } else {
    writeLine(`${formatStatus(true)} Model registry: ${ageText}`);
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
 * Prints SQLite (node:sqlite) availability check (#1249).
 */
function printSqliteCheck(check: SqliteCheck): void {
  if (check.available) {
    writeLine(
      `${formatStatus(true)} SQLite (node:sqlite): ${colors.green}Available${colors.reset}`
    );
  } else {
    writeLine(
      `${formatStatus(false, true)} SQLite (node:sqlite): ${colors.yellow}Not available${colors.reset}`
    );
    writeLine(
      `  ${colors.dim}Memory backends (agentic, adaptive, typed) require it${colors.reset}`
    );
    writeLine(`  ${colors.dim}Fix: upgrade to Node >= 22.5.0${colors.reset}`);
  }
}

/** Prints one scope group of data subdirs with per-subdir resolved paths. */
function printDataDirGroup(
  label: string,
  rootHint: string,
  subdirs: readonly DataDirectoryCheck['subdirectories'][number][]
): void {
  if (subdirs.length === 0) return;
  const existCount = subdirs.filter((d) => d.exists).length;
  writeLine(
    `  ${colors.dim}${label} — ${rootHint} (${String(existCount)}/${String(subdirs.length)})${colors.reset}`
  );
  for (const dir of subdirs) {
    let marker: string;
    if (!dir.exists) marker = `${colors.dim}·${colors.reset}`;
    else if (!dir.writable) marker = `${colors.yellow}!${colors.reset}`;
    else marker = `${colors.green}✓${colors.reset}`;
    const note = !dir.exists
      ? ` ${colors.dim}(missing — created on first use)${colors.reset}`
      : !dir.writable
        ? ` ${colors.yellow}(not writable)${colors.reset}`
        : '';
    writeLine(`    ${marker} ${dir.name}  ${colors.dim}${dir.path}${colors.reset}${note}`);
  }
}

/**
 * Prints data directory health check (#1249, extended #2892).
 * Groups subdirs by the epic #2872 state-split so the operator sees
 * exactly where per-repo vs cross-repo state lives.
 */
function printDataDirectory(check: DataDirectoryCheck): void {
  // whenEmpty = false: a layout with zero known subdirectories was not
  // measured, and printing it as healthy is the vacuous pass (#4581).
  const allExist = allOf(check.subdirectories, (d) => d.exists, false);
  const allWritable = allOf(check.subdirectories, (d) => !d.exists || d.writable, false);
  const healthy = check.rootExists && allWritable;

  writeLine(`${formatStatus(healthy, !healthy)} Data directory layout:`);

  const perRepo = check.subdirectories.filter((d) => d.scope === 'per-repo');
  const crossRepo = check.subdirectories.filter((d) => d.scope === 'cross-repo');

  if (check.repoRoot !== null) {
    printDataDirGroup('Per-repo', check.repoRoot, perRepo);
  } else {
    // Repo-preferred tier inactive — per-repo subdirs also live in homedir.
    printDataDirGroup('Per-repo (homedir — repo-preferred off)', check.rootPath, perRepo);
  }
  printDataDirGroup('Cross-repo', check.rootPath, crossRepo);

  if (!allExist) {
    writeLine(`  ${colors.dim}Fix: nexus-agents setup${colors.reset}`);
  }
}

function printSandboxHeader(check: DoctorResult['sandbox']): void {
  if (check.active) {
    writeLine(`${formatStatus(true)} Sandbox flavor: ${check.flavor ?? '(unknown)'}`);
    writeLine(`  ${colors.dim}NEXUS_SANDBOX_ROOT: ${check.root ?? '(unset)'}${colors.reset}`);
    return;
  }
  writeLine(
    `${formatStatus(false, true)} Container detected (${check.heuristicMatch ?? 'unknown'}) but ${colors.yellow}NEXUS_SANDBOX is unset${colors.reset}`
  );
  writeLine(
    `  ${colors.dim}Set NEXUS_SANDBOX=<flavor> in the image to opt into sandbox-aware behaviour.${colors.reset}`
  );
}

function printSandboxWarnings(check: DoctorResult['sandbox']): void {
  if (check.mismatch && check.active) {
    writeLine(
      `  ${colors.yellow}Mismatch: NEXUS_SANDBOX is set but no container heuristic matched (heuristic=${String(check.heuristicMatch)}).${colors.reset}`
    );
  }
  if (check.dataDirInsideRepo) {
    writeLine(
      `  ${colors.yellow}NEXUS_DATA_DIR resolves inside a single repo subfolder of NEXUS_SANDBOX_ROOT — state will be lost when switching repos. Set NEXUS_DATA_DIR at the multi-repo root.${colors.reset}`
    );
  }
}

/**
 * Prints the sandbox-awareness section (#2501). Section is suppressed when
 * neither the explicit signal nor the heuristic indicates a sandbox.
 */
function printSandbox(check: DoctorResult['sandbox']): void {
  const heuristicSaysContainer =
    check.heuristicMatch === 'docker' || check.heuristicMatch === 'podman';
  if (!check.active && !heuristicSaysContainer) {
    return;
  }
  writeLine(`${colors.cyan}Checking sandbox awareness...${colors.reset}`);
  writeLine('');
  printSandboxHeader(check);
  printSandboxWarnings(check);
  writeLine('');
}

/** Prints the summary line with issue count. */
function printDoctorSummary(result: DoctorResult): void {
  const unhealthyCount = result.clis.filter((c) => !c.installed || !c.authenticated).length;
  const nodeIssue = result.nodeVersion.supported ? 0 : 1;
  // #4851: the count enumerated CLIs, node and MCP while `isAllHealthy` ALSO
  // fails on an unacceptable scratch severity — so a critical scratch
  // filesystem with everything else fine printed "Summary: 0 issue(s) found",
  // a summary shown only because something is wrong, saying nothing is wrong.
  // Every term the verdict reads must be a term the count reads.
  const scratchIssue = scratchSeverityIsAcceptable(worstSeverity(result.scratchSpace)) ? 0 : 1;
  const totalIssues = unhealthyCount + nodeIssue + (result.mcpServerReady ? 0 : 1) + scratchIssue;
  const summary = result.allHealthy
    ? `${colors.green}${colors.bold}Status: Ready${colors.reset}`
    : `${colors.yellow}${colors.bold}Summary: ${String(totalIssues)} issue(s) found${colors.reset}`;
  writeLine(summary);
  writeLine('');
}

/**
 * Prints which transport voter/consensus calls will use (#4255): an
 * in-process OpenAI-compatible gateway when configured, else the CLI
 * subprocess round-robin fallback.
 */
function printVoterTransportCheck(check: DoctorResult['voterTransport']): void {
  if (check.configured) {
    writeLine(`${formatStatus(true)} Voter transport: In-process gateway`);
    return;
  }
  writeLine(`${formatStatus(true)} Voter transport: ${colors.dim}CLI subprocess${colors.reset}`);
  writeLine(
    `  ${colors.dim}Set NEXUS_OPENAI_COMPAT_URL and NEXUS_OPENAI_COMPAT_KEY for faster in-process voting${colors.reset}`
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
  printVoterTransportCheck(result.voterTransport);
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

  writeLine(`${colors.cyan}Checking data storage...${colors.reset}`);
  writeLine('');
  printSqliteCheck(result.sqliteCheck);
  printDataDirectory(result.dataDirectory);
  // #4488: a full scratch filesystem is invisible until a subprocess dies at
  // the write step, so surface headroom alongside the other storage checks.
  writeLine(formatScratchFilesystems(result.scratchSpace));
  writeLine('');

  printSandbox(result.sandbox);

  printHarnessAlignment(result.harnessAlignment);

  printInstallFreshness(result.installFreshness);

  printDoctorSummary(result);
}

/**
 * Prints whether the global install matches this build (#4767).
 *
 * The check computed the verdict and nothing printed it — running `doctor`
 * showed no line at all, which is the recorded-but-unread shape the check
 * itself exists to catch (#4959).
 */
function printInstallFreshness(check: DoctorResult['installFreshness']): void {
  writeLine(`${colors.cyan}Checking global install freshness...${colors.reset}`);
  writeLine('');
  writeLine(`  ${describeInstallFreshness(check)}`);
  writeLine('');
}

/**
 * Prints harness-alignment status (#2805 Phase 3). Shows which harness
 * config files are present and whether they redirect to AGENTS.md per
 * the option-B federation contract.
 */
function printHarnessAlignment(check: DoctorResult['harnessAlignment']): void {
  writeLine(`${colors.cyan}Checking agent-harness alignment...${colors.reset}`);
  writeLine('');

  if (!check.inProject) {
    writeLine(
      `${colors.gray}${symbols.circle}${colors.reset} AGENTS.md: not run inside a project — harness alignment not applicable (run doctor from your repo root)\n`
    );
    return;
  }

  writeLine(
    `${formatStatus(check.agentsMdExists)} AGENTS.md: ${check.agentsMdExists ? 'present (federated surface)' : 'MISSING — federation invariant broken'}`
  );

  for (const f of check.files) {
    if (!f.exists) {
      writeLine(`  ${colors.gray}○${colors.reset} ${f.harness}: not present (${f.path})`);
      continue;
    }
    if (f.error !== null) {
      writeLine(`  ${colors.red}✗${colors.reset} ${f.harness}: ${f.error}`);
      continue;
    }
    if (f.redirectsToAgentsMd) {
      writeLine(`  ${colors.green}✓${colors.reset} ${f.harness}: aligned (${f.path})`);
    } else {
      writeLine(
        `  ${colors.yellow}⚠${colors.reset} ${f.harness}: drift — ${f.path} exists but does NOT mention AGENTS.md`
      );
    }
  }

  writeLine('');
  writeLine(
    `  Summary: ${String(check.alignedCount)} aligned, ${String(check.driftCount)} drift, ${String(check.missingCount)} absent`
  );
  if (check.driftCount > 0) {
    writeLine(
      `  ${colors.yellow}Drift detected.${colors.reset} Per docs/architecture/AGENT_COMPATIBILITY.md, harness configs must redirect to AGENTS.md — never duplicate content.`
    );
  }
  writeLine('');
}
