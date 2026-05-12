/**
 * nexus-agents/cli - Capabilities Command
 *
 * CLI command for displaying the model capabilities matrix.
 * Shows output/input modalities, tool support, and special features
 * for all supported AI models.
 *
 * @module cli/capabilities-command
 * (Source: Issue #684, Epic #682)
 */

import type { ParsedCliArgs } from '../cli-types.js';
import { EXIT_CODES } from '../cli-types.js';
import {
  OUTPUT_MODALITIES,
  INPUT_MODALITIES,
  TOOL_CAPABILITIES,
  SPECIAL_FEATURES,
} from '../config/model-capabilities-types.js';
import type { ModelCapability } from '../config/model-capabilities-types.js';
import {
  findModelsByOutputModality,
  findModelsByInputModality,
  findModelsByToolCapability,
  findModelsByFeature,
  getInTreeCapabilitiesMatrix,
  lookupInTreeCapability,
} from '../config/model-config-helpers.js';

// ============================================================================
// Constants
// ============================================================================

type CapabilitiesSubcommand = 'list' | 'compare' | 'find';
type OutputFormat = 'table' | 'json' | 'markdown';

const VALID_SUBCOMMANDS: readonly CapabilitiesSubcommand[] = ['list', 'compare', 'find'];

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
} as const;

const USAGE = `
nexus-agents capabilities <subcommand> [options]

SUBCOMMANDS:
  list                          Show all models and their capabilities
  compare <model1> <model2>     Side-by-side capability comparison
  find <capability>             Find models supporting a capability

OPTIONS:
  --format=<fmt>   Output format: table (default), json, markdown

EXAMPLES:
  nexus-agents capabilities list
  nexus-agents capabilities compare claude-opus gemini-pro
  nexus-agents capabilities find image_png
  nexus-agents capabilities find mcp
  nexus-agents capabilities list --format=json
`.trim();

// ============================================================================
// Helpers
// ============================================================================

const write = (text: string): void => {
  process.stdout.write(text + '\n');
};

function mark(has: boolean): string {
  return has ? `${C.green}✓${C.reset}` : `${C.dim}-${C.reset}`;
}

/** Format context window size as a human-readable string. */
function fmtContext(tokens: number): string {
  if (tokens >= 1_000_000) return String(tokens / 1_000_000) + 'M';
  return String(tokens / 1_000) + 'K';
}

// ============================================================================
// List subcommand
// ============================================================================

function renderListTable(): void {
  const matrix = getInTreeCapabilitiesMatrix();
  const models = matrix.models;
  const ver = String(matrix.version);
  write(`\n${C.bold}Model Capabilities Matrix${C.reset} (v${ver})\n`);

  write(
    `${C.bold}${'Model'.padEnd(20)} ${'Provider'.padEnd(10)} ${'Context'.padEnd(8)} ` +
      `${'ImgOut'.padEnd(6)} ${'Audio'.padEnd(6)} ${'MCP'.padEnd(5)} ` +
      `${'Sandbox'.padEnd(8)} ${'Thinking'.padEnd(9)} ${'Research'.padEnd(8)}${C.reset}`
  );
  write('-'.repeat(86));

  for (const m of models) {
    write(
      `${m.displayName.padEnd(20)} ${m.provider.padEnd(10)} ${fmtContext(m.contextWindow).padEnd(8)} ` +
        `${mark(m.outputModalities.includes('image_png')).padEnd(15)} ` +
        `${mark(m.outputModalities.includes('audio_pcm')).padEnd(15)} ` +
        `${mark(m.toolCapabilities.includes('mcp')).padEnd(14)} ` +
        `${mark(m.toolCapabilities.includes('code_execution_sandbox')).padEnd(17)} ` +
        `${mark(m.specialFeatures.includes('extended_thinking')).padEnd(18)} ` +
        mark(m.specialFeatures.includes('deep_research'))
    );
  }
  write('');
}

function renderListJson(): void {
  write(JSON.stringify(getInTreeCapabilitiesMatrix(), null, 2));
}

function renderListMarkdown(): void {
  const models = getInTreeCapabilitiesMatrix().models;
  write('# Model Capabilities Matrix\n');
  write('| Model | Provider | Context | Image Out | Audio | MCP | Sandbox | Thinking | Research |');
  write('|-------|----------|---------|-----------|-------|-----|---------|----------|----------|');

  for (const m of models) {
    const row = [
      m.displayName,
      m.provider,
      fmtContext(m.contextWindow),
      m.outputModalities.includes('image_png') ? 'Yes' : '-',
      m.outputModalities.includes('audio_pcm') ? 'Yes' : '-',
      m.toolCapabilities.includes('mcp') ? 'Yes' : '-',
      m.toolCapabilities.includes('code_execution_sandbox') ? 'Yes' : '-',
      m.specialFeatures.includes('extended_thinking') ? 'Yes' : '-',
      m.specialFeatures.includes('deep_research') ? 'Yes' : '-',
    ];
    write(`| ${row.join(' | ')} |`);
  }
  write('');
}

function handleList(format: OutputFormat): void {
  if (format === 'json') {
    renderListJson();
    return;
  }
  if (format === 'markdown') {
    renderListMarkdown();
    return;
  }
  renderListTable();
}

// ============================================================================
// Compare subcommand
// ============================================================================

function compareRow(label: string, val1: string, val2: string): void {
  const indicator = val1 === val2 ? ' ' : `${C.yellow}*${C.reset}`;
  write(`${indicator} ${label.padEnd(22)} ${val1.padEnd(30)} ${val2.padEnd(30)}`);
}

