/**
 * nexus-agents/cli - Research Index CLI Command
 *
 * CLI command for deterministic RESEARCH_INDEX.md generation and validation.
 * Implements: `nexus-agents research index --generate/--validate/--check`
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 * @see docs/research/RESEARCH_INDEX.md
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import {
  generateIndexMarkdown,
  checkIndexFreshness,
  validateRegistry,
  formatValidationResult,
  formatValidationResultJson,
  PapersRegistrySchema,
  TechniquesRegistrySchema,
} from '../research/index.js';
import type { ParsedRegistry } from '../research/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Research index command action.
 */
export type ResearchIndexAction = 'generate' | 'validate' | 'check';

/**
 * Options for the research index command.
 */
export interface ResearchIndexOptions {
  /** Action to perform */
  readonly action: ResearchIndexAction;
  /** Output path for generate action */
  readonly output?: string;
  /** Output format for validate action */
  readonly format?: 'text' | 'json';
  /** Treat warnings as errors in validate */
  readonly strict?: boolean;
  /** Check integration file existence */
  readonly checkFiles?: boolean;
  /** Silent mode (only exit code) */
  readonly silent?: boolean;
}

/**
 * Result of the research index command.
 */
export interface ResearchIndexResult {
  readonly success: boolean;
  readonly message: string;
  readonly exitCode: number;
}

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get default paths based on project root.
 */
function getDefaultPaths(projectRoot: string): {
  papersPath: string;
  techniquesPath: string;
  indexPath: string;
} {
  return {
    papersPath: path.join(projectRoot, 'docs/research/registry/papers.yaml'),
    techniquesPath: path.join(projectRoot, 'docs/research/registry/techniques.yaml'),
    indexPath: path.join(projectRoot, 'docs/research/RESEARCH_INDEX.md'),
  };
}

// ============================================================================
// Registry Loading
// ============================================================================

/**
 * Load and parse registry files.
 */
function loadRegistry(
  papersPath: string,
  techniquesPath: string
): { ok: true; value: ParsedRegistry } | { ok: false; error: string } {
  // Load papers
  if (!fsSync.existsSync(papersPath)) {
    return { ok: false, error: `Papers file not found: ${papersPath}` };
  }

  const papersContent = fsSync.readFileSync(papersPath, 'utf-8');
  const papersRaw: unknown = yaml.parse(papersContent);
  const papersResult = PapersRegistrySchema.safeParse(papersRaw);

  if (!papersResult.success) {
    return { ok: false, error: `Invalid papers.yaml: ${papersResult.error.message}` };
  }

  // Load techniques
  if (!fsSync.existsSync(techniquesPath)) {
    return { ok: false, error: `Techniques file not found: ${techniquesPath}` };
  }

  const techniquesContent = fsSync.readFileSync(techniquesPath, 'utf-8');
  const techniquesRaw: unknown = yaml.parse(techniquesContent);
  const techniquesResult = TechniquesRegistrySchema.safeParse(techniquesRaw);

  if (!techniquesResult.success) {
    return { ok: false, error: `Invalid techniques.yaml: ${techniquesResult.error.message}` };
  }

  return {
    ok: true,
    value: {
      papers: papersResult.data,
      techniques: techniquesResult.data,
    },
  };
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Handle generate action - regenerate RESEARCH_INDEX.md
 */
async function handleGenerate(
  options: ResearchIndexOptions,
  projectRoot: string
): Promise<ResearchIndexResult> {
  const paths = getDefaultPaths(projectRoot);
  const outputPath = options.output ?? paths.indexPath;

  // Generate markdown
  const result = generateIndexMarkdown({
    papersPath: paths.papersPath,
    techniquesPath: paths.techniquesPath,
  });

  if (!result.ok) {
    return {
      success: false,
      message: `Error: ${result.error.message}`,
      exitCode: 1,
    };
  }

  // Write output
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, result.value, 'utf-8');

  // Extract stats from the generated content for the message
  const paperCount = result.value.match(/Total Papers:\*\* (\d+)/)?.[1] ?? '?';
  const techniqueCount = result.value.match(/Techniques:\*\* (\d+)/)?.[1] ?? '?';

  return {
    success: true,
    message: [
      'Research index generated successfully',
      `  Output: ${outputPath}`,
      `  Papers: ${paperCount}`,
      `  Techniques: ${techniqueCount}`,
    ].join('\n'),
    exitCode: 0,
  };
}

/**
 * Handle validate action - validate registry consistency
 */
async function handleValidate(
  options: ResearchIndexOptions,
  projectRoot: string
): Promise<ResearchIndexResult> {
  const paths = getDefaultPaths(projectRoot);

  // Load registry
  const loadResult = loadRegistry(paths.papersPath, paths.techniquesPath);
  if (!loadResult.ok) {
    return {
      success: false,
      message: `Error: ${loadResult.error}`,
      exitCode: 1,
    };
  }

  // Validate
  const validationResult = validateRegistry(loadResult.value, {
    projectRoot,
    checkFileExistence: options.checkFiles ?? true,
    strict: options.strict ?? false,
  });

  if (!validationResult.ok) {
    return {
      success: false,
      message: `Error: ${validationResult.error.message}`,
      exitCode: 1,
    };
  }

  const result = validationResult.value;
  const format = options.format ?? 'text';

  const message =
    format === 'json' ? formatValidationResultJson(result) : formatValidationResult(result);

  // Ensure async compliance
  await Promise.resolve();

  return {
    success: result.valid,
    message,
    exitCode: result.valid ? 0 : 1,
  };
}

