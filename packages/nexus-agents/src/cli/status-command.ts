/**
 * nexus-agents/cli - Status Command
 *
 * At-a-glance project health dashboard combining fitness score,
 * adapter availability (both CLI tools and API keys), and version info.
 *
 * @module cli/status-command
 * (Source: Issue #688)
 * (Enhanced: Issue #691 - CLI-first adapter detection)
 */

import { VERSION } from '../version.js';
import { colors, symbols } from './ansi-output.js';
import { createFitnessScoreCalculator } from '../governance/fitness-score.js';
import { createLogger } from '../core/index.js';
import type { ParsedCliArgs } from '../cli-types.js';
import { execFileSync } from 'node:child_process';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';

// ============================================================================
// Types
// ============================================================================

interface ApiAdapterStatus {
  readonly name: string;
  readonly envVar: string;
  readonly available: boolean;
}

interface CliToolStatus {
  readonly name: string;
  readonly binary: string;
  readonly installed: boolean;
  readonly version: string | null;
}

export interface StatusResult {
  readonly version: string;
  readonly nodeVersion: string;
  readonly fitnessScore: number;
  readonly fitnessTarget: number;
  readonly adapters: readonly ApiAdapterStatus[];
  readonly cliTools: readonly CliToolStatus[];
  readonly adapterStrategy: string;
  readonly timestamp: string;
}

// ============================================================================
// Constants
// ============================================================================

const FITNESS_TARGET = 90;

const API_ADAPTER_CHECKS: ReadonlyArray<{ name: string; envVar: string }> = [
  { name: 'Claude', envVar: 'ANTHROPIC_API_KEY' },
  { name: 'Gemini', envVar: 'GOOGLE_AI_API_KEY' },
  { name: 'OpenAI', envVar: 'OPENAI_API_KEY' },
];

const CLI_TOOL_CHECKS: ReadonlyArray<{ name: string; binary: string }> = [
  { name: 'Claude CLI', binary: 'claude' },
  { name: 'Gemini CLI', binary: 'gemini' },
  { name: 'Codex CLI', binary: 'codex' },
];

// ============================================================================
// Core Logic
// ============================================================================

function checkApiAdapters(): readonly ApiAdapterStatus[] {
  return API_ADAPTER_CHECKS.map((check) => ({
    name: check.name,
    envVar: check.envVar,
    available: process.env[check.envVar] !== undefined && process.env[check.envVar] !== '',
  }));
}

/**
 * Detects installed CLI tools by checking binary availability.
 * Uses sync subprocess to keep status command fast and deterministic.
 */
function detectCliTools(): readonly CliToolStatus[] {
  return CLI_TOOL_CHECKS.map((check) => {
    try {
      const version = execFileSync(check.binary, ['--version'], {
        timeout: CLI_SUBPROCESS_TIMEOUTS.statusProbeMs,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
      }).trim();
      return { name: check.name, binary: check.binary, installed: true, version };
    } catch {
      return { name: check.name, binary: check.binary, installed: false, version: null };
    }
  });
}

/**
 * Determines the effective adapter strategy based on available tools.
 */
function determineStrategy(
  cliTools: readonly CliToolStatus[],
  adapters: readonly ApiAdapterStatus[]
): string {
  const hasCli = cliTools.some((t) => t.installed);
  const hasApi = adapters.some((a) => a.available);

  if (hasCli && hasApi) return 'cli-first (CLI preferred, API fallback)';
  if (hasCli) return 'cli-only (no API keys configured)';
  if (hasApi) return 'api-only (no CLIs detected)';
  return 'none (no adapters available)';
}

/** Exported for testing. */
export function collectStatus(): StatusResult {
  const logger = createLogger({ component: 'status', level: 'error' });
  const calculator = createFitnessScoreCalculator(logger);
  const audit = calculator.audit(VERSION);
  const adapters = checkApiAdapters();
  const cliTools = detectCliTools();

  return {
    version: VERSION,
    nodeVersion: process.version,
    fitnessScore: audit.score,
    fitnessTarget: FITNESS_TARGET,
    adapters,
    cliTools,
    adapterStrategy: determineStrategy(cliTools, adapters),
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Output Formatters
// ============================================================================

function renderTable(status: StatusResult): void {
  const c = colors;
  const s = symbols;
  const w = process.stdout.write.bind(process.stdout);

  w(`\n${c.bold}nexus-agents v${status.version}${c.reset}`);
  w(` ${c.dim}— Project Health Dashboard${c.reset}\n\n`);

  // Fitness score
  const scoreColor = status.fitnessScore >= FITNESS_TARGET ? c.green : c.red;
  const scoreSymbol = status.fitnessScore >= FITNESS_TARGET ? s.check : s.cross;
  w(`  Fitness Score:  ${scoreColor}${String(status.fitnessScore)}/100${c.reset}`);
  w(`  ${scoreSymbol}\n`);

  // Node version
  w(`  Node.js:        ${c.cyan}${status.nodeVersion}${c.reset}\n`);

  // Strategy
  w(`  Strategy:       ${c.cyan}${status.adapterStrategy}${c.reset}\n`);

  // CLI Tools
  const cliParts = status.cliTools.map((t) => {
    const color = t.installed ? c.green : c.dim;
    const sym = t.installed ? s.check : s.cross;
    const ver = t.installed && t.version !== null ? ` ${c.dim}(${t.version})${c.reset}` : '';
    return `${color}${t.name} ${sym}${c.reset}${ver}`;
  });
  w(`  CLI Tools:      ${cliParts.join('  ')}\n`);

  // API Adapters
  const adapterParts = status.adapters.map((a) => {
    const color = a.available ? c.green : c.dim;
    const sym = a.available ? s.check : s.cross;
    return `${color}${a.name} ${sym}${c.reset}`;
  });
  w(`  API Keys:       ${adapterParts.join('  ')}\n`);

  w('\n');
}

function renderJson(status: StatusResult): void {
  process.stdout.write(JSON.stringify(status, null, 2) + '\n');
}

// ============================================================================
// Command Entry Point
// ============================================================================

/**
 * Handle the `nexus-agents status` CLI command.
 */
export function handleStatusCommand(args: ParsedCliArgs): void {
  const status = collectStatus();

  if (args.options.format === 'json') {
    renderJson(status);
  } else {
    renderTable(status);
  }
}