function renderCompare(m1: ModelCapability, m2: ModelCapability): void {
  write(`\n${C.bold}Capability Comparison${C.reset}\n`);
  write(
    `  ${''.padEnd(22)} ${C.cyan}${m1.displayName.padEnd(30)}${C.reset} ` +
      `${C.cyan}${m2.displayName.padEnd(30)}${C.reset}`
  );
  write('-'.repeat(86));

  const ctx = (n: number): string => fmtContext(n) + ' tokens';
  compareRow('Provider', m1.provider, m2.provider);
  compareRow('Context Window', ctx(m1.contextWindow), ctx(m2.contextWindow));
  compareRow('Output Modalities', m1.outputModalities.join(', '), m2.outputModalities.join(', '));
  compareRow('Input Modalities', m1.inputModalities.join(', '), m2.inputModalities.join(', '));
  compareRow('Tool Capabilities', m1.toolCapabilities.join(', '), m2.toolCapabilities.join(', '));
  compareRow('Special Features', m1.specialFeatures.join(', '), m2.specialFeatures.join(', '));

  write('');
  write(`${C.dim}* = difference between models${C.reset}`);
  write('');
}

// ============================================================================
// Find subcommand
// ============================================================================

/** Search capability categories in priority order, returning first match. */
function searchCapability(query: string): { found: ModelCapability[]; category: string } {
  const searches: Array<{ list: readonly string[]; fn: () => ModelCapability[]; cat: string }> = [
    {
      list: OUTPUT_MODALITIES,
      fn: () => findModelsByOutputModality(query as never),
      cat: 'Output Modality',
    },
    {
      list: INPUT_MODALITIES,
      fn: () => findModelsByInputModality(query as never),
      cat: 'Input Modality',
    },
    {
      list: TOOL_CAPABILITIES,
      fn: () => findModelsByToolCapability(query as never),
      cat: 'Tool Capability',
    },
    {
      list: SPECIAL_FEATURES,
      fn: () => findModelsByFeature(query as never),
      cat: 'Special Feature',
    },
  ];

  for (const { list, fn, cat } of searches) {
    if (list.includes(query)) {
      const results = fn();
      if (results.length > 0) return { found: results, category: cat };
    }
  }
  return { found: [], category: '' };
}

function renderFind(query: string): void {
  write(`\n${C.bold}Models supporting: ${C.cyan}${query}${C.reset}\n`);

  const { found, category } = searchCapability(query);

  if (found.length === 0) {
    write(`${C.red}No models found supporting "${query}".${C.reset}`);
    write('\nAvailable capabilities:');
    write(`  Output: ${OUTPUT_MODALITIES.join(', ')}`);
    write(`  Input:  ${INPUT_MODALITIES.join(', ')}`);
    write(`  Tools:  ${TOOL_CAPABILITIES.join(', ')}`);
    write(`  Features: ${SPECIAL_FEATURES.join(', ')}`);
    return;
  }

  write(`${C.dim}Category: ${category}${C.reset}`);
  write('');
  for (const m of found) {
    write(
      `  ${C.green}✓${C.reset} ${m.displayName} (${m.provider}, ${fmtContext(m.contextWindow)} ctx)`
    );
  }
  write('');
}

// ============================================================================
// Subcommand dispatchers
// ============================================================================

function handleCompare(args: ParsedCliArgs): void {
  const id1 = args.positionals[2];
  const id2 = args.positionals[3];
  if (id1 === undefined || id2 === undefined) {
    write(`${C.red}Usage: nexus-agents capabilities compare <model1> <model2>${C.reset}`);
    process.exit(EXIT_CODES.INVALID_ARGS);
  }
  const m1 = lookupInTreeCapability(id1);
  const m2 = lookupInTreeCapability(id2);
  if (m1 === undefined || m2 === undefined) {
    const missing = m1 === undefined ? id1 : id2;
    const ids = getInTreeCapabilitiesMatrix()
      .models.map((m) => m.id)
      .join(', ');
    write(`${C.red}Unknown model: ${missing}${C.reset}`);
    write(`Valid models: ${ids}`);
    process.exit(EXIT_CODES.INVALID_ARGS);
  }
  renderCompare(m1, m2);
}

function handleFindSubcmd(args: ParsedCliArgs): void {
  const query = args.positionals[2];
  if (query === undefined) {
    write(`${C.red}Usage: nexus-agents capabilities find <capability>${C.reset}`);
    process.exit(EXIT_CODES.INVALID_ARGS);
  }
  renderFind(query);
}

// ============================================================================
// Command handler
// ============================================================================

/** Dispatch table for subcommands. */
const SUBCOMMAND_HANDLERS: Record<string, (args: ParsedCliArgs) => void> = {
  list: (args) => {
    handleList((args.options.format as OutputFormat | undefined) ?? 'table');
  },
  compare: handleCompare,
  find: handleFindSubcmd,
};

/**
 * Handles the `nexus-agents capabilities` command.
 */
export function handleCapabilitiesCommand(args: ParsedCliArgs): void {
  const subcommand = args.positionals[1];

  if (
    subcommand === undefined ||
    !VALID_SUBCOMMANDS.includes(subcommand as CapabilitiesSubcommand)
  ) {
    process.stdout.write(USAGE + '\n');
    process.exit(subcommand === undefined ? EXIT_CODES.SUCCESS : EXIT_CODES.INVALID_ARGS);
  }

  const handler = SUBCOMMAND_HANDLERS[subcommand];
  if (handler !== undefined) handler(args);
}
