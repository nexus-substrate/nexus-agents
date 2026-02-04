/**
 * nexus-agents/cli - Status Command
 *
 * At-a-glance project health dashboard combining fitness score,
 * adapter availability, and version info into a single view.
 *
 * @module cli/status-command
 * (Source: Issue #688)
 */

import { VERSION } from '../version.js';
import { colors, symbols } from './ansi-output.js';
import { createFitnessScoreCalculator } from '../governance/fitness-score.js';
import { createLogger } from '../core/index.js';
import type { ParsedCliArgs } from '../cli-types.js';

// ============================================================================
// Types
// ============================================================================

interface AdapterStatus {
  readonly name: string;
  readonly envVar: string;
  readonly available: boolean;
}

export interface StatusResult {
  readonly version: string;
  readonly nodeVersion: string;
  readonly fitnessScore: number;
  readonly fitnessTarget: number;
  readonly adapters: readonly AdapterStatus[];
  readonly timestamp: string;
}

// ============================================================================
// Constants
// ============================================================================

const FITNESS_TARGET = 90;

const ADAPTER_CHECKS: ReadonlyArray<{ name: string; envVar: string }> = [
  { name: 'Claude', envVar: 'ANTHROPIC_API_KEY' },
  { name: 'Gemini', envVar: 'GOOGLE_AI_API_KEY' },
  { name: 'OpenAI', envVar: 'OPENAI_API_KEY' },
];

// ============================================================================
// Core Logic
// ============================================================================

function checkAdapters(): readonly AdapterStatus[] {
  return ADAPTER_CHECKS.map((check) => ({
    name: check.name,
    envVar: check.envVar,
    available: process.env[check.envVar] !== undefined && process.env[check.envVar] !== '',
  }));
}

/** Exported for testing. */
export function collectStatus(): StatusResult {
  const logger = createLogger({ component: 'status', level: 'error' });
  const calculator = createFitnessScoreCalculator(logger);
  const audit = calculator.audit(VERSION);
  const adapters = checkAdapters();

  return {
    version: VERSION,
    nodeVersion: process.version,
    fitnessScore: audit.score,
    fitnessTarget: FITNESS_TARGET,
    adapters,
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

  // Adapters
  const adapterParts = status.adapters.map((a) => {
    const color = a.available ? c.green : c.dim;
    const sym = a.available ? s.check : s.cross;
    return `${color}${a.name} ${sym}${c.reset}`;
  });
  w(`  API Adapters:   ${adapterParts.join('  ')}\n`);

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