/**
 * Handle check action - check if index is up to date
 */
async function handleCheck(
  options: ResearchIndexOptions,
  projectRoot: string
): Promise<ResearchIndexResult> {
  const paths = getDefaultPaths(projectRoot);

  // Check freshness using checksums
  const freshnessResult = checkIndexFreshness(paths.indexPath, {
    papersPath: paths.papersPath,
    techniquesPath: paths.techniquesPath,
  });

  if (!freshnessResult.ok) {
    return {
      success: false,
      message: `Error: ${freshnessResult.error.message}`,
      exitCode: 1,
    };
  }

  const { fresh, reason } = freshnessResult.value;

  // Ensure async compliance
  await Promise.resolve();

  if (fresh) {
    return {
      success: true,
      message: options.silent === true ? '' : 'Research index is up to date',
      exitCode: 0,
    };
  }

  return {
    success: false,
    message:
      options.silent === true
        ? ''
        : `Research index is out of date: ${reason}\nRun "nexus-agents research index --generate" to update.`,
    exitCode: 1,
  };
}

// ============================================================================
// Main Command
// ============================================================================

/**
 * Execute the research index command.
 */
export async function researchIndexCommand(
  options: ResearchIndexOptions
): Promise<ResearchIndexResult> {
  const projectRoot = process.cwd();

  switch (options.action) {
    case 'generate':
      return handleGenerate(options, projectRoot);
    case 'validate':
      return handleValidate(options, projectRoot);
    case 'check':
      return handleCheck(options, projectRoot);
    default:
      return {
        success: false,
        message: `Unknown action: ${String(options.action)}. Use --generate, --validate, or --check`,
        exitCode: 1,
      };
  }
}

/**
 * Mutable state for parsing research index arguments.
 */
interface ParseState {
  action: ResearchIndexAction;
  output: string | undefined;
  format: 'text' | 'json';
  strict: boolean;
  checkFiles: boolean;
  silent: boolean;
}

/**
 * Parse action flags from CLI argument.
 * @returns true if the argument was an action flag
 */
function parseActionArg(arg: string, state: ParseState): boolean {
  if (arg === '--generate' || arg === '-g') {
    state.action = 'generate';
    return true;
  }
  if (arg === '--validate' || arg === '-v') {
    state.action = 'validate';
    return true;
  }
  if (arg === '--check' || arg === '-c') {
    state.action = 'check';
    return true;
  }
  return false;
}

/**
 * Parse boolean flags from CLI argument.
 * @returns true if the argument was a boolean flag
 */
function parseBooleanFlags(arg: string, state: ParseState): boolean {
  if (arg === '--strict') {
    state.strict = true;
    return true;
  }
  if (arg === '--no-check-files') {
    state.checkFiles = false;
    return true;
  }
  if (arg === '--silent' || arg === '-s') {
    state.silent = true;
    return true;
  }
  return false;
}

/**
 * Parse value flags (flags that take the next argument as value).
 * @returns the number of arguments consumed (0 if not a value flag)
 */
function parseValueArg(arg: string, args: string[], index: number, state: ParseState): number {
  if (arg === '--output' || arg === '-o') {
    state.output = args[index + 1];
    return 2;
  }
  if (arg === '--format' || arg === '-f') {
    const formatArg = args[index + 1];
    if (formatArg === 'json') {
      state.format = 'json';
    }
    return 2;
  }
  return 0;
}

/**
 * Build the final options object from parse state.
 */
function buildOptionsFromState(state: ParseState): ResearchIndexOptions {
  const result: ResearchIndexOptions = {
    action: state.action,
    format: state.format,
    strict: state.strict,
    checkFiles: state.checkFiles,
    silent: state.silent,
  };

  if (state.output !== undefined) {
    return { ...result, output: state.output };
  }

  return result;
}

/**
 * Parse CLI arguments for the research index command.
 */
export function parseResearchIndexArgs(args: string[]): ResearchIndexOptions {
  const state: ParseState = {
    action: 'check',
    output: undefined,
    format: 'text',
    strict: false,
    checkFiles: true,
    silent: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (parseActionArg(arg, state)) continue;
    if (parseBooleanFlags(arg, state)) continue;

    const consumed = parseValueArg(arg, args, i, state);
    if (consumed > 0) {
      i += consumed - 1; // -1 because the loop will increment i
    }
  }

  return buildOptionsFromState(state);
}

/**
 * Get help text for the research index command.
 */
export function getResearchIndexHelp(): string {
  return `Usage: nexus-agents research index [options]

Options:
  --generate, -g    Generate RESEARCH_INDEX.md from registry files
  --validate, -v    Validate registry consistency (cross-references, files)
  --check, -c       Check if index is up to date (default)
  --output, -o      Output path for generate (default: docs/research/RESEARCH_INDEX.md)
  --format, -f      Output format for validate: text or json (default: text)
  --strict          Treat warnings as errors in validate
  --no-check-files  Skip integration file existence checks
  --silent, -s      Silent mode (only exit code, for CI)

Examples:
  nexus-agents research index --generate
  nexus-agents research index --validate --strict
  nexus-agents research index --check --silent`;
}
